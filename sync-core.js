/* sync-core.js — 雲端同步的純邏輯（沒有 DOM、沒有網路；node 測試也用）。
   graph 拆成「實體」，一個實體＝雲端 brain_entities 一列：kind = brain | node | link | concept | pattern | meta。
   同步方式（無狀態佇列）：記住「上次同步時雲端的樣子」（snapshot：key → JSON 字串），
     待上傳＝diff(snapshot, 本機)；拉取時＝雲端 ⊕ 待上傳（本機還沒上傳的修改優先，其他以雲端為準）。
   刪除用墓碑（deleted = true），離線裝置才不會把它復活。history 只增不減，用 hkey 去重。 */
import { sanitizeEntity } from './safe.js';

const CORE = new Set(['version', 'brains', 'nodes', 'links', 'history', 'concepts', 'patterns']);
const ARR = { brain:'brains', node:'nodes', link:'links' }, MAP = { concept:'concepts', pattern:'patterns' };
export const keyOf = (kind, id) => kind + ':' + id;
export const splitKey = k => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };
export const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
/* 跟 key 順序無關的 JSON（Postgres jsonb 會重排 key） */
export function stable(v){
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(x => x === undefined ? 'null' : stable(x)).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

export function toEntities(st){
  const m = new Map();
  for (const [kind, a] of Object.entries(ARR)) (st[a] || []).forEach(x => x && x.id && m.set(keyOf(kind, x.id), x));
  for (const [kind, a] of Object.entries(MAP)) Object.entries(st[a] || {}).forEach(([k, v]) => m.set(keyOf(kind, k), v));
  Object.keys(st).forEach(k => { if (!CORE.has(k) && st[k] !== undefined) m.set(keyOf('meta', k), st[k]); });
  return m;
}
/* meta 陣列（seedExtras／seedPatches 這類種子紀錄）是集合：putEntity 用聯集合併、不管順序，所以比對時也不管順序。
   不然新種子插在 SEED_EXTRAS 前面時（例如 main #6 的日文轉場音），本機和雲端的順序不同，唯讀者會永遠多一筆「待上傳」。 */
const setLike = (k, v) => k.startsWith('meta:') && Array.isArray(v) && v.every(x => typeof x === 'string') ? [...new Set(v)].sort() : v;
export function fingerprint(st){ const o = {}; toEntities(st).forEach((v, k) => { o[k] = stable(setLike(k, v)); }); return o; }

const byCreated = (a, b) => ((a.createdAt || 0) - (b.createdAt || 0)) || String(a.id).localeCompare(String(b.id), 'en', { numeric:true });
/* 寫入（或刪除：data == null）一個實體。外來資料一律先清洗；不合法的當作刪除 */
export function putEntity(st, kind, id, data){
  if (data != null) data = sanitizeEntity(kind, id, data);
  if (ARR[kind]){
    const a = st[ARR[kind]] = st[ARR[kind]] || [], i = a.findIndex(x => x.id === id);
    if (data == null){ if (i >= 0) a.splice(i, 1); return; }
    if (i >= 0) a[i] = data; else { let j = a.length; while (j > 0 && byCreated(a[j - 1], data) > 0) j--; a.splice(j, 0, data); }
  } else if (MAP[kind]){ const m = st[MAP[kind]] = st[MAP[kind]] || {}; if (data == null) delete m[id]; else m[id] = data; }
  else if (kind === 'meta' && !CORE.has(id)){
    if (data == null) return;                                         // seed bookkeeping never shrinks
    st[id] = Array.isArray(data) && Array.isArray(st[id]) ? [...new Set([...st[id], ...data])] : data;
  }
}
export const DEFAULT_MAIN = () => ({ id:'main', name:'AI 認知邊界', parentBrainId:null, position:[0, 0, 0], scale:1, regionColor:'#9d8cff', rootNodeId:null, createdAt:0 });
export function repair(st){
  ['brains', 'nodes', 'links', 'history'].forEach(k => { if (!Array.isArray(st[k])) st[k] = []; });
  st.concepts = st.concepts || {}; st.patterns = st.patterns || {};
  if (!st.brains.some(b => b.id === 'main')) st.brains.unshift(DEFAULT_MAIN());
  const ids = new Set(st.brains.map(b => b.id));
  st.brains.forEach(b => { if (b.id !== 'main' && !ids.has(b.parentBrainId)) b.parentBrainId = 'main'; });
  st.nodes.forEach(n => { if (!ids.has(n.brainId)) n.brainId = 'main'; });
  return st;
}
/* rows（brain_entities）→ 乾淨的 state（墓碑略過） */
export function rowsToState(rows, history = []){
  const st = { version:2, brains:[], nodes:[], links:[], history:[], concepts:{}, patterns:{} };
  rows.forEach(r => { if (!r.deleted && r.data != null) putEntity(st, r.kind, r.id, r.data); });
  st.history = mergeHistory([], history);
  return repair(st);
}

/* ---------- history ---------- */
function hash(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
export const hkey = h => (Number(h.ts) || 0) + '|' + String(h.action || '') + '|' + hash(stable(h.payload || {}));
export function mergeHistory(a, b){
  const seen = new Set(), out = [];
  [...(a || []), ...(b || [])].forEach(h => { if (!h || typeof h !== 'object') return; const k = hkey(h); if (seen.has(k)) return; seen.add(k);
    out.push({ ts:Number(h.ts) || 0, action:String(h.action || '').slice(0, 40), payload:h.payload && typeof h.payload === 'object' ? h.payload : {} }); });
  return out.sort((x, y) => x.ts - y.ts);
}

/* ---------- diff / pending ---------- */
/* snapshot → 本機：有變的實體（upsert）與消失的實體（墓碑） */
export function diff(snap, st){
  const cur = fingerprint(st), ops = [];
  for (const k in cur) if (snap[k] !== cur[k]){ const [kind, id] = splitKey(k); ops.push({ kind, id, data:JSON.parse(cur[k]), deleted:false }); }
  for (const k in snap) if (!(k in cur) && !k.startsWith('meta:')){ const [kind, id] = splitKey(k); ops.push({ kind, id, data:null, deleted:true }); }
  return ops;
}
function apply(st, ops){ ops.forEach(o => putEntity(st, o.kind, o.id, o.deleted ? null : o.data)); return st; }

/* 拉取後合併。
   local：本機 state；rows／history：雲端；sync：{ snap, hkeys }（null＝這台裝置第一次同步）；
   opts.migrate(st)：跟本機載入一樣的種子遷移（SEED_EXTRAS／SEED_PATCHES／SEED_MEDIA），套在雲端資料上，順便補齊欄位；
   opts.canWrite：可以寫入（編輯者）→ 種子遷移的結果也算待上傳；唯讀 → 只在本機套用。
   回傳 { state, sync:{snap,hkeys}, pending }。 */
export function merge(local, rows, history, sync, opts = {}){
  const raw = rowsToState(rows, history);
  let snap = sync && sync.snap;
  if (!snap){                                    // 第一次：雲端有的（含墓碑）以雲端為準；只在本機的 → 待上傳
    snap = {}; const lf = fingerprint(local);
    rows.forEach(r => { const k = keyOf(r.kind, r.id); if (lf[k]) snap[k] = lf[k]; });
  }
  const pending = diff(snap, local);
  const M = repair(opts.migrate ? opts.migrate(clone(raw)) : clone(raw));
  const newSnap = fingerprint(opts.canWrite ? raw : M);   // 編輯者：種子遷移的差異會變成待上傳；唯讀：只在本機
  const seedH = opts.canWrite && opts.migrate ? M.history : [];
  const st = repair(apply(M, pending));
  st.history = mergeHistory(mergeHistory(local.history, history), seedH);
  const remoteH = new Set(history.map(hkey));
  const hkeys = sync && sync.hkeys ? [...new Set([...sync.hkeys, ...remoteH])] : [...new Set([...remoteH, ...(local.history || []).map(hkey)])];
  if (!opts.canWrite){                           // 唯讀：種子遷移在本機長出來的東西（meta、SEED_EXTRAS）不算「本機修改」
    const rf = fingerprint(raw), sf = fingerprint(st);
    for (const k in sf) if (k.startsWith('meta:') || (k in newSnap && !(k in rf))) newSnap[k] = sf[k];
  }
  return { state:st, sync:{ snap:newSnap, hkeys }, pending:diff(newSnap, st) };
}
/* 待上傳的 history：本機有、還沒同步過的 */
export const pendingHistory = (st, sync) => { const s = new Set((sync && sync.hkeys) || []); return (st.history || []).filter(h => !s.has(hkey(h))); };
/* 上傳成功後更新 snapshot */
export function ack(sync, ops, hist = []){
  ops.forEach(o => { const k = keyOf(o.kind, o.id); if (o.deleted) delete sync.snap[k]; else sync.snap[k] = stable(o.data); });
  sync.hkeys = [...new Set([...(sync.hkeys || []), ...hist.map(hkey)])];
  return sync;
}
