/* 第一大腦｜2D 唯讀樹資料投影 V0.1
 * Source of truth: existing browser localStorage['aiBrain.v1'].
 * This module never writes source state, never migrates, and never infers causality from graph edges.
 */
export const STORAGE_KEY = 'aiBrain.v1';
export const MAX_ITEMS = 15000;

const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 256;
const byTitle = (a, b) => String(a.title || a.name || a.id).localeCompare(String(b.title || b.name || b.id), 'zh-Hant');

function indexed(items, type) {
  const map = new Map();
  for (const item of items) {
    if (!item || !validId(item.id)) throw Error(type + ':INVALID_ID');
    if (map.has(item.id)) throw Error(type + ':DUPLICATE_ID:' + item.id);
    map.set(item.id, item);
  }
  return map;
}

// A defensive forest projection. Cycle and missing-parent components remain visible as roots.
export function makeForest(items, parentKey, diagnostics, label, allIds = null) {
  const map = indexed(items, label);
  const childMap = new Map(items.map(x => [x.id, []]));
  const roots = [];
  const ordered = [...items].sort(byTitle);
  for (const item of ordered) {
    const parent = item[parentKey];
    if (parent == null || parent === '') {
      roots.push(item);
    } else if (parent === item.id) {
      diagnostics.push({ code: 'SELF_PARENT', kind: label, id: item.id });
      roots.push(item);
    } else if (map.has(parent)) {
      childMap.get(parent).push(item);
    } else {
      // A real parent in another brain is an expected subbrain root, not corruption.
      if (!allIds || !allIds.has(parent)) {
        diagnostics.push({ code: 'PARENT_NOT_IN_GROUP', kind: label, id: item.id, parent });
      }
      roots.push(item);
    }
  }
  for (const arr of childMap.values()) arr.sort(byTitle);
  const visited = new Set();
  function visit(item, ancestors = new Set()) {
    if (ancestors.has(item.id)) {
      diagnostics.push({ code: 'CYCLE', kind: label, id: item.id });
      return null;
    }
    if (visited.has(item.id)) return null;
    visited.add(item.id);
    const next = new Set(ancestors);
    next.add(item.id);
    return { ...item, children: childMap.get(item.id).map(n => visit(n, next)).filter(Boolean) };
  }
  const result = roots.map(n => visit(n)).filter(Boolean);
  for (const item of ordered) {
    if (!visited.has(item.id)) {
      diagnostics.push({ code: 'DETACHED_OR_CYCLE', kind: label, id: item.id });
      const section = visit(item);
      if (section) result.push(section);
    }
  }
  return result;
}

export function buildTree(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' ||
      !Array.isArray(snapshot.brains) || !Array.isArray(snapshot.nodes) ||
      !Array.isArray(snapshot.links) || !Array.isArray(snapshot.history)) {
    throw Error('INVALID_AIBRAIN_SHAPE');
  }
  if (snapshot.brains.length + snapshot.nodes.length > MAX_ITEMS) throw Error('VIEW_ITEM_LIMIT');
  const brainMap = indexed(snapshot.brains, 'brain');
  const nodeMap = indexed(snapshot.nodes, 'node');
  if (!brainMap.has('main')) throw Error('MISSING_MAIN_BRAIN');

  const diagnostics = [];
  const perBrain = new Map(snapshot.brains.map(b => [b.id, []]));
  const unassigned = [];
  for (const node of snapshot.nodes) {
    if (brainMap.has(node.brainId)) perBrain.get(node.brainId).push(node);
    else {
      diagnostics.push({ code: 'MISSING_BRAIN', kind: 'node', id: node.id, brainId: node.brainId ?? null });
      unassigned.push(node);
    }
  }
  const brainProjections = snapshot.brains.map(b => ({
    id: b.id, name: String(b.name || b.id), parentBrainId: b.parentBrainId ?? null,
    rootNodeId: b.rootNodeId ?? null, nodeCount: perBrain.get(b.id).length,
    nodeForest: makeForest(perBrain.get(b.id), 'parentId', diagnostics, 'node', nodeMap)
  }));
  const brainForest = makeForest(brainProjections, 'parentBrainId', diagnostics, 'brain');
  // Different relations are intentionally not collapsed into a single hierarchy.
  const crossLinks = snapshot.links.filter(l => l && l.kind === 'cross' &&
    nodeMap.has(l.from) && nodeMap.has(l.to)).map(l => ({ from:l.from, to:l.to }));
  return {
    brainForest, unassignedForest: makeForest(unassigned, 'parentId', diagnostics, 'unassigned'),
    brainCount: brainMap.size, nodeCount: nodeMap.size, crossLinks, diagnostics,
    nodeIndex: nodeMap, brainIndex: brainMap,
    sourceVersion: snapshot.version ?? null
  };
}

export function readSnapshot(storage) {
  let raw;
  try {
    if (!storage || typeof storage.getItem !== 'function') throw Error('STORAGE_UNAVAILABLE');
    raw = storage.getItem(STORAGE_KEY);
  } catch (_e) { return { ok: false, reason: 'STORAGE_UNAVAILABLE' }; }
  if (raw === null) return { ok: false, reason: 'NO_LOCAL_SNAPSHOT' };
  try {
    return { ok: true, tree: buildTree(JSON.parse(raw)) };
  } catch (e) {
    return { ok: false, reason: 'INVALID_SNAPSHOT', detail: String(e?.message || e).slice(0,120) };
  }
}
