/* brain/interior.js — the anatomical interior of a brain: translucent structures (corpus callosum, thalamus, hippocampus, striatum,
   ventricles, amygdala) merged into one mesh, GPU-animated fibre tracts with travelling glow, pulse heads, and thalamus -> question
   signal tracts. Pure rendering; no app state. app.js passes its shared pieces in once via initInterior(). */
export function initInterior({ THREE, Q, UPR, GLOW, GEO, shellVS, shellFS, nodeColor, clampInside, bez }){
function fill(g, n, v){ g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; }
function cortexPoint(side, rnd = Math.random){   // a point just under the cortex of one hemisphere
  for (let i = 0; i < 40; i++){ const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1);
    const p = [Math.abs(Math.sin(v) * Math.cos(u)) * 0.5 * side + side * 0.04, 0.1 + Math.cos(v) * 0.42, Math.sin(v) * Math.sin(u) * 0.72];
    if (p[1] > -0.2) return p.map(x => x * 0.86).map((x, i) => i === 1 ? x + 0.014 : x); }
  return [side * 0.3, 0.2, 0];
}
const TH = side => [side * 0.075, 0.07, -0.05];   // thalamus centre (relay hub)
const ANAT = (() => {   // shared geometries
  const tube = (pts, r, seg = 48) => fill(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, 10, false), 'fold', 0.4);
  const cc = tube([[0, 0.1, 0.36], [0, 0.22, 0.24], [0, 0.27, 0.02], [0, 0.25, -0.22], [0, 0.13, -0.36], [0, 0.06, -0.3]], 0.022, 64); cc.scale(3.2, 0.8, 1);
  const hip = side => tube([[side * 0.2, -0.1, 0.2], [side * 0.24, -0.08, 0.04], [side * 0.22, -0.02, -0.16], [side * 0.15, 0.08, -0.3], [side * 0.08, 0.16, -0.28]], 0.026);
  const vent = side => tube([[side * 0.05, 0.16, 0.28], [side * 0.09, 0.2, 0.08], [side * 0.1, 0.19, -0.14], [side * 0.12, 0.08, -0.3], [side * 0.18, -0.04, -0.12], [side * 0.2, -0.06, 0.1]], 0.016);
  const ell = (s, p) => { const g = new THREE.SphereGeometry(1, 28, 20); g.scale(...s); g.translate(...p); return fill(g, 'fold', 0.6); };
  return { cc, hipL:hip(-1), hipR:hip(1), ventL:vent(-1), ventR:vent(1),
    thL:ell([0.075, 0.06, 0.1], TH(-1)), thR:ell([0.075, 0.06, 0.1], TH(1)),
    stL:ell([0.06, 0.08, 0.15], [-0.17, 0.08, 0.1]), stR:ell([0.06, 0.08, 0.15], [0.17, 0.08, 0.1]),
    amL:ell([0.035, 0.035, 0.04], [-0.21, -0.1, 0.22]), amR:ell([0.035, 0.035, 0.04], [0.21, -0.1, 0.22]) };
})();
const fiberVS = `attribute float aT; attribute float aPh; attribute vec3 color; uniform float uTime; uniform float uDim; varying vec3 vC; varying float vA;
  void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); float w=fract(uTime*0.22+aPh); float d=abs(aT-w); float pulse=smoothstep(0.14,0.,d);
    float fog=clamp(1.25-(-mv.z)/40.,0.25,1.); vA=(0.07+0.75*pulse)*fog*uDim; vC=color*(0.55+1.6*pulse); gl_Position=projectionMatrix*mv; }`;
const fiberFS = `varying vec3 vC; varying float vA; void main(){ gl_FragColor=vec4(vC*vA, vA); }`;
const pulseVS = `attribute vec3 aC; attribute vec3 aB; attribute float aPh; attribute float aSp; attribute vec3 color; uniform float uTime; uniform float uSize; uniform float uPR; varying vec3 vC; varying float vA;
  void main(){ float t=fract(uTime*aSp+aPh); float u=1.-t; vec3 p=u*u*position+2.*u*t*aC+t*t*aB; vec4 mv=modelViewMatrix*vec4(p,1.);
    float s=sin(3.14159*t); vA=s; vC=color; gl_PointSize=uSize*uPR*(0.5+0.7*s)/-mv.z; gl_Position=projectionMatrix*mv; }`;
const pulseFS = `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; float a=smoothstep(.5,0.,d); gl_FragColor=vec4(vC*(0.7+a)*vA, a*vA); }`;
function fiberMaterial(){ return new THREE.ShaderMaterial({ uniforms:{ uTime:{ value:0 }, uDim:{ value:1 } }, vertexShader:fiberVS, fragmentShader:fiberFS, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }); }
function pulseMaterial(size){ return new THREE.ShaderMaterial({ uniforms:{ uTime:{ value:0 }, uSize:{ value:size }, uPR:UPR }, vertexShader:pulseVS, fragmentShader:pulseFS, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending }); }
/* curves -> (fibre lines with a travelling glow) + (bright pulse heads riding the same curves). curves: [{a,c,b,col,ph}] */
function buildTracts(curves, K, pulsesPer, size, speed){
  const pos = [], col = [], at = [], aph = [];
  curves.forEach(cv => { const A = new THREE.Vector3(...cv.a), C = new THREE.Vector3(...cv.c), Bv = new THREE.Vector3(...cv.b); let prev = A.clone();
    for (let k = 1; k <= K; k++){ const t = k / K; const cur = bez(A, C, Bv, t, new THREE.Vector3());
      pos.push(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z); col.push(...cv.col, ...cv.col); at.push((k - 1) / K, t); aph.push(cv.ph, cv.ph); prev = cur; } });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  lg.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1)); lg.setAttribute('aPh', new THREE.Float32BufferAttribute(aph, 1));
  const lines = new THREE.LineSegments(lg, fiberMaterial()); lines.frustumCulled = false;
  const pa = [], pc = [], pb = [], pph = [], psp = [], pcol = [];
  curves.forEach((cv, i) => { const n = typeof pulsesPer === 'function' ? pulsesPer(i) : pulsesPer; for (let k = 0; k < n; k++){
    pa.push(...cv.a); pc.push(...cv.c); pb.push(...cv.b); pph.push(Math.random()); psp.push(speed * (0.7 + Math.random() * 0.6)); pcol.push(...cv.col); } });
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3)); pg.setAttribute('aC', new THREE.Float32BufferAttribute(pc, 3));
  pg.setAttribute('aB', new THREE.Float32BufferAttribute(pb, 3)); pg.setAttribute('aPh', new THREE.Float32BufferAttribute(pph, 1)); pg.setAttribute('aSp', new THREE.Float32BufferAttribute(psp, 1)); pg.setAttribute('color', new THREE.Float32BufferAttribute(pcol, 3));
  const pts = new THREE.Points(pg, pulseMaterial(size)); pts.frustumCulled = false;
  return { lines, pts, dispose(){ lg.dispose(); pg.dispose(); lines.material.dispose(); pts.material.dispose(); } };
}
/* [proto perf] all translucent structures of a brain merged into ONE geometry (per-vertex colour + opacity) => 1 draw call instead of 11 */
const anatVS = shellVS.replace('void main(){', 'attribute vec3 aCol; attribute float aOp; varying vec3 vCol; varying float vOp;\n  void main(){ vCol=aCol; vOp=aOp;');
const anatFS = shellFS.replace('uniform vec3 uColor; ', '').replace('uniform float uOpacity; ', '').replace('void main(){', 'varying vec3 vCol; varying float vOp;\n  void main(){ vec3 uColor=vCol; float uOpacity=vOp;');
function mergeAnat(parts){
  let nv = 0, ni = 0; parts.forEach(([g]) => { nv += g.attributes.position.count; ni += g.index.count; });
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), fold = new Float32Array(nv), col = new Float32Array(nv * 3), op = new Float32Array(nv), idx = new Uint32Array(ni);
  let v = 0, i = 0; const c = new THREE.Color();
  parts.forEach(([g, color, o]) => { const n = g.attributes.position.count; c.set(color);
    pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3); fold.set(g.attributes.fold.array, v);
    for (let k = 0; k < n; k++){ col[(v + k) * 3] = c.r; col[(v + k) * 3 + 1] = c.g; col[(v + k) * 3 + 2] = c.b; op[v + k] = o; }
    const gi = g.index.array; for (let k = 0; k < gi.length; k++) idx[i + k] = gi[k] + v; v += n; i += gi.length; });
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('fold', new THREE.BufferAttribute(fold, 1));
  m.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); m.setAttribute('aOp', new THREE.BufferAttribute(op, 1)); m.setIndex(new THREE.BufferAttribute(idx, 1));
  m.computeBoundingSphere(); return m;
}
function makeInterior(b, f){
  const g = new THREE.Group(), main = b.id === 'main';
  const base = new THREE.Color(b.regionColor), cyan = new THREE.Color('#7fd8ff'), warm = new THREE.Color('#ffc58a'), tmp = new THREE.Color();
  // 1) layered translucent structures (fresnel glow), main brain gets the full set
  const mats = [], parts = [];
  if (Q.layers){
    // inner cortex layer (grey/white matter boundary) => depth / layering
    const innerShell = new THREE.ShaderMaterial({ uniforms:{ uColor:{ value:base.clone().lerp(cyan, 0.35) }, uTime:{ value:0 }, uOpacity:{ value:main ? 0.28 : 0.22 } }, vertexShader:shellVS, fragmentShader:shellFS, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.BackSide });
    ['L', 'R'].forEach(k => { const m = new THREE.Mesh(GEO[k], innerShell); m.scale.setScalar(0.9); m.position.y = 0.012; g.add(m); }); mats.push(innerShell);
  }
  const P = main ? { cc:'#9fe3ff', th:'#ffc58a', hip:'#ff8fe0', st:'#8ff0c0', vent:'#6fa8ff', am:'#ff9a7a' }
    : { cc:base.getStyle(), th:'#ffc58a', hip:base.getStyle(), st:base.getStyle(), vent:base.getStyle(), am:'#ff9a7a' };
  const s = main ? 1 : 0.8;
  const add = (geo, color, op) => parts.push([geo, color, op]);
  add(ANAT.cc, P.cc, 0.3 * s); add(ANAT.thL, P.th, 0.42 * s); add(ANAT.thR, P.th, 0.42 * s);   // kept subtle: questions must stay the brightest things
  if (Q.layers || main){ add(ANAT.hipL, P.hip, 0.38 * s); add(ANAT.hipR, P.hip, 0.38 * s); add(ANAT.stL, P.st, 0.26 * s); add(ANAT.stR, P.st, 0.26 * s);
    add(ANAT.ventL, P.vent, 0.28 * s); add(ANAT.ventR, P.vent, 0.28 * s); add(ANAT.amL, P.am, 0.4 * s); add(ANAT.amR, P.am, 0.4 * s); }
  const am = new THREE.ShaderMaterial({ uniforms:{ uTime:{ value:0 } }, vertexShader:anatVS, fragmentShader:anatFS, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide });
  g.add(new THREE.Mesh(mergeAnat(parts), am)); mats.push(am);
  // thalamic core glow (fake bloom)
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map:GLOW, color:'#ffd9a8', transparent:true, opacity:0.35, depthWrite:false, blending:THREE.AdditiveBlending }));
  core.position.set(0, 0.07, -0.05); core.scale.setScalar(0.42); g.add(core);
  // 2) fibre tracts: projection (thalamus -> cortex), commissural (across corpus callosum), association (arcuate / U-fibres)
  const N = Math.round(Q.fibers * f), curves = [];
  for (let i = 0; i < N; i++){
    const r = Math.random(), side = Math.random() < 0.5 ? -1 : 1; let a, c, bb, colr;
    if (r < 0.42){ a = TH(side); bb = cortexPoint(side); c = [(a[0] + bb[0]) * 0.5, Math.max(a[1], bb[1]) + 0.08, (a[2] + bb[2]) * 0.5]; colr = tmp.copy(warm).lerp(base, 0.35 + Math.random() * 0.4); }
    else if (r < 0.66){ a = cortexPoint(-1); a[1] = Math.max(a[1], 0.12); bb = [-a[0], a[1] + (Math.random() - 0.5) * 0.08, a[2] + (Math.random() - 0.5) * 0.1]; c = [0, 0.26 + Math.random() * 0.03, (a[2] + bb[2]) * 0.4]; colr = tmp.copy(cyan).lerp(base, Math.random() * 0.4); }
    else { a = cortexPoint(side); bb = cortexPoint(side); const short = Math.random() < 0.6;
      if (short){ bb = a.map((x, k) => x + (Math.random() - 0.5) * 0.22); bb = clampInside(bb); }
      const m = [(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2, (a[2] + bb[2]) / 2]; const pull = short ? 0.72 : 0.45; c = [m[0] * pull, 0.1 + (m[1] - 0.1) * pull, m[2] * pull];
      colr = tmp.copy(base).lerp(cyan, Math.random() * 0.5); }
    curves.push({ a, c, b:bb, col:[colr.r, colr.g, colr.b], ph:Math.random() });
  }
  const tracts = buildTracts(curves, Q.K, i => (i < Q.pulses * f / 1 ? 1 : 0), main ? 26 : 22, 0.16);
  g.add(tracts.lines, tracts.pts);
  const fullCount = tracts.lines.geometry.attributes.position.count;
  let toNodes = null;
  return { group:g, mats, tracts, core,
    setNodes(list){   // signals from the thalamic hub to every question in this brain
      if (toNodes){ g.remove(toNodes.lines, toNodes.pts); toNodes.dispose(); toNodes = null; }
      if (!list.length) return;
      const cv = list.map((n, i) => { const side = n.pos[0] < 0 ? -1 : 1, a = TH(side), bb = n.pos; const cl = new THREE.Color(nodeColor(n));
        return { a, c:[(a[0] + bb[0]) * 0.5, Math.max(a[1], bb[1]) + 0.1, (a[2] + bb[2]) * 0.5], b:bb, col:[cl.r, cl.g, cl.b], ph:i * 0.137 % 1 }; });
      toNodes = buildTracts(cv, 16, 3, main ? 46 : 40, 0.42); toNodes.lines.material.uniforms.uDim.value = 2.2; g.add(toNodes.lines, toNodes.pts);
    },
    setLevel(frac){ tracts.lines.geometry.setDrawRange(0, Math.floor(fullCount * frac)); tracts.pts.geometry.setDrawRange(0, Math.floor(tracts.pts.geometry.attributes.position.count * frac)); },
    tick(t){ mats.forEach(m => { m.uniforms.uTime.value = t; }); tracts.lines.material.uniforms.uTime.value = t; tracts.pts.material.uniforms.uTime.value = t;
      if (toNodes){ toNodes.lines.material.uniforms.uTime.value = t; toNodes.pts.material.uniforms.uTime.value = t; } core.material.opacity = 0.28 + 0.12 * Math.sin(t * 1.7); },
    dispose(){ tracts.dispose(); if (toNodes) toNodes.dispose(); mats.forEach(m => m.dispose()); core.material.dispose(); } };
}
return { makeInterior, TH };
}
