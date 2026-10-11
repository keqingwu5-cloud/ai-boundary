/* 🎯 知識掌握度（knowledge-score.js）
   被動記錄你在大腦（index.html）與短影音（feed.html）看過哪些節點、停留多久、影片看了多少、回訪幾次，
   算出每個節點 0–100 的掌握度，再平均成各主題（類型）與整體分數。
   - 只存在這台裝置的瀏覽器 localStorage['aiBrain.knowledge.v1']，不連網、不上傳。
   - 不改動大腦或 feed 的資料；只聽事件（AIBrain.on('select'/'close'/'change')、<video> 的 timeupdate、AIFeed.current()）。
   - 介面：工具列上一顆小徽章（顯示整體分數），點了才打開「說明區」。不會自動跳出任何東西。
   公開 API：window.KnowledgeScore = { compute(), raw(), open(), close(), reset() } */
try { await window.AI_DATA_READY; } catch(e){}   // 種子資料（data.js 從 content/*.json 載入）
(() => {
  const KS = 'aiBrain.knowledge.v1', BRAIN_KEY = 'aiBrain.v1', FEED_KEY = 'aiBrain.feed.v1';
  const PAGE = document.getElementById('c') ? 'brain' : 'feed';
  const W = { open:15, dwell:30, video:30, revisit:15, act:10 };          // 各項滿分（加總 100）
  const DWELL_T = { question:60, other:30 };                               // 停留滿分所需秒數
  const VISIT_GAP = 30 * 60 * 1000;                                        // 間隔 30 分鐘以上才算一次新的造訪
  const IDLE = 90 * 1000;                                                  // 90 秒沒有任何操作（且沒在播影片）就不再累計停留
  const FEED_OPEN_MS = 3000;                                               // 短影音停在同一格 3 秒才算「看過」
  const ACT_KINDS = ['counter', 'status', 'concept', 'pattern', 'split', 'direction', 'media', 'subbrain'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const playable = u => !!u && /\.(mp4|webm|m4v|mov|ogv)(\?|#|$)/i.test(String(u));
  const TY = t => (typeof TYPES !== 'undefined' && (TYPES[t] || TYPES['其他'])) || { color:'#64748b', icon:'✳️' };

  /* ---------- storage (read-modify-write, so the two pages never clobber each other) ---------- */
  const read = () => { try { const s = JSON.parse(localStorage.getItem(KS)); if (s && s.nodes) return s; } catch(e){} return { v:1, since:Date.now(), nodes:{} }; };
  const write = s => { try { localStorage.setItem(KS, JSON.stringify(s)); } catch(e){} };
  const rec = (s, id) => s.nodes[id] || (s.nodes[id] = { o:0, d:0, vis:0, lv:0, a:0, vb:'', vc:0 });
  const BUCKETS = 100, HEX = BUCKETS / 4;
  const orHex = (a, b) => { a = (a || '').padEnd(HEX, '0'); b = (b || '').padEnd(HEX, '0'); let o = ''; for (let i = 0; i < HEX; i++) o += (parseInt(a[i], 16) | parseInt(b[i], 16)).toString(16); return o; };
  const coverage = h => { let c = 0; for (const ch of (h || '')) { let v = parseInt(ch, 16) || 0; while (v){ c += v & 1; v >>= 1; } } return c / BUCKETS; };

  const pend = {};                                       // id → { d, vb(bit array), vc, a }
  const P = id => pend[id] || (pend[id] = { d:0, bits:null, vc:0, a:0 });
  function flush(){
    const ids = Object.keys(pend); if (!ids.length) return;
    const s = read(), now = Date.now();
    ids.forEach(id => {
      const p = pend[id], r = rec(s, id);
      r.d += Math.round(p.d); r.vc += p.vc; r.a += p.a;
      if (p.bits){ let h = ''; for (let i = 0; i < HEX; i++){ let v = 0; for (let j = 0; j < 4; j++) if (p.bits[i * 4 + j]) v |= 1 << j; h += v.toString(16); } r.vb = orHex(r.vb, h); }
      if (p.d > 0) r.lv = now;
    });
    Object.keys(pend).forEach(k => delete pend[k]);
    write(s); refresh();
  }
  function registerOpen(id){
    flush();
    const s = read(), r = rec(s, id), now = Date.now();
    r.o++; if (!r.lv || now - r.lv > VISIT_GAP) r.vis++; r.lv = now; if (!r.f) r.f = now;
    write(s); refresh();
  }

  /* ---------- tracking ---------- */
  let cur = null, curSince = 0, curOpened = false, lastInput = Date.now(), lastTick = performance.now();
  ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => addEventListener(ev, () => { lastInput = Date.now(); }, { capture:true, passive:true }));
  function setCur(id, openNow){
    if (id === cur) return;
    flush(); cur = id || null; curSince = Date.now(); curOpened = false;
    if (cur && openNow){ curOpened = true; registerOpen(cur); }
  }
  const videoPlaying = () => [...document.querySelectorAll('video')].some(v => !v.paused && !v.ended);
  setInterval(() => {
    const t = performance.now(), dt = Math.min(2000, t - lastTick); lastTick = t;
    if (PAGE === 'feed' && window.AIFeed){ let id = null; try { id = AIFeed.current() || null; } catch(e){} if (id !== cur) setCur(id, false); }
    if (!cur || document.hidden) return;
    if (Date.now() - lastInput > IDLE && !videoPlaying()) return;
    P(cur).d += dt;
    if (!curOpened && Date.now() - curSince >= FEED_OPEN_MS){ curOpened = true; registerOpen(cur); }
  }, 1000);
  setInterval(flush, 5000);
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  /* video coverage: mark 1% buckets only while playing normally (seeking ahead doesn't count) */
  const lastT = new WeakMap();
  const vidNode = v => PAGE === 'feed' ? (v.closest('.it') && v.closest('.it').dataset.id) : (v.closest('#panel') ? cur : null);
  document.addEventListener('timeupdate', e => {
    const v = e.target; if (!(v instanceof HTMLMediaElement)) return;
    const id = vidNode(v), d = v.duration, t = v.currentTime, prev = lastT.get(v); lastT.set(v, t);
    if (!id || !isFinite(d) || d <= 0 || v.paused || prev == null) return;
    const dt = t - prev; if (dt <= 0 || dt > 1.6) return;
    const p = P(id); if (!p.bits) p.bits = new Array(BUCKETS).fill(0);
    for (let b = Math.floor(prev / d * BUCKETS); b <= Math.min(BUCKETS - 1, Math.floor(t / d * BUCKETS)); b++) p.bits[b] = 1;
    if (t / d > 0.985) for (let b = Math.floor(prev / d * BUCKETS); b < BUCKETS; b++) p.bits[b] = 1;
  }, true);
  document.addEventListener('seeking', e => { if (e.target instanceof HTMLMediaElement) lastT.delete(e.target); }, true);
  document.addEventListener('emptied', e => { if (e.target instanceof HTMLMediaElement) lastT.delete(e.target); }, true);
  document.addEventListener('ended', e => { const v = e.target; if (!(v instanceof HTMLMediaElement)) return; const id = vidNode(v); if (id) P(id).vc++; }, true);

  /* brain hooks */
  if (PAGE === 'brain'){
    const hook = () => {
      if (!window.AIBrain || !AIBrain.on) return setTimeout(hook, 300);
      AIBrain.on('select', d => d && setCur(d.id, true));
      AIBrain.on('close', () => setCur(null));
      AIBrain.on('change', d => { const id = d && d.payload && d.payload.nodeId; if (id && ACT_KINDS.includes(d.action)){ P(id).a++; flush(); } else setTimeout(refresh, 400); });
    };
    hook();
  }
  addEventListener('storage', e => { if (e.key === KS || e.key === BRAIN_KEY || e.key === FEED_KEY) refresh(); });

  /* ---------- nodes (same data both pages read) ---------- */
  function nodeList(){
    let s = null; try { s = JSON.parse(localStorage.getItem(BRAIN_KEY)); } catch(e){}
    let L = [];
    if (s && Array.isArray(s.nodes)) L = s.nodes.map(n => ({ id:n.id, title:n.title, type:n.type, kind:n.kind === 'split' ? 'extension' : n.kind, parentId:n.parentId, video:(n.media && n.media.video) || '' }));
    else if (typeof QUESTIONS !== 'undefined') QUESTIONS.forEach(q => {
      L.push({ id:'n_' + q.id, title:q.title, type:q.type, kind:'question', parentId:null, video:q.videoUrl || '' });
      (q.extensions || []).forEach((e, i) => L.push({ id:'n_' + q.id + '_e' + i, title:e.q, type:e.type, kind:'extension', parentId:'n_' + q.id, video:'' }));
    });
    const done = s && Array.isArray(s.seedExtras) ? s.seedExtras : [];
    (typeof SEED_EXTRAS !== 'undefined' ? SEED_EXTRAS : []).forEach(x => { if (!done.includes(x.id) && !L.some(n => n.id === x.id)) L.push({ id:x.id, title:x.title, type:x.type, kind:x.kind, parentId:x.parentId, video:(x.media && x.media.video) || '' }); });
    const SM = typeof SEED_MEDIA !== 'undefined' ? SEED_MEDIA : {};
    L.forEach(n => { if (!playable(n.video) && SM[n.id] && SM[n.id].video) n.video = SM[n.id].video; n.hasVideo = playable(n.video); });
    return L;
  }

  /* ---------- scoring ---------- */
  function scoreNode(n, r, liked){
    r = r || {};
    const dwellMax = n.hasVideo ? W.dwell : W.dwell + W.video;
    const target = n.kind === 'question' ? DWELL_T.question : DWELL_T.other;
    const cov = coverage(r.vb);
    const parts = {
      open: r.o > 0 ? W.open : 0,
      dwell: dwellMax * Math.min(1, (r.d || 0) / 1000 / target),
      video: n.hasVideo ? W.video * Math.min(1, cov / 0.9) : 0,
      revisit: 5 * Math.min(3, Math.max(0, (r.vis || 0) - 1)),
      act: 5 * Math.min(2, (r.a || 0) + liked)
    };
    const total = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
    return { total:Math.min(100, total), parts, cov, dwellSec:Math.round((r.d || 0) / 1000), visits:r.vis || 0, opens:r.o || 0, target };
  }
  function compute(){
    const s = read(), nodes = nodeList();
    let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(FEED_KEY)) || {}; } catch(e){}
    const likes = prefs.likes || {}, saves = prefs.saves || {};
    // include not-yet-flushed activity so the badge feels live
    const live = JSON.parse(JSON.stringify(s));
    Object.entries(pend).forEach(([id, p]) => { const r = rec(live, id); r.d += p.d; r.a += p.a; });
    const per = nodes.map(n => Object.assign({ node:n }, scoreNode(n, live.nodes[n.id], (likes[n.id] ? 1 : 0) + (saves[n.id] ? 1 : 0))));
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y.total, 0) / a.length) : 0;
    const topics = {};
    per.forEach(p => { const t = p.node.type || '其他'; (topics[t] = topics[t] || []).push(p); });
    return {
      overall: avg(per), nodes: per,
      topics: Object.entries(topics).map(([type, a]) => ({ type, score:avg(a), explored:a.filter(p => p.opens > 0).length, total:a.length })),
      explored: per.filter(p => p.opens > 0).length,
      videos: per.filter(p => p.node.hasVideo).length, videosDone: per.filter(p => p.node.hasVideo && p.cov >= 0.9).length,
      since: s.since
    };
  }

  /* ---------- UI ---------- */
  const css = `
.ks-badge{flex:none;width:40px;height:40px;border-radius:50%;border:1px solid var(--line,rgba(160,180,255,.18));cursor:pointer;padding:0;position:relative;display:grid;place-items:center;
  background:conic-gradient(var(--ksc,#7fe0a8) calc(var(--ksp,0) * 1%),rgba(255,255,255,.07) 0);color:#eef0ff;font:700 11.5px/1 "Noto Sans TC",system-ui,sans-serif;transition:box-shadow .2s}
.ks-badge:before{content:"";position:absolute;inset:3px;border-radius:50%;background:rgba(10,13,32,.92)}
.ks-badge span{position:relative}
.ks-badge:hover,.ks-badge.on{box-shadow:0 0 14px rgba(157,183,255,.55);border-color:#9db7ff}
.ks-badge.ks-float{position:fixed;left:12px;bottom:140px;z-index:25}
@media (max-width:700px),(pointer:coarse){.ks-badge{width:44px;height:44px;font-size:12px}}   /* [proto] 44px tap target (was 31px) */
.ks-panel{position:fixed;z-index:45;left:10px;top:66px;bottom:10px;width:350px;border-radius:20px;padding:14px 14px 20px;overflow:auto;color:#eef0ff;font-family:"Noto Sans TC",system-ui,sans-serif;
  background:rgba(12,15,34,.9);border:1px solid var(--line,rgba(160,180,255,.18));backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);box-shadow:0 0 30px rgba(110,130,255,.12);
  transform:translateX(-112%);visibility:hidden;transition:transform .45s cubic-bezier(.2,.8,.2,1),visibility 0s .45s}
.ks-panel.open{transform:none;visibility:visible;transition:transform .45s cubic-bezier(.2,.8,.2,1)}
.ks-panel header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.ks-panel h3{margin:0;font-size:15px;flex:1}
.ks-x{width:30px;height:30px;border-radius:50%;border:1px solid var(--line,rgba(160,180,255,.18));background:rgba(255,255,255,.05);cursor:pointer;color:inherit}
.ks-big{display:flex;align-items:center;gap:14px;margin:6px 0 4px}
.ks-ring{width:74px;height:74px;border-radius:50%;flex:none;display:grid;place-items:center;background:conic-gradient(var(--ksc) calc(var(--ksp) * 1%),rgba(255,255,255,.08) 0);position:relative}
.ks-ring:before{content:"";position:absolute;inset:6px;border-radius:50%;background:#0c0f22}
.ks-ring b{position:relative;font-size:24px;font-weight:900}
.ks-ring small{position:absolute;bottom:13px;font-size:9.5px;color:#a3abd6}
.ks-sum{font-size:12.5px;color:#c9d0f0;line-height:1.7}
.ks-sum em{font-style:normal;color:#f5c451}
.ks-lbl{font-size:11.5px;color:#a3abd6;font-weight:700;letter-spacing:1px;margin:14px 0 6px}
.ks-row{display:grid;grid-template-columns:1fr 34px;gap:2px 8px;align-items:center;font-size:12.5px;margin-bottom:7px}
.ks-row small{color:#8f98c4;font-size:11px;margin-left:4px}
.ks-row b{text-align:right;font-size:12.5px}
.ks-bar{grid-column:1/-1;height:4px;border-radius:2px;background:rgba(255,255,255,.07);overflow:hidden}
.ks-bar i{display:block;height:100%;width:calc(var(--p) * 1%);background:var(--c);box-shadow:0 0 8px var(--c)}
.ks-list{display:grid;gap:4px}
.ks-list a{display:flex;gap:7px;align-items:flex-start;font-size:12.5px;line-height:1.45;text-decoration:none;color:#dfe5ff;padding:5px 8px;border-radius:10px;border:1px solid rgba(160,180,255,.12);background:rgba(255,255,255,.03)}
.ks-list a:hover{border-color:#9db7ff}
.ks-list a i{flex:none;width:8px;height:8px;border-radius:50%;margin-top:5px;background:var(--c);box-shadow:0 0 6px var(--c)}
.ks-list a span{flex:1}
.ks-list a em{font-style:normal;color:#8f98c4;font-size:11px;white-space:nowrap}
.ks-more{font-size:11.5px;color:#8f98c4;border:none;background:none;cursor:pointer;padding:2px 0}
.ks-how{font-size:12.5px;color:#c9d0f0;line-height:1.7;margin:0;padding-left:18px}
.ks-how b{color:#eef0ff}
.ks-note{font-size:11.5px;color:#8f98c4;line-height:1.6;margin:8px 0 0}
.ks-empty{font-size:12px;color:#8f98c4}
.ks-reset{margin-top:14px;border:1px solid rgba(255,140,140,.35);background:rgba(255,120,120,.06);color:#ffb0b0;border-radius:99px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit}
@media (max-width:700px){.ks-panel{left:8px;right:8px;width:auto;top:auto;bottom:8px;max-height:70vh;transform:translateY(115%)}}
`;
  const st = document.createElement('style'); st.id = 'ks-style'; st.textContent = css; document.head.appendChild(st);

  const badge = document.createElement('button');
  badge.className = 'ks-badge'; badge.type = 'button'; badge.setAttribute('aria-label', '知識掌握度說明');
  badge.innerHTML = '<span>0</span>';
  const anchor = PAGE === 'brain' ? document.getElementById('bHist') : document.getElementById('bSound');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(badge, anchor);
  else { badge.classList.add('ks-float'); document.body.appendChild(badge); }

  const panel = document.createElement('aside');
  panel.className = 'ks-panel'; panel.setAttribute('aria-label', '知識掌握度說明區');
  document.body.appendChild(panel);

  const colorFor = v => v >= 80 ? '#7fe0a8' : v >= 50 ? '#9db7ff' : v >= 20 ? '#f5c451' : '#ff9a9a';
  const verdict = v => v >= 80 ? '已經熟悉整張認知地圖，可以開始提出自己的反證和新方向。'
    : v >= 50 ? '掌握了大部分內容，剩下的節點補一補就很完整。'
    : v >= 20 ? '輪廓已經出來了，還有不少節點和影片沒看。'
    : v > 0 ? '剛起步：點開幾個節點、看完一集，分數就會往上長。' : '還沒有紀錄。正常使用就好，分數會自己累積。';
  let showAllTodo = false, lastSig = '';
  function render(){
    const R = compute(), top = panel.scrollTop;
    const todo = R.nodes.filter(p => p.opens === 0), vids = R.nodes.filter(p => p.node.hasVideo && p.cov < 0.9);
    const known = R.nodes.filter(p => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);
    const item = (p, extra) => `<a href="#node=${encodeURIComponent(p.node.id)}" data-ks-go="${esc(p.node.id)}" style="--c:${p.node.kind === 'direction' ? '#ff7ae0' : TY(p.node.type).color}"><i></i><span>${esc(p.node.title)}</span><em>${extra}</em></a>`;
    const todoShown = showAllTodo ? todo : todo.slice(0, 8);
    panel.innerHTML = `
      <header><h3>🎯 知識掌握度・說明區</h3><button class="ks-x" data-ks-x title="關閉">✕</button></header>
      <div class="ks-big"><div class="ks-ring" style="--ksc:${colorFor(R.overall)};--ksp:${R.overall}"><b>${R.overall}</b><small>/ 100</small></div>
        <div class="ks-sum">已探索 <em>${R.explored}</em> / ${R.nodes.length} 個節點<br>影片看完 <em>${R.videosDone}</em> / ${R.videos} 支<br>${esc(verdict(R.overall))}</div></div>
      <div class="ks-lbl">📚 各主題</div>
      ${R.topics.map(t => `<div class="ks-row"><span>${TY(t.type).icon} ${esc(t.type)}<small>${t.explored}/${t.total} 個節點</small></span><b>${t.score}</b><div class="ks-bar" style="--c:${TY(t.type).color};--p:${t.score}"><i></i></div></div>`).join('')}
      ${known.length ? `<div class="ks-lbl">✦ 掌握最多</div><div class="ks-list">${known.map(p => item(p, p.total + ' 分')).join('')}</div>` : ''}
      <div class="ks-lbl">🧭 還沒探索 ${todo.length}</div>
      ${todo.length ? `<div class="ks-list">${todoShown.map(p => item(p, p.node.hasVideo ? '🎬' : (p.node.kind === 'question' ? '主問題' : p.node.kind === 'direction' ? '新方向' : '延伸'))).join('')}</div>${todo.length > 8 ? `<button class="ks-more" data-ks-more>${showAllTodo ? '收起' : `顯示全部 ${todo.length} 個 ▾`}</button>` : ''}` : '<div class="ks-empty">全部都看過了 🎉</div>'}
      <div class="ks-lbl">🎬 影片還沒看完 ${vids.length}</div>
      ${vids.length ? `<div class="ks-list">${vids.map(p => item(p, '看了 ' + Math.round(p.cov * 100) + '%')).join('')}</div>` : '<div class="ks-empty">每支影片都看完了 🎉</div>'}
      <div class="ks-lbl">❓ 分數怎麼算</div>
      <ul class="ks-how">
        <li>每個節點 0–100 分，由五個部分加起來：</li>
        <li><b>接觸 ${W.open} 分</b>：點開過這個節點（短影音要停留 3 秒以上）。</li>
        <li><b>停留 ${W.dwell} 分</b>：看節點內容的時間，主問題 ${DWELL_T.question} 秒、其他節點 ${DWELL_T.other} 秒拿滿。沒有影片的節點，影片那 ${W.video} 分也改用停留時間算（停留滿分變 ${W.dwell + W.video}）。</li>
        <li><b>影片 ${W.video} 分</b>：實際播放過的比例，看過 90% 就拿滿。快轉跳過的部分不算。</li>
        <li><b>回訪 ${W.revisit} 分</b>：隔 30 分鐘以上再回來看一次 +5 分，最多 3 次。</li>
        <li><b>動手 ${W.act} 分</b>：在節點上加反證、改研究進度、加概念、分裂、按喜歡或收藏，每一種行為 +5 分，最多 2 次。</li>
        <li>主題分數＝該類型所有節點的平均；整體分數＝全部節點的平均（沒看過的算 0）。分數不會隨時間衰減。</li>
      </ul>
      <p class="ks-note">只是「接觸程度」的粗略指標，不是考試：看得多、看得久、會回來想，分數就高。90 秒沒有任何操作（又沒在播影片）就暫停計時。紀錄只存在這台裝置的瀏覽器裡，不會上傳，也不會影響大腦或短影音的資料。${R.since ? '從 ' + new Date(R.since).toLocaleDateString('zh-TW') + ' 開始記錄。' : ''}</p>
      <button class="ks-reset" data-ks-reset>↺ 重置掌握度紀錄</button>`;
    panel.scrollTop = top;
  }
  function refresh(){
    const R = compute();
    badge.style.setProperty('--ksp', R.overall); badge.style.setProperty('--ksc', colorFor(R.overall));
    badge.querySelector('span').textContent = R.overall;
    badge.title = `知識掌握度 ${R.overall} 分（已探索 ${R.explored}/${R.nodes.length}）・點一下看說明`;
    if (panel.classList.contains('open')){ const sig = JSON.stringify(R.nodes.map(p => p.total)) + R.overall; if (sig !== lastSig){ lastSig = sig; render(); } }
  }
  function open(){ flush(); lastSig = ''; render(); panel.classList.add('open'); badge.classList.add('on'); refresh(); }
  function close(){ panel.classList.remove('open'); badge.classList.remove('on'); }
  badge.addEventListener('click', e => { e.stopPropagation(); panel.classList.contains('open') ? close() : open(); });
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-ks-x]')) return close();
    if (e.target.closest('[data-ks-more]')){ showAllTodo = !showAllTodo; render(); return; }
    if (e.target.closest('[data-ks-reset]')){ if (confirm('確定要清除所有知識掌握度紀錄嗎？\n只會清掉分數，不會動到大腦、影片、喜歡或收藏。')) reset(); return; }
    const go = e.target.closest('[data-ks-go]'); if (!go) return;
    e.preventDefault(); const id = go.dataset.ksGo;
    if (window.matchMedia('(max-width:700px)').matches) close();
    if (PAGE === 'brain' && window.AIBrain && AIBrain.focusNode) AIBrain.focusNode(id);
    else if (location.hash !== '#node=' + encodeURIComponent(id)) location.hash = 'node=' + encodeURIComponent(id);
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });
  function reset(){ Object.keys(pend).forEach(k => delete pend[k]); try { localStorage.removeItem(KS); } catch(e){} curOpened = true; lastSig = ''; refresh(); if (panel.classList.contains('open')) render(); }

  setInterval(refresh, 5000);
  refresh();
  window.KnowledgeScore = { compute, raw:read, open, close, reset, flush, weights:W };
})();
