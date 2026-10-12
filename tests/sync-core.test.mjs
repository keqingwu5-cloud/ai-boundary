// node --test tests/ ：合併、無狀態佇列（snapshot diff）、墓碑、種子遷移、唯讀
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../sync-core.js';

const node = (id, o = {}) => Object.assign({ id, brainId:'main', parentId:null, kind:'question', title:id, type:'其他', createdBy:'seed', createdAt:1, pos:[0, 0, 0], concepts:[] }, o);
const base = () => C.repair({ version:2, brains:[C.DEFAULT_MAIN()], nodes:[node('n_q1'), node('n_q2')], links:[{ id:'l1', from:'n_q1', to:'n_q2', kind:'derived', createdAt:1 }],
  history:[{ ts:1, action:'seed', payload:{ questions:2 } }], concepts:{ 意識:{ color:'#ffffff', desc:'', createdBy:'seed' } }, patterns:{}, seedExtras:[] });
const norm = st => C.rowsToState([...C.toEntities(st)].map(([k, v]) => { const [kind, id] = C.splitKey(k); return { kind, id, data:v }; }), st.history);

/* 假的雲端：upsert，像 Supabase 一樣 jsonb 會重排 key */
function server(){ const rows = new Map(), hist = new Map();
  return { rows, hist, all:() => [...rows.values()].map(C.clone), H:() => [...hist.values()],
    upsert(ops){ ops.forEach(o => rows.set(C.keyOf(o.kind, o.id), { kind:o.kind, id:o.id, data:o.deleted ? null : JSON.parse(C.stable(o.data)), deleted:!!o.deleted })); },
    addHist(list){ list.forEach(h => hist.set(C.hkey(h), h)); } }; }
/* 一台裝置：本機 state＋snapshot，流程跟 sync.js 一樣 */
function device(srv, st = norm(base()), canWrite = true, migrate){
  const d = { st:C.clone(st), sync:null, canWrite };
  d.pull = () => { const r = srv.all();
    if (!r.length){ if (d.canWrite) d.sync = { snap:{}, hkeys:[] }; return; }
    const res = C.merge(d.st, r, srv.H(), d.sync, { migrate, canWrite:d.canWrite }); d.st = res.state; d.sync = res.sync; return res; };
  d.flush = () => { if (!d.canWrite || !d.sync) return 0; const ops = C.diff(d.sync.snap, d.st), h = C.pendingHistory(d.st, d.sync); srv.upsert(ops); srv.addHist(h); C.ack(d.sync, ops, h); return ops.length; };
  d.pending = () => d.sync ? C.diff(d.sync.snap, d.st) : [];
  return d;
}
const N = (st, id) => st.nodes.find(n => n.id === id);

test('stable()／hkey 跟 key 順序無關', () => {
  assert.equal(C.stable({ a:1, b:{ c:[1, { e:1, f:2 }] } }), C.stable({ b:{ c:[1, { f:2, e:1 }] }, a:1 }));
  assert.equal(C.hkey({ ts:5, action:'add', payload:{ a:1, b:2 } }), C.hkey({ ts:'5', action:'add', payload:{ b:2, a:1 } }));
});
test('雲端是空的：編輯者整份上傳（種子），唯讀者不動', () => {
  const srv = server(); const ro = device(srv, undefined, false); ro.pull(); assert.equal(ro.sync, null);
  const a = device(srv); a.pull(); assert.ok(a.flush() > 5); assert.ok(srv.rows.has('node:n_q1') && srv.hist.size === 1);
  assert.equal(a.pending().length, 0);
});
test('兩台裝置改不同節點：互不覆蓋', () => {
  const srv = server(); const a = device(srv); a.pull(); a.flush();
  const b = device(srv); b.pull();
  N(a.st, 'n_q1').status = 'resolved'; N(b.st, 'n_q2').title = 'B 改了';
  a.flush(); b.flush(); a.pull(); b.pull();
  for (const d of [a, b]){ assert.equal(N(d.st, 'n_q1').status, 'resolved'); assert.equal(N(d.st, 'n_q2').title, 'B 改了'); }
});
test('離線修改：拉取時保留本機未上傳的修改，其他以雲端為準；連線後上傳', () => {
  const srv = server(); const a = device(srv); a.pull(); a.flush();
  const b = device(srv); b.pull();
  N(b.st, 'n_q1').title = '離線標題'; b.st.nodes.push(node('n_new', { createdBy:'merlin', createdAt:9 }));   // b 離線
  N(a.st, 'n_q1').title = 'A 標題'; N(a.st, 'n_q2').status = 'researching'; a.flush();
  b.pull();
  assert.equal(N(b.st, 'n_q1').title, '離線標題'); assert.equal(N(b.st, 'n_q2').status, 'researching'); assert.ok(N(b.st, 'n_new'));
  assert.equal(b.pending().length, 2); b.flush();
  assert.equal(srv.rows.get('node:n_q1').data.title, '離線標題'); assert.ok(srv.rows.get('node:n_new'));
});
test('第一次同步：共有的節點以雲端為準、只在本機的上傳、雲端墓碑不會被復活', () => {
  const srv = server(); const a = device(srv); a.pull(); a.flush();
  a.st.nodes.push(node('n_tmp', { createdAt:5 })); a.flush();
  a.st.nodes = a.st.nodes.filter(n => n.id !== 'n_tmp'); a.flush();
  assert.equal(srv.rows.get('node:n_tmp').deleted, true);
  N(a.st, 'n_q1').title = '雲端標題'; a.flush();
  const local = norm(base()); N(local, 'n_q1').title = '舊裝置標題'; local.nodes.push(node('n_tmp', { createdAt:5 }), node('n_mine', { createdBy:'merlin', createdAt:6 }));
  const c = device(srv, local); const res = c.pull();
  assert.equal(N(c.st, 'n_q1').title, '雲端標題'); assert.ok(!N(c.st, 'n_tmp')); assert.ok(N(c.st, 'n_mine'));
  assert.deepEqual(res.pending.map(o => o.id), ['n_mine']);
});
test('第一次同步：雲端才有的實體不會被當成本機刪除（不會誤寫墓碑）', () => {
  const srv = server(); const a = device(srv); a.pull(); a.flush();
  a.st.nodes.push(node('n_remote_only', { createdBy:'merlin', createdAt:8 })); a.flush();
  const c = device(srv); const res = c.pull();
  assert.ok(N(c.st, 'n_remote_only')); assert.ok(!res.pending.some(o => o.deleted));
});
test('刪除 → 墓碑，其他裝置跟著移除', () => {
  const srv = server(); const a = device(srv); a.pull(); a.flush(); const b = device(srv); b.pull();
  a.st.nodes = a.st.nodes.filter(n => n.id !== 'n_q2'); a.st.links = []; a.flush();
  b.pull(); assert.ok(!N(b.st, 'n_q2')); assert.equal(b.st.links.length, 0); assert.equal(b.pending().length, 0);
});
test('復原：本機回到舊狀態也只是一個普通的待上傳修改', () => {
  const srv = server(); const a = device(srv); a.pull(); a.flush();
  const before = C.clone(a.st); N(a.st, 'n_q1').status = 'resolved'; a.flush();
  a.st = before; assert.deepEqual(a.pending().map(o => o.id), ['n_q1']); a.flush();
  assert.equal(srv.rows.get('node:n_q1').data.status, 'open');
});
test('種子遷移（SEED_EXTRAS／SEED_PATCHES 語意）在本機跑：編輯者上傳結果、唯讀者只在本機、不覆蓋使用者修改、刪掉的不會長回來', () => {
  const migrate = st => { st.seedExtras = st.seedExtras || [];
    if (!st.seedExtras.includes('n_x')){ st.seedExtras.push('n_x'); if (!st.nodes.some(n => n.id === 'n_x')) st.nodes.push(node('n_x', { parentId:'n_q1', kind:'direction', createdAt:3, pos:[Math.random(), 0, 0] })); st.history.push({ ts:7, action:'direction', payload:{ nodeId:'n_x' } }); }
    return st; };
  const srv = server(); const a = device(srv); a.pull(); a.flush();
  N(a.st, 'n_q1').title = 'Merlin 改過'; a.flush();
  const ro = device(srv, norm(base()), false, migrate); ro.pull(); ro.pull();
  assert.ok(N(ro.st, 'n_x'), '唯讀者也看得到新種子'); assert.deepEqual(ro.pending(), [], '但不算本機修改');
  assert.equal(N(ro.st, 'n_q1').title, 'Merlin 改過');
  const b = device(srv, norm(base()), true, migrate); b.pull();
  assert.ok(b.pending().some(o => o.id === 'n_x')); b.flush();
  assert.ok(srv.rows.get('node:n_x')); assert.deepEqual(srv.rows.get('meta:seedExtras').data, ['n_x']);
  assert.ok([...srv.hist.values()].some(h => h.action === 'direction'));
  b.st.nodes = b.st.nodes.filter(n => n.id !== 'n_x'); b.flush();
  const c = device(srv, norm(base()), true, migrate); c.pull(); assert.ok(!N(c.st, 'n_x'), '刪掉的種子不會長回來');
});
test('種子紀錄（meta 陣列）順序不同不算修改：新種子插在 SEED_EXTRAS 前面時，唯讀者不會多一筆待上傳、編輯者不會重複上傳', () => {
  // 雲端是舊版（只有 n_x）；種子節點跟 app.js 一樣是欄位齊全的（用 putEntity 建），本機新版的 SEED_EXTRAS 把 n_new 放在最前面（main #6 就是這樣）
  const migrate = st => { st.seedExtras = st.seedExtras || [];
    for (const id of ['n_new', 'n_x']) if (!st.seedExtras.includes(id)){ st.seedExtras.push(id); if (!st.nodes.some(n => n.id === id)) C.putEntity(st, 'node', id, node(id, { parentId:'n_q1', kind:'direction', createdAt:3 })); }
    return st; };
  const oldMigrate = st => { st.seedExtras = st.seedExtras || []; if (!st.seedExtras.includes('n_x')){ st.seedExtras.push('n_x'); C.putEntity(st, 'node', 'n_x', node('n_x', { parentId:'n_q1', kind:'direction', createdAt:3 })); } return st; };
  // 跟 sync.js 一樣：合併結果不是整份換掉，而是把差異用 putEntity 套回本機（meta 陣列是聯集，會保留本機的順序）
  const asSyncJs = d => { d.pull = () => { const r = srv.all();
    if (!r.length){ if (d.canWrite) d.sync = { snap:{}, hkeys:[] }; return; }
    const res = C.merge(d.st, r, srv.H(), d.sync, { migrate:d.migrate, canWrite:d.canWrite });
    C.diff(C.fingerprint(d.st), res.state).forEach(o => C.putEntity(d.st, o.kind, o.id, o.deleted ? null : o.data));
    d.st.history = C.mergeHistory(d.st.history, res.state.history); d.sync = res.sync; }; return d; };
  const srv = server(); const a = device(srv, norm(oldMigrate(base())), true, oldMigrate); a.pull(); a.flush();
  const ro = asSyncJs(Object.assign(device(srv, norm(migrate(base())), false), { migrate })); ro.pull(); ro.pull();
  assert.ok(N(ro.st, 'n_new')); assert.deepEqual(ro.pending(), [], '唯讀者沒有待上傳');
  const ed = asSyncJs(Object.assign(device(srv, norm(migrate(base())), true), { migrate })); ed.pull();
  assert.deepEqual(ed.pending().map(o => o.kind + ':' + o.id).sort(), ['meta:seedExtras', 'node:n_new']);
  ed.flush(); assert.deepEqual(ed.pending(), []); ed.pull(); assert.deepEqual(ed.pending(), [], '上傳後再拉也沒有東西要傳');
  assert.deepEqual([...srv.rows.get('meta:seedExtras').data].sort(), ['n_new', 'n_x']);
  ro.pull(); assert.deepEqual(ro.pending(), []);
});
test('唯讀者的本機修改保留在本機（拉取不會蓋掉），也不會上傳', () => {
  const srv = server(); const a = device(srv); a.pull(); a.flush();
  const ro = device(srv, norm(base()), false); ro.pull();
  N(ro.st, 'n_q2').title = '我自己的筆記'; ro.pull();
  assert.equal(N(ro.st, 'n_q2').title, '我自己的筆記'); assert.equal(ro.flush(), 0); assert.equal(srv.rows.get('node:n_q2').data.title, 'n_q2');
});
test('雲端來的惡意／殘缺資料在合併時就被清洗、補齊（feed 與 3D 場景不會崩潰）', () => {
  const srv = server(); const a = device(srv); a.pull(); a.flush();
  srv.upsert([{ kind:'node', id:'n_bad', data:{ title:'bot 只寫了標題', parentId:'n_q1', source:{ url:'javascript:alert(1)' } } },
    { kind:'brain', id:'b_x', data:{ name:'x', regionColor:'"><script>alert(1)</script>' } }, { kind:'node', id:'n_str', data:'garbage' }]);
  a.pull();
  const n = N(a.st, 'n_bad'); assert.ok(n.media && Array.isArray(n.concepts) && Array.isArray(n.pos)); assert.equal(n.source.url, '');
  assert.equal(a.st.brains.find(b => b.id === 'b_x').regionColor, '#9db7ff'); assert.ok(!N(a.st, 'n_str'));
});
test('repair 讓 graph 一定能畫', () => {
  const st = C.rowsToState([{ kind:'node', id:'a', data:node('a', { brainId:'b_gone' }) }]);
  assert.ok(st.brains.some(b => b.id === 'main')); assert.equal(st.nodes[0].brainId, 'main');
});
