/* 短影音 feed — reads the same state as the 3D brain (localStorage aiBrain.v1, falling back to seed data). */
const KEY = 'aiBrain.v1', FKEY = 'aiBrain.feed.v1';
/* giscus (GitHub Discussions). Works once the giscus GitHub App is installed on the repo. One discussion per node: term = "node:<id>". */
const GISCUS = { repo:'keqingwu5-cloud/ai-boundary', repoId:'R_kgDOVDydcA', category:'Announcements', categoryId:'DIC_kwDOVDydcM4DHf-d' };
const DIR_COLOR = '#ff7ae0';
/* comment routing: each node × bot gets its own discussion, term = "node:<id> bot:<slug>", so every bot can filter its own feedback */
const BOTS = [
  { slug:'radar',      name:'AI 邊界雷達',     scope:'新問題、延伸、來源',      color:'#9db7ff' },
  { slug:'decomposer', name:'問題拆解師',      scope:'推演流程、問題類型',      color:'#f59e0b' },
  { slug:'director',   name:'影像導演',        scope:'影片與畫面',              color:'#ff7ae0' },
  { slug:'intp',       name:'INTP 鏡像研究員', scope:'關於 Merlin 自己的思考', color:'#7fe0a8' }
];
const botOf = s => BOTS.find(b => b.slug === s) || BOTS[0];
const KIND = { question:'主問題', extension:'延伸問題', direction:'🚀 新方向' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const T = t => TYPES[t] || TYPES['其他'];
const colorOf = n => n.kind === 'direction' ? DIR_COLOR : T(n.type).color;
const safeUrl = u => { u = String(u || '').trim(); return !u || /^https?:\/\/[^\s<>"']+$/i.test(u) || (/^[^\s:<>"'`]+$/u.test(u) && !u.startsWith('//')); };
const playable = u => !!u && safeUrl(u) && /\.(mp4|webm|m4v|mov|ogv)(\?|#|$)/i.test(u);
const conceptColor = c => (state.concepts && state.concepts[c] && state.concepts[c].color) || (CONCEPTS.defs[c] && CONCEPTS.defs[c].color) || '#9db7ff';

/* ---------- data ---------- */
function seedLite(){
  const nodes = [], now = 0;
  QUESTIONS.forEach(q => {
    const id = 'n_' + q.id;
    nodes.push({ id, brainId:'main', parentId:null, kind:'question', title:q.title, type:q.type, oneLiner:q.oneLiner, source:q.source, createdBy:'seed', createdAt:now,
      media:{ video:q.videoUrl || '', image:q.imageUrl || '' }, concepts:(CONCEPTS.tags[q.id] || []).slice() });
    (q.extensions || []).forEach((e, i) => nodes.push({ id:id + '_e' + i, brainId:'main', parentId:id, kind:'extension', title:e.q, type:e.type, oneLiner:'', source:null, createdBy:'seed', createdAt:now,
      media:{ video:'', image:'' }, concepts:(CONCEPTS.tags[q.id + ':e' + i] || []).slice() }));
  });
  return { brains:[{ id:'main', name:'AI 認知邊界', parentBrainId:null }], nodes, concepts:{} };
}
function seedKey(id){ const m = /^n_(q\d+)(?:_e(\d+))?$/.exec(id); return m ? (m[2] != null ? m[1] + ':e' + m[2] : m[1]) : null; }
function loadState(){
  let s = null; try { s = JSON.parse(localStorage.getItem(KEY)); } catch(e){}
  if (!s || !Array.isArray(s.nodes) || !Array.isArray(s.brains)) s = seedLite();
  const done = Array.isArray(s.seedExtras) ? s.seedExtras : [];
  (typeof SEED_EXTRAS !== 'undefined' ? SEED_EXTRAS : []).forEach(x => {
    if (done.includes(x.id) || s.nodes.some(n => n.id === x.id)) return;
    const p = s.nodes.find(n => n.id === x.parentId);
    s.nodes.push(Object.assign(JSON.parse(JSON.stringify(x)), { brainId:p ? p.brainId : 'main', parentId:p ? p.id : null, createdAt:Date.now() }));
  });
  s.nodes.forEach(n => {
    if (!n.media) n.media = { video:'', image:'' };
    applySeedMedia(n);
    if (n.kind === 'split') n.kind = 'extension';
    if (!Array.isArray(n.concepts)){ const k = seedKey(n.id); n.concepts = (k && CONCEPTS.tags[k] || []).slice(); }
  });
  s.concepts = s.concepts || {};
  return s;
}
let state = loadState();
const N = id => state.nodes.find(n => n.id === id);
const kids = id => state.nodes.filter(n => n.parentId === id);

const prefs = (() => { try { return Object.assign({ likes:{}, saves:{}, set:{}, bots:{} }, JSON.parse(localStorage.getItem(FKEY))); } catch(e){ return { likes:{}, saves:{}, set:{}, bots:{} }; } })();
prefs.bots = prefs.bots || {};
const set = Object.assign({ order:'tree', types:[], concepts:[], onlyVideo:false, onlySaved:false }, prefs.set);
prefs.set = set;
const savePrefs = () => { try { localStorage.setItem(FKEY, JSON.stringify(prefs)); } catch(e){} };

function treeOrder(){
  const out = [], seen = new Set(), bOrder = [];
  const walkB = b => { if (bOrder.includes(b)) return; bOrder.push(b); state.brains.filter(x => x.parentBrainId === b.id).forEach(walkB); };
  state.brains.filter(b => !b.parentBrainId || !state.brains.some(x => x.id === b.parentBrainId)).forEach(walkB);
  state.brains.forEach(walkB);
  const walk = n => { if (seen.has(n.id)) return; seen.add(n.id); out.push(n); kids(n.id).filter(k => k.brainId === n.brainId).forEach(walk); };
  bOrder.forEach(b => state.nodes.filter(n => n.brainId === b.id && (!n.parentId || !N(n.parentId) || N(n.parentId).brainId !== b.id)).forEach(walk));
  state.nodes.forEach(walk);
  return out;
}
function buildList(){
  let L = set.order === 'newest' ? state.nodes.map((n, i) => [n, i]).sort((a, b) => (b[0].createdAt || 0) - (a[0].createdAt || 0) || b[1] - a[1]).map(x => x[0]) : treeOrder();
  if (set.types.length) L = L.filter(n => set.types.includes(n.type) || (n.kind === 'direction' && set.types.includes('__dir')));
  if (set.concepts.length) L = L.filter(n => n.concepts.some(c => set.concepts.includes(c)));
  if (set.onlyVideo) L = L.filter(n => playable(n.media.video));
  if (set.onlySaved) L = L.filter(n => prefs.saves[n.id]);
  return L;
}

/* ---------- render ---------- */
const feed = $('#feed');
let list = [], cur = 0, soundOn = false;
function credit(n){
  const s = n.source;
  if (s && (s.who || s.outlet)) return { short:'📎 ' + (s.who || s.outlet), html:`📎 ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.who || '來源')} ↗</a>` : esc(s.who || '')}${[s.outlet, s.date].filter(Boolean).length ? ' · ' + esc([s.outlet, s.date].filter(Boolean).join(' · ')) : ''}` };
  const p = N(n.parentId);
  if (p){ const ps = p.source && p.source.who ? '（' + p.source.who + '）' : ''; return { short:'🧬 延伸自〈' + p.title + '〉', html:`🧬 延伸自〈${esc(p.title)}〉${esc(ps)}` }; }
  return { short: n.createdBy === 'bot' ? '🤖 bot 提出' : n.createdBy === 'seed' ? '' : '⭐ Merlin 提出', html: n.createdBy === 'bot' ? '🤖 bot 提出' : n.createdBy === 'seed' ? '' : '⭐ Merlin 提出' };
}
function itemHTML(n, i){
  const c = colorOf(n), v = n.media.video, hasV = playable(v), ext = !hasV && v && safeUrl(v) ? v : '';
  const img = n.media.image && safeUrl(n.media.image) ? n.media.image : '';
  const ch = kids(n.id), cr = credit(n);
  const caption = n.caption || n.oneLiner || '';
  const stage = hasV ? `<video data-src="${esc(v)}" muted loop playsinline preload="none" ${img ? `poster="${esc(img)}"` : ''}></video>`
    : `${img ? `<img class="bgimg" src="${esc(img)}" alt="" loading="lazy">` : ''}<div class="ph" ${img ? 'style="background:linear-gradient(transparent,rgba(5,6,15,.6))"' : ''}><div class="dots"></div>
        <div class="ring"><div class="orb"><span>${n.kind === 'direction' ? '🚀' : T(n.type).icon}</span></div></div>
        <h3>${esc(n.title)}</h3>
        <span class="wip"><i></i>🎬 影片製作中</span>${ext ? `<a class="ext" href="${esc(ext)}" target="_blank" rel="noopener">▶ 觀看原始影片 ↗</a>` : ''}</div>`;
  return `<section class="it ${hasV ? 'hasVideo' : 'noVideo'} ${n.kind === 'direction' ? 'dir' : ''} ${hasV && n.media.subtitlesBurnedIn ? 'subs' : ''}" data-i="${i}" data-id="${esc(n.id)}" style="--c:${c}">
    <div class="col">${stage}<div class="shade"></div><div class="flash"></div>${hasV ? '<div class="prog"></div>' : ''}
      <div class="cap">
        <div class="row"><span class="tag" style="--c:${T(n.type).color}">${T(n.type).icon} ${esc(n.type)}</span><span class="tag k ${n.kind}">${KIND[n.kind] || esc(n.kind)}</span>${n.bot ? `<span class="tag" style="--c:#7fe0a8">🤖 ${esc(n.bot)}</span>` : ''}</div>
        <h2 data-capt>${esc(n.title)}</h2>
        ${caption || cr.html ? `<div class="note" data-note>${esc(caption)}${caption ? ' <span class="more">…更多</span>' : ''}<span class="cred">${cr.html}</span></div>` : ''}
        ${n.concepts.length ? `<div class="chips">${n.concepts.map(x => `<button class="chip" data-concept="${esc(x)}" style="--cc:${esc(conceptColor(x))}">${esc(x)}</button>`).join('')}</div>` : ''}
        ${cr.short ? `<div class="src1">${esc(cr.short)}</div>` : ''}
      </div>
      <div class="rail">
        <a class="rb brain" href="index.html#node=${encodeURIComponent(n.id)}" title="在 3D 大腦打開"><b>🧠</b>大腦</a>
        <button class="rb" data-act="branches" title="子問題／新方向"><b>🌿</b>${ch.length}</button>
        <button class="rb like ${prefs.likes[n.id] ? 'on' : ''}" data-act="like" title="喜歡"><b>❤</b>喜歡</button>
        <button class="rb save ${prefs.saves[n.id] ? 'on' : ''}" data-act="save" title="收藏"><b>🔖</b>收藏</button>
        <button class="rb" data-act="comments" title="留言"><b>💬</b>留言</button>
        ${hasV ? `<button class="rb" data-act="sound" title="聲音"><b>${soundOn ? '🔊' : '🔇'}</b>聲音</button>` : ''}
      </div>
    </div></section>`;
}
let io;
function render(keepId){
  list = buildList();
  feed.innerHTML = list.map(itemHTML).join('');
  $('#none').classList.toggle('on', !list.length);
  $('#bSet').classList.toggle('on', set.types.length + set.concepts.length > 0 || set.onlyVideo || set.onlySaved);
  if (io) io.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && e.intersectionRatio >= 0.6) activate(+e.target.dataset.i); }), { root:feed, threshold:[0.6] });
  feed.querySelectorAll('.it').forEach(el => io.observe(el));
  let i = keepId ? list.findIndex(n => n.id === keepId) : 0; if (i < 0) i = 0;
  cur = -1; go(i, true); activate(i);
}
function itemEl(i){ return feed.children[i]; }
function go(i, instant){
  if (!list.length) return; i = Math.max(0, Math.min(list.length - 1, i));
  feed.scrollTo({ top:i * feed.clientHeight, behavior:instant ? 'instant' : 'smooth' });
}
function activate(i){
  if (i === cur || !list[i]) return; cur = i;
  $('#cnt').textContent = `${i + 1} / ${list.length}`;
  const id = list[i].id;
  $('#toBrain').href = 'index.html#node=' + encodeURIComponent(id);
  history.replaceState(null, '', '#node=' + encodeURIComponent(id));
  [...feed.children].forEach((el, j) => {
    const v = el.querySelector('video'); if (!v) return;
    if (Math.abs(j - i) <= 1 && !v.src) { v.src = v.dataset.src; }           // preload neighbours only
    if (Math.abs(j - i) > 2 && v.src){ v.pause(); v.removeAttribute('src'); v.load(); }
    if (j === i){ v.muted = !soundOn; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
    else v.pause();
  });
}
function flash(el, s){ const f = el.querySelector('.flash'); f.textContent = s; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
function toast(m){ const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2000); }
function setSound(on){ soundOn = on; feed.querySelectorAll('[data-act=sound] b').forEach(b => b.textContent = on ? '🔊' : '🔇'); const v = itemEl(cur)?.querySelector('video'); if (v){ v.muted = !on; if (on || v.paused) v.play().catch(() => { soundOn = false; v.muted = true; feed.querySelectorAll('[data-act=sound] b').forEach(b => b.textContent = '🔇'); v.play().catch(() => {}); toast('瀏覽器擋下了聲音，再點一次試試'); }); } }
function togglePlay(el){ const v = el.querySelector('video'); if (!v) return; if (v.muted && !soundOn){ setSound(true); flash(el, '🔊'); return; } if (v.paused){ v.play().catch(() => {}); flash(el, '▶'); } else { v.pause(); flash(el, '⏸'); } }
function toggleLike(id, el, force){ const on = force ?? !prefs.likes[id]; if (on) prefs.likes[id] = Date.now(); else delete prefs.likes[id]; savePrefs(); el.querySelector('.like').classList.toggle('on', on); if (on) flash(el, '❤️'); }

/* ---------- interaction ---------- */
let tapT = 0;
feed.addEventListener('click', e => {
  const el = e.target.closest('.it'); if (!el) return; const id = el.dataset.id;
  const act = e.target.closest('[data-act]'); const chip = e.target.closest('[data-concept]'); const note = e.target.closest('[data-note]');
  if (e.target.closest('a')) return;
  if (act){ const a = act.dataset.act;
    if (a === 'like') toggleLike(id, el);
    else if (a === 'save'){ const on = !prefs.saves[id]; if (on) prefs.saves[id] = Date.now(); else delete prefs.saves[id]; savePrefs(); act.classList.toggle('on', on); toast(on ? '🔖 已收藏' : '已取消收藏'); }
    else if (a === 'branches') openBranches(id);
    else if (a === 'comments') openComments(id);
    else if (a === 'sound') setSound(!soundOn);
    return; }
  if (chip){ set.concepts = [chip.dataset.concept]; savePrefs(); render(id); toast('🧵 只看「' + chip.dataset.concept + '」'); return; }
  const capt = e.target.closest('[data-capt]');
  if (capt && el.classList.contains('subs')){ el.querySelector('.cap').classList.toggle('open'); return; }
  if (note){ note.classList.toggle('open'); const m = note.querySelector('.more'); if (m) m.textContent = note.classList.contains('open') ? ' 收起' : '…更多'; return; }
  if (e.target.closest('.rail,.cap')) return;
  if (tapT){ clearTimeout(tapT); tapT = 0; toggleLike(id, el, true); return; }            // double tap = like
  tapT = setTimeout(() => { tapT = 0; togglePlay(el); }, 240);
});
let wheelLock = 0, wheelAcc = 0;
feed.addEventListener('wheel', e => {
  if (document.querySelector('.sheet.on')) return;
  e.preventDefault(); const now = performance.now(); wheelAcc += e.deltaY;
  if (now < wheelLock || Math.abs(wheelAcc) < 30) return;
  go(cur + (wheelAcc > 0 ? 1 : -1)); wheelAcc = 0; wheelLock = now + 550;
}, { passive:false });
addEventListener('keydown', e => {
  if (e.target.closest('input,textarea')) return;
  if (e.key === 'Escape') return closeSheets();
  if (document.querySelector('.sheet.on')) return;
  if (['ArrowDown', 'PageDown', 'j'].includes(e.key)){ e.preventDefault(); go(cur + 1); }
  else if (['ArrowUp', 'PageUp', 'k'].includes(e.key)){ e.preventDefault(); go(cur - 1); }
  else if (e.key === ' '){ e.preventDefault(); const el = itemEl(cur); if (el) togglePlay(el); }
  else if (e.key === 'm' || e.key === 'M') setSound(!soundOn);
  else if (e.key === 'l' || e.key === 'L'){ const el = itemEl(cur); if (el) toggleLike(el.dataset.id, el); }
});
feed.addEventListener('timeupdate', e => { const v = e.target; const p = v.closest('.it')?.querySelector('.prog'); if (p && v.duration) p.style.width = (v.currentTime / v.duration * 100) + '%'; }, true);

/* ---------- sheets ---------- */
function openSheet(id){ closeSheets(true); $('#' + id).classList.add('on'); $('#scrim').classList.add('on'); }
function closeSheets(keep){ document.querySelectorAll('.sheet.on').forEach(s => s.classList.remove('on')); if (!keep) $('#scrim').classList.remove('on'); }
$('#scrim').onclick = () => closeSheets();
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeSheets());
document.querySelectorAll('.sheet').forEach(sh => { let y0 = null; sh.addEventListener('touchstart', e => { if (sh.querySelector('.bd').scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive:true });
  sh.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 80) closeSheets(); y0 = null; }); });

function openBranches(id){
  const n = N(id); const ch = kids(id); const subQ = ch.filter(k => k.kind !== 'direction'), dirs = ch.filter(k => k.kind === 'direction'); const p = N(n.parentId);
  const li = k => `<a href="index.html#node=${encodeURIComponent(k.id)}" data-jump="${esc(k.id)}" class="${k.kind === 'direction' ? 'dir' : ''}" style="--c:${colorOf(k)}"><i></i><span>${esc(k.title)}<small>${list.some(x => x.id === k.id) ? '在短影音中看' : '在 3D 大腦打開'}</small></span></a>`;
  $('#brT').textContent = '🌿 ' + n.title;
  $('#brB').innerHTML = `<div class="brl">${p ? `<div class="lbl">🧬 分裂自</div>${li(p)}` : ''}
    <div class="lbl">🌿 子問題 ${subQ.length}</div>${subQ.map(li).join('') || '<div class="empty">還沒有子問題</div>'}
    <div class="lbl">🚀 新方向 ${dirs.length}</div>${dirs.map(li).join('') || '<div class="empty">還沒有提出新方向</div>'}</div>`;
  $('#brB').querySelectorAll('[data-jump]').forEach(a => a.onclick = e => { const j = list.findIndex(x => x.id === a.dataset.jump); if (j >= 0){ e.preventDefault(); closeSheets(); go(j); } });
  openSheet('brSheet');
}
let gcTerm = null, cmId = null;
const defaultBot = n => prefs.bots[n.id] || (playable(n.media.video) ? 'director' : 'radar');
function openComments(id, bot){
  const n = N(id); cmId = id; $('#cmT').textContent = '💬 ' + n.title;
  bot = botOf(bot || defaultBot(n)).slug;
  $('#botPick').innerHTML = BOTS.map(b => `<button class="opt ${b.slug === bot ? 'on' : ''}" data-bot="${b.slug}" style="--oc:${b.color}">${esc(b.name)}</button>`).join('');
  const B = botOf(bot);
  $('#botHint').innerHTML = `留言將交給：${esc(B.name)}（${esc(B.scope)}）<small>這一串只給 ${esc(B.name)} 看；換 bot 會切到另一串留言</small>`;
  const term = 'node:' + id + ' bot:' + bot;
  if (gcTerm !== term){
    gcTerm = term; $('#gcWarn').classList.remove('on');
    const box = $('#giscus'); box.innerHTML = '';
    const s = document.createElement('script');
    const attrs = { src:'https://giscus.app/client.js', 'data-repo':GISCUS.repo, 'data-repo-id':GISCUS.repoId, 'data-category':GISCUS.category, 'data-category-id':GISCUS.categoryId,
      'data-mapping':'specific', 'data-term':term, 'data-strict':'1', 'data-reactions-enabled':'1', 'data-emit-metadata':'0', 'data-input-position':'top',
      'data-theme':'dark_dimmed', 'data-lang':'zh-TW', 'data-loading':'lazy', crossorigin:'anonymous' };
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v)); s.async = true;
    box.appendChild(s);
  }
  if (!$('#cmSheet').classList.contains('on')) openSheet('cmSheet');
}
$('#botPick').addEventListener('click', e => { const b = e.target.closest('[data-bot]'); if (!b || !cmId) return; prefs.bots[cmId] = b.dataset.bot; savePrefs(); openComments(cmId, b.dataset.bot); });
addEventListener('message', e => {
  if (e.origin !== 'https://giscus.app' || !e.data || typeof e.data !== 'object' || !e.data.giscus) return;
  const err = e.data.giscus.error; if (err && !/Discussion not found/i.test(err)) $('#gcWarn').classList.add('on');
});

function renderSettings(){
  const opt = (k, label, on, c) => `<button class="opt ${on ? 'on' : ''}" data-k="${esc(k)}" ${c ? `style="--oc:${esc(c)}"` : ''}>${label}</button>`;
  $('#oOrder').innerHTML = opt('order:tree', '🌳 大腦樹狀順序', set.order === 'tree') + opt('order:newest', '🆕 最新', set.order === 'newest');
  $('#oShow').innerHTML = opt('onlyVideo', `🎬 只看有影片（${state.nodes.filter(n => playable(n.media.video)).length}）`, set.onlyVideo) + opt('onlySaved', `🔖 只看收藏（${Object.keys(prefs.saves).filter(N).length}）`, set.onlySaved);
  const types = [...new Set(state.nodes.map(n => n.type))];
  $('#oType').innerHTML = opt('types:*', '全部', !set.types.length) + types.map(t => opt('types:' + t, T(t).icon + ' ' + esc(t), set.types.includes(t), T(t).color)).join('') + opt('types:__dir', '🚀 新方向', set.types.includes('__dir'), DIR_COLOR);
  const cs = [...new Set(state.nodes.flatMap(n => n.concepts))];
  $('#oConc').innerHTML = opt('concepts:*', '全部', !set.concepts.length) + cs.map(c => opt('concepts:' + c, esc(c), set.concepts.includes(c), conceptColor(c))).join('');
}
$('#setSheet').addEventListener('click', e => {
  const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k; const [f, v] = k.split(/:(.*)/s);
  if (f === 'order') set.order = v;
  else if (f === 'onlyVideo' || f === 'onlySaved') set[f] = !set[f];
  else { if (v === '*') set[f] = []; else set[f] = set[f].includes(v) ? set[f].filter(x => x !== v) : [...set[f], v]; }
  savePrefs(); renderSettings(); render(list[cur] && list[cur].id);
});
$('#bSet').onclick = () => { renderSettings(); openSheet('setSheet'); };
$('#clearF').onclick = () => { set.types = []; set.concepts = []; set.onlyVideo = false; set.onlySaved = false; savePrefs(); render(); };

/* ---------- deep link + sync with the brain ---------- */
function hashId(){ const m = /(?:^#|&)node=([^&]+)/.exec(location.hash); return m ? decodeURIComponent(m[1]) : null; }
function openHash(){
  const id = hashId(); if (!id || (list[cur] && list[cur].id === id)) return;
  if (!N(id)) return toast('找不到這個節點');
  if (!list.some(n => n.id === id)){ set.types = []; set.concepts = []; set.onlyVideo = false; set.onlySaved = false; savePrefs(); toast('已顯示全部'); }
  render(id);
}
addEventListener('hashchange', openHash);
addEventListener('storage', e => { if (e.key === KEY){ state = loadState(); render(list[cur] && list[cur].id); } });
addEventListener('pageshow', e => { if (e.persisted){ state = loadState(); render(list[cur] && list[cur].id); } });
document.addEventListener('visibilitychange', () => { const v = itemEl(cur)?.querySelector('video'); if (v){ if (document.hidden) v.pause(); else v.play().catch(() => {}); } });
addEventListener('resize', () => go(cur, true));

{ const h0 = hashId();
  if (h0 && N(h0) && !buildList().some(n => n.id === h0)){ set.types = []; set.concepts = []; set.onlyVideo = false; set.onlySaved = false; savePrefs(); }
  render(h0); }
feed.focus({ preventScroll:true });
window.AIFeed = { list:() => list.map(n => n.id), current:() => list[cur] && list[cur].id, index:() => cur, go, reload:() => { state = loadState(); render(list[cur] && list[cur].id); }, settings:set, giscus:GISCUS, bots:BOTS, openComments };
document.body.dataset.ready = '1';
