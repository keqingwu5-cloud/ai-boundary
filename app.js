/* 3D 動態認知大腦 v1 — plain Three.js (ES modules, vendored), no build step. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ================= constants ================= */
const KEY = 'aiBrain.v1', UKEY = 'aiBrain.v1.undo';
const MOBILE = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
const ACT = { seed:'🌱 播種', add:'✦ 新增問題', split:'❖ 分裂', subbrain:'🧠 生成子腦', merge:'↩ 併回', cross:'🔗 跨腦連結',
  status:'◐ 研究進度', counter:'⚔ 反證', collapse:'◌ 收合', expand:'◉ 展開', media:'🎞 媒體', delete:'✕ 刪除', import:'⇧ 匯入', reset:'↺ 重置', undo:'↶ 復原' };
const STATUS = { open:'待研究', researching:'研究中', resolved:'已有結論' };
const colorOf = t => (TYPES[t] || TYPES['其他']).color;
const iconOf = t => (TYPES[t] || TYPES['其他']).icon;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = s => document.querySelector(s);

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
function mkNode(o){
  return Object.assign({ id: uid('n'), brainId:'main', parentId:null, kind:'question', title:'', type:'其他', oneLiner:'', source:null,
    assumptions:'', reasoning:[], counterEvidence:[], media:{ video:'', image:'' }, status:'open', createdBy:'merlin',
    createdAt: Date.now(), collapsed:false, pos:[0,0,0], botNotes:[] }, o);
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
      media:{ video:q.videoUrl || '', image:q.imageUrl || '' }, createdBy:'seed', seedId:q.id, createdAt:now, pos }));
    (q.extensions || []).forEach((e, i) => {
      const cid = nid + '_e' + i;
      st.nodes.push(mkNode({ id:cid, parentId:nid, kind:'extension', title:e.q, type:e.type, createdBy:'seed', createdAt:now, pos:jitter(pos, 0.14, rnd) }));
      st.links.push({ id:'l_' + cid, from:nid, to:cid, kind:'derived', createdAt:now });
    });
  });
  st.history.push({ ts:now, action:'seed', payload:{ questions:QUESTIONS.length, nodes:st.nodes.length } });
  return st;
}
function valid(s){ return s && Array.isArray(s.brains) && Array.isArray(s.nodes) && Array.isArray(s.links) && Array.isArray(s.history) && s.brains.some(b => b.id === 'main'); }
function load(){ try { const s = JSON.parse(localStorage.getItem(KEY)); return valid(s) ? s : null; } catch(e){ return null; } }
let state = load() || seedState();
let undoStack = []; try { undoStack = JSON.parse(localStorage.getItem(UKEY) || '[]'); } catch(e){ undoStack = []; }
let saveT = 0;
function save(now = false){
  clearTimeout(saveT);
  const f = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(UKEY, JSON.stringify(undoStack.slice(-12))); flashSaved(); } catch(e){ toast('⚠ 儲存失敗：' + e.message); } };
  now ? f() : (saveT = setTimeout(f, 250));
}
save(true);
const listeners = {};
function emit(ev, data){ (listeners[ev] || []).forEach(f => { try { f(data); } catch(e){ console.error(e); } }); }
function mutate(action, payload, fn){
  undoStack.push(JSON.stringify(state)); if (undoStack.length > 12) undoStack.shift();
  fn();
  state.history.push({ ts:Date.now(), action, payload });
  save(); sync(); renderHistory(); renderCrumbs();
  emit('change', { action, payload });
}
const N = id => state.nodes.find(n => n.id === id);
const B = id => state.brains.find(b => b.id === id);
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
  mutate('add', { nodeId:n.id, title:n.title, brainId:brain }, () => {
    state.nodes.push(n);
    if (n.parentId) state.links.push({ id:uid('l'), from:n.parentId, to:n.id, kind:'derived', createdAt:Date.now() });
    exts.forEach(e => { const c = mkNode({ brainId:brain, parentId:n.id, kind:'extension', title:e.title, type:TYPES[e.type] ? e.type : n.type, createdBy:n.createdBy, pos:jitter(n.pos, 0.13) });
      state.nodes.push(c); state.links.push({ id:uid('l'), from:n.id, to:c.id, kind:'derived', createdAt:Date.now() }); });
  });
  pendingBursts.push(n.id);
  return n.id;
}
function splitNode(id, items, createdBy = 'merlin'){
  const p = N(id); if (!p || !items.length) return [];
  const ids = [];
  mutate('split', { nodeId:id, title:p.title, children:items.map(i => i.title) }, () => {
    p.collapsed = false;
    items.forEach(it => { const c = mkNode({ brainId:p.brainId, parentId:id, kind:'split', title:it.title, type:TYPES[it.type] ? it.type : p.type, createdBy, pos:jitter(p.pos, 0.15) });
      state.nodes.push(c); ids.push(c.id); state.links.push({ id:uid('l'), from:id, to:c.id, kind:'derived', createdAt:Date.now() }); });
  });
  pendingBursts.push(id);
  return ids;
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
    state.brains.push({ id:bid, name:n.title, parentBrainId:parent.id, position:pos, scale:parent.scale * 0.5, regionColor:colorOf(n.type), rootNodeId:id, createdAt:Date.now() });
    n.brainId = bid; n.pos = [0, 0.1, 0]; n.collapsed = false;
    // radial re-layout of the subtree inside the new brain
    const depthOf = x => { let d = 0, c = x; while (c && c.id !== id){ c = N(c.parentId); d++; } return d; };
    const byDepth = {}; sub.forEach(s => { const d = depthOf(s); (byDepth[d] = byDepth[d] || []).push(s); });
    Object.keys(byDepth).forEach(d => { const arr = byDepth[d]; arr.forEach((s, i) => { const a = i / arr.length * Math.PI * 2 + d * 0.7;
      s.brainId = bid; s.pos = clampInside([Math.sin(a) * 0.2 * d, 0.1 + (i % 2 ? 0.12 : -0.1) * Math.min(d, 2), Math.cos(a) * 0.3 * d]); }); });
  });
  pendingFly.set(bid, id);
  focusBrain(bid, 1400);
  return bid;
}
function mergeBrain(bid){
  const b = B(bid); if (!b || bid === 'main') return;
  const target = B(b.parentBrainId) || B('main');
  const root = N(b.rootNodeId);
  mutate('merge', { brainId:bid, title:b.name, into:target.id }, () => {
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
function setMedia(id, kind, url){ const n = N(id); if (!n) return; mutate('media', { nodeId:id, kind }, () => { n.media[kind] = url; }); }
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
  state = JSON.parse(undoStack.pop());
  save(true); sync(); renderHistory(); renderCrumbs(); closePanel(); toast('↶ 已復原');
  if (!B(focusId)) focusBrain('main');
  emit('change', { action:'undo' });
}
function resetAll(){ undoStack.push(JSON.stringify(state)); state = seedState(); state.history.push({ ts:Date.now(), action:'reset', payload:{} }); save(true); sync(); renderHistory(); renderCrumbs(); closePanel(); focusBrain('main'); }
function exportJSON(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ai-brain-' + new Date().toISOString().slice(0,16).replace(/[:T]/g,'') + '.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('⇩ 已匯出 JSON');
}
function importJSON(obj){
  if (!valid(obj)){ toast('⚠ 檔案格式不符'); return false; }
  undoStack.push(JSON.stringify(state));
  state = obj; state.history.push({ ts:Date.now(), action:'import', payload:{ nodes:obj.nodes.length, brains:obj.brains.length } });
  save(true); sync(); renderHistory(); renderCrumbs(); closePanel(); focusBrain('main'); toast('⇧ 已匯入');
  return true;
}

/* ================= three.js scene ================= */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:!MOBILE, alpha:false, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
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
  const m = new THREE.ShaderMaterial({ uniforms:{ uTime:{ value:0 }, uPR:{ value:renderer.getPixelRatio() } }, transparent:true, depthWrite:false, fog:false,
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
function stem(){ const g = new THREE.CylinderGeometry(0.075, 0.05, 0.4, 20, 4); g.rotateX(0.35); g.translate(0, -0.42, -0.3); g.setAttribute('fold', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(0.3), 1)); return g; }
const WS = MOBILE ? 96 : 144, HS = MOBILE ? 72 : 108;
const GEO = { L:hemisphere(-1, WS, HS), R:hemisphere(1, WS, HS), C:cerebellum(), S:stem() };
const NODE_GEO = new THREE.IcosahedronGeometry(1, 2);
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
    let p; do { p = [(Math.random() * 2 - 1) * 0.55, Math.random() * 0.9 - 0.32, (Math.random() * 2 - 1) * 0.78]; }
    while ((p[0] / 0.55) ** 2 + ((p[1] - 0.1) / 0.5) ** 2 + (p[2] / 0.78) ** 2 > 0.85);
    pos.set(p, i * 3); ph[i] = Math.random() * 6.28; tmp.copy(c1).lerp(c2, Math.random()); col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({ uniforms:{ uTime:{ value:0 }, uSize:{ value:MOBILE ? 26 : 30 }, uPR:{ value:renderer.getPixelRatio() } }, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
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
function createBrain(b){
  const group = new THREE.Group(); group.userData.brainId = b.id;
  const mat = new THREE.ShaderMaterial({ uniforms:{ uColor:{ value:new THREE.Color(b.regionColor) }, uTime:{ value:0 }, uOpacity:{ value:1 } },
    vertexShader:shellVS, fragmentShader:shellFS, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide });
  ['L', 'R', 'C', 'S'].forEach(k => { const m = new THREE.Mesh(GEO[k], mat); m.userData.brainId = b.id; m.userData.shell = true; group.add(m); });
  const inner = makeInner(b.id === 'main' ? (MOBILE ? 700 : 1600) : (MOBILE ? 220 : 500), b.regionColor);
  group.add(inner.pts, inner.web);
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
  const o = { group, mat, inner, nodes, links, halo, label, regions:new Map(), phase:Math.random() * 6.28 };
  brainObjs.set(b.id, o); return o;
}
function disposeBrain(id){
  const o = brainObjs.get(id); if (!o) return;
  const b0 = o.group; const parent = o.parentPos || new THREE.Vector3();
  tween({ dur:900, ease:easeIO, from:b0.position.clone(), to:parent, s0:b0.scale.x, s1:0.01, step:(e, tw) => { b0.position.lerpVectors(tw.from, tw.to, e); b0.scale.setScalar(tw.s0 + (tw.s1 - tw.s0) * e); },
    done:() => { scene.remove(b0); o.inner.pts.geometry.dispose(); o.inner.web.geometry.dispose(); o.links.geometry.dispose(); o.label.remove(); } });
  brainObjs.delete(id);
}
function createNode(n, bo){
  const color = new THREE.Color(colorOf(n.type));
  const mesh = new THREE.Mesh(NODE_GEO, new THREE.MeshBasicMaterial({ color, transparent:true }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color, transparent:true, opacity:0.9, depthWrite:false, blending:THREE.AdditiveBlending }));
  glow.scale.set(7, 7, 1); mesh.add(glow);
  mesh.userData.nodeId = n.id; glow.userData.nodeId = n.id;
  bo.nodes.add(mesh);
  const o = { mesh, glow, brainId:n.brainId, phase:Math.random() * 6.28, size:0 };
  nodeObjs.set(n.id, o); return o;
}
function nodeSize(n){ const isRoot = state.brains.some(b => b.rootNodeId === n.id); return isRoot ? 0.042 : n.kind === 'question' ? 0.03 : 0.021; }
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
        tween({ dur:1600, ease:easeIO, from, to:target, step:(e, tw) => { o.group.position.lerpVectors(tw.from, tw.to, e); const k = Math.max(0.02, ts * (e < 0.3 ? e / 0.3 * 0.35 : 0.35 + 0.65 * easeBack((e - 0.3) / 0.7))); o.group.scale.setScalar(k); } });
      } else { o.group.position.copy(target); o.group.scale.setScalar(ts); }
      pendingFly.delete(b.id);
    }
    const pb = B(b.parentBrainId); o.parentPos = pb ? new THREE.Vector3(...pb.position) : new THREE.Vector3();
    o.label.textContent = b.id === 'main' ? '' : '🧠 ' + (b.name.length > 12 ? b.name.slice(0, 12) + '…' : b.name);
    o.label.style.setProperty('--c', b.regionColor);
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
    const col = new THREE.Color(colorOf(n.type));
    o.mesh.material.color.copy(col); o.glow.material.color.copy(col);
    o.size = nodeSize(n);
    o.visible = !hiddenByCollapse(n);
    o.dim = filterType && n.type !== filterType;
    o.status = n.status; o.user = n.createdBy !== 'seed'; o.collapsed = n.collapsed && kids(n.id).some(k => k.brainId === n.brainId);
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
  updateCounts();
}

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
const MAXA = 6000;
const arcGeo = new THREE.BufferGeometry();
arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXA * 3), 3)); arcGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXA * 3), 3));
const arcs = new THREE.LineSegments(arcGeo, new THREE.LineBasicMaterial({ vertexColors:true, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false }));
arcs.frustumCulled = false; scene.add(arcs);
const MAXP = MOBILE ? 260 : 700;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3)); pGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAXP), 1));
const pMat = new THREE.ShaderMaterial({ uniforms:{ uPR:{ value:renderer.getPixelRatio() } }, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  vertexShader:`attribute vec3 color; attribute float aSize; uniform float uPR; varying vec3 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=aSize*uPR*60.0/-mv.z; gl_Position=projectionMatrix*mv; }`,
  fragmentShader:`varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; float a=smoothstep(.5,0.,d); gl_FragColor=vec4(vC*(0.6+a), a); }` });
const flow = new THREE.Points(pGeo, pMat); flow.frustumCulled = false; scene.add(flow);
const GOLD = new THREE.Color('#ffd36e');
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
  const col = new THREE.Color();
  state.links.forEach((l, li) => {
    const a = nodeObjs.get(l.from), b = nodeObjs.get(l.to); if (!a || !b || !a.visible || !b.visible) return;
    const seed = (li * 0.6180339) % 1;
    if (l.kind === 'derived' && a.brainId === b.brainId){
      const L = intra.get(a.brainId); if (!L) return;
      const A = a.mesh.position, Bp = b.mesh.position; tmpC.copy(A).add(Bp).multiplyScalar(0.5).multiplyScalar(0.82);
      col.set(colorOf(N(l.to)?.type)); const dim = (a.dim || b.dim) ? 0.15 : 1;
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
    const SEG = 28, k = isX ? 1 : 0.55;
    for (let s = 0; s < SEG && ai < MAXA - 2; s++){ bez(tmpA, tmpC, tmpB, s / SEG, tmpV); ap.set([tmpV.x, tmpV.y, tmpV.z], ai * 3); bez(tmpA, tmpC, tmpB, (s + 1) / SEG, tmpV); ap.set([tmpV.x, tmpV.y, tmpV.z], ai * 3 + 3);
      ac.set([col.r*k, col.g*k, col.b*k, col.r*k, col.g*k, col.b*k], ai * 3); ai += 2; }
    emitP(tmpA, tmpC, tmpB, col, isX ? (MOBILE ? 4 : 7) : 3, isX ? 2.2 : 1.4, isX ? 0.16 : 0.12, seed);
  });
  // tethers brain -> parent brain
  state.brains.forEach((b, bi) => { if (!b.parentBrainId) return; const o = brainObjs.get(b.id), po = brainObjs.get(b.parentBrainId); if (!o || !po) return;
    tmpA.copy(po.group.position); tmpB.copy(o.group.position); const d = tmpA.distanceTo(tmpB); tmpC.copy(tmpA).add(tmpB).multiplyScalar(0.5); tmpC.y -= d * 0.15;
    col.set(b.regionColor);
    for (let s = 0; s < 24 && ai < MAXA - 2; s++){ bez(tmpA, tmpC, tmpB, s / 24, tmpV); ap.set([tmpV.x, tmpV.y, tmpV.z], ai * 3); bez(tmpA, tmpC, tmpB, (s + 1) / 24, tmpV); ap.set([tmpV.x, tmpV.y, tmpV.z], ai * 3 + 3);
      const k = 0.22; ac.set([col.r*k, col.g*k, col.b*k, col.r*k, col.g*k, col.b*k], ai * 3); ai += 2; }
    emitP(tmpA, tmpC, tmpB, col, 2, 1.6, 0.1, bi * 0.37);
  });
  arcGeo.setDrawRange(0, ai); arcGeo.attributes.position.needsUpdate = true; arcGeo.attributes.color.needsUpdate = true;
  pGeo.setDrawRange(0, pi); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; pGeo.attributes.aSize.needsUpdate = true;
  brainObjs.forEach((bo, id) => { const L = intra.get(id); const g = bo.links.geometry; g.setDrawRange(0, L.i); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; });
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
  const dist = fitDist(r * 0.9);
  const dir = camera.position.clone().sub(controls.target).normalize();
  fly = { t0:performance.now(), dur:1300, fromT:controls.target.clone(), toT:c, fromP:camera.position.clone(), toP:c.clone().add(dir.multiplyScalar(Math.max(dist, 6))) };
  focusId = 'main'; renderCrumbs(); $('#bHome').classList.add('hide');
}

/* ---------- picking ---------- */
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
function pick(x, y){
  const r = canvas.getBoundingClientRect(); ndc.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = []; nodeObjs.forEach(o => { if (o.visible) targets.push(o.glow); });
  const hit = ray.intersectObjects(targets, false).sort((a, b) => a.distance - b.distance)[0];
  if (hit) return { node:hit.object.userData.nodeId };
  const shells = []; brainObjs.forEach(o => o.group.children.forEach(c => { if (c.userData.shell) shells.push(c); }));
  const sh = ray.intersectObjects(shells, false)[0];
  return sh ? { brain:sh.object.userData.brainId } : null;
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
  const ic = kind === 'video' ? '🎬' : '🖼️', nm = kind === 'video' ? '影片' : '圖片';
  const body = !url ? `<b>${ic}</b>${nm}・即將加入` : kind === 'image' ? `<img src="${esc(url)}" alt="">` : `<b>▶</b>觀看${nm}`;
  return `<div class="slot ${url ? 'has' : ''}">${url && kind === 'video' ? `<a href="${esc(url)}" target="_blank" rel="noopener">${body}</a>` : url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${body}</a>` : body}<button class="mini" data-media="${kind}" title="設定網址">✎</button></div>`;
}
function select(id){
  const n = N(id); if (!n) return; selected = id;
  if (n.brainId !== focusId && B(n.brainId)) focusBrain(n.brainId);
  const s = n.source || {}; const par = N(n.parentId); const ch = kids(id);
  const xl = state.links.filter(l => l.kind === 'cross' && (l.from === id || l.to === id)).map(l => N(l.from === id ? l.to : l.from)).filter(Boolean);
  const brain = B(n.brainId); const isRoot = state.brains.find(b => b.rootNodeId === id);
  const hist = state.history.filter(h => h.payload && (h.payload.nodeId === id || (h.payload.children && h.action === 'split' && h.payload.nodeId === id))).slice(-4);
  const srcHTML = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.who || '來源')} ↗</a><br>${esc([s.outlet, s.date].filter(Boolean).join(' · '))}`
    : esc([s.who, s.outlet, s.date].filter(Boolean).join(' · ') || (n.createdBy === 'seed' ? '' : 'Merlin 自行提出'));
  const also = (s.also || []).map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.label)}</a>`).join('、');
  const by = n.createdBy === 'bot' ? '🤖 bot' : n.createdBy === 'seed' ? '📚 公開來源' : '⭐ Merlin';
  pBody.innerHTML = `
    <div class="row1">${tag(n.type)}<span class="tag by ${n.createdBy}">${by}</span><span class="tag kind">${{ question:'主問題', extension:'延伸', split:'分裂' }[n.kind] || n.kind}</span></div>
    <h2>${esc(n.title)}</h2>
    ${n.oneLiner ? `<p class="one">${esc(n.oneLiner)}</p>` : ''}
    <div class="acts">
      <button data-a="split" title="分裂成子問題">❖ 分裂</button>
      ${ch.some(k => k.brainId === n.brainId) ? `<button data-a="${n.collapsed ? 'expand' : 'collapse'}">${n.collapsed ? '◉ 展開' : '◌ 收合'}</button>` : ''}
      ${isRoot ? `<button data-a="merge">↩ 併回${B(brain.parentBrainId)?.id === 'main' ? '主腦' : '上層'}</button>` : `<button data-a="sub" title="獨立成子腦">🧠 子腦</button>`}
      <button data-a="link" title="跨腦連結">🔗 連結</button>
      ${n.brainId !== 'main' ? `<button data-a="home">⌂ 主腦</button>` : ''}
      ${n.createdBy !== 'seed' && !isRoot ? `<button data-a="del" class="danger">✕</button>` : ''}
    </div>
    <div class="status">${Object.entries(STATUS).map(([k, v]) => `<button data-st="${k}" class="${n.status === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    ${srcHTML ? `<div class="src">📎 ${srcHTML}${also ? '<br>其他：' + also : ''}</div>` : ''}
    <div class="prov">
      <div><span>🧬 來自</span>${par ? nodeLink(par) + (par.brainId !== n.brainId ? ` <em>（${esc(B(par.brainId)?.id === 'main' ? '主腦' : B(par.brainId)?.name || '')}）</em>` : '') : `<em>${esc(brain.id === 'main' ? '主腦' : brain.name)}・根問題</em>`}</div>
      ${ch.length ? `<div><span>🌿 衍生 ${ch.length}</span>${ch.map(nodeLink).join('')}</div>` : ''}
      ${xl.length ? `<div><span>🔗 跨腦</span>${xl.map(nodeLink).join('')}</div>` : ''}
    </div>
    ${n.assumptions ? `<div class="lbl">◇ 前提假設</div><p class="txt">${esc(n.assumptions)}</p>` : ''}
    ${n.reasoning.length ? `<div class="lbl">🧭 推演</div><div class="steps">${n.reasoning.map(r => `<div class="st"><b>${esc(r.k)}</b><span>${esc(r.v)}</span></div>`).join('')}</div>` : ''}
    <div class="lbl">⚔ 反證 <i>${n.counterEvidence.length}</i></div>
    <div class="ce">${n.counterEvidence.map(c => `<div class="ci"><span>${c.createdBy === 'bot' ? '🤖' : '⭐'}</span>${esc(c.text)}</div>`).join('') || '<div class="empty">尚無反證</div>'}
      <form id="ceF"><input id="ceI" placeholder="新增反證…" maxlength="200"><button>＋</button></form></div>
    <div class="lbl">🎞 媒體</div><div class="media">${slot('video', n.media.video)}${slot('image', n.media.image)}</div>
    ${hist.length ? `<div class="lbl">🕘 紀錄</div><div class="mh">${hist.map(h => `<div>${fmt(h.ts)} ${ACT[h.action] || h.action}</div>`).join('')}</div>` : ''}`;
  pBody.querySelectorAll('.nl').forEach(a => a.onclick = ev => { ev.preventDefault(); select(a.dataset.n); });
  pBody.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { setStatus(id, b.dataset.st); select(id); });
  pBody.querySelectorAll('[data-media]').forEach(b => b.onclick = () => { const u = prompt(b.dataset.media === 'video' ? '影片網址' : '圖片網址', n.media[b.dataset.media] || ''); if (u !== null){ setMedia(id, b.dataset.media, u.trim()); select(id); } });
  $('#ceF').onsubmit = ev => { ev.preventDefault(); const v = $('#ceI').value.trim(); if (v){ addCounterEvidence(id, v); select(id); } };
  pBody.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'split') openSplit(id);
    else if (a === 'collapse' || a === 'expand'){ setCollapsed(id, a === 'collapse'); select(id); }
    else if (a === 'sub'){ makeSubBrain(id); select(id); toast('🧠 分裂出子腦'); }
    else if (a === 'merge'){ mergeBrain(isRoot.id); select(id); }
    else if (a === 'link'){ startLink(id); }
    else if (a === 'home'){ focusBrain('main'); }
    else if (a === 'del'){ if (confirm('刪除這個節點與其分支？')) deleteNode(id); }
  });
  panel.classList.add('open'); panel.scrollTop = 0;
}
function closePanel(){ panel.classList.remove('open'); selected = null; }
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
$('#bAdd').onclick = () => { $('#qType').innerHTML = TYPE_LIST.map(t => `<option>${esc(t)}</option>`).join(''); $('#addWhere').textContent = focusId === 'main' ? '主腦' : B(focusId).name; openDlg('#addDlg'); };
$('#addDlg').addEventListener('close', () => {
  const d = $('#addDlg'), f = $('#addForm').elements;
  if (d.returnValue === 'ok' && f.qtitle.value.trim()){
    const exts = f.exts.value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6).map(l => { const p = l.split(/[｜|]/).map(x => x.trim()); return { title:p[0], type:p[1] }; });
    const id = addQuestion({ title:f.qtitle.value.trim(), type:f.qtype.value, oneLiner:f.oneLiner.value.trim(), assumptions:f.assume.value.trim(),
      source:{ who:f.src.value.trim() || 'Merlin', outlet:'', date:new Date().toISOString().slice(0,10), url:f.url.value.trim(), also:[] }, extensions:exts });
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
    if (items.length){ splitNode(splitTarget, items); select(splitTarget); toast('❖ 節點已分裂'); }
  }
  d.returnValue = '';
});

// history
function renderHistory(){
  const el = $('#hList'); if (!el) return;
  el.innerHTML = state.history.slice().reverse().slice(0, 150).map(h => {
    const p = h.payload || {}; const t = p.title || p.fromTitle && (p.fromTitle + ' ⇄ ' + p.toTitle) || (p.questions ? p.questions + ' 題' : '') || '';
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
$('#bReset').onclick = () => { if (confirm('重置成初始 6 題？（可用復原找回）')) resetAll(); };
$('#bHome').onclick = () => focusBrain('main');
$('#bFit').onclick = overview;
$('#bRot').onclick = function(){ controls.autoRotate = !controls.autoRotate; this.classList.toggle('on', controls.autoRotate); autoRotPref = controls.autoRotate; };
let autoRotPref = !REDUCED;

function renderCrumbs(){
  const chain = []; let b = B(focusId); while (b){ chain.unshift(b); b = B(b.parentBrainId); }
  $('#crumbs').innerHTML = chain.map((x, i) => `<button data-b="${esc(x.id)}" style="--c:${x.regionColor}">${x.id === 'main' ? '🧠 主腦' : esc(x.name.length > 8 ? x.name.slice(0, 8) + '…' : x.name)}</button>`).join('<i>›</i>');
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
function resize(){ const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const clock = new THREE.Clock();
const viewOff = { x:0, y:0 }; const MOBILE_LAYOUT = () => innerWidth <= 700;
const v3 = new THREE.Vector3();
function frame(){
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
    o.halo.material.opacity = (id === 'main' ? 0.16 : 0.26) * (0.8 + 0.2 * Math.sin(t * 1.5 + o.phase));
    o.regions.forEach((sp, ty) => { const w = sp.userData.want || 0; sp.material.opacity += (w * (0.75 + 0.25 * Math.sin(t * 2 + sp.position.x * 9)) - sp.material.opacity) * 0.05; if (filterType && ty !== filterType) sp.material.opacity *= 0.9; });
    // label
    if (id !== 'main'){ v3.copy(o.group.position); v3.y += o.group.scale.x * 0.75; v3.project(camera);
      const vis = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1;
      o.label.style.transform = `translate(${(v3.x * 0.5 + 0.5) * innerWidth}px,${(-v3.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-100%)`; o.label.style.opacity = vis ? 1 : 0; }
  });
  nodeObjs.forEach((o, id) => {
    const growing = o.mesh.scale.x < o.size * 0.999;
    const target = o.visible ? o.size * (selected === id ? 1.6 : hover === id ? 1.35 : 1) * (o.collapsed ? 1.2 : 1) : 0.0001;
    o.mesh.scale.setScalar(o.mesh.scale.x + (target - o.mesh.scale.x) * (growing ? 0.08 : 0.15));
    o.mesh.visible = o.mesh.scale.x > 0.0005;
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.4 + o.phase);
    o.glow.material.opacity = (o.dim ? 0.12 : 1) * (o.status === 'resolved' ? 1 : o.status === 'researching' ? 0.9 * pulse + 0.1 : 0.85 * pulse);
    o.mesh.material.opacity = o.dim ? 0.2 : 1;
    o.glow.scale.setScalar(o.collapsed ? 9 + 2 * Math.sin(t * 4 + o.phase) : selected === id ? 9 : 7);
  });
  updateLinks(t);
  // selected / hovered node label
  const lid = hover || selected; const nl = $('#nlabel');
  if (lid && nodeObjs.get(lid) && nodeObjs.get(lid).mesh.visible){ nodeObjs.get(lid).mesh.getWorldPosition(v3); v3.project(camera);
    nl.style.transform = `translate(${(v3.x * 0.5 + 0.5) * innerWidth}px,${(-v3.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-140%)`; const n = N(lid); nl.textContent = n ? n.title : ''; nl.style.setProperty('--c', colorOf(n?.type)); nl.style.opacity = 1; }
  else nl.style.opacity = 0;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
sync(); initDone = true; renderHistory(); renderCrumbs();
camera.position.set(0, 2.6, 0).add(new THREE.Vector3(0, 0.22, 1).normalize().multiplyScalar(fitDist(WORLD * 0.85)));
$('#bHome').classList.add('hide');
if (state.brains.length > 1) setTimeout(overview, 200);
requestAnimationFrame(frame);
setTimeout(() => $('#hint').classList.add('off'), 6500);

/* ================= public API (hooks for future AI bots) ================= */
window.AIBrain = {
  version:1, getState:() => JSON.parse(JSON.stringify(state)),
  addQuestion, splitNode, makeSubBrain, mergeBrain, crossLink, setStatus, addCounterEvidence, setCollapsed, setMedia, deleteNode,
  focusBrain, overview, select, undo, exportJSON, importJSON, reset:resetAll,
  on:(ev, f) => { (listeners[ev] = listeners[ev] || []).push(f); }
};
document.body.dataset.ready = '1';
