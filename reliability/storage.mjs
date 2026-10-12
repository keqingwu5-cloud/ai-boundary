/* Browser-only persistence guard. No provider, network, or schema rewrite. */
export const GRAPH_KEY = 'aiBrain.v1';
export const BACKUP_PREFIX = 'aiBrain.backup.';
const copy = value => JSON.parse(JSON.stringify(value));
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
export function snapshot(storage, reason = 'manual') {
  const entries = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k.startsWith('aiBrain.') && !k.startsWith(BACKUP_PREFIX)) entries[k] = storage.getItem(k);
  }
  return { format:'aiBrain-backup', formatVersion:1, createdAt:new Date().toISOString(), reason, entries };
}
export function validateBackup(b) {
  if (b?.format !== 'aiBrain-backup' || b.formatVersion !== 1 || !b.entries || typeof b.entries !== 'object' || Array.isArray(b.entries)) throw new Error('INVALID_BACKUP');
  for (const [k, v] of Object.entries(b.entries)) {
    if (!k.startsWith('aiBrain.') || k.startsWith(BACKUP_PREFIX) || typeof v !== 'string') throw new Error('INVALID_BACKUP_ENTRY');
  }
  if (b.entries[GRAPH_KEY] == null) throw new Error('BACKUP_MISSING_GRAPH');
  validateGraph(JSON.parse(b.entries[GRAPH_KEY]));
  return b;
}
export function backup(storage, reason) {
  const b = snapshot(storage, reason), raw = JSON.stringify(b);
  // Reuse an identical snapshot to avoid consuming quota on every reload.
  for (let i = 0; i < storage.length; i++) {
    const existingKey = storage.key(i);
    if (!existingKey.startsWith(BACKUP_PREFIX)) continue;
    try {
      const existing = JSON.parse(storage.getItem(existingKey));
      if (existing.format === 'aiBrain-backup' && existing.formatVersion === 1 && JSON.stringify(existing.entries) === JSON.stringify(b.entries)) return { key:existingKey, backup:existing };
    } catch {}
  }
  const key = BACKUP_PREFIX + globalThis.crypto.randomUUID();
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error('BACKUP_VERIFY_FAILED');
  return { key, backup:b };
}
export function openGuardedStore(storage, migrate, seed) {
  let expected = null, blocked = false, lastError = null, state;
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
  return {
    state,
    status:() => ({ blocked, error:lastError }),
    save(next) {
      if (blocked) throw new Error('PERSISTENCE_BLOCKED');
      validateGraph(next);
      if (storage.getItem(GRAPH_KEY) !== expected) {
        blocked = true; lastError = 'LOCAL_VERSION_CONFLICT'; throw new Error(lastError);
      }
      const raw = JSON.stringify(next);
      storage.setItem(GRAPH_KEY, raw); expected = raw;
    }
  };
}
/* Restore is explicit and backed up; it never deletes unrelated storage keys.
   localStorage has no multi-key transaction: retain the backup if rollback fails. */
export function restoreBackup(storage, input) {
  const b = validateBackup(copy(input));
  const previous = backup(storage, 'before-restore');
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
