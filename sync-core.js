/* sync-core.js — 純邏輯（沒有 DOM、沒有網路），讓大腦／feed 跟 Supabase 同步。
   瀏覽器與 node（tests/sync-core.test.mjs）共用。

   模型：把 graph 拆成「實體」（entity），每個實體是雲端 brain_entities 的一列：
     kind = 'brain' | 'node' | 'link' | 'concept' | 'pattern' | 'meta'
     id   = brains[].id / nodes[].id / links[].id / 概念名稱 / 流程名稱 / 頂層欄位名（seedExtras、seedPatches…）
     data = 該實體的 JSON，deleted = 墓碑（刪除也會同步，離線裝置不會把它復活）
   history 是只增不減的紀錄，另外存在 brain_history，用 hkey 去重。
   合併規則（每個實體各自決定，不會整份 graph 互相覆蓋）：
     1. 本機佇列（尚未上傳的修改）裡有的實體 → 保留本機版本，等上傳後以「最後寫入者」為準。
     2. 否則雲端版本優先（版本號比已知的舊就忽略，避免自己的回音把較新的修改蓋掉）。
     3. 只存在本機、雲端完全沒有（也沒有墓碑）的實體 → 視為尚未同步的本機修改，放進佇列。
     4. meta 裡的陣列（seedExtras／seedPatches）取聯集，確保種子補丁「套用過就不再套用」的語意跨裝置成立。 */

export const KINDS = ['brain', 'node', 'link', 'concept', 'pattern', 'meta'];
const CORE = new Set(['version', 'brains', 'nodes', 'links', 'history', 'concepts', 'patterns']);
export const keyOf = (kind, id) => kind + ':' + id;
export const splitKey = k => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };
export const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
/* key-order independent JSON (Postgres jsonb re-orders object keys, so plain JSON.stringify can't compare local vs remote) */
export function stable(v){
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(x => x === undefined ? 'null' : stable(x)).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== 'function').sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
const sameJSON = (a, b) => stable(a) === stable(b);

/* ---------- state ⇄ entities ---------- */
export function toEntities(st){
  const m = new Map();
  (st.brains || []).forEach(b => b && b.id && m.set(keyOf('brain', b.id), b));
  (st.nodes || []).forEach(n => n && n.id && m.set(keyOf('node', n.id), n));
  (st.links || []).forEach(l => l && l.id && m.set(keyOf('link', l.id), l));
  Object.entries(st.concepts || {}).forEach(([k, v]) => m.set(keyOf('concept', k), v));
  Object.entries(st.patterns || {}).forEach(([k, v]) => m.set(keyOf('pattern', k), v));
  Object.keys(st).forEach(k => { if (!CORE.has(k) && st[k] !== undefined && typeof st[k] !== 'function') m.set(keyOf('meta', k), st[k]); });
  return m;
}
/* key → JSON string, used as the "shadow" (what the sync layer has already accounted for) */
export function fingerprint(st){ const out = new Map(); toEntities(st).forEach((v, k) => out.set(k, stable(v))); return out; }

const natural = (a, b) => String(a).localeCompare(String(b), 'en', { numeric:true });
const byCreated = (a, b) => ((a.createdAt || 0) - (b.createdAt || 0)) || natural(a.id, b.id);

/* put one entity into a state object in place (data === null → delete) */
export function putEntity(st, kind, id, data){
  const arr = kind === 'brain' ? 'brains' : kind === 'node' ? 'nodes' : kind === 'link' ? 'links' : null;
  if (arr){
    st[arr] = st[arr] || [];
    const i = st[arr].findIndex(x => x.id === id);
    if (data == null){ if (i >= 0) st[arr].splice(i, 1); return; }
    const v = clone(data); v.id = id;
    if (i >= 0) st[arr][i] = v;
    else { // keep roughly chronological order without reshuffling existing items
      let j = st[arr].length; while (j > 0 && byCreated(st[arr][j - 1], v) > 0) j--; st[arr].splice(j, 0, v);
    }
    return;
  }
  const map = kind === 'concept' ? 'concepts' : kind === 'pattern' ? 'patterns' : null;
  if (map){ st[map] = st[map] || {}; if (data == null) delete st[map][id]; else st[map][id] = clone(data); return; }
  if (kind === 'meta'){ if (CORE.has(id)) return; if (data == null) delete st[id]; else st[id] = clone(data); }
}

export const DEFAULT_MAIN = () => ({ id:'main', name:'AI 認知邊界', parentBrainId:null, position:[0, 0, 0], scale:1, regionColor:'#9d8cff', rootNodeId:null, createdAt:0 });
/* keep the graph renderable after partial / concurrent updates (never queued: purely local display repair) */
export function repair(st){
  st.brains = st.brains || []; st.nodes = st.nodes || []; st.links = st.links || []; st.history = st.history || [];
  if (!st.brains.some(b => b.id === 'main')) st.brains.unshift(DEFAULT_MAIN());
  const bids = new Set(st.brains.map(b => b.id));
  st.brains.forEach(b => { if (b.id !== 'main' && b.parentBrainId && !bids.has(b.parentBrainId)) b.parentBrainId = 'main'; });
  st.nodes.forEach(n => { if (!bids.has(n.brainId)) n.brainId = 'main'; });
  return st;
}

/* rows (from brain_entities) → a fresh state (deleted rows skipped) */
export function rowsToState(rows, history = []){
  const st = { version:2, brains:[], nodes:[], links:[], history:[], concepts:{}, patterns:{} };
  rows.filter(r => !r.deleted && r.data != null).forEach(r => {
    const d = clone(r.data);
    if (r.kind === 'brain') st.brains.push(Object.assign(d, { id:r.id }));
    else if (r.kind === 'node') st.nodes.push(Object.assign(d, { id:r.id }));
    else if (r.kind === 'link') st.links.push(Object.assign(d, { id:r.id }));
    else putEntity(st, r.kind, r.id, d);
  });
  st.brains.sort(byCreated); st.nodes.sort(byCreated); st.links.sort(byCreated);
  st.history = mergeHistory([], history);
  return repair(st);
}

/* ---------- history ---------- */
function hash(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export const hkey = h => (Number(h.ts) || 0) + '|' + (h.action || '') + '|' + hash(stable(h.payload || {}));
export function mergeHistory(local, remote){
  const seen = new Set(), out = [];
  [...(local || []), ...(remote || [])].forEach(h => { if (!h) return; const k = hkey(h); if (seen.has(k)) return; seen.add(k); out.push({ ts:Number(h.ts) || 0, action:h.action, payload:h.payload || {} }); });
  return out.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

/* ---------- diff (shadow → current) ---------- */
/* returns ops [{kind,id,data,deleted}] for everything that changed since the shadow fingerprint */
export function diff(shadow, st){
  const cur = fingerprint(st), ops = [];
  cur.forEach((s, k) => { if (shadow.get(k) !== s){ const [kind, id] = splitKey(k); ops.push({ kind, id, data:JSON.parse(s), deleted:false }); } });
  shadow.forEach((s, k) => { if (!cur.has(k)){ const [kind, id] = splitKey(k); ops.push({ kind, id, data:null, deleted:true }); } });
  return ops;
}
export function newHistory(shadowKeys, st){ return (st.history || []).filter(h => !shadowKeys.has(hkey(h))); }
export const historyKeys = st => new Set((st.history || []).map(hkey));

/* ---------- outbound queue ---------- */
/* queue: { ops:{key:{kind,id,data,deleted,ts}}, hist:{hkey:entry}, ver:{key:version}, since:'iso', synced:bool } */
export const emptyQueue = () => ({ v:1, ops:{}, hist:{}, ver:{}, since:null, synced:false });
export function enqueue(q, ops, now = Date.now()){
  ops.forEach(o => { q.ops[keyOf(o.kind, o.id)] = { kind:o.kind, id:o.id, data:o.deleted ? null : clone(o.data), deleted:!!o.deleted, ts:now }; });
  return q;
}
export function enqueueHistory(q, entries){ entries.forEach(h => { q.hist[hkey(h)] = { ts:h.ts, action:h.action, payload:h.payload || {} }; }); return q; }
/* after a successful upsert: drop ops that weren't re-edited meanwhile, remember server versions */
export function ack(q, sent, returned = []){
  sent.forEach(o => { const k = keyOf(o.kind, o.id), cur = q.ops[k]; if (cur && cur.ts === o.ts && sameJSON(cur.data, o.data) && cur.deleted === o.deleted) delete q.ops[k]; });
  returned.forEach(r => noteVersion(q, r));
  return q;
}
export function noteVersion(q, r){
  const k = keyOf(r.kind, r.id); if (r.version != null) q.ver[k] = Math.max(q.ver[k] || 0, r.version);
  if (r.updated_at && (!q.since || r.updated_at > q.since)) q.since = r.updated_at;
}
export const pending = q => Object.keys(q.ops).length;

/* meta arrays (seedExtras / seedPatches …) are grow-only sets */
export function mergeMeta(localVal, remoteVal){
  if (Array.isArray(localVal) && Array.isArray(remoteVal)) return [...new Set([...remoteVal, ...localVal])];
  return remoteVal;
}

/* ---------- applying remote rows ---------- */
/* decide which incoming rows should be applied (not queued locally, not older than what we know) */
export function acceptRows(q, rows){
  return rows.filter(r => {
    const k = keyOf(r.kind, r.id);
    if (q.ops[k] && !(r.kind === 'meta')) return false;              // local unsynced edit wins until it's flushed
    if (r.version != null && q.ver[k] != null && r.version < q.ver[k]) return false;  // stale echo
    return true;
  });
}
/* apply rows to a state object in place. meta arrays are unioned with whatever is local (and the union is queued if it differs). */
export function applyRows(st, rows){
  rows.forEach(r => {
    if (r.kind === 'meta'){
      if (r.deleted || r.data == null) return;                        // never shrink seed bookkeeping
      putEntity(st, 'meta', r.id, mergeMeta(st[r.id], r.data));
      return;
    }
    putEntity(st, r.kind, r.id, r.deleted ? null : r.data);
  });
  return repair(st);
}

/* ---------- initial / periodic merge ---------- */
/* local: current local state (will NOT be mutated); rows: brain_entities rows (full or incremental);
   q: queue (mutated: version notes + local-only ops); opts.full: rows are the complete remote set;
   opts.migrate(st): seed migration (SEED_EXTRAS / SEED_PATCHES / SEED_MEDIA / concept defs), same function as local loads;
   opts.canWrite: queue seed-migration results for upload (authenticated) or only apply them locally (read-only).
   returns { state, seedOps, seedHistory, localOnly, empty } */
export function mergeRemote(local, rows, q, opts = {}){
  const full = !!opts.full;
  rows.forEach(r => noteVersion(q, r));
  if (full && !rows.length){
    // remote is empty → seed it from the local state (which is already seed + migrations + local edits)
    const st = clone(local);
    const ops = [...toEntities(st)].map(([k, v]) => { const [kind, id] = splitKey(k); return { kind, id, data:v, deleted:false }; });
    if (opts.canWrite){ enqueue(q, ops); enqueueHistory(q, st.history || []); }
    return { state:st, seedOps:ops, localOnly:[], empty:true };
  }
  const st = clone(local);
  applyRows(st, acceptRows(q, rows));
  // queued local edits stay on top (they were already in local, but re-apply in case local was older)
  Object.values(q.ops).forEach(o => { if (o.kind !== 'meta') putEntity(st, o.kind, o.id, o.deleted ? null : o.data); });
  let seedOps = [], localOnly = [], seedHistory = [];
  if (full){
    const remoteKeys = new Set(rows.map(r => keyOf(r.kind, r.id)));
    // seed migration against the remote graph, exactly like a local load would do
    let R = rowsToState(rows), R2 = R;
    if (opts.migrate){ R2 = opts.migrate(clone(R)); seedOps = diff(fingerprint(R), R2).filter(o => !o.deleted); seedHistory = newHistory(historyKeys(R), R2); }
    const seedKeys = new Set(seedOps.map(o => keyOf(o.kind, o.id)));
    // apply seed results locally where the user hasn't got a pending edit
    applyRows(st, seedOps.filter(o => !q.ops[keyOf(o.kind, o.id)] || o.kind === 'meta').map(o => ({ kind:o.kind, id:o.id, data:o.data, deleted:false })));
    if (opts.canWrite){ enqueue(q, seedOps.filter(o => !q.ops[keyOf(o.kind, o.id)])); enqueueHistory(q, seedHistory); st.history = mergeHistory(st.history, seedHistory); }
    // entities that only exist locally (not on the server at all, not produced by seed migration) → unsynced local edits
    toEntities(st).forEach((v, k) => {
      if (remoteKeys.has(k) || seedKeys.has(k) || q.ops[k]) return;
      const [kind, id] = splitKey(k); localOnly.push({ kind, id, data:v, deleted:false });
    });
    enqueue(q, localOnly);
    // meta unions that differ from the server → upload (authenticated only)
    if (opts.canWrite) rows.filter(r => r.kind === 'meta' && !r.deleted).forEach(r => { if (!sameJSON(st[r.id], r.data) && !q.ops[keyOf('meta', r.id)]) enqueue(q, [{ kind:'meta', id:r.id, data:st[r.id] }]); });
    q.synced = true;
  }
  return { state:repair(st), seedOps, seedHistory, localOnly, empty:false };
}

/* ---------- per-user feed marks (likes / bookmarks) ---------- */
/* local prefs: { likes:{id:ts}, saves:{id:ts} }; remote rows: { node_id, liked_at, saved_at } (ms epoch or null) */
export function marksOf(prefs){
  const m = {}; const L = (prefs && prefs.likes) || {}, S = (prefs && prefs.saves) || {};
  new Set([...Object.keys(L), ...Object.keys(S)]).forEach(id => { m[id] = { l:L[id] || null, s:S[id] || null }; });
  return m;
}
export function diffMarks(shadow, cur){
  const ops = [];
  new Set([...Object.keys(shadow || {}), ...Object.keys(cur || {})]).forEach(id => {
    const a = (shadow || {})[id] || { l:null, s:null }, b = (cur || {})[id] || { l:null, s:null };
    if (!!a.l !== !!b.l || !!a.s !== !!b.s) ops.push({ node_id:id, liked_at:b.l || null, saved_at:b.s || null });
  });
  return ops;
}
/* remote wins per node unless that node has a queued local change; local-only marks get queued */
export function mergeMarks(prefs, rows, mq){
  const likes = Object.assign({}, prefs.likes || {}), saves = Object.assign({}, prefs.saves || {});
  const remote = new Set();
  rows.forEach(r => { remote.add(r.node_id); if (mq[r.node_id]) return;
    if (r.liked_at) likes[r.node_id] = r.liked_at; else delete likes[r.node_id];
    if (r.saved_at) saves[r.node_id] = r.saved_at; else delete saves[r.node_id]; });
  Object.keys(marksOf(prefs)).forEach(id => { if (!remote.has(id) && !mq[id]) mq[id] = { node_id:id, liked_at:likes[id] || null, saved_at:saves[id] || null }; });
  return { likes, saves };
}

/* ---------- knowledge score (per user, one jsonb doc) ---------- */
/* counters only grow on each device → take per-field max (idempotent, safe to repeat); video buckets are OR-ed */
export function mergeKnowledge(a, b){
  if (!a || !a.nodes) return clone(b) || null; if (!b || !b.nodes) return clone(a);
  const out = { v:1, since:Math.min(a.since || Date.now(), b.since || Date.now()), nodes:{} };
  const orHex = (x, y) => { const n = Math.max((x || '').length, (y || '').length); x = (x || '').padEnd(n, '0'); y = (y || '').padEnd(n, '0'); let o = ''; for (let i = 0; i < n; i++) o += ((parseInt(x[i], 16) || 0) | (parseInt(y[i], 16) || 0)).toString(16); return o; };
  new Set([...Object.keys(a.nodes), ...Object.keys(b.nodes)]).forEach(id => {
    const p = a.nodes[id] || {}, r = b.nodes[id] || {}, o = {};
    new Set([...Object.keys(p), ...Object.keys(r)]).forEach(f => {
      o[f] = f === 'vb' ? orHex(p.vb, r.vb) : typeof (p[f] ?? r[f]) === 'number' ? Math.max(p[f] || 0, r[f] || 0) : (p[f] ?? r[f]);
    });
    out.nodes[id] = o;
  });
  return out;
}
