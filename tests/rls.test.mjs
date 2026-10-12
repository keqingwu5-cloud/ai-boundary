// RLS 測試：用 PGlite（WASM 版 Postgres）跑 supabase/schema.sql，模擬 Supabase 的 auth schema 與 anon／authenticated 角色。
// 需要 @electric-sql/pglite：PGLITE=<.../@electric-sql/pglite/dist/index.js> node --test tests/rls.test.mjs（沒裝就略過）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
let PGlite = null;
try { ({ PGlite } = await import(process.env.PGLITE || '@electric-sql/pglite')); } catch(e){}
const MERLIN = '11111111-1111-1111-1111-111111111111', BOB = '22222222-2222-2222-2222-222222222222', EVE = '33333333-3333-3333-3333-333333333333';

test('schema.sql RLS: 只有 brain_editors 裡、email 已驗證的帳號能寫', { skip:!PGlite && '沒有 @electric-sql/pglite' }, async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
    insert into auth.users values ('${MERLIN}', 'keqingwu5@gmail.com', now()), ('${BOB}', 'bob@example.com', now()), ('${EVE}', 'eve@example.com', null);
  `);
  await db.exec(fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));   // 可重複執行
  const as = async (role, uid, email, sql) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false), set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub:uid, email, role }) : ''}', false); set role ${role};`);
    try { return { rows:(await db.query(sql)).rows }; } catch(e){ return { error:e.message }; } finally { await db.exec('reset role'); }
  };
  const ins = id => `insert into public.brain_entities (kind, id, data) values ('node', '${id}', '{"title":"x"}') returning id`;
  // anon：可讀、不能寫
  assert.ok((await as('anon', null, null, 'select * from public.brain_entities')).rows);
  assert.match((await as('anon', null, null, ins('n_anon'))).error || '', /permission|row-level/);
  // 不在名單的登入者：不能寫
  assert.match((await as('authenticated', BOB, 'bob@example.com', ins('n_bob'))).error || '', /row-level/);
  assert.equal((await as('authenticated', BOB, 'bob@example.com', 'select public.is_brain_editor() as ok')).rows[0].ok, false);
  // 編輯者：可新增、可修改（含墓碑）
  assert.deepEqual((await as('authenticated', MERLIN, 'keqingwu5@gmail.com', ins('n_m'))).rows, [{ id:'n_m' }]);
  assert.equal((await as('authenticated', MERLIN, 'keqingwu5@gmail.com', 'select public.is_brain_editor() as ok')).rows[0].ok, true);
  assert.ok((await as('authenticated', MERLIN, 'keqingwu5@gmail.com', `update public.brain_entities set deleted = true, data = null where id = 'n_m' returning id`)).rows.length === 1);
  const row = (await db.query(`select updated_by from public.brain_entities where id = 'n_m'`)).rows[0];
  assert.equal(row.updated_by, MERLIN);
  // 不能真的 DELETE
  const del = await as('authenticated', MERLIN, 'keqingwu5@gmail.com', `delete from public.brain_entities where id = 'n_m' returning id`);
  assert.ok(del.error || del.rows.length === 0);
  // 非編輯者不能修改既有列
  const upd = await as('authenticated', BOB, 'bob@example.com', `update public.brain_entities set data = '{"title":"hacked"}' where id = 'n_m' returning id`);
  assert.ok(upd.error || upd.rows.length === 0);
  // JWT 冒用編輯者 email（帳號本身的 email 不同）→ 不行
  assert.match((await as('authenticated', BOB, 'keqingwu5@gmail.com', ins('n_spoof'))).error || '', /row-level/);
  // email 沒驗證 → 不行（即使加進名單）
  await db.exec(`insert into public.brain_editors (email) values ('eve@example.com')`);
  assert.match((await as('authenticated', EVE, 'eve@example.com', ins('n_eve'))).error || '', /row-level/);
  // 用戶端不能讀／改 brain_editors
  assert.match((await as('authenticated', MERLIN, 'keqingwu5@gmail.com', 'select * from public.brain_editors')).error || '', /permission/);
  assert.match((await as('authenticated', BOB, 'bob@example.com', `insert into public.brain_editors (email) values ('bob@example.com')`)).error || '', /permission/);
  // history：編輯者可新增，payload 有大小上限；非編輯者不行
  assert.ok((await as('authenticated', MERLIN, 'keqingwu5@gmail.com', `insert into public.brain_history (hkey, ts, action, payload) values ('k1', 1, 'add', '{}') returning hkey`)).rows);
  assert.match((await as('authenticated', MERLIN, 'keqingwu5@gmail.com', `insert into public.brain_history (hkey, ts, action, payload) values ('k2', 1, 'add', jsonb_build_object('x', repeat('a', 20000)))`)).error || '', /check/);
  assert.match((await as('authenticated', BOB, 'bob@example.com', `insert into public.brain_history (hkey, ts, action) values ('k3', 1, 'add')`)).error || '', /row-level/);
  await db.close();
});
