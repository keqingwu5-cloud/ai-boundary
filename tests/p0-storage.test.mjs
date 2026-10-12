// P0 保護基線：本機存檔（reliability/storage.mjs）的驗收測試。不需要任何套件：node --test tests/p0-storage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH_KEY, UNDO_KEY, WORLD_MODEL_KEY, BACKUP_PREFIX, BACKUP_KEEP, openGuardedStore, snapshot, backup, backupState, backupWorldModel,
  restoreBackup, validateBackup, validateUndoEntry, listBackups, pruneBackups, isBackedUpKey } from '../reliability/storage.mjs';

const graph = (extra = {}) => ({ version:2, brains:[{ id:'main', parentBrainId:null, rootNodeId:null }], nodes:[{ id:'a', title:'好資料', brainId:'main', parentId:null }],
  links:[], history:[{ ts:1, action:'seed', payload:{} }], ...extra });
class Storage {
  map = new Map(); failure = () => false; listeners = [];
  get length(){ return this.map.size; } key(i){ return [...this.map.keys()][i] ?? null; }
  getItem(k){ return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v){ if (this.failure(k, v)){ const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; } this.map.set(k, String(v)); }
  removeItem(k){ this.map.delete(k); }
}
const backups = s => [...s.map.keys()].filter(k => k.startsWith(BACKUP_PREFIX));
const seeded = () => { const s = new Storage(); s.setItem(GRAPH_KEY, JSON.stringify(graph())); return s; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('#1 備份輪替：資料每次載入都不同，備份最多保留 BACKUP_KEEP 份（不會塞滿 localStorage）', async () => {
  const s = seeded(); s.setItem(UNDO_KEY, JSON.stringify(['x'.repeat(50000)]));
  for (let i = 0; i < 12; i++){
    const p = openGuardedStore(s, g => g, graph);
    p.save({ ...p.state, nodes:[{ ...p.state.nodes[0], title:'第 ' + i + ' 次' }] });
    await sleep(2);                                   // createdAt 不同
  }
  assert.equal(backups(s).length, BACKUP_KEEP);
  const newest = JSON.parse(s.getItem(listBackups(s)[0].key));
  assert.match(newest.entries[GRAPH_KEY], /第 10 次/, '保留的是最新的幾份');
});
test('#1 備份排除 aiBrain.v1.undo、aiBrain.audioLab.*、登入 token 與同步快取；納入 worldModel.verify.v1', () => {
  const s = seeded();
  s.setItem(UNDO_KEY, '[]'); s.setItem('aiBrain.audioLab.jpTransitions.v1', '{}'); s.setItem('aiBrain.audioLab.backup.2026', '{}');
  s.setItem('aiBrain.auth', '{"access_token":"secret"}'); s.setItem('aiBrain.sync.v2:main', '{}'); s.setItem('aiBrain.feed.v1', '{"likes":{}}');
  s.setItem(WORLD_MODEL_KEY, JSON.stringify([{ id:'v1', hypothesis:'h' }])); s.setItem('unrelated', 'x');
  const b = snapshot(s);
  assert.deepEqual(Object.keys(b.entries).sort(), [GRAPH_KEY, 'aiBrain.feed.v1', WORLD_MODEL_KEY].sort());
  assert.ok(!JSON.stringify(b).includes('secret'));
  assert.equal(b.manifest.counts.graph.nodes, 1); assert.equal(b.manifest.counts.worldModel.records, 1);
  assert.equal(b.manifest.sha256[GRAPH_KEY].length, 64);
  for (const k of [UNDO_KEY, 'aiBrain.audioLab.x', 'aiBrain.auth', 'aiBrain.sync.v2:main', BACKUP_PREFIX + 'x']) assert.equal(isBackedUpKey(k), false, k);
});
test('#2 另一分頁寫入 → 衝突狀態＋事件（不是靜默停用）；可選擇保留此分頁（先備份另一分頁版本）', () => {
  const s = seeded(), p = openGuardedStore(s, g => g, graph), seen = [];
  p.onStatus(st => seen.push(st.mode));
  const other = JSON.stringify(graph({ nodes:[{ id:'a', title:'另一分頁', brainId:'main', parentId:null }] }));
  s.setItem(GRAPH_KEY, other);                         // 另一分頁寫入（瀏覽器會觸發 storage 事件 → app.js 呼叫 checkExternal）
  assert.equal(p.checkExternal().mode, 'conflict'); assert.deepEqual(seen, ['conflict']);
  assert.throws(() => p.save(graph()), /CONFLICT/); assert.equal(s.getItem(GRAPH_KEY), other, '另一分頁的資料沒有被覆寫');
  p.overwrite(graph({ nodes:[{ id:'a', title:'此分頁', brainId:'main', parentId:null }] }));
  assert.equal(p.status().mode, 'ok'); assert.match(s.getItem(GRAPH_KEY), /此分頁/);
  assert.ok(backups(s).some(k => s.getItem(k).includes('另一分頁')), '另一分頁的版本已存成備份');
  p.save(graph()); assert.equal(p.status().mode, 'ok', '解除衝突後恢復正常儲存');
});
test('#2 此分頁未儲存的版本可以存成備份再載入最新（backupState）', () => {
  const s = seeded(); const mine = graph({ nodes:[{ id:'a', title:'此分頁未存', brainId:'main', parentId:null }] });
  const r = backupState(s, 'unsaved-tab-before-reload', mine);
  assert.match(JSON.parse(s.getItem(r.key)).entries[GRAPH_KEY], /此分頁未存/); assert.match(s.getItem(GRAPH_KEY), /好資料/);
});
test('#3 輕量復原快照（沒有 history）通過驗證；壞的仍被拒絕', () => {
  const { history, ...lite } = graph();
  assert.ok(validateUndoEntry(JSON.stringify(lite)));
  assert.throws(() => validateUndoEntry(JSON.stringify({ ...lite, nodes:[{ id:'a', brainId:'nope' }] })));
});
test('P0 驗收：損毀存檔絕不被覆寫，好的備份保留；並可從備份還原', () => {
  const s = seeded(); const good = s.getItem(GRAPH_KEY);
  const p0 = openGuardedStore(s, g => g, graph); p0.save(p0.state);  // 正常載入 → 有一份好的備份
  const goodBackups = backups(s); assert.equal(goodBackups.length, 1);
  for (const corrupt of ['{"version":2,"nodes":[', JSON.stringify({ ...graph(), version:999 })]){
    s.setItem(GRAPH_KEY, corrupt);
    for (let i = 0; i < 5; i++){                      // 連續重新整理也不會產生壞備份或輪替掉好備份
      const p = openGuardedStore(s, g => g, graph);
      assert.equal(p.status().mode, 'blocked');
      assert.throws(() => p.save(graph()), /BLOCKED/);
      assert.equal(s.getItem(GRAPH_KEY), corrupt, '原文保留');
    }
    assert.deepEqual(backups(s), goodBackups, '好的備份還在');
  }
  const r = restoreBackup(s, JSON.parse(s.getItem(goodBackups[0])));
  assert.equal(s.getItem(GRAPH_KEY), good, '從備份還原成功');
  assert.ok(JSON.parse(s.getItem(r.rollbackKey)).entries[GRAPH_KEY].includes('"version":999'), '還原前的損毀原文另存隔離副本');
  assert.equal(openGuardedStore(s, g => g, graph).status().mode, 'ok');
});
test('P0 驗收：容量已滿時存檔不覆寫原文，狀態可見，空間恢復後下一次儲存成功', () => {
  const s = seeded(); const p = openGuardedStore(s, g => g, graph); const before = s.getItem(GRAPH_KEY);
  s.failure = k => k === GRAPH_KEY;
  assert.throws(() => p.save(graph({ nodes:[{ id:'a', title:'新', brainId:'main', parentId:null }] })), /QUOTA/);
  assert.deepEqual([p.status().mode, p.status().error], ['save-failed', 'QUOTA_EXCEEDED']); assert.equal(s.getItem(GRAPH_KEY), before);
  s.failure = () => false; p.save(graph({ nodes:[{ id:'a', title:'新', brainId:'main', parentId:null }] }));
  assert.equal(p.status().mode, 'ok'); assert.match(s.getItem(GRAPH_KEY), /新/);
});
test('P0 驗收：世界模型紀錄進入同一份備份，可還原；損毀的世界模型或主腦不會變成備份', () => {
  const s = seeded(); const rows = JSON.stringify([{ id:'v1', hypothesis:'CPI 加速必升息' }]); s.setItem(WORLD_MODEL_KEY, rows);
  const b = backup(s, 'test').backup;
  s.setItem(WORLD_MODEL_KEY, JSON.stringify([]));
  restoreBackup(s, b); assert.equal(s.getItem(WORLD_MODEL_KEY), rows);
  s.setItem(WORLD_MODEL_KEY, '{oops'); assert.throws(() => backup(s, 'bad'), /JSON|WORLD_MODEL/);
  // world-model.html：主腦存檔壞掉時仍可備份世界模型（不帶壞主腦）
  s.setItem(WORLD_MODEL_KEY, rows); s.setItem(GRAPH_KEY, '{broken');
  const w = backupWorldModel(s, 'world-model-load').backup;
  assert.deepEqual(Object.keys(w.entries), [WORLD_MODEL_KEY]); validateBackup(w);
});
test('P0 驗收：被竄改的備份（雜湊不符）、未知鍵或登入 token 不能還原；舊版 v1 備份仍可還原', () => {
  const s = seeded(); const b = snapshot(s);
  assert.throws(() => restoreBackup(s, { ...b, entries:{ ...b.entries, [GRAPH_KEY]:b.entries[GRAPH_KEY].replace('好資料', '竄改') } }), /HASH|MANIFEST/);
  assert.throws(() => restoreBackup(s, { ...b, entries:{ ...b.entries, 'aiBrain.auth':'{}' } }), /INVALID/);
  const v1 = { format:'aiBrain-backup', formatVersion:1, createdAt:'2026-10-01T00:00:00Z', reason:'old', entries:{ [GRAPH_KEY]:JSON.stringify(graph({ nodes:[{ id:'a', title:'v1 備份', brainId:'main', parentId:null }] })) } };
  restoreBackup(s, v1); assert.match(s.getItem(GRAPH_KEY), /v1 備份/);
});
test('pruneBackups 不刪隔離副本（quarantine）', () => {
  const s = seeded(); s.setItem(BACKUP_PREFIX + 'quarantine.x', '{"format":"aiBrain-quarantine","createdAt":"2000-01-01"}');
  for (let i = 0; i < 4; i++) s.setItem(BACKUP_PREFIX + i, JSON.stringify({ createdAt:'2026-10-0' + (i + 1) }));
  pruneBackups(s, 1); assert.deepEqual(backups(s).sort(), [BACKUP_PREFIX + '3', BACKUP_PREFIX + 'quarantine.x']);
});
