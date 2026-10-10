// node --test tests/        （Node 20.19+；不需要安裝任何套件）
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../sync-core.js';

const node = (id, o = {}) => Object.assign({ id, brainId:'main', parentId:null, kind:'question', title:id, type:'其他', createdBy:'seed', createdAt:1, pos:[0, 0, 0], concepts:[] }, o);
const base = () => ({ version:2, brains:[C.DEFAULT_MAIN()], nodes:[node('n_q1'), node('n_q2')], links:[{ id:'l1', from:'n_q1', to:'n_q2', kind:'derived', createdAt:1 }],
  history:[{ ts:1, action:'seed', payload:{ questions:2 } }], concepts:{ 意識:{ color:'#fff', desc:'', createdBy:'seed' } }, patterns:{}, seedExtras:[], seedPatches:[] });

/* tiny in-memory "Supabase": upsert bumps version, like the trigger in schema.sql */
function server(){
  const rows = new Map(); let clock = 0;
  return {
    rows, all:() => [...rows.values()].map(r => C.clone(r)),
    upsert(list){ return list.map(r => { const k = C.keyOf(r.kind, r.id), old = rows.get(k);
      const n = { kind:r.kind, id:r.id, data:r.data ? JSON.parse(C.stable(r.data)) : null /* jsonb re-orders keys */, deleted:!!r.deleted, version:old ? old.version + 1 : 1, updated_at:new Date(1e12 + ++clock * 1000).toISOString() };
      rows.set(k, n); return C.clone(n); }); }
  };
}
/* a device = local state + persisted queue + shadow, mimicking sync.js */
function device(srv, st = base(), canWrite = true){
  const d = { st:C.clone(st), q:C.emptyQueue(), canWrite };
  d.shadow = C.fingerprint(d.st); d.hs = C.historyKeys(d.st);
  d.edit = fn => { fn(d.st); const ops = C.diff(d.shadow, d.st); C.enqueue(d.q, ops); C.enqueueHistory(d.q, C.newHistory(d.hs, d.st)); d.shadow = C.fingerprint(d.st); d.hs = C.historyKeys(d.st); };
  d.load = (migrate) => { const res = C.mergeRemote(d.st, srv.all(), d.q, { full:true, migrate, canWrite:d.canWrite }); d.st = res.state; d.shadow = C.fingerprint(d.st); return res; };
  d.flush = () => { if (!d.canWrite) return []; const ops = Object.values(d.q.ops); const ret = srv.upsert(ops.map(o => ({ kind:o.kind, id:o.id, data:o.data, deleted:o.deleted }))); C.ack(d.q, ops, ret); return ret; };
  d.receive = rows => { C.applyRows(d.st, C.acceptRows(d.q, rows)); rows.forEach(r => C.noteVersion(d.q, r)); d.shadow = C.fingerprint(d.st); };
  return d;
}
const N = (st, id) => st.nodes.find(n => n.id === id);

test('state ⇄ entities round trip (incl. concepts and meta)', () => {
  const st = base(), ents = C.toEntities(st);
  assert.ok(ents.has('node:n_q1') && ents.has('link:l1') && ents.has('concept:意識') && ents.has('meta:seedExtras'));
  assert.ok(!ents.has('meta:version') && !ents.has('meta:history'));
  const rows = [...ents].map(([k, v]) => { const [kind, id] = C.splitKey(k); return { kind, id, data:v, deleted:false }; });
  const back = C.rowsToState(rows, st.history);
  assert.equal(C.stable(C.toEntities(back).get('node:n_q2')), C.stable(st.nodes[1]));
  assert.deepEqual(back.concepts, st.concepts);
  assert.equal(back.history.length, 1);
});

test('stable() ignores key order (jsonb) and history keys dedupe', () => {
  assert.equal(C.stable({ a:1, b:{ c:2, d:[1, { e:1, f:2 }] } }), C.stable({ b:{ d:[1, { f:2, e:1 }], c:2 }, a:1 }));
  const h = { ts:5, action:'add', payload:{ nodeId:'x', title:'t' } };
  assert.equal(C.hkey(h), C.hkey({ ts:'5', action:'add', payload:{ title:'t', nodeId:'x' } }));
  assert.equal(C.mergeHistory([h], [{ ts:5, action:'add', payload:{ title:'t', nodeId:'x' } }, { ts:2, action:'seed', payload:{} }]).length, 2);
});

test('empty remote: an authenticated device seeds it, a read-only one does not', () => {
  const srv = server();
  const ro = device(srv, base(), false); const r1 = ro.load(); assert.ok(r1.empty); assert.equal(C.pending(ro.q), 0);
  const a = device(srv); const r2 = a.load(); assert.ok(r2.empty); assert.ok(C.pending(a.q) > 0); assert.equal(Object.keys(a.q.hist).length, 1);
  a.flush(); assert.equal(C.pending(a.q), 0); assert.ok(srv.rows.has('node:n_q1'));
});

test('two devices editing different nodes do not clobber each other', () => {
  const srv = server(); const a = device(srv); a.load(); a.flush();
  const b = device(srv); b.load();
  a.edit(st => { N(st, 'n_q1').status = 'resolved'; });
  b.edit(st => { N(st, 'n_q2').title = 'B 改了標題'; });
  const ra = a.flush(), rb = b.flush();
  a.receive(rb); b.receive(ra);
  for (const d of [a, b]){ assert.equal(N(d.st, 'n_q1').status, 'resolved'); assert.equal(N(d.st, 'n_q2').title, 'B 改了標題'); }
});

test('remote wins for shared nodes, but queued local (offline) edits are preserved and uploaded later', () => {
  const srv = server(); const a = device(srv); a.load(); a.flush();
  const b = device(srv); b.load();
  // b goes offline and edits q1 + adds a node
  b.edit(st => { N(st, 'n_q1').title = 'offline 標題'; st.nodes.push(node('n_new', { createdBy:'merlin', createdAt:9 })); });
  // meanwhile a edits q1 and q2 online
  a.edit(st => { N(st, 'n_q1').title = 'A 標題'; N(st, 'n_q2').status = 'researching'; }); a.flush();
  // b reconnects: full merge
  b.load();
  assert.equal(N(b.st, 'n_q1').title, 'offline 標題', 'queued local edit kept');
  assert.equal(N(b.st, 'n_q2').status, 'researching', 'remote edit applied');
  assert.ok(N(b.st, 'n_new'));
  b.flush(); assert.equal(C.pending(b.q), 0);
  assert.equal(srv.rows.get('node:n_q1').data.title, 'offline 標題');   // last writer wins on the same node
  assert.ok(srv.rows.get('node:n_new'));
});

test('local-only entities (made before sync was configured) are queued; tombstones delete', () => {
  const srv = server(); const a = device(srv); a.load(); a.flush();
  a.edit(st => { st.nodes.push(node('n_tmp', { createdBy:'merlin', createdAt:5 })); }); a.flush();
  a.edit(st => { st.nodes = st.nodes.filter(n => n.id !== 'n_tmp'); }); a.flush();
  assert.equal(srv.rows.get('node:n_tmp').deleted, true);
  const local = base(); local.nodes.push(node('n_tmp', { createdAt:5 }), node('n_mine', { createdBy:'merlin', createdAt:6 }));
  const c = device(srv, local); const res = c.load();
  assert.ok(!N(c.st, 'n_tmp'), 'tombstone removed it, no resurrection');
  assert.ok(N(c.st, 'n_mine')); assert.deepEqual(res.localOnly.map(o => o.id), ['n_mine']);
  assert.ok(c.q.ops['node:n_mine']);
});

test('stale echoes are ignored; queued keys are not overwritten by realtime', () => {
  const srv = server(); const a = device(srv); a.load(); a.flush();
  a.edit(st => { N(st, 'n_q1').title = 'v2'; }); const r2 = a.flush();
  a.edit(st => { N(st, 'n_q1').title = 'v3'; }); const r3 = a.flush();
  a.receive(r2);   // late echo of v2 after v3 was acknowledged
  assert.equal(N(a.st, 'n_q1').title, 'v3');
  a.edit(st => { N(st, 'n_q2').title = 'local pending'; });
  a.receive([{ kind:'node', id:'n_q2', data:Object.assign({}, N(base(), 'n_q2'), { title:'remote' }), deleted:false, version:99 }]);
  assert.equal(N(a.st, 'n_q2').title, 'local pending');
  void r3;
});

test('seed migration (SEED_EXTRAS / SEED_PATCHES semantics) runs against the shared brain, additive only', () => {
  // fake migrate: adds extra node once (tracked in seedExtras) and patches q1 once (tracked in seedPatches)
  const migrate = st => {
    st.seedExtras = st.seedExtras || []; st.seedPatches = st.seedPatches || [];
    if (!st.seedExtras.includes('n_x')){ st.seedExtras.push('n_x'); if (!st.nodes.some(n => n.id === 'n_x')) st.nodes.push(node('n_x', { parentId:'n_q1', kind:'direction', createdAt:3 })); }
    const q1 = st.nodes.find(n => n.id === 'n_q1');
    if (q1 && !st.seedPatches.includes('n_q1@p1')){ st.seedPatches.push('n_q1@p1'); if (!q1.reasoning) q1.reasoning = [{ k:'flow', v:'patched' }]; }
    st.history.push({ ts:7, action:'direction', payload:{ nodeId:'n_x' } });
    return st;
  };
  const srv = server(); const a = device(srv); a.load(); a.flush();          // remote = old seed, no extras
  a.edit(st => { N(st, 'n_q1').title = 'Merlin 改過'; }); a.flush();
  const ro = device(srv, base(), false); ro.load(migrate);
  assert.ok(N(ro.st, 'n_x'), 'read-only device still shows seed additions'); assert.equal(C.pending(ro.q), 0, 'but does not queue them');
  const b = device(srv); const res = b.load(migrate);
  assert.ok(res.seedOps.some(o => o.id === 'n_x'));
  assert.equal(N(b.st, 'n_q1').title, 'Merlin 改過', 'user edit untouched');
  assert.deepEqual(N(b.st, 'n_q1').reasoning, [{ k:'flow', v:'patched' }]);
  b.flush();
  assert.ok(srv.rows.get('node:n_x')); assert.deepEqual(srv.rows.get('meta:seedExtras').data, ['n_x']);
  // user deletes the extra → it must not grow back on the next load anywhere
  b.edit(st => { st.nodes = st.nodes.filter(n => n.id !== 'n_x'); }); b.flush();
  const c = device(srv); c.load(migrate);
  assert.ok(!N(c.st, 'n_x'));
  assert.equal(Object.keys(c.q.ops).filter(k => k === 'node:n_x').length, 0);
});

test('meta arrays are unioned (concurrent seed bookkeeping)', () => {
  const st = base(); st.seedPatches = ['a'];
  C.applyRows(st, [{ kind:'meta', id:'seedPatches', data:['b'], deleted:false }]);
  assert.deepEqual(st.seedPatches.sort(), ['a', 'b']);
  C.applyRows(st, [{ kind:'meta', id:'seedPatches', data:null, deleted:true }]);
  assert.deepEqual(st.seedPatches.sort(), ['a', 'b'], 'never shrinks');
});

test('undo snapshots get remote patches, so undo only reverts the local action', () => {
  const srv = server(); const a = device(srv); a.load(); a.flush();
  const snapshot = C.clone(a.st);                       // what app.js pushes before a local mutation
  a.edit(st => { N(st, 'n_q1').status = 'resolved'; });
  const remote = [{ kind:'node', id:'n_q2', data:Object.assign({}, N(a.st, 'n_q2'), { title:'別人改的' }), deleted:false, version:5 }];
  C.applyRows(a.st, remote); C.applyRows(snapshot, remote);   // applyExternal does both
  a.st = snapshot;                                        // ↶ undo
  assert.equal(N(a.st, 'n_q1').status, undefined);
  assert.equal(N(a.st, 'n_q2').title, '別人改的');
  const ops = C.diff(a.shadow, a.st); assert.ok(ops.some(o => o.id === 'n_q1'));   // undo itself is synced as an edit
});

test('repair keeps the graph renderable', () => {
  const st = C.rowsToState([{ kind:'node', id:'a', data:node('a', { brainId:'b_gone' }), deleted:false }]);
  assert.ok(st.brains.some(b => b.id === 'main')); assert.equal(st.nodes[0].brainId, 'main');
});

test('feed likes / bookmarks merge per node', () => {
  const mq = {};
  const out = C.mergeMarks({ likes:{ a:1, c:3 }, saves:{} }, [{ node_id:'a', liked_at:null, saved_at:10 }, { node_id:'b', liked_at:20, saved_at:null }], mq);
  assert.deepEqual(out, { likes:{ b:20, c:3 }, saves:{ a:10 } });
  assert.deepEqual(Object.keys(mq), ['c']);
  const ops = C.diffMarks(C.marksOf({ likes:{ a:1 }, saves:{} }), C.marksOf({ likes:{}, saves:{ b:2 } }));
  assert.deepEqual(ops.sort((x, y) => x.node_id.localeCompare(y.node_id)), [{ node_id:'a', liked_at:null, saved_at:null }, { node_id:'b', liked_at:null, saved_at:2 }]);
});

test('knowledge score merge is a per-field max (idempotent)', () => {
  const a = { v:1, since:5, nodes:{ x:{ o:2, d:1000, vb:'f0', lv:3 } } }, b = { v:1, since:2, nodes:{ x:{ o:1, d:5000, vb:'0f', lv:9 }, y:{ o:1 } } };
  const m = C.mergeKnowledge(a, b);
  assert.deepEqual(m.nodes.x, { o:2, d:5000, vb:'ff', lv:9 }); assert.equal(m.since, 2); assert.ok(m.nodes.y);
  assert.deepEqual(C.mergeKnowledge(m, b), m);
});
