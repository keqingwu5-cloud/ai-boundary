/* 3D 動態認知大腦 v1 — plain Three.js (ES modules, vendored), no build step. */
import { openGuardedStore, backup, snapshot, validateGraph, verifyTopology } from './reliability/storage.mjs';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { esc, safeUrl, safeColor, playable, sanitizeEntity } from './safe.js';
import { initInterior } from './brain/interior.js';
import { QPARAM, levels, initialLevel, createWatch } from './brain/quality.js';
await window.AI_DATA_READY;           // data.js：等 content/*.json、patches/*.json 載入完（QUESTIONS、TYPES… 才會有值）

/* ================= constants ================= */
const KEY = 'aiBrain.v1', UKEY = 'aiBrain.v1.undo';
const MOBILE = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* [proto] adaptive node sizing + screen-space picking */
const COARSE = matchMedia('(pointer: coarse)').matches;
const MIN_NODE_PX = COARSE || MOBILE ? 7 : 4.5;      // min on-screen radius of a node (px)
const MIN_FAR_PX = COARSE || MOBILE ? 3.5 : 2.5;     // min radius of de-emphasised (LOD) nodes
const TAP_PX = COARSE || MOBILE ? 26 : 14;           // tap radius => ~52px / 28px hit target
const LOD_NEAR_PX = 260;                             // a brain bigger than this on screen shows full detail
const UIKEY = 'aiBrain.ui.v1';
/* [proto] adaptive quality: ?q=high|mid|low pins a level; otherwise phones start at mid, laptops at high, and FPS watchdog steps down */
const QLV = levels(MOBILE || COARSE);   // [proto] quality levels + watchdog: brain/quality.js
let QL = initialLevel();
const Q = QLV[QL];
const ui = (() => { try { return Object.assign({ declutter:true, glow:false }, JSON.parse(localStorage.getItem(UIKEY))); } catch(e){ return { declutter:true, glow:false }; } })();
const saveUI = () => { try { localStorage.setItem(UIKEY, JSON.stringify(ui)); } catch(e){} };
const WORLD = 3;                       // main brain world scale
const TYPE_LIST = Object.keys(TYPES);
const REGION = {                       // brain-local region centres (front = +z)
  '能力邊界':   [0.28, 0.16, 0.42],
  '理解與意識': [0.0, 0.38, -0.12],
  '推理與判斷': [-0.28, 0.16, 0.42],
  '倫理與責任': [-0.3, 0.06, -0.42],
  '社會影響':   [0.3, 0.06, -0.42],
  '其他':       [0.0, -0.05, 0.1]
};
const ACT = { seed:'🌱 播種', add:'✦ 新增問題', split:'❖ 分裂', direction:'🚀 新方向', concept:'🧵 概念', pattern:'⟳ 流程', migrate:'🧵 概念層升級', subbrain:'🧠 生成子腦', merge:'↩ 併回', cross:'🔗 跨腦連結',
  status:'◐ 研究進度', counter:'⚔ 反證', collapse:'◌ 收合', expand:'◉ 展開', media:'🎞 媒體', delete:'✕ 刪除', import:'⇧ 匯入', reset:'↺ 重置', undo:'↶ 復原', 'seed-update':'🌱 內容更新' };
const STATUS = { open:'待研究', researching:'研究中', resolved:'已有結論' };
const colorOf = t => (TYPES[t] || TYPES['其他']).color;
const DIR_COLOR = '#ff7ae0';
const KIND = { question:'主問題', extension:'延伸問題', direction:'🚀 新方向' };
const nodeColor = n => n.kind === 'direction' ? DIR_COLOR : colorOf(n.type);
const iconOf = t => (TYPES[t] || TYPES['其他']).icon;
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = s => document.querySelector(s);
/* esc / safeUrl（只接受 http(s) 或 repo 內相對路徑）/ safeColor / playable：safe.js（跟 feed.js、sync 共用） */

/* ================= data model ================= */
function mulberry(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function clampInside(p){
  const e = (p[0]/0.5)**2 + ((p[1]-0.08)/0.42)**2 + (p[2]/0.72)**2;
  if (e > 0.8){ const f = Math.sqrt(0.8/e); return [p[0]*f, 0.08+(p[1]-0.08)*f, p[2]*f]; }
  return p;
}
function jitter(c, r, rnd = Math.random){
  const u = rnd()*Math.PI*2, v = Math.acos(2*rnd()-1), rr = r*(0.5+0.5*rnd());
  return clampInside([c[0]+rr*Math.sin(v)*Math.cos(u), c[1]+rr*Math.cos(v)*0.7, c[2]+rr*Math.sin(v)*Math.sin(u)]);
}
/* [proto] sub-brain layout: push overlapping brains apart (main stays fixed, smaller brains move more) */
const brainR = b => WORLD * b.scale * 0.92;
/* `mov` (optional Set of ids): only those may move, everything else stays put. Used after an edit so that only the new
   nodes / brains get placed; untouched nodes keep their positions and are not re-uploaded by sync (no write races). */
function relaxBrains(st, gap = 0.7, mov = null, tol = 1e-6){
  const bs = st.brains; let moved = false;
  for (let it = 0; it < 120; it++){
    let any = false;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++){
      const a = bs[i], b = bs[j], min = brainR(a) + brainR(b) + gap * Math.min(a.scale, b.scale) * 2;
      let dx = b.position[0] - a.position[0], dy = (b.position[1] - a.position[1]) * 1.4, dz = b.position[2] - a.position[2];
      let d = Math.hypot(dx, dy, dz);
      if (d >= min - tol) continue;   // tolerance: float rounding must not re-nudge settled pairs (migrate has to be idempotent for sync)
      if (d < 1e-4){ const ang = (i * 7 + j * 13) % 360 * Math.PI / 180; dx = Math.cos(ang); dy = 0; dz = Math.sin(ang); d = 1; }
      const push = (min - d) * 0.55, ux = dx / d, uy = dy / d / 1.4, uz = dz / d;
      let wa = a.id === 'main' ? 0 : b.id === 'main' ? 1 : b.scale / (a.scale + b.scale);
      if (mov){ const ma = mov.has(a.id) && a.id !== 'main', mb = mov.has(b.id) && b.id !== 'main'; if (!ma && !mb) continue; wa = ma && mb ? wa : ma ? 1 : 0; }
      const wb = 1 - wa;
      a.position = [a.position[0] - ux * push * wa, a.position[1] - uy * push * wa, a.position[2] - uz * push * wa];
      b.position = [b.position[0] + ux * push * wb, b.position[1] + uy * push * wb, b.position[2] + uz * push * wb];
      any = moved = true;
    }
    if (!any) break;
  }
  return moved;
}
/* [proto] keep nodes inside one brain from sitting on top of each other */
function relaxNodes(st, brainId, minD = 0.075, mov = null, tol = 1e-6){
  const ns = st.nodes.filter(n => n.brainId === brainId); if (ns.length < 2) return false; let moved = false;
  for (let it = 0; it < 40; it++){
    let any = false;
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++){
      const a = ns[i].pos, b = ns[j].pos; let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; let d = Math.hypot(dx, dy, dz);
      if (d >= minD - tol) continue;   // same tolerance as relaxBrains
      if (d < 1e-5){ dx = ((i * 31 + j * 17) % 7 - 3) / 3 || 0.5; dy = 0.2; dz = ((i * 13 + j * 29) % 5 - 2) / 2 || 0.5; const L = Math.hypot(dx, dy, dz) / 1e-5; dx /= L; dy /= L; dz /= L; d = 1e-5; }   // unit direction scaled to d, so the push is exactly minD - d
      let ki = 0.5, kj = 0.5;
      if (mov){ const mi = mov.has(ns[i].id), mj = mov.has(ns[j].id); if (!mi && !mj) continue; if (!mi){ ki = 0; kj = 1; } else if (!mj){ ki = 1; kj = 0; } }
      const k = (minD - d) / d;
      if (ki) ns[i].pos = clampInside([a[0] - dx * k * ki, a[1] - dy * k * ki, a[2] - dz * k * ki]);
      if (kj) ns[j].pos = clampInside([b[0] + dx * k * kj, b[1] + dy * k * kj, b[2] + dz * k * kj]);
      any = moved = true;
    }
    if (!any) break;
  }
  return moved;
}
function relaxAll(st, mov = null, tol = 1e-6){ relaxBrains(st, 0.7, mov, tol); st.brains.forEach(b => relaxNodes(st, b.id, b.id === 'main' ? 0.075 : 0.11, mov, tol)); }
function mkNode(o){
  return Object.assign({ id: uid('n'), brainId:'main', parentId:null, kind:'question', title:'', type:'其他', oneLiner:'', source:null,
    assumptions:'', reasoning:[], counterEvidence:[], media:{ video:'', image:'' }, status:'open', createdBy:'merlin',
    createdAt: Date.now(), collapsed:false, pos:[0,0,0], botNotes:[], concepts:[], processPattern:'' }, o);
}
function seedState(){
  const rnd = mulberry(20261010), now = Date.now();
  const st = { version:1, brains:[{ id:'main', name:'AI 認知邊界', parentBrainId:null, position:[0,0,0], scale:1, regionColor:'#9d8cff', rootNodeId:null, createdAt:now }],
    nodes:[], links:[], history:[] };
  QUESTIONS.forEach(q => {
    const nid = 'n_' + q.id;
    const pos = jitter(REGION[q.type] || REGION['其他'], 0.1, rnd);
    st.nodes.push(mkNode({ id:nid, kind:'question', title:q.title, type:q.type, oneLiner:q.oneLiner, source:q.source,
      assumptions:(q.process.find(p => p.k === '前提') || {}).v || '', reasoning:q.process.map(p => ({ k:p.k, v:p.v })),
      media:{ video:q.videoUrl || '', image:q.imageUrl || '' }, createdBy:'seed', seedId:q.id, createdAt:now, pos, concepts:(CONCEPTS.tags[q.id] || []).slice(), processPattern:CONCEPTS.process[q.id] || '' }));
    (q.extensions || []).forEach((e, i) => {
      const cid = nid + '_e' + i;
      st.nodes.push(mkNode({ id:cid, parentId:nid, kind:'extension', title:e.q, type:e.type, createdBy:'seed', createdAt:now, pos:jitter(pos, 0.14, rnd), concepts:(CONCEPTS.tags[q.id + ':e' + i] || []).slice() }));
      st.links.push({ id:'l_' + cid, from:nid, to:cid, kind:'derived', createdAt:now });
    });
  });
  st.history.push({ ts:now, action:'seed', payload:{ questions:QUESTIONS.length, nodes:st.nodes.length } });
  return st;
}
function valid(s){ return s && Array.isArray(s.brains) && Array.isArray(s.nodes) && Array.isArray(s.links) && Array.isArray(s.history) && s.brains.some(b => b.id === 'main'); }
function load(){ try { const s = JSON.parse(localStorage.getItem(KEY)); return valid(s) ? s : null; } catch(e){ return null; } }
/* concept layer migration: adds concepts[] / processPattern to old saves without touching user edits */
function seedKey(id){ const m = /^n_(q\d+)(?:_e(\d+))?$/.exec(id); return m ? (m[2] !== undefined ? m[1] + ':e' + m[2] : m[1]) : null; }
/* [proto] item 2 — returning visitors get seed updates. Saved state = seed + the user's own edits, merged by id on every load:
   seed-owned text (title/type/oneLiner/source) always follows the current data.js (the UI cannot edit these on seed nodes);
   seed questions/extensions that are new since the save are grown in; everything the user owns (status, concepts, counter-
   evidence, media they set, pattern, collapse, positions, sub-brains, own nodes) is never touched. Reasoning/assumptions keep
   the existing applySeedPatch rule (replace only while unchanged). Idempotent, so it is safe to call again after async content
   loads and produces a normal diff for sync.js. Runs after `await window.AI_DATA_READY` (content/*.json + patches/*.json), so
   whatever the content files say now is what returning visitors see; feed.js loadState() applies the same rule. */
function refreshSeed(st){
  const byId = new Map(st.nodes.map(n => [n.id, n])), now = Date.now(); let added = 0, upd = 0;
  // values go through the same sanitizeEntity() sync uses (e.g. source.also:[]), else sync's cleaned copy and ours ping-pong as a fake edit
  // compare sanitized to sanitized: a seed patch may later restore the raw form (no also:[]), which must not count as an update on every migrate
  const san = (o, k, v) => (sanitizeEntity('node', o.id, Object.assign({}, o, { [k]:v })) || {})[k];
  const put = (o, k, v) => { if (v === undefined) return 0; v = san(o, k, v); if (v !== undefined && JSON.stringify(san(o, k, o[k])) !== JSON.stringify(v)){ o[k] = JSON.parse(JSON.stringify(v)); return 1; } return 0; };
  QUESTIONS.forEach(q => {
    const nid = 'n_' + q.id; let n = byId.get(nid);
    if (!n){
      n = mkNode({ id:nid, kind:'question', title:q.title, type:q.type, oneLiner:q.oneLiner, source:q.source, seedId:q.id, createdBy:'seed', createdAt:now,
        assumptions:(q.process.find(p => p.k === '前提') || {}).v || '', reasoning:q.process.map(p => ({ k:p.k, v:p.v })), media:{ video:q.videoUrl || '', image:q.imageUrl || '' },
        pos:jitter(REGION[q.type] || REGION['其他'], 0.1), concepts:(CONCEPTS.tags[q.id] || []).slice(), processPattern:CONCEPTS.process[q.id] || '' });
      st.nodes.push(n); byId.set(nid, n); added++;
    } else if (n.createdBy === 'seed'){
      upd += put(n, 'title', q.title) + put(n, 'type', q.type) + put(n, 'oneLiner', q.oneLiner || '') + put(n, 'source', q.source || null);
    }
    (q.extensions || []).forEach((e, i) => {
      const cid = nid + '_e' + i, c = byId.get(cid);
      if (!c){
        const k = mkNode({ id:cid, brainId:n.brainId, parentId:nid, kind:'extension', title:e.q, type:e.type, createdBy:'seed', createdAt:now, pos:jitter(n.pos, 0.14),
          concepts:(CONCEPTS.tags[q.id + ':e' + i] || []).slice() });
        st.nodes.push(k); byId.set(cid, k); added++;
        if (!st.links.some(l => l.id === 'l_' + cid)) st.links.push({ id:'l_' + cid, from:nid, to:cid, kind:'derived', createdAt:now });
      } else if (c.createdBy === 'seed') upd += put(c, 'title', e.q) + put(c, 'type', e.type);
    });
  });
  // bot nodes from content/seed-extras.json + patches/*.json (seedExtras): their text also follows the source file
  (typeof SEED_EXTRAS !== 'undefined' ? SEED_EXTRAS : []).forEach(x => { const n = byId.get(x.id); if (n && n.createdBy !== 'merlin') upd += put(n, 'title', x.title) + put(n, 'type', x.type) + put(n, 'oneLiner', x.oneLiner) + put(n, 'source', x.source); });
  // no history row here: migrate() also runs inside sync merge(), whose history additions are uploaded — a row per pull would ping-pong between devices
  return st;
}
function migrate(st){
  if (!st.concepts) st.concepts = {};
  refreshSeed(st);
  if (!st.patterns) st.patterns = {};
  Object.entries(CONCEPTS.defs).forEach(([k, v]) => { if (!st.concepts[k]) st.concepts[k] = { color:v.color, desc:v.desc, createdBy:'seed' }; });
  Object.entries(CONCEPTS.patterns).forEach(([k, v]) => { if (!st.patterns[k]) st.patterns[k] = { color:v.color, desc:v.desc, createdBy:'seed' }; });
  st.seedExtras = Array.isArray(st.seedExtras) ? st.seedExtras : [];
  (typeof SEED_EXTRAS !== 'undefined' ? SEED_EXTRAS : []).forEach(x => {
    if (st.seedExtras.includes(x.id)) return;
    const p = st.nodes.find(n => n.id === x.parentId), now = Date.now();
    if (x.kind === 'extension' && !p) return;  // 延伸問題要等父節點在才加（父節點被刪就不加）
    st.seedExtras.push(x.id);
    if (st.nodes.some(n => n.id === x.id)) return;
    const n = mkNode(Object.assign(JSON.parse(JSON.stringify(x)), { brainId:p ? p.brainId : 'main', parentId:p ? p.id : null, createdAt:now, seedExtra:true,
      pos:p ? (x.kind === 'extension' ? jitter(p.pos, 0.14) : dirPos(p.pos)) : jitter(REGION[x.type] || REGION['其他'], 0.1) }));
    st.nodes.push(n);
    if (p) st.links.push({ id:'l_' + n.id, from:p.id, to:n.id, kind:'derived', createdAt:now });
    st.history.push({ ts:now, action:x.kind === 'extension' ? 'split' : 'direction', payload:{ nodeId:n.id, parentId:p ? p.id : null, title:n.title, createdBy:n.createdBy } });
  });
  let changed = 0;
  st.nodes.forEach(n => {
    const key = seedKey(n.id), seeded = n.createdBy === 'seed' && key;
    if (n.kind === 'split') n.kind = 'extension';
    if (!Array.isArray(n.concepts)){ n.concepts = seeded && CONCEPTS.tags[key] ? CONCEPTS.tags[key].slice() : []; changed++; }
    if (typeof n.processPattern !== 'string') n.processPattern = seeded && CONCEPTS.process[key] ? CONCEPTS.process[key] : '';
    if (!n.media) n.media = { video:'', image:'' };
    applySeedMedia(n);
    if (typeof applySeedPatch === 'function') applySeedPatch(n, st);
    n.concepts.forEach(c => { if (!st.concepts[c]) st.concepts[c] = { color:pickColor(st), desc:'', createdBy:'merlin' }; });
  });
  if (changed) st.history.push({ ts:Date.now(), action:'migrate', payload:{ nodes:changed } });
  relaxAll(st, null, 0.015);   // [proto] de-overlap brains + nodes (positions only); 0.015 slack: only real overlaps move, not the ≤0.011 leftovers of add-time relax (no extra upload)
  st.version = 2;
  return st;
}
const CPAL = ['#5eead4','#a3e635','#fde047','#fdba74','#67e8f9','#f0abfc','#86efac','#c4b5fd','#f9a8d4','#fca5a5','#fb7185','#93c5fd','#fb923c','#f472b6','#cbd5e1','#bef264','#7dd3fc','#fcd34d','#d8b4fe','#99f6e4'];
function pickColor(st){ const used = new Set(Object.values(st.concepts || {}).map(c => c.color)); return CPAL.find(c => !used.has(c)) || `hsl(${Math.floor(Math.random() * 360)},85%,72%)`; }
/* [#4 可靠性] 存檔經 openGuardedStore：損壞／未知版本的存檔進入保護模式，不被種子覆寫。
   [#8 效能] 狀態每次變更同步寫入；undo 快照（不含 history）只在 pagehide／visibilitychange 時寫出。 */
const persistence = openGuardedStore(localStorage, migrate, seedState);
let state = persistence.state;
if (persistence.status().blocked) setTimeout(() => toast('⚠ 資料保護模式：原始存檔未覆寫，請匯出備份後處理'), 0);
let undoStack = []; try {
  const savedUndo = JSON.parse(localStorage.getItem(UKEY) || '[]');
  // 快照可能不含 history（#8 的精簡快照）→ 驗證時補空陣列
  if (Array.isArray(savedUndo)) undoStack = savedUndo.filter(raw => { try { const o = JSON.parse(raw); validateGraph({ ...o, history:Array.isArray(o.history) ? o.history : [] }); return true; } catch { return false; } });
} catch(e){ undoStack = []; }
let undoDirty = false;
const UNDO_KEEP = 12, UNDO_PERSIST = 5;
function writeUndo(){ if (!undoDirty || persistence.status().blocked) return; undoDirty = false; try { localStorage.setItem(UKEY, JSON.stringify(undoStack.slice(-UNDO_PERSIST))); } catch(e){} }
function save(){
  if (persistence.status().blocked) return;
  undoDirty = true;
  try { persistence.save(state); flashSaved(); } catch(e){ setTimeout(() => toast('⚠ 儲存未完成，請匯出備份：' + e.message), 0); }
}
addEventListener('pagehide', writeUndo);
document.addEventListener('visibilitychange', () => { if (document.hidden) writeUndo(); });
/* undo snapshots skip the (ever-growing) history log; undo restores the snapshot and keeps the current log */
const snap = () => { const { history, ...rest } = state; return JSON.stringify(rest); };
function pushUndo(){ undoStack.push(snap()); if (undoStack.length > UNDO_KEEP) undoStack.shift(); }
save();
const listeners = {};
function emit(ev, data){ (listeners[ev] || []).forEach(f => { try { f(data); } catch(e){ console.error(e); } }); }
function mutate(action, payload, fn){
  pushUndo();
  const placeable = ['add', 'split', 'direction', 'merge'].includes(action);
  const before = placeable ? new Map([...state.nodes.map(n => [n.id, n.brainId]), ...state.brains.map(b => [b.id, 'brain'])]) : null;
  fn();
  if (placeable){   // [proto] place only what this edit created or moved to another brain; everything else keeps its position
    const mov = new Set([...state.nodes.filter(n => before.get(n.id) !== n.brainId).map(n => n.id), ...state.brains.filter(b => !before.has(b.id)).map(b => b.id)]);
    if (mov.size) relaxAll(state, mov);
  }
  state.history.push({ ts:Date.now(), action, payload });
  save(); sync(); renderHistory(); renderCrumbs();
  emit('change', { action, payload });
}
/* [proto perf] id -> object Map indexes instead of Array.find on every lookup (hundreds per frame / per render).
   Rebuilt lazily whenever the array is replaced or changes length (push / filter / undo / import all do one of those). */
const IX = { n:{ a:null, len:-1 }, b:{ a:null, len:-1 } };
function ix(c, arr){ if (c.a !== arr || c.len !== arr.length){ c.a = arr; c.len = arr.length; c.m = new Map(); arr.forEach(x => c.m.set(x.id, x)); } return c.m; }
const N = id => ix(IX.n, state.nodes).get(id);
const B = id => ix(IX.b, state.brains).get(id);
const kids = id => state.nodes.filter(n => n.parentId === id);
function descendants(id, sameBrain){
  const root = N(id), out = [], st = [id];
  while (st.length){ const c = st.pop(); kids(c).forEach(k => { if (!sameBrain || k.brainId === root.brainId){ out.push(k); st.push(k.id); } }); }
  return out;
}

/* ================= operations (also exposed for future bots) ================= */
function addQuestion(d){
  const brainId = d.brainId || focusId || 'main';
  const brain = B(brainId) ? brainId : 'main';
  const isMain = brain === 'main';
  const n = mkNode({ brainId:brain, parentId:d.parentId || null, kind:'question', title:d.title, type:TYPES[d.type] ? d.type : '其他',
    oneLiner:d.oneLiner || '', source:d.source || { who:'Merlin', outlet:'', date:new Date().toISOString().slice(0,10), url:'', also:[] },
    assumptions:d.assumptions || '', reasoning:d.reasoning || [], createdBy:d.createdBy || 'merlin',
    pos: jitter(isMain ? (REGION[d.type] || REGION['其他']) : [0, 0.08, 0], isMain ? 0.12 : 0.35) });
  const exts = (d.extensions || []).filter(e => e && e.title);
  n.concepts = [...new Set((d.concepts || []).map(c => String(c).trim()).filter(Boolean))];
  mutate('add', { nodeId:n.id, title:n.title, brainId:brain }, () => {
    n.concepts.forEach(c => ensureConcept(c, n.createdBy));
    state.nodes.push(n);
    if (n.parentId){ n.kind = 'extension'; state.links.push({ id:uid('l'), from:n.parentId, to:n.id, kind:'derived', createdAt:Date.now() }); }
    exts.forEach(e => { const c = mkNode({ brainId:brain, parentId:n.id, kind:'extension', title:e.title, type:TYPES[e.type] ? e.type : n.type, createdBy:n.createdBy, pos:jitter(n.pos, 0.13) });
      state.nodes.push(c); state.links.push({ id:uid('l'), from:n.id, to:c.id, kind:'derived', createdAt:Date.now() }); });
  });
  pendingBursts.push(n.id);
  return n.id;
}
function splitNode(id, items, createdBy = 'merlin', kind = 'extension'){
  kind = kind === 'direction' ? 'direction' : 'extension';
  const p = N(id); if (!p || !items.length) return [];
  const ids = [];
  mutate(kind === 'direction' ? 'direction' : 'split', { nodeId:id, title:p.title, kind, children:items.map(i => i.title) }, () => {
    p.collapsed = false;
    items.forEach(it => { const c = mkNode({ brainId:p.brainId, parentId:id, kind, title:it.title, type:TYPES[it.type] ? it.type : p.type, createdBy, oneLiner:it.oneLiner || '',
      concepts:[...new Set(it.concepts || (kind === 'direction' ? p.concepts : []) || [])], media:{ video:'', image:it.image || '' },
      pos:kind === 'direction' ? dirPos(p.pos) : jitter(p.pos, 0.15) });
      c.concepts.forEach(x => ensureConcept(x, createdBy));
      state.nodes.push(c); ids.push(c.id); state.links.push({ id:uid('l'), from:id, to:c.id, kind:'derived', createdAt:Date.now() }); });
  });
  pendingBursts.push(id);
  return ids;
}
function dirPos(p){  // new directions sit further out, pointing away from the brain centre
  const v = new THREE.Vector3(p[0], p[1] - 0.1, p[2]); if (v.length() < 0.05) v.set(Math.random() - .5, 0.3, Math.random() - .5);
  v.normalize().multiplyScalar(0.12).add(new THREE.Vector3((Math.random() - .5) * 0.06, (Math.random() - .5) * 0.06, (Math.random() - .5) * 0.06));
  return clampInside([p[0] + v.x, p[1] + v.y, p[2] + v.z]);
}
/* a proposed new research direction branching from a node (bots: createdBy:'bot'; 影像導演 bot can fill media.image later) */
function addDirection(parentId, d = {}){
  if (typeof d === 'string') d = { title:d };
  if (!N(parentId) || !d.title) return null;
  return splitNode(parentId, [{ title:d.title, type:d.type, oneLiner:d.oneLiner, concepts:d.concepts, image:d.image }], d.createdBy || 'merlin', 'direction')[0] || null;
}
/* ---------- concept layer ---------- */
function ensureConcept(name, by = 'merlin', color){ if (!state.concepts[name]) state.concepts[name] = { color:color || pickColor(state), desc:'', createdBy:by }; }
function addConcept(id, name, by = 'merlin'){
  const n = N(id); name = String(name || '').trim().slice(0, 16); if (!n || !name) return false;
  if (n.concepts.includes(name)) return false;
  mutate('concept', { nodeId:id, title:n.title, concept:name, op:'add' }, () => { ensureConcept(name, by); n.concepts.push(name); });
  return true;
}
function removeConcept(id, name){
  const n = N(id); if (!n || !n.concepts.includes(name)) return false;
  mutate('concept', { nodeId:id, title:n.title, concept:name, op:'remove' }, () => { n.concepts = n.concepts.filter(c => c !== name); });
  return true;
}
function setProcessPattern(id, pattern){
  const n = N(id); if (!n) return; pattern = String(pattern || '').trim();
  mutate('pattern', { nodeId:id, title:n.title, pattern }, () => { if (pattern && !state.patterns[pattern]) state.patterns[pattern] = { color:'#e2e8f0', desc:'', createdBy:'merlin' }; n.processPattern = pattern; });
}
function getConcepts(){
  const out = {};
  Object.entries(state.concepts).forEach(([k, v]) => { out[k] = { kind:'concept', color:v.color, desc:v.desc, nodes:state.nodes.filter(n => n.concepts.includes(k)).map(n => n.id) }; });
  Object.entries(state.patterns).forEach(([k, v]) => { out['⟳' + k] = { kind:'process', name:k, color:v.color, desc:v.desc, nodes:state.nodes.filter(n => n.processPattern === k).map(n => n.id) }; });
  return out;
}
function suggestConcepts(text, exclude = []){
  text = String(text || ''); const low = text.toLowerCase();
  const sc = Object.keys(state.concepts).map(k => {
    let s = text.includes(k) ? 5 : 0;
    ((CONCEPTS.defs[k] || {}).kw || []).forEach(w => { if (low.includes(w.toLowerCase())) s += 2; });
    k.split(/vs|與|和|\s+/).filter(x => x.length >= 2).forEach(part => { if (text.includes(part)) s += 1; });
    return [k, s];
  }).filter(([k, s]) => s > 0 && !exclude.includes(k)).sort((a, b) => b[1] - a[1]);
  return sc.slice(0, 6).map(x => x[0]);
}
function makeSubBrain(id){
  const n = N(id); if (!n) return null;
  if (state.brains.some(b => b.rootNodeId === id)) { toast('已經是子腦'); return null; }
  const parent = B(n.brainId);
  const sibs = state.brains.filter(b => b.parentBrainId === parent.id).length;
  let pos;
  const pp = new THREE.Vector3(...parent.position);
  if (parent.id === 'main'){
    const a = sibs * 2.39996 + 0.5; const r = WORLD * 1.75 + Math.floor(sibs / 6) * 2.2;
    pos = [Math.sin(a) * r, (sibs % 2 ? 1.1 : -0.7) + (sibs % 3) * 0.3, Math.cos(a) * r];
  } else {
    const gp = new THREE.Vector3(...B(parent.parentBrainId).position);
    const dir = pp.clone().sub(gp).normalize(); const ang = (sibs % 2 ? 1 : -1) * (0.55 + 0.35 * Math.floor(sibs / 2));
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    const r = WORLD * parent.scale * 1.7; const v = pp.clone().add(dir.multiplyScalar(r)); v.y += (sibs % 2 ? 0.6 : -0.5) * parent.scale;
    pos = v.toArray();
  }
  const bid = uid('b');
  const sub = descendants(id, true);
  mutate('subbrain', { nodeId:id, title:n.title, brainId:bid, from:parent.id }, () => {
    state.brains.push({ id:bid, name:n.title, parentBrainId:parent.id, position:pos, scale:parent.scale * 0.5, regionColor:nodeColor(n), rootNodeId:id, createdAt:Date.now() });
    n.brainId = bid; n.pos = [0, 0.1, 0]; n.collapsed = false;
    // radial re-layout of the subtree inside the new brain
    const depthOf = x => { let d = 0, c = x; while (c && c.id !== id){ c = N(c.parentId); d++; } return d; };
    const byDepth = {}; sub.forEach(s => { const d = depthOf(s); (byDepth[d] = byDepth[d] || []).push(s); });
    Object.keys(byDepth).forEach(d => { const arr = byDepth[d]; arr.forEach((s, i) => { const a = i / arr.length * Math.PI * 2 + d * 0.7;
      s.brainId = bid; s.pos = clampInside([Math.sin(a) * 0.2 * d, 0.1 + (i % 2 ? 0.12 : -0.1) * Math.min(d, 2), Math.cos(a) * 0.3 * d]); }); });
    relaxAll(state, new Set([bid, ...sub.map(s => s.id), id]));   // [proto] only the new sub-brain and its nodes move
  });
  pendingFly.set(bid, id);
  focusBrain(bid, 1400);
  return bid;
}
function mergeBrain(bid){
  const b = B(bid); if (!b || bid === 'main') return;
  const target = B(b.parentBrainId) || B('main');
  const root = N(b.rootNodeId);
  mutate('merge', { nodeId:b.rootNodeId, brainId:bid, title:b.name, into:target.id, intoName:target.id === 'main' ? '主腦' : target.name }, () => {   // nodeId: shows up in the node's own history + clickable in 🕘
    const anchor = root && root.parentId && N(root.parentId) && N(root.parentId).brainId === target.id ? N(root.parentId).pos
      : (target.id === 'main' ? (REGION[root ? root.type : '其他'] || REGION['其他']) : [0, 0.08, 0]);
    state.nodes.filter(n => n.brainId === bid).forEach(n => { n.brainId = target.id; n.pos = jitter(anchor, n.id === b.rootNodeId ? 0.06 : 0.17); });
    state.brains.filter(x => x.parentBrainId === bid).forEach(x => { x.parentBrainId = target.id; });
    state.brains = state.brains.filter(x => x.id !== bid);
  });
  focusBrain(target.id);
}
function crossLink(a, b){
  const na = N(a), nb = N(b); if (!na || !nb || a === b) return null;
  if (na.brainId === nb.brainId){ toast('請選擇不同腦區的節點'); return null; }
  if (state.links.some(l => l.kind === 'cross' && ((l.from === a && l.to === b) || (l.from === b && l.to === a)))){ toast('已經連結過'); return null; }
  const id = uid('x');
  mutate('cross', { from:a, to:b, fromTitle:na.title, toTitle:nb.title }, () => state.links.push({ id, from:a, to:b, kind:'cross', createdAt:Date.now() }));
  return id;
}
function setCollapsed(id, v){ const n = N(id); if (!n) return; mutate(v ? 'collapse' : 'expand', { nodeId:id, title:n.title }, () => { n.collapsed = v; }); }
function setStatus(id, s){ const n = N(id); if (!n || !STATUS[s]) return; mutate('status', { nodeId:id, title:n.title, status:s }, () => { n.status = s; }); }
function addCounterEvidence(id, text, createdBy = 'merlin', source = ''){ const n = N(id); if (!n || !text) return;
  mutate('counter', { nodeId:id, title:n.title, text }, () => n.counterEvidence.push({ id:uid('c'), text, source, createdBy, ts:Date.now() })); }
function setMedia(id, kind, url){ const n = N(id); if (!n) return false; url = String(url || '').trim(); if (!safeUrl(url)) return false; mutate('media', { nodeId:id, kind, url }, () => { n.media[kind] = url; }); return true; }
function deleteNode(id){
  const n = N(id); if (!n || n.createdBy === 'seed') return;
  if (state.brains.some(b => b.rootNodeId === id)){ toast('這是子腦核心，請先併回'); return; }
  const gone = new Set([id, ...descendants(id, true).map(d => d.id)]);
  if (state.brains.some(b => gone.has(b.rootNodeId))){ toast('分支裡有子腦，請先併回'); return; }
  mutate('delete', { nodeId:id, title:n.title }, () => { state.nodes = state.nodes.filter(x => !gone.has(x.id)); state.links = state.links.filter(l => !gone.has(l.from) && !gone.has(l.to)); });
  closePanel();
}
function undo(){
  if (!undoStack.length){ toast('沒有可復原的步驟'); return; }
  const h = state.history, s = JSON.parse(undoStack.pop()); state = s.history ? s : { ...s, history:h };   // old full snapshots still work
  save(true); sync(); renderHistory(); renderCrumbs(); closePanel(); toast('↶ 已復原');
  if (!B(focusId)) focusBrain('main');
  emit('change', { action:'undo' });
}
/* 雲端同步開著時，重置只影響這台裝置（捨棄本機修改、改用雲端版本），不會寫墓碑去清空共享大腦 */
function resetAll(){ if (window.AISync && window.AISync.enabled && window.AISync.resetLocal){ pushUndo(); return window.AISync.resetLocal(resetSeed); } resetSeed(); }
function resetSeed(){ pushUndo(); state = migrate(seedState()); state.history.push({ ts:Date.now(), action:'reset', payload:{} }); save(true); sync(); renderHistory(); renderCrumbs(); closePanel(); focusBrain('main'); emit('change', { action:'reset' }); }
function exportJSON(value = state){
  // onclick passes a MouseEvent; preserve the original graph-export behavior.
  if (!value || value instanceof Event) value = state;
  const blob = new Blob([JSON.stringify(value, null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ai-brain-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'') + '.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('⇩ 已匯出 JSON');
}
function importJSON(obj){
  if (!valid(obj)){ toast('⚠ 檔案格式不符'); return false; }
  let candidate;
  try {
    validateGraph(obj); backup(localStorage, 'before-import');
    candidate = migrate(JSON.parse(JSON.stringify(obj))); verifyTopology(obj, candidate);
    candidate.history.push({ ts:Date.now(), action:'import', payload:{ nodes:obj.nodes.length, brains:obj.brains.length } });
    persistence.save(candidate);
  } catch { toast('⚠ 匯入未完成：原始資料保留'); return false; }
  pushUndo();
  state = candidate;
  save(true); sync(); renderHistory(); renderCrumbs(); closePanel(); focusBrain('main'); toast('⇧ 已匯入');
  emit('change', { action:'import' });
  return true;
}
/* changes that come from elsewhere (Supabase realtime / sync.js). fn(st) patches a state object in place; it is applied to the
   live state AND to every undo snapshot, so ↶ only reverts your own last action instead of other people's edits.
   No history entry, no undo step. Emits change { action:'remote' }. */
function applyExternal(fn, info = {}){
  fn(state); IX.n.a = IX.b.a = null;   // [proto] putEntity replaces array items in place -> drop the id Map indexes
  if (!valid(state)) return false;
  // [proto] lighter undo snapshots have no history log: patch them with a throw-away history and strip it again
  if (!info.keepUndo) undoStack = undoStack.map(s => { try { const o = JSON.parse(s), lite = !o.history; if (lite) o.history = []; fn(o); if (lite) delete o.history; return JSON.stringify(o); } catch(e){ return s; } });
  save(); sync(); renderHistory(); renderCrumbs();
  if (!B(focusId)) focusBrain('main');
  if (selected){
    const n = N(selected), ae = document.activeElement;
    if (!n) closePanel();
    else if ((!info.ids || info.ids.includes(selected)) && !(ae && panel.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) select(selected, true);
  }
  emit('change', { action:'remote', payload:{ ids:info.ids || null } });
  return true;
}

/* ================= three.js scene ================= */
const canvas = $('#c');
/* 沒有 WebGL（舊裝置、被停用、GPU 黑名單）：顯示一段說明＋短影音連結，停在這裡，不丟錯誤 */
function noWebGL(){
  document.body.dataset.webgl = '0'; canvas.style.display = 'none';
  const d = document.createElement('div'); d.id = 'noGL'; d.setAttribute('role', 'alert');
  d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:24px;z-index:5;pointer-events:none';
  d.innerHTML = '<div style="pointer-events:auto;max-width:420px;padding:22px 24px;border-radius:18px;background:rgba(14,18,40,.9);border:1px solid rgba(160,180,255,.25);color:#eef0ff;font:15px/1.7 system-ui,-apple-system,\'Noto Sans TC\',sans-serif;text-align:center">'
    + '<div style="font-size:34px">🧠</div><p style="margin:6px 0 14px">你的瀏覽器無法啟用 3D（WebGL），所以看不到認知大腦。<br>可以改看短影音頁，內容是同一份。</p>'
    + '<a href="feed.html" style="display:inline-block;padding:9px 18px;border-radius:99px;background:#f5c451;color:#1a1300;font-weight:700;text-decoration:none">📱 改看短影音</a></div>';
  document.body.appendChild(d);
}
const hasWebGL = (() => { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch(e){ return false; } })();
let renderer = null;
if (hasWebGL) try { renderer = new THREE.WebGLRenderer({ canvas, antialias:!MOBILE, alpha:false, powerPreference:'high-performance' }); } catch(e){ renderer = null; }
if (!renderer){ noWebGL(); await new Promise(() => {}); }   // 其餘程式（3D 場景、AIBrain）都需要 WebGL：不再往下跑
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
/* [proto] one shared pixel-ratio uniform for every point shader, so dynamic resolution only has to update one value */
const DPR_MAX = renderer.getPixelRatio(), UPR = { value:DPR_MAX };
renderer.setClearColor(0x03040b, 1);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x03040b, 0.018);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
camera.position.set(0, 2.6, 10.5);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 1.2; controls.maxDistance = 60;
controls.autoRotate = !REDUCED; controls.autoRotateSpeed = 0.5; controls.zoomSpeed = 0.9; controls.rotateSpeed = 0.7;
let lastInteract = 0;
controls.addEventListener('start', () => { controls.autoRotate = false; lastInteract = performance.now(); cancelFly(); });
controls.addEventListener('end', () => { lastInteract = performance.now(); });

// shared textures
function glowTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.85)'); gr.addColorStop(0.45, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTexture();

// background stars + nebula
(function sky(){
  const n = MOBILE ? 1200 : 3000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), ph = new Float32Array(n);
  const palette = [new THREE.Color('#ffffff'), new THREE.Color('#cfe0ff'), new THREE.Color('#ffe6c4'), new THREE.Color('#d6c6ff')];
  for (let i = 0; i < n; i++){
    const r = 70 + Math.random() * 120, u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(v) * Math.cos(u), r * Math.cos(v), r * Math.sin(v) * Math.sin(u)], i * 3);
    const c = palette[i % 4]; col.set([c.r, c.g, c.b], i * 3); ph[i] = Math.random() * 6.28;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({ uniforms:{ uTime:{ value:0 }, uPR:UPR }, transparent:true, depthWrite:false, fog:false,
    vertexShader:`attribute float aPhase; attribute vec3 color; uniform float uTime; uniform float uPR; varying vec3 vC; varying float vA;
      void main(){ vC=color; vA=0.45+0.55*sin(uTime*1.3+aPhase); vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=(1.2+1.6*fract(aPhase*7.13))*uPR; gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(vC, vA*smoothstep(.5,.0,d)); }` });
  const p = new THREE.Points(g, m); p.userData.sky = true; scene.add(p); skyMat = m;
  const neb = [['#4a2a9a', [-40, 10, -60], 70], ['#0f5a78', [50, -10, -40], 60], ['#7a2466', [20, 30, 60], 65], ['#1f3a96', [-55, -25, 30], 55]];
  neb.forEach(([c, p3, s]) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:c, transparent:true, opacity:0.22, depthWrite:false, blending:THREE.AdditiveBlending, fog:false }));
    sp.position.set(...p3); sp.scale.set(s, s, 1); scene.add(sp); });
})();
var skyMat;

// procedural brain geometry (shared)
function gyri(x, y, z){
  const a = Math.sin(11 * x + 2.2 * Math.sin(7 * y + 1.3) + 1.7 * Math.sin(5 * z));
  const b = Math.sin(11 * z + 2.0 * Math.sin(6 * x + 0.7) + 1.5 * Math.sin(8 * y));
  const c = Math.sin(13 * y + 1.8 * Math.sin(9 * z) + 1.2 * Math.sin(7 * x + 2.0));
  return (a * b + 0.6 * c * a + 0.4 * b * c) / 1.6;
}
function hemisphere(side, ws, hs){
  const g = new THREE.SphereGeometry(1, ws, hs); const p = g.attributes.position; const fold = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++){
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    let x = vx * 0.47, y = vy * 0.56, z = vz * 0.8;
    if (side * x < 0) x *= 0.22;                          // medial face
    if (y < -0.22) y = -0.22 + (y + 0.22) * 0.45;          // flatter base
    if (y < 0 && z > 0.1) y -= 0.08 * Math.max(0, -vy) * Math.max(0, vz);  // temporal/frontal shaping
    const n = gyri(vx, vy, vz) * (side * vx < -0.2 ? 0.35 : 1);
    const d = 1 + 0.045 * n; x *= d; y *= d; z *= d;
    p.setXYZ(i, x + side * 0.13, y + 0.1, z); fold[i] = n;
  }
  g.setAttribute('fold', new THREE.BufferAttribute(fold, 1)); g.computeVertexNormals(); return g;
}
function cerebellum(){
  const g = new THREE.SphereGeometry(1, MOBILE ? 48 : 72, MOBILE ? 32 : 48); const p = g.attributes.position; const fold = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++){ const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i); const n = Math.sin(vy * 34 + Math.sin(vx * 5) * 1.5);
    const d = 1 + 0.03 * n; p.setXYZ(i, vx * 0.36 * d, vy * 0.17 * d - 0.27, vz * 0.22 * d - 0.5); fold[i] = n; }
  g.setAttribute('fold', new THREE.BufferAttribute(fold, 1)); g.computeVertexNormals(); return g;
}
function fill(g, n, v){ g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; }
function stem(){ const g = new THREE.CylinderGeometry(0.075, 0.05, 0.4, 20, 4); g.rotateX(0.35); g.translate(0, -0.42, -0.3); g.setAttribute('fold', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.3), 1)); return g; }
const WS = MOBILE ? 96 : 144, HS = MOBILE ? 72 : 108;
const GEO = { L:hemisphere(-1, WS, HS), R:hemisphere(1, WS, HS), C:cerebellum(), S:stem() };
const NODE_GEO = new THREE.IcosahedronGeometry(1, 2);
const DIR_GEO = new THREE.OctahedronGeometry(1.25, 0); DIR_GEO.scale(0.75, 1.6, 0.75);
const BEAM_GEO = new THREE.CylinderGeometry(0.0, 0.32, 1, 10, 1, true); BEAM_GEO.translate(0, 0.5, 0);
const shellVS = `attribute float fold; varying vec3 vN; varying vec3 vV; varying float vF; varying vec3 vP;
  void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); vF=fold; vP=position; gl_Position=projectionMatrix*mv; }`;
const shellFS = `uniform vec3 uColor; uniform float uTime; uniform float uOpacity; varying vec3 vN; varying vec3 vV; varying float vF; varying vec3 vP;
  void main(){ float fr=pow(1.0-abs(dot(vN,vV)),2.0); float g=smoothstep(-0.7,0.9,vF);
    float wave=0.5+0.5*sin(uTime*1.6 - vP.z*7.0 + vP.y*3.0);
    vec3 c=uColor*(0.18+1.15*fr)*(0.45+0.75*g) + vec3(0.65,0.75,1.0)*pow(fr,5.0)*0.7 + uColor*wave*0.06;
    float a=(0.05+0.5*fr)*(0.5+0.6*g)*uOpacity; gl_FragColor=vec4(c,a); }`;

/* ---------- scene objects ---------- */
const brainObjs = new Map();   // id -> { group, mat, inner, regions:Map, links:LineSegments, label }
const nodeObjs = new Map();    // id -> { mesh, glow, brainId }
const tweens = [];
const pendingFly = new Map();  // brainId -> source nodeId
const pendingBursts = [];
const labelsEl = $('#labels');
function tween(o){ o.t0 = performance.now() + (o.delay || 0); tweens.push(o); return o; }
const easeOut = t => 1 - Math.pow(1 - t, 3), easeBack = t => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function makeInner(count, color){
  const pos = new Float32Array(count * 3), ph = new Float32Array(count), col = new Float32Array(count * 3);
  const c1 = new THREE.Color(color), c2 = new THREE.Color('#5fd4ff'), tmp = new THREE.Color();
  for (let i = 0; i < count; i++){
    let p, e; const shell = Math.random() < 0.55;   // [proto] 55% of points hug the cortex (grey-matter feel)
    do { p = [(Math.random() * 2 - 1) * 0.55, Math.random() * 0.9 - 0.32, (Math.random() * 2 - 1) * 0.78]; e = (p[0] / 0.55) ** 2 + ((p[1] - 0.1) / 0.5) ** 2 + (p[2] / 0.78) ** 2; }
    while (e > 0.85 || (shell && e < 0.6));
    pos.set(p, i * 3); ph[i] = Math.random() * 6.28; tmp.copy(c1).lerp(c2, Math.random()); col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({ uniforms:{ uTime:{ value:0 }, uSize:{ value:MOBILE ? 26 : 30 }, uPR:UPR }, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`attribute float aPhase; attribute vec3 color; uniform float uTime; uniform float uSize; uniform float uPR; varying float vA; varying vec3 vC;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); float p=0.5+0.5*sin(uTime*2.2+aPhase+position.z*6.0); vA=0.15+0.85*p*p*p; vC=color;
        gl_PointSize=uSize*uPR*(0.35+0.65*p)/-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader:`varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(vC, vA*smoothstep(.5,0.,d)); }` });
  const pts = new THREE.Points(g, m);
  // faint static synapse web between nearby particles
  const segs = []; const lim = Math.min(count, MOBILE ? 220 : 420);
  for (let i = 0; i < lim; i++){ let best = -1, bd = 1e9; for (let j = 0; j < lim; j++){ if (j === i) continue; const dx = pos[i*3]-pos[j*3], dy = pos[i*3+1]-pos[j*3+1], dz = pos[i*3+2]-pos[j*3+2]; const d = dx*dx+dy*dy+dz*dz; if (d < bd){ bd = d; best = j; } }
    if (best > i || true) segs.push(pos[i*3], pos[i*3+1], pos[i*3+2], pos[best*3], pos[best*3+1], pos[best*3+2]); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
  const web = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color, transparent:true, opacity:0.12, blending:THREE.AdditiveBlending, depthWrite:false }));
  return { pts, web, mat:m };
}
/* ================= [proto] brain interior: layered structures, fibre tracts, travelling signals ================= */
/* [proto] brain interior lives in brain/interior.js */
const { makeInterior } = initInterior({ THREE, Q, UPR, GLOW, GEO, shellVS, shellFS, nodeColor, clampInside, bez });
function upd(attr, n){ attr.clearUpdateRanges(); if (n > 0){ attr.addUpdateRange(0, n * attr.itemSize); attr.needsUpdate = true; } }
function createBrain(b){
  const group = new THREE.Group(); group.userData.brainId = b.id;
  const mat = new THREE.ShaderMaterial({ uniforms:{ uColor:{ value:new THREE.Color(b.regionColor) }, uTime:{ value:0 }, uOpacity:{ value:1 } },
    vertexShader:shellVS, fragmentShader:shellFS, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide });
  const anat = new THREE.Group(); group.add(anat);   // [proto] everything anatomical lives here (breathes); nodes stay put
  ['L', 'R', 'C', 'S'].forEach(k => { const m = new THREE.Mesh(GEO[k], mat); m.userData.brainId = b.id; m.userData.shell = true; anat.add(m); });
  const inner = makeInner(Math.round(b.id === 'main' ? Q.cloud : Q.cloud * 0.25), b.regionColor);
  anat.add(inner.pts, inner.web);
  const interior = makeInterior(b, b.id === 'main' ? 1 : Q.sub); anat.add(interior.group);
  const nodes = new THREE.Group(); group.add(nodes);
  const lg = new THREE.BufferGeometry(); const MAXL = 4000;
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXL * 3), 3)); lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXL * 3), 3));
  const links = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors:true, transparent:true, opacity:0.75, blending:THREE.AdditiveBlending, depthWrite:false }));
  links.frustumCulled = false; group.add(links);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:b.regionColor, transparent:true, opacity:b.id === 'main' ? 0.18 : 0.28, depthWrite:false, blending:THREE.AdditiveBlending }));
  halo.scale.set(2.6, 2.6, 1); halo.position.y = 0.1; group.add(halo);
  const label = document.createElement('div'); label.className = 'blabel'; labelsEl.appendChild(label);
  label.onclick = () => focusBrain(b.id);
  scene.add(group);
  const o = { group, mat, inner, nodes, links, halo, label, anat, interior, regions:new Map(), phase:Math.random() * 6.28 };
  brainObjs.set(b.id, o); return o;
}
function disposeBrain(id){
  const o = brainObjs.get(id); if (!o) return;
  const b0 = o.group; const parent = o.parentPos || new THREE.Vector3();
  tween({ dur:900, ease:easeIO, from:b0.position.clone(), to:parent, s0:b0.scale.x, s1:0.01, step:(e, tw) => { b0.position.lerpVectors(tw.from, tw.to, e); b0.scale.setScalar(tw.s0 + (tw.s1 - tw.s0) * e); },
    done:() => { scene.remove(b0); o.inner.pts.geometry.dispose(); o.inner.web.geometry.dispose(); o.links.geometry.dispose(); o.interior.dispose(); o.label.remove(); } });
  brainObjs.delete(id);
}
function createNode(n, bo){
  const color = new THREE.Color(nodeColor(n)); const isDir = n.kind === 'direction';
  const mesh = new THREE.Mesh(isDir ? DIR_GEO : NODE_GEO, new THREE.MeshBasicMaterial({ color, transparent:true }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color, transparent:true, opacity:0.9, depthWrite:false, blending:THREE.AdditiveBlending }));
  glow.scale.set(7, 7, 1); mesh.add(glow);
  let beam = null;
  if (isDir){ beam = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color:DIR_COLOR, transparent:true, opacity:0.45, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide })); beam.scale.set(1, 13, 1); mesh.add(beam); }
  mesh.userData.nodeId = n.id; glow.userData.nodeId = n.id;
  bo.nodes.add(mesh);
  const o = { mesh, glow, beam, isDir, brainId:n.brainId, phase:Math.random() * 6.28, size:0 };
  nodeObjs.set(n.id, o); return o;
}
function nodeSize(n){ const isRoot = state.brains.some(b => b.rootNodeId === n.id); return isRoot ? 0.042 : n.kind === 'question' ? 0.03 : n.kind === 'direction' ? 0.026 : 0.021; }
function hiddenByCollapse(n){ let c = N(n.parentId); while (c){ if (c.brainId !== n.brainId) return false; if (c.collapsed) return true; c = N(c.parentId); } return false; }
let filterType = null;

function sync(){
  // brains
  const seen = new Set();
  state.brains.forEach(b => {
    seen.add(b.id);
    let o = brainObjs.get(b.id);
    const target = new THREE.Vector3(...b.position), ts = WORLD * b.scale;
    if (!o){
      o = createBrain(b);
      const srcNode = pendingFly.get(b.id);
      const so = srcNode && nodeObjs.get(srcNode);
      if (so){
        const from = so.mesh.getWorldPosition(new THREE.Vector3());
        o.group.position.copy(from); o.group.scale.setScalar(0.02);
        burstAt(from, b.regionColor, 1.6);
        tween({ dur:1600, ease:easeIO, from, to:target, brainObj:o, step:(e, tw) => { o.group.position.lerpVectors(tw.from, o.target || tw.to, e); const k = Math.max(0.02, ts * (e < 0.3 ? e / 0.3 * 0.35 : 0.35 + 0.65 * easeBack((e - 0.3) / 0.7))); o.group.scale.setScalar(k); } });
      } else { o.group.position.copy(target); o.group.scale.setScalar(ts); }
      pendingFly.delete(b.id);
    } else if (o.group.position.distanceTo(target) > 1e-3 && !tweens.some(t => t.brainObj === o)){   // [proto] slide away from overlaps
      const from = o.group.position.clone();
      tween({ dur:1100, ease:easeIO, brainObj:o, step:e => o.group.position.lerpVectors(from, o.target, e) });
    }
    o.target = target;
    const pb = B(b.parentBrainId); o.parentPos = pb ? new THREE.Vector3(...pb.position) : new THREE.Vector3();
    const LMAX = MOBILE ? 7 : 12;   // [proto] shorter labels on phones
    o.label.textContent = b.id === 'main' ? '' : '🧠 ' + (b.name.length > LMAX ? b.name.slice(0, LMAX) + '…' : b.name);
    o.label.style.setProperty('--c', safeColor(b.regionColor));
  });
  [...brainObjs.keys()].forEach(id => { if (!seen.has(id)) disposeBrain(id); });
  // nodes
  const alive = new Set();
  state.nodes.forEach(n => {
    alive.add(n.id);
    const bo = brainObjs.get(n.brainId); if (!bo) return;
    let o = nodeObjs.get(n.id);
    const target = new THREE.Vector3(...n.pos);
    if (o && o.brainId !== n.brainId){             // moved to another brain (sub-brain split / merge)
      o.mesh.parent && o.mesh.parent.remove(o.mesh); bo.nodes.add(o.mesh); o.brainId = n.brainId;
      o.mesh.position.set(0, 0.1, 0); o.mesh.scale.setScalar(0.001);
      tween({ dur:1100, delay:500 + Math.random() * 400, ease:easeBack, from:o.mesh.position.clone(), to:target, obj:o, step:(e, tw) => { tw.obj.mesh.position.lerpVectors(tw.from, tw.to, e); } });
    }
    if (!o){
      o = createNode(n, bo);
      const par = N(n.parentId); const po = par && nodeObjs.get(par.id);
      const start = po && po.brainId === n.brainId ? po.mesh.position.clone() : target.clone();
      o.mesh.position.copy(start); o.mesh.scale.setScalar(0.001);
      if (initDone){ tween({ dur:1000, delay:120 + Math.random() * 200, ease:easeBack, from:start, to:target.clone(), obj:o, step:(e, tw) => tw.obj.mesh.position.lerpVectors(tw.from, tw.to, e) }); }
      else o.mesh.position.copy(target);
    } else if (o.mesh.position.distanceTo(target) > 1e-4 && !tweens.some(t => t.obj === o)){
      tween({ dur:900, ease:easeIO, from:o.mesh.position.clone(), to:target, obj:o, step:(e, tw) => tw.obj.mesh.position.lerpVectors(tw.from, tw.to, e) });
    }
    const col = new THREE.Color(nodeColor(n));
    o.mesh.material.color.copy(col); o.glow.material.color.copy(col);
    o.size = nodeSize(n);
    o.visible = !hiddenByCollapse(n);
    o.dim = (filterType && n.type !== filterType) || (conceptUI.focus && !inFocus(n));
    o.kind = n.kind; o.status = n.status; o.user = n.createdBy !== 'seed'; o.collapsed = n.collapsed && kids(n.id).some(k => k.brainId === n.brainId);
  });
  [...nodeObjs.keys()].forEach(id => { if (!alive.has(id)){ const o = nodeObjs.get(id); o.mesh.parent && o.mesh.parent.remove(o.mesh); o.mesh.material.dispose(); o.glow.material.dispose(); nodeObjs.delete(id); } });
  // regions: one soft glow per type per brain
  brainObjs.forEach((bo, bid) => {
    const acc = {}; state.nodes.filter(n => n.brainId === bid && n.kind === 'question').forEach(n => { (acc[n.type] = acc[n.type] || []).push(n.pos); });
    const want = new Set(Object.keys(acc));
    acc && Object.entries(acc).forEach(([t, arr]) => {
      const c = arr.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map(v => v / arr.length);
      let sp = bo.regions.get(t);
      if (!sp){ sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:colorOf(t), transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending })); sp.scale.set(0.55, 0.55, 1); bo.group.add(sp); bo.regions.set(t, sp); }
      sp.position.set(...c); sp.userData.want = 0.28;
    });
    bo.regions.forEach((sp, t) => { if (!want.has(t)) sp.userData.want = 0; });
  });
  // bursts for freshly created / split nodes
  while (pendingBursts.length){ const id = pendingBursts.shift(); const o = nodeObjs.get(id); if (o){ o.mesh.updateWorldMatrix(true, false); const n = N(id); burstAt(o.mesh.getWorldPosition(new THREE.Vector3()), colorOf(n.type), 0.8 * (B(n.brainId)?.scale || 1)); } }
  brainObjs.forEach((bo, bid) => bo.interior.setNodes(state.nodes.filter(n => n.brainId === bid && (n.kind === 'question' || n.kind === 'direction' || state.brains.some(x => x.rootNodeId === n.id)))));   // [proto]
  computeThreads(); applyFocus();
  updateCounts(); renderConcepts();
}
/* [proto] focus mode: when a node is selected, everything unrelated fades back */
let related = null;
function applyFocus(){
  related = null;
  const n = selected && N(selected);
  if (n && ui.declutter){
    related = new Set([n.id]); if (n.parentId) related.add(n.parentId);
    kids(n.id).forEach(k => related.add(k.id));
    state.links.forEach(l => { if (l.from === n.id) related.add(l.to); if (l.to === n.id) related.add(l.from); });
    state.nodes.forEach(m => { if (m.concepts.some(c => n.concepts.includes(c))) related.add(m.id); });
  }
  nodeObjs.forEach((o, id) => { o.fdim = !!related && !related.has(id); });
}
/* ---------- concept threads (derived, recomputed on every sync so they follow moves / splits / sub-brains) ---------- */
const conceptUI = { on:true, focus:null };
let threads = [], conceptLinks = [];
function inFocus(n){ const f = conceptUI.focus; if (!f) return true; return f.startsWith('p:') ? n.processPattern === f.slice(2) : n.concepts.includes(f.slice(2)); }
function threadColor(key){ const nm = key.slice(2); return key[0] === 'c' ? (state.concepts[nm]?.color || '#ffffff') : (state.patterns[nm]?.color || '#e2e8f0'); }
function computeThreads(){
  const wp = n => { const b = B(n.brainId) || B('main'); return new THREE.Vector3(...n.pos).multiplyScalar(WORLD * b.scale).add(new THREE.Vector3(...b.position)); };
  const groups = {};
  state.nodes.forEach(n => {
    const o = nodeObjs.get(n.id); if (!o || !o.visible) return;
    (n.concepts || []).forEach(c => (groups['c:' + c] = groups['c:' + c] || []).push(n));
    if (n.processPattern) (groups['p:' + n.processPattern] = groups['p:' + n.processPattern] || []).push(n);
  });
  threads = Object.entries(groups).filter(([, a]) => a.length > 1).map(([key, arr]) => {
    const P = new Map(arr.map(n => [n.id, wp(n)]));
    const c = arr.reduce((s, n) => s.add(P.get(n.id)), new THREE.Vector3()).divideScalar(arr.length);
    let cur = arr.reduce((a, b) => P.get(a.id).distanceTo(c) >= P.get(b.id).distanceTo(c) ? a : b).id;
    const order = [cur], left = new Set(arr.map(n => n.id)); left.delete(cur);
    while (left.size){ let best = null, bd = Infinity; left.forEach(i => { const d = P.get(i).distanceTo(P.get(cur)); if (d < bd){ bd = d; best = i; } }); order.push(best); left.delete(best); cur = best; }
    return { key, name:key.slice(2), kind:key[0] === 'c' ? 'concept' : 'process', color:threadColor(key), ids:order, h:hashStr(key) };
  });
  conceptLinks = threads.flatMap(th => th.ids.slice(1).map((id, i) => ({ from:th.ids[i], to:id, kind:'concept', concept:th.name, threadKind:th.kind, key:th.key, color:th.color, h:th.h })));
}
function hashStr(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }
function focusConcept(key){
  if (key && !key.includes(':')) key = (state.concepts[key] ? 'c:' : 'p:') + key;
  conceptUI.focus = conceptUI.focus === key ? null : (key || null);
  if (conceptUI.focus) conceptUI.on = true;
  sync(); renderConceptPill();
  return conceptUI.focus;
}
function showConcepts(v){ conceptUI.on = v === undefined ? !conceptUI.on : !!v; if (!conceptUI.on){ conceptUI.focus = null; sync(); renderConceptPill(); } renderConcepts(); return conceptUI.on; }

/* ---------- bursts ---------- */
function burstAt(pos, color, size = 1){
  const g = new THREE.Group(); g.position.copy(pos); scene.add(g);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending })); g.add(flash);
  const sparks = []; for (let i = 0; i < (MOBILE ? 10 : 18); i++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:'#ffffff', transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }));
    const d = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize().multiplyScalar((0.6 + Math.random()) * size); sparks.push([s, d]); g.add(s); }
  tween({ dur:1000, ease:t => t, step:e => { const k = easeOut(e); flash.scale.setScalar(size * (0.3 + 2.2 * k)); flash.material.opacity = 1 - e;
    sparks.forEach(([s, d]) => { s.position.copy(d).multiplyScalar(k); s.scale.setScalar(0.12 * size * (1 - e) + 0.01); s.material.opacity = 1 - e; }); },
    done:() => { scene.remove(g); flash.material.dispose(); sparks.forEach(([s]) => s.material.dispose()); } });
}

/* ---------- cross-brain arcs + flowing particles ---------- */
const MAXA = 16000;
const arcGeo = new THREE.BufferGeometry();
arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXA * 3), 3)); arcGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXA * 3), 3));
const arcs = new THREE.LineSegments(arcGeo, new THREE.LineBasicMaterial({ vertexColors:true, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false }));
arcs.frustumCulled = false; scene.add(arcs);
const MAXP = MOBILE ? 260 : 700;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3)); pGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAXP), 1));
const pMat = new THREE.ShaderMaterial({ uniforms:{ uPR:UPR }, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  vertexShader:`attribute vec3 color; attribute float aSize; uniform float uPR; varying vec3 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=aSize*uPR*60.0/-mv.z; gl_Position=projectionMatrix*mv; }`,
  fragmentShader:`varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; float a=smoothstep(.5,0.,d); gl_FragColor=vec4(vC*(0.6+a), a); }` });
const flow = new THREE.Points(pGeo, pMat); flow.frustumCulled = false; scene.add(flow);
/* [proto] screen-space "fat" glowing ribbons for highlighted lines (WebGL line width is always 1px) */
const RMAX = MOBILE ? 2400 : 4800;
const RW = { focus:MOBILE ? 14 : 11, sel:MOBILE ? 11 : 8, concept:MOBILE ? 10 : 7, cross:MOBILE ? 8 : 6 };   // half-width incl. glow (px)
const rGeo = new THREE.BufferGeometry();
{ const corner = new Float32Array(RMAX * 8), idx = new Uint32Array(RMAX * 6);
  for (let i = 0; i < RMAX; i++){ corner.set([-1, 0, 1, 0, -1, 1, 1, 1], i * 8); const v = i * 4; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6); }
  rGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  rGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RMAX * 12), 3));
  rGeo.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(RMAX * 12), 3));
  rGeo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  rGeo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(RMAX * 12), 3));
  rGeo.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(RMAX * 4), 1)); }
const rMat = new THREE.ShaderMaterial({ uniforms:{ uRes:{ value:new THREE.Vector2(innerWidth, innerHeight) }, uTime:{ value:0 } }, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide,
  vertexShader:`attribute vec3 aB; attribute vec2 aCorner; attribute vec3 aCol; attribute float aW; uniform vec2 uRes; varying vec3 vC; varying float vS; varying float vT;
    void main(){ vec4 a=projectionMatrix*modelViewMatrix*vec4(position,1.); vec4 b=projectionMatrix*modelViewMatrix*vec4(aB,1.);
      if(a.w<=0.01||b.w<=0.01){ gl_Position=vec4(2.,2.,2.,1.); return; }
      vec2 sa=a.xy/a.w*uRes*.5, sb=b.xy/b.w*uRes*.5; vec2 d=sb-sa; float L=length(d); vec2 dir=L>1e-4?d/L:vec2(1.,0.); vec2 n=vec2(-dir.y,dir.x);
      vec4 p=a; if(aCorner.y>.5) p=b; float ext=(aCorner.y>.5?1.:-1.)*aW*.35;
      p.xy+=(n*aCorner.x*aW+dir*ext)*2./uRes*p.w; gl_Position=p; vC=aCol; vS=aCorner.x; vT=aCorner.y; }`,
  fragmentShader:`varying vec3 vC; varying float vS; varying float vT; void main(){ float d=abs(vS); float core=1.-smoothstep(.16,.3,d); float glow=pow(max(0.,1.-d),1.7)*.6;
      gl_FragColor=vec4(vC*(core*1.4+glow*1.2)+vec3(core*.12), clamp(core+glow,0.,1.)); }` });
const ribbons = new THREE.Mesh(rGeo, rMat); ribbons.frustumCulled = false; ribbons.renderOrder = 5; scene.add(ribbons);
let ri = 0; const rTmp1 = new THREE.Vector3(), rTmp2 = new THREE.Vector3();
function ribCurve(A, C, B, col, w, k = 1, SEG = 16){
  const pa = rGeo.attributes.position.array, pb = rGeo.attributes.aB.array, pc = rGeo.attributes.aCol.array, pw = rGeo.attributes.aW.array;
  for (let s = 0; s < SEG && ri < RMAX; s++){
    bez(A, C, B, s / SEG, rTmp1); bez(A, C, B, (s + 1) / SEG, rTmp2);
    for (let v = 0; v < 4; v++){ const j = ri * 4 + v; pa.set([rTmp1.x, rTmp1.y, rTmp1.z], j * 3); pb.set([rTmp2.x, rTmp2.y, rTmp2.z], j * 3); pc.set([col.r * k, col.g * k, col.b * k], j * 3); pw[j] = w; }
    ri++;
  }
}
const GOLD = new THREE.Color('#ffd36e');
const sideV = new THREE.Vector3(); const debug = { conceptSegments:0 };
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpV = new THREE.Vector3();
function bez(a, c, b, t, out){ const u = 1 - t; return out.set(u*u*a.x + 2*u*t*c.x + t*t*b.x, u*u*a.y + 2*u*t*c.y + t*t*b.y, u*u*a.z + 2*u*t*c.z + t*t*b.z); }

function updateLinks(time){
  const ap = arcGeo.attributes.position.array, ac = arcGeo.attributes.color.array; let ai = 0;
  const pp = pGeo.attributes.position.array, pc = pGeo.attributes.color.array, ps = pGeo.attributes.size ? null : pGeo.attributes.aSize.array; let pi = 0;
  const intra = new Map(); brainObjs.forEach((bo, id) => intra.set(id, { p:bo.links.geometry.attributes.position.array, c:bo.links.geometry.attributes.color.array, i:0 }));
  const emitP = (a, c, b, col, n, size, speed, seed) => {
    for (let k = 0; k < n && pi < MAXP; k++){ const t = ((time * speed + seed + k / n) % 1); bez(a, c, b, t, tmpV); pp[pi*3] = tmpV.x; pp[pi*3+1] = tmpV.y; pp[pi*3+2] = tmpV.z;
      const f = Math.sin(Math.PI * t); pc[pi*3] = col.r * f; pc[pi*3+1] = col.g * f; pc[pi*3+2] = col.b * f; ps[pi] = size; pi++; }
  };
  const col = new THREE.Color(); ri = 0;
  state.links.forEach((l, li) => {
    const a = nodeObjs.get(l.from), b = nodeObjs.get(l.to); if (!a || !b || !a.visible || !b.visible) return;
    const seed = (li * 0.6180339) % 1;
    const hl = selected && (l.from === selected || l.to === selected);   // [proto] links of the selected node glow
    if (l.kind === 'derived' && a.brainId === b.brainId){
      const L = intra.get(a.brainId); if (!L) return;
      if (!hl && (a.lodFar || b.lodFar)) return;                          // [proto] LOD: far-away detail links hidden
      const A = a.mesh.position, Bp = b.mesh.position; tmpC.copy(A).add(Bp).multiplyScalar(0.5).multiplyScalar(0.82);
      col.set(colorOf(N(l.to)?.type)); const dim = (a.dim || b.dim) ? 0.15 : (a.fdim || b.fdim) ? 0.2 : 1;
      if (hl){ a.mesh.getWorldPosition(tmpA); b.mesh.getWorldPosition(tmpB); tmpC.copy(tmpA).add(tmpB).multiplyScalar(0.5); tmpC.lerp(brainObjs.get(a.brainId).group.position, 0.18);
        ribCurve(tmpA, tmpC, tmpB, col, RW.sel, 0.9, 12); tmpC.copy(A).add(Bp).multiplyScalar(0.5).multiplyScalar(0.82); }
      const SEG = 8;
      for (let s = 0; s < SEG && L.i < 3990; s++){ bez(A, tmpC, Bp, s / SEG, tmpA); bez(A, tmpC, Bp, (s + 1) / SEG, tmpB);
        L.p.set([tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z], L.i * 3); const k = 0.35 * dim; L.c.set([col.r*k, col.g*k, col.b*k, col.r*k, col.g*k, col.b*k], L.i * 3); L.i += 2; }
      if (!a.dim && !b.dim){ a.mesh.getWorldPosition(tmpA); b.mesh.getWorldPosition(tmpB); tmpC.copy(tmpA).add(tmpB).multiplyScalar(0.5); const bo = brainObjs.get(a.brainId); tmpC.lerp(bo.group.position, 0.18);
        emitP(tmpA, tmpC, tmpB, col, 1, 0.9 * (B(a.brainId)?.scale || 1) + 0.25, 0.22, seed); }
      return;
    }
    // inter-brain: derived (split provenance) or cross link
    a.mesh.getWorldPosition(tmpA); b.mesh.getWorldPosition(tmpB);
    const d = tmpA.distanceTo(tmpB); tmpC.copy(tmpA).add(tmpB).multiplyScalar(0.5); tmpC.y += d * 0.28;
    const isX = l.kind === 'cross'; if (isX) col.copy(GOLD); else col.set(colorOf(N(l.to)?.type));
    if (isX || hl) ribCurve(tmpA, tmpC, tmpB, col, hl ? RW.sel : RW.cross, (a.fdim || b.fdim) && !hl ? 0.3 : 1, 24);   // [proto]
    const SEG = 28, k = (isX ? 1 : 0.55) * ((a.fdim || b.fdim) && !hl ? 0.25 : 1);
    for (let s = 0; s < SEG && ai < MAXA - 2; s++){ bez(tmpA, tmpC, tmpB, s / SEG, tmpV); ap.set([tmpV.x, tmpV.y, tmpV.z], ai * 3); bez(tmpA, tmpC, tmpB, (s + 1) / SEG, tmpV); ap.set([tmpV.x, tmpV.y, tmpV.z], ai * 3 + 3);
      ac.set([col.r*k, col.g*k, col.b*k, col.r*k, col.g*k, col.b*k], ai * 3); ai += 2; }
    emitP(tmpA, tmpC, tmpB, col, isX ? (MOBILE ? 4 : 7) : 3, isX ? 2.2 : 1.4, isX ? 0.16 : 0.12, seed);
  });
  // concept / process threads
  let cSeg = 0;
  const selKeys = selected && !conceptUI.focus && ui.declutter ? new Set(threads.filter(t => t.ids.includes(selected)).map(t => t.key)) : null;
  if (conceptUI.on) conceptLinks.forEach((l, li) => {
    const a = nodeObjs.get(l.from), b = nodeObjs.get(l.to); if (!a || !b || !a.visible || !b.visible) return;
    const foc = conceptUI.focus;
    // [proto] declutter: focus thread => glowing ribbon; selected node => only its own threads; overview => faint, far detail hidden
    let isF = !foc || foc === l.key, rib = 0;
    if (foc){ if (isF) rib = RW.focus; else if (ui.declutter) return; }
    else if (selKeys){ if (!selKeys.has(l.key)) return; rib = RW.concept; }
    else if (ui.declutter && (a.lodFar || b.lodFar)) return;
    const k = foc ? (isF ? 1 : 0.05) : rib ? 0.8 : ui.declutter ? 0.3 : 0.42;
    a.mesh.getWorldPosition(tmpA); b.mesh.getWorldPosition(tmpB);
    const d = tmpA.distanceTo(tmpB);
    tmpC.copy(tmpA).add(tmpB).multiplyScalar(0.5); tmpC.y += d * (0.1 + 0.22 * l.h);
    sideV.subVectors(tmpB, tmpA); sideV.set(-sideV.z, 0, sideV.x); if (sideV.lengthSq() > 1e-8) sideV.normalize().multiplyScalar(d * (l.h - 0.5) * 0.45); tmpC.add(sideV);
    col.set(l.color);
    if (rib) ribCurve(tmpA, tmpC, tmpB, col, rib, 1, 22);
    const SEG = 22, proc = l.threadKind === 'process';
    for (let s = 0; s < SEG && ai < MAXA - 2; s++){
      if (proc && s % 2) continue;                       // process threads are dotted
      bez(tmpA, tmpC, tmpB, s / SEG, tmpV); ap.set([tmpV.x, tmpV.y, tmpV.z], ai * 3); bez(tmpA, tmpC, tmpB, (s + 1) / SEG, tmpV); ap.set([tmpV.x, tmpV.y, tmpV.z], ai * 3 + 3);
      ac.set([col.r*k, col.g*k, col.b*k, col.r*k, col.g*k, col.b*k], ai * 3); ai += 2; cSeg++;
    }
    if (isF) emitP(tmpA, tmpC, tmpB, col, foc ? (MOBILE ? 3 : 5) : (MOBILE ? 1 : 2), foc ? 2.6 : rib ? 1.8 : 1.15, proc ? 0.09 : 0.13, (l.h + li * 0.137) % 1);
  });
  debug.conceptSegments = cSeg; debug.ribbonSegments = ri;
  // tethers brain -> parent brain
  state.brains.forEach((b, bi) => { if (!b.parentBrainId) return; const o = brainObjs.get(b.id), po = brainObjs.get(b.parentBrainId); if (!o || !po) return;
    tmpA.copy(po.group.position); tmpB.copy(o.group.position); const d = tmpA.distanceTo(tmpB); tmpC.copy(tmpA).add(tmpB).multiplyScalar(0.5); tmpC.y -= d * 0.15;
    col.set(b.regionColor);
    for (let s = 0; s < 24 && ai < MAXA - 2; s++){ bez(tmpA, tmpC, tmpB, s / 24, tmpV); ap.set([tmpV.x, tmpV.y, tmpV.z], ai * 3); bez(tmpA, tmpC, tmpB, (s + 1) / 24, tmpV); ap.set([tmpV.x, tmpV.y, tmpV.z], ai * 3 + 3);
      const k = 0.22; ac.set([col.r*k, col.g*k, col.b*k, col.r*k, col.g*k, col.b*k], ai * 3); ai += 2; }
    emitP(tmpA, tmpC, tmpB, col, 2, 1.6, 0.1, bi * 0.37);
  });
  // [proto perf] upload only the drawn range (was: the whole ~0.5 MB of buffers every frame)
  rGeo.setDrawRange(0, ri * 6); ['position', 'aB', 'aCol', 'aW'].forEach(k => upd(rGeo.attributes[k], ri * 4));
  arcGeo.setDrawRange(0, ai); upd(arcGeo.attributes.position, ai); upd(arcGeo.attributes.color, ai);
  pGeo.setDrawRange(0, pi); upd(pGeo.attributes.position, pi); upd(pGeo.attributes.color, pi); upd(pGeo.attributes.aSize, pi);
  brainObjs.forEach((bo, id) => { const L = intra.get(id); const g = bo.links.geometry; g.setDrawRange(0, L.i); upd(g.attributes.position, L.i); upd(g.attributes.color, L.i); });
}

/* ---------- camera flights ---------- */
let focusId = 'main', fly = null;
function cancelFly(){ fly = null; }
function focusBrain(id, delay = 0){
  const b = B(id); if (!b) return;
  focusId = id; renderCrumbs();
  const go = () => {
    const target = new THREE.Vector3(...b.position);
    const dist = fitDist(WORLD * b.scale * 0.85);
    const dir = camera.position.clone().sub(controls.target).normalize(); if (dir.y < 0.1) dir.y = 0.25; dir.normalize();
    fly = { t0:performance.now(), dur:1300, fromT:controls.target.clone(), toT:target, fromP:camera.position.clone(), toP:target.clone().add(dir.multiplyScalar(dist)) };
  };
  delay ? setTimeout(go, delay) : go();
  $('#bHome').classList.toggle('hide', id === 'main');
}
function fitDist(r){
  const v = camera.fov * Math.PI / 180, h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
  return r / Math.sin(Math.min(v, h) / 2) * 1.05;
}
function overview(){
  const box = new THREE.Box3(); state.brains.forEach(b => { const r = WORLD * b.scale * 0.8; const p = new THREE.Vector3(...b.position); box.expandByPoint(p.clone().addScalar(r)); box.expandByPoint(p.clone().addScalar(-r)); });
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() * 0.5;
  const portrait = innerHeight > innerWidth * 1.2;
  const dist = fitDist(r * (portrait ? 0.75 : 0.9));
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (portrait && state.brains.length > 1){ dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); dir.normalize(); dir.y = 1.5; dir.normalize(); }   // [proto] top-down-ish => uses phone height
  fly = { t0:performance.now(), dur:1300, fromT:controls.target.clone(), toT:c, fromP:camera.position.clone(), toP:c.clone().add(dir.multiplyScalar(Math.max(dist, 6))) };
  focusId = 'main'; renderCrumbs(); $('#bHome').classList.add('hide');
}

/* ---------- picking ---------- */
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
function pick(x, y){
  const r = canvas.getBoundingClientRect(); ndc.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = pickNodeAt(x, y, r);   // [proto] nearest node on screen within TAP_PX, not a 1:1 raycast
  if (hit) return { node:hit };
  const shells = []; brainObjs.forEach(o => o.anat.children.forEach(c => { if (c.userData.shell) shells.push(c); }));
  const sh = ray.intersectObjects(shells, false)[0];
  return sh ? { brain:sh.object.userData.brainId } : null;
}
const pv = new THREE.Vector3();
debug.screenOf = id => { const o = nodeObjs.get(id); if (!o) return null; const v = o.mesh.getWorldPosition(new THREE.Vector3()).project(camera); return { x:(v.x * 0.5 + 0.5) * innerWidth, y:(-v.y * 0.5 + 0.5) * innerHeight, r:o.mesh.scale.x * (brainObjs.get(o.brainId)?.group.scale.x || 1) / (camera.position.distanceTo(o.mesh.getWorldPosition(new THREE.Vector3())) * 2 * Math.tan(camera.fov * Math.PI / 360) / innerHeight) }; };   // [proto] test hook
function pickNodeAt(x, y, r){
  const wppK = 2 * Math.tan(camera.fov * Math.PI / 360) / innerHeight; let best = null, bs = Infinity;
  nodeObjs.forEach((o, id) => {
    if (!o.visible || !o.mesh.visible) return;
    o.mesh.getWorldPosition(pv); const d3 = camera.position.distanceTo(pv); pv.project(camera); if (pv.z > 1) return;
    const sx = (pv.x * 0.5 + 0.5) * r.width + r.left, sy = (-pv.y * 0.5 + 0.5) * r.height + r.top;
    const gs = brainObjs.get(o.brainId)?.group.scale.x || 1, rad = o.mesh.scale.x * gs / (d3 * wppK);
    const dpx = Math.hypot(sx - x, sy - y); if (dpx > TAP_PX + rad) return;
    const score = Math.max(0, dpx - rad) + (o.kind === 'question' ? -5 : o.kind === 'direction' ? -2 : 3) + (o.lodFar ? 9 : 0) + (o.dim || o.fdim ? 7 : 0) + d3 * 0.05;
    if (score < bs){ bs = score; best = id; }
  });
  return best;
}
let down = null, linkMode = null, selected = null, hover = null;
canvas.addEventListener('pointerdown', e => { down = { x:e.clientX, y:e.clientY, t:performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
  if (moved > 7) return;
  lastInteract = performance.now(); controls.autoRotate = false;
  const h = pick(e.clientX, e.clientY);
  if (h && h.node){
    if (linkMode){ handleLinkPick(h.node); return; }
    select(h.node);
  } else if (h && h.brain && h.brain !== focusId){ focusBrain(h.brain); }
  else if (!h){ closePanel(); }
});
let hoverT = 0;
canvas.addEventListener('pointermove', e => {
  if (MOBILE || e.buttons) return; const now = performance.now(); if (now - hoverT < 60) return; hoverT = now;
  const h = pick(e.clientX, e.clientY); hover = h && h.node ? h.node : null; canvas.style.cursor = h ? 'pointer' : 'grab';
});

/* ================= UI ================= */
const panel = $('#panel'), pBody = $('#pBody');
let toastT = 0;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
function flashSaved(){ const s = $('#saved'); s.classList.add('on'); clearTimeout(flashSaved.t); flashSaved.t = setTimeout(() => s.classList.remove('on'), 1200); }
const tag = t => `<span class="tag" style="--c:${colorOf(t)}">${iconOf(t)} ${esc(t)}</span>`;
const nodeLink = n => n ? `<a href="#" class="nl" data-n="${esc(n.id)}" style="--c:${colorOf(n.type)}">${esc(n.title)}</a>` : '';
function slot(kind, url){
  if (!safeUrl(url)) url = '';
  const ic = kind === 'video' ? '🎬' : '🖼️', nm = kind === 'video' ? '影片' : '圖片';
  const body = !url ? `<b>${ic}</b>${nm}・即將加入` : kind === 'image' ? `<img src="${esc(url)}" alt="">` : `<b>▶</b>觀看${nm}`;
  return `<div class="slot ${url ? 'has' : ''}">${url && kind === 'video' ? `<a href="${esc(url)}" target="_blank" rel="noopener">${body}</a>` : url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${body}</a>` : body}<button class="mini" data-media="${kind}" title="設定網址" aria-label="設定網址">✎</button></div>`;
}
function videoBox(n){
  const u = n.media.video || '';
  return `<div class="vbox">${playable(u) ? `<video src="${esc(u)}" muted loop playsinline preload="metadata" controls></video>` : u && safeUrl(u) ? `<a class="vext" href="${esc(u)}" target="_blank" rel="noopener">▶ 外部影片 ↗</a>` : ''}
    <form id="mvF"><input id="mvI" value="${esc(u)}" placeholder="🎬 mp4 網址 或 media/videos/xxx.mp4" maxlength="500" inputmode="url"><button title="儲存影片" aria-label="儲存影片">✓</button></form>
    <a class="tofeed" href="feed.html#node=${encodeURIComponent(n.id)}">📱 用短影音模式看</a></div>`;
}
/* 【推測】 markers stay visible as a small badge */
const spec = s => esc(s).replace(/【(推測[^】]*)】/g, '<em class="spec">$1</em>');
const srcLink = s => { if (!s || typeof s !== 'object') return s ? esc(s) : '';
  const meta = [s.outlet, s.date].filter(Boolean).join(' · ');
  return `${s.url && safeUrl(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.who || '來源')} ↗</a>` : esc(s.who || '')}${meta ? `<small>${esc(meta)}</small>` : ''}`; };
function ceHTML(c){
  return `<div class="ci"><span>${c.createdBy === 'bot' ? '🤖' : '⭐'}</span><div>${c.against ? `<b class="ag">↯ ${esc(c.against)}</b>` : ''}${spec(c.text)}${c.source ? `<div class="cs">${srcLink(c.source)}</div>` : ''}</div></div>`;
}
function flowHTML(f){
  const split = a => typeof a === 'string' && /②/.test(a) ? a.split(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/).map(s => s.trim()).filter(Boolean) : a;
  const list = a => (a = split(a), Array.isArray(a)) ? `<ol>${a.map(x => `<li>${spec(String(x).replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, ''))}</li>`).join('')}</ol>` : `<p>${spec(a)}</p>`;
  const sec = (icon, k, body, open) => body ? `<details class="fl" ${open ? 'open' : ''}><summary>${icon} ${k}</summary>${body}</details>` : '';
  const views = Array.isArray(f['各方觀點']) && f['各方觀點'].length ? `<div class="vw">${f['各方觀點'].map(v => `<div class="v"><b>${esc(v.stance || '')}</b><p>${spec(v.claim || '')}</p>${v.source ? `<div class="cs">${srcLink(v.source)}</div>` : ''}</div>`).join('')}</div>` : '';
  return `<div class="lbl">🧭 推理流程 <i class="by">🤖 問題拆解師</i></div><div class="flow">
    ${sec('❓', '問題定義', f['問題定義'] ? `<p>${spec(f['問題定義'])}</p>` : '', true)}
    ${sec('◇', '前提假設', f['前提假設'] ? list(f['前提假設']) : '')}
    ${sec('→', '推理步驟', f['推理步驟'] ? list(f['推理步驟']) : '')}
    ${sec('🗣', '各方觀點', views)}
    ${sec('？', '未解關鍵點', f['未解關鍵點'] ? list(f['未解關鍵點']) : '')}</div>`;
}
function select(id, quiet){
  const n = N(id); if (!n) return; selected = id;
  $('#bFeed').href = 'feed.html#node=' + encodeURIComponent(id);
  if (n.brainId !== focusId && B(n.brainId)) focusBrain(n.brainId);
  const s = n.source || {}; const par = N(n.parentId); const ch = kids(id);
  const subQ = ch.filter(k => k.kind !== 'direction'), dirs = ch.filter(k => k.kind === 'direction');
  const xl = state.links.filter(l => l.kind === 'cross' && (l.from === id || l.to === id)).map(l => N(l.from === id ? l.to : l.from)).filter(Boolean);
  const brain = B(n.brainId); const isRoot = state.brains.find(b => b.rootNodeId === id);
  const hist = state.history.filter(h => h.payload && (h.payload.nodeId === id || (h.payload.children && h.action === 'split' && h.payload.nodeId === id))).slice(-4);
  const srcHTML = s.url && safeUrl(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.who || '來源')} ↗</a><br>${esc([s.outlet, s.date].filter(Boolean).join(' · '))}`
    : esc([s.who, s.outlet, s.date].filter(Boolean).join(' · ') || (n.createdBy === 'seed' ? '' : 'Merlin 自行提出'));
  const also = (Array.isArray(s.also) ? s.also : []).filter(a => a && typeof a === 'object').map(a => a.url && safeUrl(a.url) ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.label || a.url)}</a>` : esc(a.label || '')).filter(Boolean).join('、');
  const by = n.createdBy === 'bot' ? '🤖 bot' : n.createdBy === 'seed' ? '📚 公開來源' : '⭐ Merlin';
  // [proto] visual-first panel: media hero on top, short header, big actions, long text folded into <details>
  const v = n.media.video || '', img = n.media.image && safeUrl(n.media.image) ? n.media.image : '';
  const feedHref = 'feed.html#node=' + encodeURIComponent(n.id);
  const hero = playable(v)
    ? `<div class="hero"><video id="pVid" src="${esc(v)}" ${img ? `poster="${esc(img)}"` : ''} muted loop playsinline preload="${img ? 'none' : 'metadata'}"></video>
        <button class="heroPlay" data-a="play" aria-label="播放／暫停">▶</button>
        <a class="heroFeed" href="${feedHref}" data-nav>🎬 全螢幕看</a><button class="heroEdit" data-a="media" aria-label="換影片">✎</button></div>`
    : img ? `<div class="hero"><img src="${esc(img)}" alt=""><button class="heroEdit" data-a="media" aria-label="設定影片">✎</button></div>`
    : `<button class="hero none" data-a="media"><b>🎬</b><span>還沒有影片</span><small>點這裡掛上影片</small></button>`;
  const ext = v && !playable(v) && safeUrl(v) ? `<a class="vext" href="${esc(v)}" target="_blank" rel="noopener">▶ 外部影片 ↗</a>` : '';
  const sec = (key, title, count, body) => `<details class="sec" data-sec="${key}" ${openSecs.has(key) ? 'open' : ''}><summary>${title}${count !== '' ? ` <i>${count}</i>` : ''}</summary><div class="secb">${body}</div></details>`;
  const relBody = `<div class="prov">
      <div><span>🧬 來自</span>${par ? nodeLink(par) + (par.brainId !== n.brainId ? ` <em>（${esc(B(par.brainId)?.id === 'main' ? '主腦' : B(par.brainId)?.name || '')}）</em>` : '') : `<em>${esc(brain.id === 'main' ? '主腦' : brain.name)}・根問題</em>`}</div>
      ${subQ.length ? `<div><span>🌿 子問題</span>${subQ.map(nodeLink).join('')}</div>` : ''}
      ${dirs.length ? `<div><span>🚀 新方向</span>${dirs.map(nodeLink).join('')}</div>` : ''}
      ${xl.length ? `<div><span>🔗 跨腦</span>${xl.map(nodeLink).join('')}</div>` : ''}</div>`;
  const conBody = `<div class="cchips">${n.concepts.map(c => `<span class="cc ${conceptUI.focus === 'c:' + c ? 'on' : ''}" style="--c:${safeColor(state.concepts[c]?.color, '#fff')}"><button data-cf="${esc(c)}">${esc(c)}</button><button data-cr="${esc(c)}" aria-label="移除 ${esc(c)}">×</button></span>`).join('')}
      <form id="ccF"><input id="ccI" list="clist" placeholder="＋ 概念" maxlength="16"><datalist id="clist">${Object.keys(state.concepts).filter(c => !n.concepts.includes(c)).map(c => `<option value="${esc(c)}">`).join('')}</datalist></form></div>
    <div class="pat"><span>⟳ 推演流程</span><select id="patS"><option value="">（無）</option>${Object.keys(state.patterns).map(p => `<option ${n.processPattern === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}<option value="__new">＋ 新流程…</option></select>${n.processPattern ? `<button data-pf="${esc(n.processPattern)}" class="pf ${conceptUI.focus === 'p:' + n.processPattern ? 'on' : ''}">亮線</button>` : ''}</div>`;
  const reasonBody = n.flow ? flowHTML(n.flow) : `${n.assumptions ? `<div class="lbl">◇ 前提假設</div><p class="txt">${spec(n.assumptions)}</p>` : ''}${n.reasoning.length ? `<div class="steps">${n.reasoning.map(r => `<div class="st"><b>${esc(r.k)}</b><span>${spec(r.v)}</span></div>`).join('')}</div>` : '<div class="empty">還沒有推演</div>'}`;
  const ceBody = `<div class="ce">${n.counterEvidence.map(c => ceHTML(c)).join('') || '<div class="empty">尚無反證</div>'}
      <form id="ceF"><input id="ceI" placeholder="新增反證…" maxlength="200"><button aria-label="新增反證">＋</button></form></div>`;
  pBody.innerHTML = `
    <div class="grip" id="pGrip" aria-hidden="true"></div>
    ${hero}${ext}
    <div class="row1">${tag(n.type)}<span class="tag kind ${esc(n.kind)}">${KIND[n.kind] || esc(n.kind)}</span><span class="tag by ${esc(n.createdBy)}">${by}</span></div>
    <h2>${esc(n.title)}</h2>
    ${n.oneLiner ? `<p class="one">${esc(n.oneLiner)}</p>` : ''}
    <div class="acts">
      <button data-a="split" title="分裂成子問題或新方向" aria-label="分裂成子問題或新方向"><b>❖</b>分裂</button>
      ${ch.some(k => k.brainId === n.brainId) ? `<button data-a="${n.collapsed ? 'expand' : 'collapse'}"><b>${n.collapsed ? '◉' : '◌'}</b>${n.collapsed ? '展開' : '收合'}</button>` : ''}
      ${isRoot ? `<button data-a="merge"><b>↩</b>併回</button>` : `<button data-a="sub" title="獨立成子腦" aria-label="獨立成子腦"><b>🧠</b>子腦</button>`}
      <button data-a="link" title="跨腦連結" aria-label="跨腦連結"><b>🔗</b>連結</button>
      <a href="${feedHref}" data-nav class="actFeed"><b>🎬</b>短影音</a>
      ${n.brainId !== 'main' ? `<button data-a="home"><b>⌂</b>主腦</button>` : ''}
      ${n.createdBy !== 'seed' && !isRoot ? `<button data-a="del" class="danger"><b>✕</b>刪除</button>` : ''}
    </div>
    <div class="status" role="radiogroup" aria-label="研究進度">${Object.entries(STATUS).map(([k, v]) => `<button data-st="${k}" role="radio" aria-checked="${n.status === k}" class="${n.status === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    ${sec('rel', '🧬 關係', subQ.length + dirs.length + xl.length || '', relBody)}
    ${sec('con', '🧵 概念', n.concepts.length, conBody)}
    ${srcHTML ? sec('src', '📎 來源', '', `<div class="src">${srcHTML}${also ? '<br>其他：' + also : ''}</div>`) : ''}
    ${sec('why', '🧭 推演', n.flow ? '' : n.reasoning.length || '', reasonBody)}
    ${sec('ce', '⚔ 反證', n.counterEvidence.length, ceBody)}
    ${hist.length ? sec('hist', '🕘 紀錄', hist.length, `<div class="mh">${hist.map(h => `<div>${fmt(h.ts)} ${ACT[h.action] || esc(h.action)}</div>`).join('')}</div>`) : ''}`;
  pBody.querySelectorAll('details.sec').forEach(d => d.addEventListener('toggle', () => { d.open ? openSecs.add(d.dataset.sec) : openSecs.delete(d.dataset.sec); }));
  pBody.querySelectorAll('.nl').forEach(a => a.onclick = ev => { ev.preventDefault(); select(a.dataset.n); });
  pBody.querySelectorAll('[data-cf]').forEach(b => b.onclick = () => { focusConcept('c:' + b.dataset.cf); select(id); });
  pBody.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { focusConcept('p:' + b.dataset.pf); select(id); });
  pBody.querySelectorAll('[data-cr]').forEach(b => b.onclick = () => { removeConcept(id, b.dataset.cr); select(id); });
  $('#ccF').onsubmit = ev => { ev.preventDefault(); const v = $('#ccI').value.trim(); if (v && addConcept(id, v)){ toast('🧵 已連上「' + v + '」概念線'); } select(id); };
  $('#patS').onchange = async ev => { let v = ev.target.value; if (v === '__new'){ v = await askText({ title:'⟳ 新的推演流程', label:'流程名稱', placeholder:'例：類比推論→反例檢驗', max:30 }); if (!v){ select(id); return; } } setProcessPattern(id, v); select(id); };
  pBody.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { setStatus(id, b.dataset.st); select(id); });
  $('#ceF').onsubmit = ev => { ev.preventDefault(); const v = $('#ceI').value.trim(); if (v){ addCounterEvidence(id, v); select(id); } };
  pBody.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'split') openSplit(id);
    else if (a === 'media') openMediaSheet(id, 'video');
    else if (a === 'play'){ const vd = $('#pVid'); if (!vd) return; if (vd.paused){ vd.muted = false; vd.play().catch(() => { vd.muted = true; vd.play().catch(() => {}); }); b.textContent = '❚❚'; b.classList.add('playing'); } else { vd.pause(); b.textContent = '▶'; b.classList.remove('playing'); } }
    else if (a === 'collapse' || a === 'expand'){ setCollapsed(id, a === 'collapse'); select(id); }
    else if (a === 'sub'){ makeSubBrain(id); select(id); toast('🧠 分裂出子腦'); }
    else if (a === 'merge'){ mergeBrain(isRoot.id); select(id); }
    else if (a === 'link'){ startLink(id); }
    else if (a === 'home'){ focusBrain('main'); }
    else if (a === 'del'){ if (await askConfirm({ title:'刪除這個節點？', text:'「' + n.title + '」與它的分支會一起刪除（可以用 ↶ 復原）。', ok:'刪除', danger:true })) deleteNode(id); }
  });
  $('#pGrip').onclick = () => panel.classList.toggle('full');
  const fresh = panelFor !== id; panelFor = id;
  panel.classList.add('open'); if (fresh){ panel.scrollTop = 0; panel.classList.remove('full'); }
  applyFocus();
  if (!quiet) emit('select', { id });   // 給 knowledge-score.js 等被動觀察者
}
function closePanel(){ const was = selected; panel.classList.remove('open', 'full'); selected = null; panelFor = null; if (was) emit('close', { id:was }); $('#bFeed').href = 'feed.html'; const vd = $('#pVid'); if (vd) vd.pause(); applyFocus(); }
const openSecs = new Set(['rel', 'con']); let panelFor = null;

/* ================= [proto] in-page sheets (replace prompt()/confirm()) ================= */
function knownMedia(kind){
  const out = new Set();
  Object.values(typeof SEED_MEDIA !== 'undefined' ? SEED_MEDIA : {}).forEach(m => { if (m[kind]) out.add(m[kind]); });
  (typeof SEED_EXTRAS !== 'undefined' ? SEED_EXTRAS : []).forEach(x => { if (x.media && x.media[kind]) out.add(x.media[kind]); });
  state.nodes.forEach(n => { const u = n.media && n.media[kind]; if (u && !/^https?:/i.test(u)) out.add(u); });
  return [...out];
}
let mediaCtx = null;
function openMediaSheet(id, kind = 'video'){
  const n = N(id); if (!n) return; mediaCtx = { id, kind };
  $('#mTitle').textContent = n.title;
  renderMediaSheet(n.media[kind] || '');
  openDlg('#mediaDlg');
}
function renderMediaSheet(val){
  const { id, kind } = mediaCtx, n = N(id);
  $('#mediaDlg').querySelectorAll('[data-mk]').forEach(b => { b.classList.toggle('on', b.dataset.mk === kind); b.setAttribute('aria-selected', b.dataset.mk === kind); });
  const inp = $('#mUrl'); inp.value = val; inp.placeholder = kind === 'video' ? 'https://…/影片.mp4 或 media/videos/xxx.mp4' : 'https://…/封面.jpg 或 media/videos/xxx.jpg';
  const mine = `media/videos/${n.id}.${kind === 'video' ? 'mp4' : 'jpg'}`;
  const opts = [...new Set([mine, ...knownMedia(kind)])];
  $('#mPicks').innerHTML = opts.map(u => `<button type="button" class="pick ${u === val ? 'on' : ''}" data-u="${esc(u)}">${u === mine ? '⭐ ' : ''}${esc(u.split('/').pop())}</button>`).join('');
  $('#mPicks').querySelectorAll('[data-u]').forEach(b => b.onclick = () => { inp.value = b.dataset.u; mediaPreview(); });
  $('#mDel').classList.toggle('hide', !(n.media[kind]));
  mediaPreview();
}
function mediaPreview(){
  const { kind } = mediaCtx, u = $('#mUrl').value.trim(), box = $('#mPrev'), msg = $('#mMsg');
  $('#mPicks').querySelectorAll('[data-u]').forEach(b => b.classList.toggle('on', b.dataset.u === u));
  msg.className = 'mmsg'; box.innerHTML = '';
  if (!u){ msg.textContent = kind === 'video' ? '貼上影片網址，或從下面選一個 repo 裡的檔案' : '貼上圖片網址，或從下面選一個'; box.innerHTML = `<div class="mempty">${kind === 'video' ? '🎬' : '🖼️'}</div>`; return true; }
  if (!safeUrl(u)){ msg.textContent = '⚠ 只接受 https:// 網址或 repo 內的相對路徑（例：media/videos/n_q1.mp4）'; msg.classList.add('bad'); box.innerHTML = '<div class="mempty">⛔</div>'; return false; }
  if (kind === 'video' && playable(u)){
    box.innerHTML = `<video src="${esc(u)}" muted autoplay loop playsinline></video>`; msg.textContent = '✓ 可以播放的影片，短影音會直接顯示'; msg.classList.add('ok');
    box.querySelector('video').onerror = () => { msg.textContent = '⚠ 目前讀不到這個檔案（還沒上傳？）。仍可儲存，上傳後就會出現'; msg.className = 'mmsg warn'; };
  } else if (kind === 'video'){ msg.textContent = 'ℹ 這是外部頁面（例如 YouTube），短影音會顯示「觀看原始影片」按鈕'; box.innerHTML = '<div class="mempty">↗</div>'; }
  else { box.innerHTML = `<img src="${esc(u)}" alt="">`; msg.textContent = '✓ 封面圖預覽'; msg.classList.add('ok'); box.querySelector('img').onerror = () => { msg.textContent = '⚠ 讀不到這張圖'; msg.className = 'mmsg warn'; }; }
  return true;
}
$('#mUrl').addEventListener('input', () => { clearTimeout(mediaPreview.t); mediaPreview.t = setTimeout(mediaPreview, 250); });
$('#mediaDlg').querySelectorAll('[data-mk]').forEach(b => b.onclick = () => { mediaCtx.kind = b.dataset.mk; renderMediaSheet(N(mediaCtx.id).media[mediaCtx.kind] || ''); });
$('#mPaste').onclick = async () => { try { const t = await navigator.clipboard.readText(); if (t){ $('#mUrl').value = t.trim(); mediaPreview(); } } catch(e){ toast('沒辦法讀剪貼簿，請長按輸入框貼上'); $('#mUrl').focus(); } };
$('#mClear').onclick = () => { $('#mUrl').value = ''; mediaPreview(); $('#mUrl').focus(); };
$('#mDel').onclick = () => { const { id, kind } = mediaCtx; setMedia(id, kind, ''); $('#mediaDlg').close(); toast(kind === 'video' ? '🎬 已移除影片' : '🖼️ 已移除封面'); select(id); };
$('#mediaForm').onsubmit = ev => {
  ev.preventDefault(); const { id, kind } = mediaCtx, u = $('#mUrl').value.trim();
  if (!mediaPreview()){ $('#mUrl').focus(); return; }
  if (u === (N(id).media[kind] || '')){ $('#mediaDlg').close(); return; }
  if (setMedia(id, kind, u)){ $('#mediaDlg').close(); toast(kind === 'video' ? (u ? '🎬 影片已掛上，短影音會同步顯示' : '🎬 已移除影片') : '🖼️ 封面已更新'); select(id); }
};
$('#mediaDlg').addEventListener('close', () => { const vd = $('#mPrev video'); if (vd) vd.pause(); });
function askText({ title, label = '', placeholder = '', value = '', max = 80 }){
  return new Promise(res => {
    const d = $('#askDlg'); $('#askT').textContent = title; $('#askL').textContent = label; $('#askText').classList.remove('hide'); $('#askP').classList.add('hide');
    const i = $('#askI'); i.value = value; i.placeholder = placeholder; i.maxLength = max; $('#askOk').textContent = '確定'; $('#askOk').classList.remove('danger');
    d.onclose = () => res(d.returnValue === 'ok' ? i.value.trim() : ''); d.returnValue = ''; openDlg('#askDlg'); if (!COARSE) i.focus();
  });
}
function askConfirm({ title, text = '', ok = '確定', danger = false }){
  return new Promise(res => {
    const d = $('#askDlg'); $('#askT').textContent = title; $('#askP').textContent = text; $('#askP').classList.remove('hide'); $('#askText').classList.add('hide');
    $('#askI').value = 'x'; $('#askOk').textContent = ok; $('#askOk').classList.toggle('danger', danger);
    d.onclose = () => res(d.returnValue === 'ok'); d.returnValue = ''; openDlg('#askDlg');
    (danger ? $('#askNo') : $('#askOk')).focus();   // [proto] destructive confirms default to 取消 (Enter/Space won't delete)
  });
}
$('#pX').onclick = closePanel;
const fmt = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function startLink(id){ linkMode = { from:id }; document.body.classList.add('linking'); toast('🔗 點選另一個腦區的節點'); closePanel(); }
function handleLinkPick(id){
  if (!linkMode.from){ linkMode.from = id; toast('🔗 再點另一個腦區的節點'); return; }
  const from = linkMode.from; const r = crossLink(from, id);
  if (r || N(from).brainId !== N(id).brainId){ linkMode = null; document.body.classList.remove('linking'); }
  if (r){ toast('✦ 已建立跨腦連結'); select(id); }
}
$('#bLink').onclick = () => { if (linkMode){ linkMode = null; document.body.classList.remove('linking'); toast('已取消連結'); } else { linkMode = { from:null }; document.body.classList.add('linking'); toast('🔗 依序點兩個不同腦區的節點'); } };

// dialogs
function openDlg(id){ const d = $(id); d.showModal ? d.showModal() : d.setAttribute('open', ''); }
let addSel = new Set();
function renderSugg(){
  const f = $('#addForm').elements; const txt = [f.qtitle.value, f.oneLiner.value, f.assume.value, f.exts.value].join(' ');
  const sug = suggestConcepts(txt); const all = [...new Set([...addSel, ...sug])];
  $('#sugg').innerHTML = all.length ? all.map(c => `<button type="button" class="cc1 ${addSel.has(c) ? 'on' : ''}" data-c="${esc(c)}" style="--c:${safeColor(state.concepts[c]?.color, '#fff')}">${addSel.has(c) ? '✓ ' : '＋ '}${esc(c)}</button>`).join('') : '<span class="empty">輸入問題後會自動建議概念</span>';
  $('#sugg').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const c = b.dataset.c; addSel.has(c) ? addSel.delete(c) : addSel.add(c); renderSugg(); });
}
['qtitle', 'oneLiner', 'assume', 'exts'].forEach(nm => $('#addForm').elements[nm].addEventListener('input', () => { clearTimeout(renderSugg.t); renderSugg.t = setTimeout(renderSugg, 180); }));
$('#bAdd').onclick = () => { addSel = new Set(); renderSugg(); $('#qType').innerHTML = TYPE_LIST.map(t => `<option>${esc(t)}</option>`).join(''); $('#addWhere').textContent = focusId === 'main' ? '主腦' : B(focusId).name; openDlg('#addDlg'); };
$('#addDlg').addEventListener('close', () => {
  const d = $('#addDlg'), f = $('#addForm').elements;
  if (d.returnValue === 'ok' && f.qtitle.value.trim()){
    const exts = f.exts.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6).map(l => { const p = l.split(/[｜|]/).map(x => x.trim()); return { title:p[0], type:p[1] }; });
    const id = addQuestion({ title:f.qtitle.value.trim(), type:f.qtype.value, oneLiner:f.oneLiner.value.trim(), assumptions:f.assume.value.trim(),
      source:{ who:f.src.value.trim() || 'Merlin', outlet:'', date:new Date().toISOString().slice(0,10), url:f.url.value.trim(), also:[] }, extensions:exts,
      concepts:[...addSel, ...f.cextra.value.split(/[,，、]/).map(s => s.trim()).filter(Boolean)] });
    setTimeout(() => select(id), 60); toast('✦ 新的神經節點已長出');
  }
  $('#addForm').reset(); d.returnValue = '';
});
let splitTarget = null;
function openSplit(id){ splitTarget = id; $('#splitOf').textContent = N(id).title; $('#splitForm').reset(); openDlg('#splitDlg'); }
$('#splitDlg').addEventListener('close', () => {
  const d = $('#splitDlg'); const v = $('#splitForm').elements.lines.value;
  if (d.returnValue === 'ok' && splitTarget){
    const items = v.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6).map(l => { const p = l.split(/[｜|]/).map(x => x.trim()); return { title:p[0], type:p[1] }; });
    const kind = ($('#splitForm').elements.skind.value || 'extension');
    if (items.length){ splitNode(splitTarget, items, 'merlin', kind); select(splitTarget); toast(kind === 'direction' ? '🚀 新方向已分裂出去' : '❖ 已分裂出子問題'); }
  }
  d.returnValue = '';
});

// history
function renderHistory(){
  const el = $('#hList'); if (!el) return;
  el.innerHTML = state.history.slice().reverse().slice(0, 150).map(h => {
    const p = h.payload || {}; const t = (h.action === 'merge' && p.title ? p.title + ' → ' + (p.intoName || (p.into === 'main' ? '主腦' : B(p.into)?.name || '上層腦')) : '') || p.title || p.fromTitle && (p.fromTitle + ' ⇄ ' + p.toTitle) || (p.questions ? p.questions + ' 題' : '') || '';
    return `<div class="hi" ${p.nodeId && N(p.nodeId) ? `data-n="${esc(p.nodeId)}"` : ''}><time>${fmt(h.ts)}</time><b>${ACT[h.action] || esc(h.action)}</b><span>${esc(t)}</span></div>`;
  }).join('');
  el.querySelectorAll('[data-n]').forEach(d => d.onclick = () => select(d.dataset.n));
  $('#hCount').textContent = state.history.length;
}
$('#bHist').onclick = () => { $('#hist').classList.toggle('open'); renderHistory(); };
$('#hX').onclick = () => $('#hist').classList.remove('open');
$('#bUndo').onclick = undo;
$('#bExport').onclick = exportJSON;
$('#bImport').onclick = () => $('#file').click();
$('#file').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { importJSON(JSON.parse(r.result)); } catch(err){ toast('⚠ 無法讀取 JSON'); } }; r.readAsText(f); e.target.value = ''; };
$('#bReset').onclick = async () => { const cloud = window.AISync && window.AISync.enabled;   // [proto] in-page dialog; wording from the sync branch
  if (await askConfirm(cloud ? { title:'重置這台裝置？', text:'會捨棄還沒上傳的本機修改，改成雲端上的共享大腦。不會影響其他裝置或共享大腦。', ok:'重置這台裝置', danger:true }
    : { title:'重置成初始 6 題？', text:'目前的大腦會被換掉，可以用 ↶ 復原找回。', ok:'重置', danger:true })) resetAll(); };
$('#bHome').onclick = () => focusBrain('main');
addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')){ if (linkMode){ $('#bLink').click(); } else closePanel(); } });   // [proto]
$('#bFit').onclick = overview;
$('#bRot').onclick = function(){ controls.autoRotate = !controls.autoRotate; this.classList.toggle('on', controls.autoRotate); autoRotPref = controls.autoRotate; };
let autoRotPref = !REDUCED;
/* [proto] declutter toggle, phone overflow menu, onboarding, page transitions */
function renderDecl(){ $('#bDecl').classList.toggle('on', ui.declutter); $('#bDecl').setAttribute('aria-pressed', ui.declutter); }
$('#bDecl').onclick = () => { ui.declutter = !ui.declutter; saveUI(); renderDecl(); applyFocus(); toast(ui.declutter ? '◐ 精簡模式：只亮相關的節點與線' : '◑ 顯示全部細節'); };
renderDecl();
$('#bGlow').onclick = () => setGlow(!ui.glow);
$('#roPill').onclick = e => { e.stopPropagation(); const s = $('#bSync'); if (s) s.click(); };   // read-only pill -> sync/login menu
function roPillText(){   // AISync.reason(): 'anon' 未登入 | 'not-editor' 已登入但不在名單 | 'checking' 查名單中（中性）; updated on the aisync:change event, no polling
  const b = $('#roPill'); if (!b) return;
  const r = window.AISync && AISync.reason ? AISync.reason() : 'anon';
  const [ic, t, l] = r === 'not-editor' ? ['🔒', '唯讀・你不在編輯名單', '唯讀：你已登入，但不在編輯名單']
    : r === 'checking' ? ['⏳', '確認編輯權限…', '正在確認編輯權限'] : ['🔒', '唯讀・登入後可編輯', '唯讀：登入後可編輯'];
  b.dataset.r = r; b.querySelector('i').textContent = ic; b.querySelector('span').textContent = t; b.setAttribute('aria-label', l); b.title = l;
}
addEventListener('aisync:change', roPillText); roPillText();
const more = $('#moreMenu');
$('#bMore').onclick = e => { e.stopPropagation(); more.querySelectorAll('[data-proxy]').forEach(b => { b.hidden = !$('#' + b.dataset.proxy); }); more.classList.toggle('on'); $('#bMore').setAttribute('aria-expanded', more.classList.contains('on')); };
more.querySelectorAll('[data-proxy]').forEach(b => b.onclick = e => { e.stopPropagation(); more.classList.remove('on'); $('#' + b.dataset.proxy)?.click(); });
addEventListener('pointerdown', e => { if (!e.target.closest('#moreMenu,#bMore')) more.classList.remove('on'); });
if (!localStorage.getItem('aiBrain.onboarded')){ $('#coach').classList.remove('hide'); }
const coachDone = () => { if ($('#coach').classList.contains('hide')) return; $('#coach').classList.add('hide'); try { localStorage.setItem('aiBrain.onboarded', '1'); } catch(e){} };
$('#coachGo').onclick = coachDone;
addEventListener('pointerdown', e => { if (!e.target.closest('#coach')) coachDone(); }, true);   // any other tap (toolbar, 📅, canvas) = "got it"; never blocks other panels
// cross-document View Transitions where supported (Chrome/Edge 126+, Safari 18.2+); otherwise a quick fade-out
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-nav]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || 'onpagereveal' in window) return;
  e.preventDefault(); document.body.classList.add('leaving'); setTimeout(() => { location.href = a.href; }, 180);
});
addEventListener('pageshow', () => document.body.classList.remove('leaving'));

function renderConcepts(){
  const el = $('#cList'); if (!el) return;
  const cs = getConcepts();
  const chip = (key, name, c) => `<button class="cchip ${conceptUI.focus === key ? 'on' : ''} ${c.nodes.length < 2 ? 'solo' : ''}" data-k="${esc(key)}" style="--c:${safeColor(c.color)}" title="${esc(c.desc || '')}"><i></i>${esc(name)}<b>${c.nodes.length}</b></button>`;
  el.innerHTML = '<div class="csec">🧵 概念</div>' + Object.entries(cs).filter(([, c]) => c.kind === 'concept' && c.nodes.length).sort((a, b) => b[1].nodes.length - a[1].nodes.length).map(([k, c]) => chip('c:' + k, k, c)).join('')
    + '<div class="csec">⟳ 推演流程</div>' + Object.entries(cs).filter(([, c]) => c.kind === 'process' && c.nodes.length).map(([k, c]) => chip('p:' + c.name, c.name, c)).join('');
  el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => focusConcept(b.dataset.k));
  $('#cOn').textContent = conceptUI.on ? '● 顯示' : '○ 隱藏'; $('#cOn').classList.toggle('on', conceptUI.on);
  $('#bConc').classList.toggle('on', conceptUI.on);
}
function renderConceptPill(){
  const p = $('#cpill'); const f = conceptUI.focus;
  if (!f){ p.classList.remove('on'); return; }
  const th = threads.find(x => x.key === f); const nm = f.slice(2);
  p.innerHTML = `<i style="--c:${safeColor(threadColor(f))}"></i>${f[0] === 'p' ? '⟳ ' : '🧵 '}${esc(nm)} <b>${th ? th.ids.length : 0}</b><button id="cpX">✕</button>`;
  p.style.setProperty('--c', safeColor(threadColor(f))); p.classList.add('on');
  $('#cpX').onclick = () => focusConcept(null);
}
$('#bConc').onclick = () => { $('#cdraw').classList.toggle('open'); renderConcepts(); };
$('#cX').onclick = () => $('#cdraw').classList.remove('open');
$('#cOn').onclick = () => showConcepts();
function renderCrumbs(){
  const chain = []; let b = B(focusId); while (b){ chain.unshift(b); b = B(b.parentBrainId); }
  $('#crumbs').innerHTML = chain.map((x, i) => `<button data-b="${esc(x.id)}" style="--c:${safeColor(x.regionColor)}">${x.id === 'main' ? '🧠 主腦' : esc(x.name.length > 8 ? x.name.slice(0, 8) + '…' : x.name)}</button>`).join('<i>›</i>');
  $('#crumbs').classList.toggle('single', chain.length < 2);
  $('#crumbs').querySelectorAll('[data-b]').forEach(el => el.onclick = () => focusBrain(el.dataset.b));
}
function updateCounts(){
  const c = {}; state.nodes.forEach(n => { c[n.type] = (c[n.type] || 0) + 1; });
  $('#legend').innerHTML = Object.keys(c).sort((a, b) => TYPE_LIST.indexOf(a) - TYPE_LIST.indexOf(b)).map(t => `<button class="${filterType === t ? 'on' : ''}" data-t="${esc(t)}" style="--c:${colorOf(t)}" title="${esc(t)}">${iconOf(t)}<i>${c[t]}</i></button>`).join('')
    + `<span class="meta">${state.nodes.length} 節點・${state.brains.length} 腦</span>`;
  $('#legend').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { filterType = filterType === b.dataset.t ? null : b.dataset.t; sync(); });
}

/* ================= loop ================= */
let initDone = false;
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); UPR.value = renderer.getPixelRatio(); camera.aspect = w / h; camera.updateProjectionMatrix(); rMat.uniforms.uRes.value.set(w, h); if (bloom){ bloom.composer.setPixelRatio(renderer.getPixelRatio()); bloom.composer.setSize(w, h); } }
/* [proto] bloom: laptop opt-in (✨ toggle, saved in aiBrain.ui.v1) or ?q=high; lazily loaded. The FPS watchdog gives up bloom first,
   then render resolution, then the quality level (mid -> low). */
let bloom = null;
async function enableBloom(){
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }, { CopyShader }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/ShaderPass.js'), import('three/addons/shaders/CopyShader.js')]);
    // our custom ShaderMaterials write display-space colours (as on the plain canvas path), so keep the whole chain in sRGB
    // and finish with a plain copy instead of OutputPass (which would gamma-boost them and lift the black background)
    const rt = new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type:THREE.HalfFloatType, colorSpace:THREE.SRGBColorSpace });
    const composer = new EffectComposer(renderer, rt); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    const pass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.4, 0.72); composer.addPass(pass); composer.addPass(new ShaderPass(CopyShader));
    bloom = { composer, pass, on:wantBloom() }; debug.bloom = bloom;
  } catch(e){ console.warn('bloom unavailable', e); }
}
let bloomDropped = false;
function wantBloom(){ return !COARSE && !bloomDropped && QL !== 'low' && (QPARAM ? QL === 'high' : !!ui.glow); }
function setGlow(on){
  ui.glow = on; saveUI(); bloomDropped = false; syncGlowBtn();
  if (wantBloom() && !bloom) enableBloom(); else if (bloom) bloom.on = wantBloom();
  toast(on ? '✨ 光暈特效：開（較耗效能）' : '光暈特效：關');
}
function syncGlowBtn(){ const b = $('#bGlow'); if (b){ b.classList.toggle('on', !!ui.glow); b.setAttribute('aria-pressed', String(!!ui.glow)); } }
if (wantBloom()) enableBloom();
function setQuality(lv){
  QL = lv; document.body.dataset.q = lv;
  if (bloom) bloom.on = wantBloom();
  brainObjs.forEach(bo => bo.interior.setLevel(lv === 'low' ? 0.45 : 1));
  if (lv === 'low'){ renderer.setPixelRatio(1); resize(); }
}
/* [proto perf] targets: laptop ~60 fps, phone 30+ (brain/quality.js). Slow: drop bloom, then lower the render resolution in
   0.25 steps (cheap, invisible at high DPR), only then the level. Fast: raise resolution again. */
function setDpr(d){ d = Math.max(1, Math.min(DPR_MAX, Math.round(d * 4) / 4)); if (d === renderer.getPixelRatio()) return false; renderer.setPixelRatio(d); resize(); debug.dpr = d; return true; }
const qw = createWatch({ coarse:COARSE, onFps:f => { debug.fps = +f.toFixed(1); },
  onSlow(){ if (bloom && bloom.on){ bloomDropped = true; bloom.on = false; return; }
            if (!setDpr(renderer.getPixelRatio() - 0.25) && QL !== 'low') setQuality(QL === 'high' ? 'mid' : 'low'); },
  onFast(){ setDpr(renderer.getPixelRatio() + 0.25); } });
const qWatch = now => qw.tick(now, document.hidden);
/* [proto perf] stop the render loop while the page is hidden / in bfcache (e.g. after jumping to the feed) and restart on return */
let running = true;
function resumeLoop(){ if (running || document.hidden) return; running = true; qw.reset(); requestAnimationFrame(frame); }
document.addEventListener('visibilitychange', () => { if (document.hidden) running = false; else resumeLoop(); });
addEventListener('pagehide', () => { running = false; });
addEventListener('pageshow', () => resumeLoop());
document.body.dataset.q = QL;
addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
const viewOff = { x:0, y:0 }; const dirV = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0); const MOBILE_LAYOUT = () => innerWidth <= 700;
const v3 = new THREE.Vector3();
function frame(){
  if (!running || document.hidden){ running = false; return; }
  // phone: when the details sheet covers the whole screen the 3D view is invisible -> ~10 fps keeps it alive without burning battery
  if (MOBILE_LAYOUT() && panel.classList.contains('full') && (frame.n = (frame.n || 0) + 1) % 6){ requestAnimationFrame(frame); return; }
  const now = performance.now(), t = clock.getElapsedTime();
  // tweens
  for (let i = tweens.length - 1; i >= 0; i--){ const tw = tweens[i]; const e = Math.min(1, Math.max(0, (now - tw.t0) / tw.dur)); if (now < tw.t0) continue; tw.step((tw.ease || easeIO)(e), tw); if (e >= 1){ tweens.splice(i, 1); tw.done && tw.done(); } }
  if (fly){ const e = easeIO(Math.min(1, (now - fly.t0) / fly.dur)); controls.target.lerpVectors(fly.fromT, fly.toT, e); camera.position.lerpVectors(fly.fromP, fly.toP, e); if (e >= 1) fly = null; }
  if (!controls.autoRotate && autoRotPref && !REDUCED && now - lastInteract > 5000 && !panel.classList.contains('open') && !fly) controls.autoRotate = true;
  // shift the rendered view so the brain stays visible beside/above the open panel
  const po = panel.classList.contains('open');
  viewOff.x += ((po && !MOBILE_LAYOUT() ? 185 : 0) - viewOff.x) * 0.1; viewOff.y += ((po && MOBILE_LAYOUT() ? innerHeight * 0.26 : 0) - viewOff.y) * 0.1;
  if (Math.abs(viewOff.x) > 0.5 || Math.abs(viewOff.y) > 0.5) camera.setViewOffset(innerWidth, innerHeight, viewOff.x, viewOff.y, innerWidth, innerHeight); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  controls.update();
  skyMat.uniforms.uTime.value = t;
  brainObjs.forEach((o, id) => {
    o.mat.uniforms.uTime.value = t + o.phase; o.inner.mat.uniforms.uTime.value = t + o.phase;
    o.interior.tick(t + o.phase); if (!REDUCED) o.anat.scale.setScalar(1 + 0.014 * Math.sin(t * 0.9 + o.phase));   // [proto] breathing
    o.halo.material.opacity = (id === 'main' ? 0.16 : 0.26) * (0.8 + 0.2 * Math.sin(t * 1.5 + o.phase));
    o.regions.forEach((sp, ty) => { const w = sp.userData.want || 0; sp.material.opacity += (w * (0.75 + 0.25 * Math.sin(t * 2 + sp.position.x * 9)) - sp.material.opacity) * 0.05; if (filterType && ty !== filterType) sp.material.opacity *= 0.9; });
    // label
    if (id !== 'main'){ v3.copy(o.group.position); v3.y += o.group.scale.x * 0.75; v3.project(camera);
      const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
      o.lx = (v3.x * 0.5 + 0.5) * innerWidth; o.ly = (-v3.y * 0.5 + 0.5) * innerHeight; o.lvis = vis;
      o.label.style.transform = `translate(${o.lx}px,${o.ly}px) translate(-50%,-100%)`; const op = vis ? '1' : '0'; if (o.label.style.opacity !== op) o.label.style.opacity = op; }
  });
  // [proto] LOD: how big is each brain on screen?
  const wppK = 2 * Math.tan(camera.fov * Math.PI / 360) / innerHeight;
  brainObjs.forEach(bo => { const d = camera.position.distanceTo(bo.group.position); bo.px = bo.group.scale.x * 0.8 / Math.max(0.01, d * wppK); bo.far = bo.px < LOD_NEAR_PX; });
  rMat.uniforms.uTime.value = t;
  // [proto] brain labels: biggest brains first, hide any label that would overlap one already placed
  if (!frame.lt || now - frame.lt > 120){ frame.lt = now; const placed = [];
    [...brainObjs.entries()].filter(([id]) => id !== 'main').sort((a, b) => (b[0] === focusId) - (a[0] === focusId) || b[1].px - a[1].px).forEach(([id, o]) => {
      if (!o.lvis) return;
      if (o.ltxt !== o.label.textContent){ o.ltxt = o.label.textContent; o.lw = o.label.offsetWidth; o.lh = o.label.offsetHeight; }   // measured only when the text changes
      if (!o.lw) return; const r = { left:o.lx - o.lw / 2, right:o.lx + o.lw / 2, top:o.ly - o.lh, bottom:o.ly };
      const hit = placed.some(q => r.left < q.right + 4 && r.right > q.left - 4 && r.top < q.bottom + 2 && r.bottom > q.top - 2);
      o.label.classList.toggle('lhide', hit || o.px < 14); if (!hit) placed.push(r); }); }
  nodeObjs.forEach((o, id) => {
    const bo = brainObjs.get(o.brainId), gs = bo ? bo.group.scale.x : 1;
    o.lodFar = ui.declutter && o.kind === 'extension' && !!bo && bo.far && !(related && related.has(id)) && selected !== id;
    o.mesh.getWorldPosition(v3); const dist = camera.position.distanceTo(v3);
    const minLocal = (o.lodFar ? MIN_FAR_PX : MIN_NODE_PX) * dist * wppK / gs;   // never smaller than N px on screen
    if (o.isDir){ dirV.copy(o.mesh.position); dirV.y -= 0.1; if (dirV.lengthSq() < 1e-6) dirV.set(0, 1, 0); dirV.normalize();
      o.mesh.quaternion.setFromUnitVectors(UPV, dirV); o.mesh.rotateY(t * 0.8);
      o.beam.material.opacity = (o.dim ? 0.06 : 0.3 + 0.25 * Math.sin(t * 3 + o.phase)); o.beam.scale.set(1, 11 + 3 * Math.sin(t * 2 + o.phase), 1); }
    const growing = o.mesh.scale.x < o.size * 0.999;
    const base = Math.max(o.size * (o.lodFar ? 0.6 : 1), minLocal);
    const target = o.visible ? base * (selected === id ? 1.6 : hover === id ? 1.35 : 1) * (o.collapsed ? 1.2 : 1) : 0.0001;
    o.mesh.scale.setScalar(o.mesh.scale.x + (target - o.mesh.scale.x) * (growing ? 0.08 : 0.15));
    o.mesh.visible = o.mesh.scale.x > 0.0005;
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.4 + o.phase);
    o.glow.material.opacity = (o.dim ? 0.12 : o.fdim ? 0.18 : o.lodFar ? 0.5 : 1) * (o.status === 'resolved' ? 1 : o.status === 'researching' ? 0.9 * pulse + 0.1 : 0.85 * pulse);
    o.mesh.material.opacity = o.dim ? 0.2 : o.fdim ? 0.28 : 1;
    o.glow.scale.setScalar(o.collapsed ? 9 + 2 * Math.sin(t * 4 + o.phase) : selected === id ? 9 : 7);
  });
  updateLinks(t);
  // selected / hovered node label
  const lid = hover || selected; const nl = $('#nlabel');
  if (lid && nodeObjs.get(lid) && nodeObjs.get(lid).mesh.visible){ nodeObjs.get(lid).mesh.getWorldPosition(v3); v3.project(camera);
    nl.style.transform = `translate(${(v3.x * 0.5 + 0.5) * innerWidth}px,${(-v3.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-140%)`; const n = N(lid);
    const key = lid + '|' + (n ? n.title : ''); if (nl.dataset.for !== key){ nl.dataset.for = key; nl.textContent = n ? n.title : ''; nl.style.setProperty('--c', colorOf(n?.type)); }   // no per-frame text writes (they invalidate layout)
    if (nl.style.opacity !== '1') nl.style.opacity = 1; }
  else if (nl.style.opacity !== '0') nl.style.opacity = 0;
  qWatch(now);
  if (bloom && bloom.on) bloom.composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
sync(); initDone = true; renderHistory(); renderCrumbs();
camera.position.set(0, 2.6, 0).add(new THREE.Vector3(0, 0.22, 1).normalize().multiplyScalar(fitDist(WORLD * 0.85)));
$('#bHome').classList.add('hide');
if (state.brains.length > 1) setTimeout(overview, 200);
requestAnimationFrame(frame);
requestAnimationFrame(() => requestAnimationFrame(() => $('#boot')?.classList.add('off')));   // [proto]
setTimeout(() => $('#hint').classList.add('off'), 6500);

/* ---------- deep link: index.html#node=ID focuses that node ---------- */
function focusNode(id){
  const n = N(id); if (!n) return false;
  for (let p = N(n.parentId); p; p = N(p.parentId)) if (p.collapsed && p.brainId === n.brainId) setCollapsed(p.id, false);
  const switching = n.brainId !== focusId;
  select(id);
  setTimeout(() => {
    const o = nodeObjs.get(id), b = B(n.brainId); if (!o || !b) return;
    const target = o.mesh.getWorldPosition(new THREE.Vector3());
    const dir = camera.position.clone().sub(controls.target).normalize(); if (dir.y < 0.15) dir.y = 0.3; dir.normalize();
    fly = { t0:performance.now(), dur:1400, fromT:controls.target.clone(), toT:target, fromP:camera.position.clone(), toP:target.clone().add(dir.multiplyScalar(fitDist(WORLD * b.scale * 0.42))) };
  }, switching ? 1400 : 60);
  $('#bFeed').href = 'feed.html#node=' + encodeURIComponent(id);
  return true;
}
function handleHash(){
  const m = /(?:^#|&)node=([^&]+)/.exec(location.hash); if (!m) return;
  const id = decodeURIComponent(m[1]);
  if (!focusNode(id)) toast('找不到這個節點');
}
addEventListener('hashchange', handleHash);
setTimeout(handleHash, state.brains.length > 1 ? 400 : 100);

/* ================= public API (hooks for future AI bots) ================= */
window.AIBrain = {
  persistenceStatus:() => persistence.status(),
  getBackup:() => snapshot(localStorage),
  exportBackup:() => exportJSON(snapshot(localStorage)),
  version:1, getState:() => JSON.parse(JSON.stringify(state)),
  addQuestion, splitNode, addDirection, makeSubBrain,
  addConcept, removeConcept, setProcessPattern, getConcepts, getConceptThreads:() => JSON.parse(JSON.stringify(threads)), getConceptLinks:() => conceptLinks.map(l => ({ from:l.from, to:l.to, kind:'concept', concept:l.concept, threadKind:l.threadKind })),
  suggestConcepts, focusConcept, showConcepts, _debug:debug, quality:lv => (QLV[lv] ? setQuality(lv) : QL), mergeBrain, crossLink, setStatus, addCounterEvidence, setCollapsed, setMedia, deleteNode,
  focusBrain, focusNode, overview, select, undo, exportJSON, importJSON, reset:resetAll,
  on:(ev, f) => { (listeners[ev] = listeners[ev] || []).push(f); },
  /* sync hooks (sync.js) — not for bots */
  _applyExternal:applyExternal, _migrate:st => migrate(st), _valid:valid, _toast:toast
};
document.body.dataset.ready = '1';

