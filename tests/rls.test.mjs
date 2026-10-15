// RLS／版本化寫入測試：用 PGlite（WASM 版 Postgres）跑 supabase/schema.sql，模擬 Supabase 的 auth schema 與 anon／authenticated 角色。
// 需要 @electric-sql/pglite：PGLITE=<.../@electric-sql/pglite/dist/index.js> node --test tests/rls.test.mjs（沒裝就略過）
// P0 驗收：未授權（匿名、登入但非編輯者、冒用 email、email 未驗證、其他 graph 的編輯者）讀取與寫入全部被拒；
//          同一版本的第二筆修改變成 conflict（不覆寫、內容保留可查）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE || '@electric-sql/pglite')); } catch(e){}
const MERLIN = '11111111-1111-1111-1111-111111111111', BOB = '22222222-2222-2222-2222-222222222222', EVE = '33333333-3333-3333-3333-333333333333', CAROL = '44444444-4444-4444-4444-444444444444';
const M = ['authenticated', MERLIN, 'keqingwu5@gmail.com'], B = ['authenticated', BOB, 'bob@example.com'], ANON = ['anon', null, null];
const SKIP = { skip:!PGlite && '沒有 @electric-sql/pglite' };
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

async function setup({ upgradeFromPR2 = true } = {}){
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users values ('${MERLIN}', 'keqingwu5@gmail.com', now()), ('${BOB}', 'bob@example.com', now()), ('${EVE}', 'eve@example.com', null), ('${CAROL}', 'carol@example.com', now());
  `);
  if (upgradeFromPR2){
    // 先套 PR #2 草稿（匿名可讀、直接 upsert），放一筆舊資料 → 再套新 schema：模擬已部署的資料庫升級
    await db.exec(fs.readFileSync(new URL('./fixtures/schema.pr2-51a87bf.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into public.brain_entities (graph_id, kind, id, data) values ('main', 'node', 'n_old', '{"title":"舊資料"}')`);
  }
  await db.exec(schema); await db.exec(schema);   // 可重複執行
  const as = async ([role, uid, email], sql) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false), set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub:uid, email, role }) : ''}', false); set role ${role};`);
    try { return { rows:(await db.query(sql)).rows }; } catch(e){ return { error:e.message }; } finally { await db.exec('reset role'); }
  };
  const apply = async (who, ops, graph = 'main') => {
    const r = await as(who, `select public.brain_apply('${graph}', '${JSON.stringify(ops).replace(/'/g, "''")}'::jsonb) as r`);
    return r.error ? r : r.rows[0].r;
  };
  return { db, as, apply };
}
const DENIED = /permission denied|row-level security/;

test('P0 驗收：未授權讀取全部被拒（匿名、非編輯者、冒用 email、未驗證 email、其他 graph 的編輯者）', SKIP, async () => {
  const { db, as, apply } = await setup();
  assert.equal((await apply(M, [{ kind:'node', id:'n_secret', data:{ title:'私人研究' }, base:null }])).applied.length, 1);
  await as(M, `insert into public.brain_history (hkey, ts, action, payload) values ('k1', 1, 'add', '{"title":"私人研究"}')`);
  await db.exec(`insert into public.brain_editors (email, graph_ids) values ('carol@example.com', array['other']), ('eve@example.com', null)`);
  const tables = ['brain_entities', 'brain_history', 'brain_proposals', 'brain_revisions'];
  for (const t of tables){
    // 匿名：連 select 權限都沒有（PostgREST 會回 401／42501）
    assert.match((await as(ANON, `select * from public.${t}`)).error || '', /permission denied/, 'anon ' + t);
    // 登入但不能讀：RLS 過濾成 0 列
    for (const who of [B, ['authenticated', BOB, 'keqingwu5@gmail.com'], ['authenticated', EVE, 'eve@example.com'], ['authenticated', CAROL, 'carol@example.com']]){
      const r = await as(who, `select * from public.${t} where graph_id = 'main'`);
      assert.deepEqual(r.rows, [], `${who[2]}（uid ${who[1].slice(0, 4)}）讀 ${t}`);
    }
  }
  // 編輯者讀得到（包含升級前的舊資料）
  const mine = (await as(M, `select id, version from public.brain_entities order by id`)).rows;
  assert.deepEqual(mine.map(r => r.id), ['n_old', 'n_secret']);
  assert.equal(Number(mine[0].version), 1, '升級後舊資料有 version = 1');
  // 用戶端不能讀編輯者名單，匿名也不能問「我是不是編輯者」
  assert.match((await as(M, 'select * from public.brain_editors')).error || '', /permission denied/);
  assert.match((await as(ANON, `select public.is_graph_editor('main')`)).error || '', /permission denied/);
  assert.equal((await as(M, `select public.is_graph_editor('main') as ok`)).rows[0].ok, true);
  assert.equal((await as(['authenticated', CAROL, 'carol@example.com'], `select public.is_graph_editor('main') as ok`)).rows[0].ok, false);
  await db.close();
});

test('P0 驗收：未授權寫入全部被拒；編輯者也只能經過 brain_apply（不能直接 insert／update／delete）', SKIP, async () => {
  const { db, as, apply } = await setup();
  await db.exec(`insert into public.brain_editors (email, graph_ids) values ('carol@example.com', array['other']), ('eve@example.com', null)`);
  const op = [{ kind:'node', id:'n_x', data:{ title:'x' }, base:null }];
  assert.match((await apply(ANON, op)).error || '', /permission denied/, 'anon apply');
  assert.match((await apply(B, op)).error || '', /permission denied/, '非編輯者 apply');
  assert.match((await apply(['authenticated', BOB, 'keqingwu5@gmail.com'], op)).error || '', /permission denied/, '冒用 email');
  assert.match((await apply(['authenticated', EVE, 'eve@example.com'], op)).error || '', /permission denied/, 'email 未驗證');
  assert.match((await apply(['authenticated', CAROL, 'carol@example.com'], op)).error || '', /permission denied/, '其他 graph 的編輯者');
  assert.equal((await apply(['authenticated', CAROL, 'carol@example.com'], op, 'other')).applied.length, 1, 'Carol 可以寫自己的 graph');
  for (const who of [ANON, B, M]){
    assert.match((await as(who, `insert into public.brain_entities (kind, id, data) values ('node', 'n_direct', '{}')`)).error || '', DENIED, who[0] + ' 直接 insert');
    const upd = await as(who, `update public.brain_entities set data = '{"title":"hacked"}' where id = 'n_old' returning id`);
    assert.ok(upd.error || upd.rows.length === 0, who[0] + ' 直接 update');
    const del = await as(who, `delete from public.brain_entities where id = 'n_old' returning id`);
    assert.ok(del.error || del.rows.length === 0, who[0] + ' delete');
    for (const t of ['brain_proposals', 'brain_revisions']){
      assert.match((await as(who, `insert into public.${t} (graph_id, kind, entity_id${t === 'brain_revisions' ? ', version' : ''}) values ('main', 'node', 'x'${t === 'brain_revisions' ? ', 9' : ''})`)).error || '', DENIED, who[0] + ' ' + t);
    }
  }
  assert.equal((await db.query(`select data->>'title' t from public.brain_entities where id = 'n_old'`)).rows[0].t, '舊資料');
  // history：匿名／非編輯者不能寫；編輯者可以，payload 有上限
  assert.match((await as(ANON, `insert into public.brain_history (hkey, ts, action) values ('a', 1, 'add')`)).error || '', /permission denied/);
  assert.match((await as(B, `insert into public.brain_history (hkey, ts, action) values ('b', 1, 'add')`)).error || '', /row-level/);
  assert.ok((await as(M, `insert into public.brain_history (hkey, ts, action, payload) values ('k1', 1, 'add', '{}') returning hkey`)).rows);
  assert.match((await as(M, `insert into public.brain_history (hkey, ts, action, payload) values ('k2', 1, 'add', jsonb_build_object('x', repeat('a', 20000)))`)).error || '', /check/);
  // 編輯者名單：用戶端不能自己加
  assert.match((await as(B, `insert into public.brain_editors (email) values ('bob@example.com')`)).error || '', /permission denied/);
  await db.close();
});

test('版本化寫入：同版本第二筆修改 → conflict（不覆寫、內容存進 brain_proposals）；重送冪等；修訂只增不減', SKIP, async () => {
  const { db, as, apply } = await setup({ upgradeFromPR2:false });
  const node = (title, base) => ({ kind:'node', id:'n_q1', data:{ title }, base });
  let r = await apply(M, [node('r1', null)]); assert.deepEqual(r.applied, [{ kind:'node', id:'n_q1', version:1 }]);
  r = await apply(M, [node('r2', 1)]); assert.equal(r.applied[0].version, 2);
  // A、B 都根據 r2（version 2）修改；A 先被接受 → version 3；B 版本不符 → conflict
  const A = await apply(M, [node('A 的修改', 2)]), Bc = await apply(M, [node('B 的修改', 2)]);
  assert.equal(A.applied[0].version, 3);
  assert.equal(Bc.applied.length, 0); assert.equal(Bc.conflicts.length, 1);
  const c = Bc.conflicts[0];
  assert.deepEqual([c.base, c.current, c.data.title], [2, 3, 'A 的修改'], '衝突回報雲端目前內容與版本');
  const row = (await as(M, `select data->>'title' t, version from public.brain_entities where id = 'n_q1'`)).rows[0];
  assert.deepEqual([row.t, Number(row.version)], ['A 的修改', 3], '雲端沒有被 B 覆寫');
  const prop = (await as(M, `select status, base_version, current_version, patch->>'title' t from public.brain_proposals where id = ${c.proposal_id}`)).rows[0];
  assert.deepEqual([prop.status, Number(prop.base_version), Number(prop.current_version), prop.t], ['conflict', 2, 3, 'B 的修改'], 'B 的內容保留、可查閱');
  // 重送已被接受的同一筆（網路斷線後重試）：不是衝突，也不多一個版本
  r = await apply(M, [node('A 的修改', 2)]); assert.deepEqual([r.applied[0].version, r.conflicts.length], [3, 0]);
  // 新實體但雲端已有不同內容 → conflict；一樣 → 冪等
  assert.equal((await apply(M, [node('別台裝置也建了 n_q1', null)])).conflicts.length, 1);
  // 人決定以 B 的版本覆蓋：用目前版本當 base，帶 resolves → proposal accepted
  r = await apply(M, [{ ...node('B 的修改', 3), resolves:c.proposal_id }]); assert.equal(r.applied[0].version, 4);
  assert.equal((await as(M, `select status from public.brain_proposals where id = ${c.proposal_id}`)).rows[0].status, 'accepted');
  // 另一個衝突，人決定保留雲端版本 → rejected
  const c2 = (await apply(M, [node('過時的修改', 1)])).conflicts[0];
  assert.equal((await as(M, `select public.brain_reject_proposal('main', ${c2.proposal_id}) as ok`)).rows[0].ok, true);
  assert.match((await as(B, `select public.brain_reject_proposal('main', ${c2.proposal_id})`)).error || '', /permission denied/);
  // 墓碑也要版本相符
  assert.equal((await apply(M, [{ kind:'node', id:'n_q1', data:null, deleted:true, base:3 }])).conflicts.length, 1);
  r = await apply(M, [{ kind:'node', id:'n_q1', data:null, deleted:true, base:4 }]); assert.equal(r.applied[0].version, 5);
  assert.equal((await as(M, `select deleted from public.brain_entities where id = 'n_q1'`)).rows[0].deleted, true);
  // 不同節點互不影響：同一批裡一筆衝突、一筆成功
  r = await apply(M, [{ kind:'node', id:'n_q2', data:{ title:'新' }, base:null }, node('離線復活', 2)]);
  assert.deepEqual([r.applied.length, r.conflicts.length], [1, 1]);
  // meta 字串陣列（種子紀錄）：聯集，不算衝突
  await apply(M, [{ kind:'meta', id:'seedExtras', data:['a', 'b'], base:null }]);
  await apply(M, [{ kind:'meta', id:'seedExtras', data:['a', 'b', 'c'], base:1 }]);
  r = await apply(M, [{ kind:'meta', id:'seedExtras', data:['a', 'b', 'd'], base:1 }]);
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual((await as(M, `select data from public.brain_entities where kind = 'meta'`)).rows[0].data, ['a', 'b', 'c', 'd']);
  // 修訂：n_q1 有 5 個版本，前後內容都在；不能改
  const revs = (await as(M, `select version, before->>'title' b, after->>'title' a from public.brain_revisions where entity_id = 'n_q1' order by version`)).rows;
  assert.deepEqual(revs.map(x => [Number(x.version), x.b, x.a]), [[1, null, 'r1'], [2, 'r1', 'r2'], [3, 'r2', 'A 的修改'], [4, 'A 的修改', 'B 的修改'], [5, 'B 的修改', null]]);
  const tamper = await as(M, `update public.brain_revisions set after = '{}' where entity_id = 'n_q1' returning version`);
  assert.ok(tamper.error || tamper.rows.length === 0, '修訂不能被改');
  // 格式錯誤的請求被拒，不寫入任何東西
  assert.match((await apply(M, [{ kind:'evil', id:'x', data:{}, base:null }])).error || '', /invalid/);
  assert.match((await apply(M, [{ kind:'node', id:'x', base:null }])).error || '', /invalid/);
  await db.close();
});
