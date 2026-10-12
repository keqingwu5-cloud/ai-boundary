/* Browser-only persistence guard. No provider, network, or schema rewrite.
   P0：備份涵蓋所有資料鍵（aiBrain.* 的資料 + worldModel.verify.v1），排除可重建或敏感的鍵；
   自動備份輪替（最多 BACKUP_KEEP 份）；另一分頁寫入時改成「衝突」狀態（不是永久停用），並通知 UI。 */
export const GRAPH_KEY = 'aiBrain.v1';
export const UNDO_KEY = 'aiBrain.v1.undo';
export const WORLD_MODEL_KEY = 'worldModel.verify.v1';
export const BACKUP_PREFIX = 'aiBrain.backup.';
export const BACKUP_KEEP = 3;
export const BACKUP_FORMAT_VERSION = 2;
const copy = value => JSON.parse(JSON.stringify(value));

/* 哪些鍵進備份：
   - 納入：aiBrain.v1（主腦）、aiBrain.feed.v1、aiBrain.knowledge.v1 等其他 aiBrain.* 資料，以及世界模型的 worldModel.verify.v1
   - 排除：aiBrain.v1.undo（復原暫存，最大宗、每次都變）、aiBrain.audioLab.*（實驗室暫存與它自己的備份）、
           aiBrain.auth*（Supabase 登入 token，不可進入可匯出的備份檔）、aiBrain.sync.*（雲端快照快取，可重新拉取）、備份本身 */
const EXCLUDED = [
  k => k === UNDO_KEY, k => k.startsWith('aiBrain.audioLab.'), k => k.startsWith('aiBrain.auth'),
  k => k.startsWith('aiBrain.sync.'), k => k.startsWith(BACKUP_PREFIX)
];
export function isBackedUpKey(k) {
  if (k === WORLD_MODEL_KEY) return true;
  return typeof k === 'string' && k.startsWith('aiBrain.') && !EXCLUDED.some(f => f(k));
}

export function validateGraph(s) {
  if (!s || ![1, 2].includes(s.version)) throw new Error('UNSUPPORTED_GRAPH_VERSION');
  for (const k of ['brains', 'nodes', 'links', 'history'])
    if (!Array.isArray(s[k])) throw new Error('INVALID_GRAPH');
  const ids = k => {
    const a = s[k].map(x => x?.id);
    if (a.some(x => typeof x !== 'string' || !x) || new Set(a).size !== a.length)
      throw new Error('DUPLICATE_OR_INVALID_ID');
    return new Set(a);
  };
  const brains = ids('brains'), nodes = ids('nodes'); ids('links');
  if (!brains.has('main')) throw new Error('MISSING_MAIN');
  for (const n of s.nodes) {
    if (!brains.has(n.brainId) || (n.parentId != null && !nodes.has(n.parentId))) throw new Error('DANGLING_NODE');
  }
  for (const b of s.brains) {
    if ((b.parentBrainId != null && !brains.has(b.parentBrainId)) || (b.rootNodeId != null && !nodes.has(b.rootNodeId))) throw new Error('DANGLING_BRAIN');
  }
  for (const l of s.links) if (!nodes.has(l.from) || !nodes.has(l.to)) throw new Error('DANGLING_LINK');
  for (const [items, key] of [[s.nodes, 'parentId'], [s.brains, 'parentBrainId']]) {
    const map = new Map(items.map(x => [x.id, x[key]]));
    for (const item of items) {
      const seen = new Set(); let id = item.id;
      while (id != null) { if (seen.has(id)) throw new Error('PARENT_CYCLE'); seen.add(id); id = map.get(id); }
    }
  }
  return s;
}
/* 復原暫存（undo）可能是「輕量快照」：沒有 history（復原時沿用目前的 history）。驗證時補一個空 history。 */
export function validateUndoEntry(raw) {
  const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
  validateGraph(Array.isArray(o?.history) ? o : Object.assign({}, o, { history:[] }));
  return o;
}
export function validateWorldModel(raw) {
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error('INVALID_WORLD_MODEL');
  return rows;
}
export function verifyTopology(before, after) {
  validateGraph(after);
  for (const [kind, keys] of [['nodes', ['brainId', 'parentId']], ['brains', ['parentBrainId', 'rootNodeId']], ['links', ['from', 'to', 'kind']]]) {
    for (const old of before[kind]) {
      const now = after[kind].find(x => x.id === old.id);
      if (!now || keys.some(k => now[k] !== old[k])) throw new Error('MIGRATION_TOPOLOGY_CHANGED');
    }
  }
  if (JSON.stringify(after.history.slice(0, before.history.length)) !== JSON.stringify(before.history)) throw new Error('MIGRATION_HISTORY_CHANGED');
  return true;
}

/* ---------- SHA-256（同步版，給備份 manifest 用；瀏覽器 crypto.subtle 是 async） ---------- */
const K256 = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
export function sha256(str) {
  const msg = new TextEncoder().encode(str), len = msg.length, n = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(n); buf.set(msg); buf[len] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(n - 4, (len * 8) >>> 0); dv.setUint32(n - 8, Math.floor(len / 0x20000000));
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), W = new Uint32Array(64);
  const r = (x, s) => (x >>> s) | (x << (32 - s));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) W[i] = (r(W[i-15],7) ^ r(W[i-15],18) ^ (W[i-15] >>> 3)) + W[i-16] + (r(W[i-2],17) ^ r(W[i-2],19) ^ (W[i-2] >>> 10)) + W[i-7];
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e,6) ^ r(e,11) ^ r(e,25)) + ((e & f) ^ (~e & g)) + K256[i] + W[i]) >>> 0;
      const t2 = ((r(a,2) ^ r(a,13) ^ r(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map(x => x.toString(16).padStart(8, '0')).join('');
}

/* ---------- 備份 ---------- */
function manifestOf(entries) {
  const m = { keys:Object.keys(entries).sort(), sha256:{}, bytes:{}, counts:{} };
  for (const k of m.keys) { m.sha256[k] = sha256(entries[k]); m.bytes[k] = entries[k].length; }
  try { const g = JSON.parse(entries[GRAPH_KEY]); m.counts.graph = { brains:g.brains.length, nodes:g.nodes.length, links:g.links.length, history:g.history.length }; } catch {}
  try { m.counts.worldModel = { records:JSON.parse(entries[WORLD_MODEL_KEY]).length }; } catch {}
  return m;
}
export function snapshot(storage, reason = 'manual', override = {}) {
  const entries = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (isBackedUpKey(k)) entries[k] = storage.getItem(k);
  }
  Object.assign(entries, override);
  return { format:'aiBrain-backup', formatVersion:BACKUP_FORMAT_VERSION, createdAt:new Date().toISOString(), reason, entries, manifest:manifestOf(entries) };
}
/* 來源資料本身要是好的，才值得備份（損毀存檔由「不覆寫原文」保護；壞備份不能把好備份輪替掉） */
function assertEntriesValid(entries) {
  if (entries[GRAPH_KEY] == null && entries[WORLD_MODEL_KEY] == null) throw new Error('BACKUP_MISSING_DATA');
  if (entries[GRAPH_KEY] != null) validateGraph(JSON.parse(entries[GRAPH_KEY]));
  if (entries[WORLD_MODEL_KEY] != null) validateWorldModel(entries[WORLD_MODEL_KEY]);
}
export function validateBackup(b) {
  if (b?.format !== 'aiBrain-backup' || ![1, 2].includes(b.formatVersion) || !b.entries || typeof b.entries !== 'object' || Array.isArray(b.entries)) throw new Error('INVALID_BACKUP');
  for (const [k, v] of Object.entries(b.entries)) {
    const allowed = b.formatVersion === 1 ? k.startsWith('aiBrain.') && !k.startsWith(BACKUP_PREFIX) : isBackedUpKey(k);
    if (!allowed || typeof v !== 'string') throw new Error('INVALID_BACKUP_ENTRY');
  }
  if (b.formatVersion === 1 && b.entries[GRAPH_KEY] == null) throw new Error('BACKUP_MISSING_GRAPH');
  if (b.formatVersion === 2) {
    if (!b.manifest || !b.manifest.sha256) throw new Error('BACKUP_MISSING_MANIFEST');
    const keys = Object.keys(b.entries).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...b.manifest.keys].sort())) throw new Error('BACKUP_MANIFEST_MISMATCH');
    for (const k of keys) if (sha256(b.entries[k]) !== b.manifest.sha256[k]) throw new Error('BACKUP_HASH_MISMATCH');
  }
  assertEntriesValid(b.entries);
  return b;
}
export function listBackups(storage) {
  const out = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(BACKUP_PREFIX)) continue;
    let b = null; try { b = JSON.parse(storage.getItem(key)); } catch {}
    out.push({ key, createdAt:b?.createdAt || '', reason:b?.reason || '', formatVersion:b?.formatVersion ?? null, bytes:(storage.getItem(key) || '').length, counts:b?.manifest?.counts || null });
  }
  return out.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
}
/* 輪替：只留最新 keep 份（舊版沒有 createdAt 的視為最舊） */
export function pruneBackups(storage, keep = BACKUP_KEEP) {
  const removed = [];
  // 隔離副本（quarantine.*：還原前損毀原文的留存）不參與輪替，只能由使用者手動刪除
  for (const b of listBackups(storage).filter(b => !b.key.startsWith(BACKUP_PREFIX + 'quarantine.')).slice(Math.max(0, keep))) { storage.removeItem(b.key); removed.push(b.key); }
  return removed;
}
function writeBackup(storage, b) {
  validateBackup(b);
  const raw = JSON.stringify(b);
  for (const existing of listBackups(storage)) {        // 相同內容重用，不因每次載入多一份
    try {
      const e = JSON.parse(storage.getItem(existing.key));
      if (e.format === 'aiBrain-backup' && JSON.stringify(e.entries) === JSON.stringify(b.entries)) return { key:existing.key, backup:e, reused:true };
    } catch {}
  }
  pruneBackups(storage, BACKUP_KEEP - 1);               // 先騰出位置，寫入後總數 ≤ BACKUP_KEEP
  const key = BACKUP_PREFIX + globalThis.crypto.randomUUID();
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error('BACKUP_VERIFY_FAILED');
  return { key, backup:b, reused:false };
}
export function backup(storage, reason) { return writeBackup(storage, snapshot(storage, reason)); }
/* world-model.html 用：世界模型紀錄有效就備份；主腦存檔若損毀則不放進這份備份（主腦原文由 app.js 的保護模式負責保留） */
export function backupWorldModel(storage, reason) {
  const b = snapshot(storage, reason);
  try { if (b.entries[GRAPH_KEY] != null) validateGraph(JSON.parse(b.entries[GRAPH_KEY])); }
  catch { delete b.entries[GRAPH_KEY]; b.manifest = manifestOf(b.entries); }
  return writeBackup(storage, b);
}
/* 把「記憶體中的主腦」（例如另一分頁已改了存檔、這個分頁尚未儲存的版本）存成一份備份，避免靜默遺失 */
export function backupState(storage, reason, graph) { return writeBackup(storage, snapshot(storage, reason, { [GRAPH_KEY]:JSON.stringify(graph) })); }

/* ---------- 受保護的主腦存檔 ----------
   status():
     blocked  —— 存檔損壞／版本不明／遷移失敗／備份失敗：原文不覆寫，這個分頁不再儲存（重新整理或還原後才解除）
     conflict —— 另一個分頁已改了存檔：暫停儲存；由使用者選「載入最新」或「保留這個分頁（先備份另一版）」
     saveFailed —— 最近一次寫入失敗（例如容量已滿）：原文不變；下一次修改會再試 */
export function openGuardedStore(storage, migrate, seed) {
  let expected = null, blocked = false, conflict = false, saveFailed = false, lastError = null, lastSavedAt = null, state;
  const listeners = new Set();
  const status = () => ({ blocked, conflict, saveFailed, error:lastError, lastSavedAt, mode:blocked ? 'blocked' : conflict ? 'conflict' : saveFailed ? 'save-failed' : 'ok' });
  const notify = () => { const s = status(); listeners.forEach(f => { try { f(s); } catch {} }); };
  try {
    expected = storage.getItem(GRAPH_KEY);
    if (expected !== null) {
      const original = validateGraph(JSON.parse(expected));
      // Backup is durable before the existing migration function is invoked.
      backup(storage, 'before-load-migration');
      const candidate = migrate(copy(original));
      verifyTopology(original, candidate);
      state = candidate;
    } else state = validateGraph(migrate(seed()));
  } catch (e) {
    blocked = true; lastError = e.message;
    try { state = validateGraph(JSON.parse(expected)); }
    catch { state = validateGraph(migrate(seed())); }
  }
  const markConflict = () => { if (!conflict) { conflict = true; lastError = 'LOCAL_VERSION_CONFLICT'; notify(); } };
  return {
    state,
    status,
    onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /* 有 storage 事件（另一分頁寫入）時呼叫：存檔跟這個分頁上次寫入的不同 → 衝突 */
    checkExternal() { if (!blocked && storage.getItem(GRAPH_KEY) !== expected) markConflict(); return status(); },
    save(next) {
      if (blocked) throw new Error('PERSISTENCE_BLOCKED');
      if (conflict) throw new Error('LOCAL_VERSION_CONFLICT');
      validateGraph(next);
      if (storage.getItem(GRAPH_KEY) !== expected) { markConflict(); throw new Error('LOCAL_VERSION_CONFLICT'); }
      const raw = JSON.stringify(next);
      try { storage.setItem(GRAPH_KEY, raw); }
      catch (e) {
        // 例如 QuotaExceededError：setItem 失敗不會改到原本的值；記錄狀態讓 UI 顯示，下一次修改會再試
        saveFailed = true; lastError = /quota/i.test(e && (e.name + e.message)) ? 'QUOTA_EXCEEDED' : 'SAVE_FAILED'; notify(); throw new Error(lastError);
      }
      expected = raw; lastSavedAt = Date.now();
      if (saveFailed) { saveFailed = false; lastError = null; notify(); }
    },
    /* 使用者明確選「保留這個分頁的版本」：先把另一分頁寫入的版本備份起來，再覆蓋 */
    overwrite(next) {
      if (blocked) throw new Error('PERSISTENCE_BLOCKED');
      validateGraph(next);
      const other = storage.getItem(GRAPH_KEY), raw = JSON.stringify(next);
      if (other !== null) backup(storage, 'before-tab-overwrite');
      storage.setItem(GRAPH_KEY, raw); expected = raw; lastSavedAt = Date.now();
      conflict = false; saveFailed = false; lastError = null; notify();
    }
  };
}
/* Restore is explicit and backed up; it never deletes unrelated storage keys.
   localStorage has no multi-key transaction: retain the backup if rollback fails. */
export function restoreBackup(storage, input) {
  const b = validateBackup(copy(input));
  let previous = null;
  try { previous = backup(storage, 'before-restore'); }
  catch (e) {
    // 目前資料本身壞掉（例如主腦存檔損毀）時無法建立正常備份：原文另存一份隔離副本後再還原
    if (!/QUOTA/i.test(e.message || '') && !(e.name === 'QuotaExceededError')) {
      const key = BACKUP_PREFIX + 'quarantine.' + globalThis.crypto.randomUUID(), entries = {};
      for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (isBackedUpKey(k)) entries[k] = storage.getItem(k); }
      const raw = JSON.stringify({ format:'aiBrain-quarantine', createdAt:new Date().toISOString(), reason:'before-restore-corrupt', entries });
      storage.setItem(key, raw); if (storage.getItem(key) !== raw) throw new Error('BACKUP_VERIFY_FAILED');
      previous = { key };
    } else throw e;
  }
  const touched = [];
  try {
    for (const [k, v] of Object.entries(b.entries)) {
      touched.push([k, storage.getItem(k)]); storage.setItem(k, v);
      if (storage.getItem(k) !== v) throw new Error('RESTORE_VERIFY_FAILED');
    }
  } catch {
    let failed = false;
    for (const [k, v] of touched.reverse()) {
      try { v == null ? storage.removeItem(k) : storage.setItem(k, v); } catch { failed = true; }
    }
    const error = new Error(failed ? 'RESTORE_ROLLBACK_REQUIRED' : 'RESTORE_FAILED_ROLLED_BACK');
    error.backupKey = previous.key; throw error;
  }
  return { restored:true, rollbackKey:previous.key };
}
