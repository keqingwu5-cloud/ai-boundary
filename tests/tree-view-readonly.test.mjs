import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, makeForest, readSnapshot, STORAGE_KEY, MAX_ITEMS } from '../tree-view-model.mjs';

function fixture() {
  return {
    version: 2,
    brains: [
      { id:'main', name:'第一大腦', parentBrainId:null, rootNodeId:null },
      { id:'sub', name:'研究子腦', parentBrainId:'main', rootNodeId:'n_sub' }
    ],
    nodes: [
      { id:'n_a', brainId:'main', parentId:null, title:'初始節點', kind:'question' },
      { id:'n_b', brainId:'main', parentId:'n_a', title:'延伸節點', kind:'extension' },
      { id:'n_sub', brainId:'sub', parentId:'n_a', title:'子腦根', kind:'question' },
      { id:'n_leaf', brainId:'sub', parentId:'n_sub', title:'子腦葉', kind:'extension' }
    ],
    links: [
      { id:'d', kind:'derived', from:'n_a', to:'n_b' },
      { id:'c', kind:'cross', from:'n_b', to:'n_leaf' },
      { id:'invalid', kind:'cross', from:'n_b', to:'ghost' }
    ],
    history: [{ ts:1, action:'seed', payload:{} }]
  };
}
test('reads only the original browser storage key without writing', () => {
  const snap = fixture(), calls = [];
  const storage = {
    getItem: k => { calls.push(['get', k]); return JSON.stringify(snap); },
    setItem: () => { throw Error('unexpected write'); },
    removeItem: () => { throw Error('unexpected remove'); }
  };
  const r = readSnapshot(storage);
  assert.equal(r.ok, true);
  assert.deepEqual(calls, [['get', STORAGE_KEY]]);
  assert.equal(r.tree.nodeCount, 4);
});
test('preserves original snapshot without migrating or altering node coordinates', () => {
  const s = fixture();
  s.nodes[0].pos = [1,2,3];
  const before = structuredClone(s);
  buildTree(s);
  assert.deepEqual(s, before);
});
test('nests brain children and local node children, not cross-brain parent as local child', () => {
  const r = buildTree(fixture());
  assert.equal(r.brainForest.length, 1);
  assert.equal(r.brainForest[0].id, 'main');
  assert.equal(r.brainForest[0].children[0].id, 'sub');
  assert.equal(r.brainForest[0].nodeForest[0].children[0].id, 'n_b');
  assert.equal(r.brainForest[0].children[0].nodeForest[0].id, 'n_sub');
  assert.equal(r.brainForest[0].children[0].nodeForest[0].children[0].id, 'n_leaf');
  assert.ok(r.diagnostics.some(d => d.code === 'PARENT_NOT_IN_GROUP' && d.id === 'n_sub'));
});
test('cross relation remains separate; invalid cross targets are not projected', () => {
  const r = buildTree(fixture());
  assert.deepEqual(r.crossLinks, [{ from:'n_b', to:'n_leaf' }]);
});
test('brainless orphan nodes are visible rather than silently discarded', () => {
  const s = fixture();
  s.nodes.push({ id:'orphan', brainId:'missing', parentId:null, title:'沒有腦區' });
  const r = buildTree(s);
  assert.equal(r.unassignedForest[0].id, 'orphan');
  assert.ok(r.diagnostics.some(d => d.code === 'MISSING_BRAIN'));
});
test('orphan parent nodes remain as roots with a diagnostic', () => {
  const s = fixture();
  s.nodes[1].parentId = 'missing-parent';
  const r = buildTree(s);
  assert.ok(r.brainForest[0].nodeForest.some(x => x.id === 'n_b'));
  assert.ok(r.diagnostics.some(d => d.id === 'n_b' && d.code === 'PARENT_NOT_IN_GROUP'));
});
test('node cycles do not recurse forever; all nodes remain visible in projections', () => {
  const s = fixture();
  s.nodes[0].parentId = 'n_b';
  const r = buildTree(s);
  const roots = r.brainForest[0].nodeForest;
  const ids = new Set();
  function walk(x) { ids.add(x.id); x.children.forEach(walk); }
  roots.forEach(walk);
  assert.deepEqual([...ids].sort(), ['n_a','n_b']);
  assert.ok(r.diagnostics.some(d => d.code === 'DETACHED_OR_CYCLE'));
});
test('brain cycles also terminate and preserve the affected brains', () => {
  const s = fixture();
  s.brains.push({ id:'other', name:'子腦 2', parentBrainId:'sub' });
  s.brains[1].parentBrainId = 'other';
  const r = buildTree(s);
  const names = [];
  function walk(x) { names.push(x.id); x.children.forEach(walk); }
  r.brainForest.forEach(walk);
  assert.deepEqual(names.sort(), ['main','other','sub']);
  assert.ok(r.diagnostics.some(d => d.code === 'DETACHED_OR_CYCLE'));
});
test('self-parent is detected without losing the node', () => {
  const s = fixture();
  s.nodes[0].parentId = 'n_a';
  const r = buildTree(s);
  assert.ok(r.diagnostics.some(d => d.code === 'SELF_PARENT' && d.id === 'n_a'));
  assert.equal(r.brainForest[0].nodeForest[0].id, 'n_a');
});
test('missing local snapshot is not invented from seed data', () => {
  assert.deepEqual(readSnapshot({ getItem: () => null }), { ok:false, reason:'NO_LOCAL_SNAPSHOT' });
});
test('malformed JSON and restricted storage fail closed', () => {
  assert.equal(readSnapshot({ getItem: () => '{' }).reason, 'INVALID_SNAPSHOT');
  assert.equal(readSnapshot({ getItem: () => { throw Error('blocked'); } }).reason, 'STORAGE_UNAVAILABLE');
});
test('invalid structure, missing main, and duplicate IDs fail closed', () => {
  const a = fixture(); delete a.history; assert.throws(() => buildTree(a), /INVALID_AIBRAIN_SHAPE/);
  const b = fixture(); b.brains = b.brains.slice(1); assert.throws(() => buildTree(b), /MISSING_MAIN_BRAIN/);
  const c = fixture(); c.nodes.push({ ...c.nodes[0] }); assert.throws(() => buildTree(c), /DUPLICATE_ID/);
});
test('oversized snapshot is refused rather than freezing the UI', () => {
  const s = fixture();
  s.nodes = Array.from({ length:MAX_ITEMS + 1 }, (_,i) => ({ id:'n'+i, brainId:'main' }));
  assert.throws(() => buildTree(s), /VIEW_ITEM_LIMIT/);
});
test('makeForest sorts and reports missing parents on an isolated synthetic set', () => {
  const diag = [];
  const out = makeForest([
    { id:'b', name:'Beta', parentBrainId:'missing' },
    { id:'a', name:'Alpha', parentBrainId:null }
  ], 'parentBrainId', diag, 'brain');
  assert.deepEqual(out.map(x=>x.id), ['a','b']);
  assert.equal(diag[0].code,'PARENT_NOT_IN_GROUP');
});
