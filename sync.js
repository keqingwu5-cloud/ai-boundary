/* sync.js — Supabase 雲端即時同步（大腦 index.html 與短影音 feed.html 共用）。
   config.js 沒填 SUPABASE_URL / SUPABASE_ANON_KEY 時，這個檔案什麼都不做（不載入 supabase-js、不顯示任何 UI）。
   合併規則與資料模型見 sync-core.js 開頭與 README「☁️ 雲端即時同步」。 */
const CFG = window.AI_BOUNDARY_CONFIG || {};
const SB_URL = String(CFG.SUPABASE_URL || '').trim(), SB_KEY = String(CFG.SUPABASE_ANON_KEY || '').trim();
const GRAPH = String(CFG.GRAPH_ID || 'main');
const V = new URL(import.meta.url).search;            // 跟著頁面的 ?v= 一起更新快取
window.AISync = { enabled:false, canWrite:() => false, status:() => 'off' };
if (SB_URL && SB_KEY) start().catch(e => { console.error('[sync]', e); });

async function start(){
  const core = await import('./sync-core.js' + V);
  const PAGE = window.AIBrain && document.getElementById('c') ? 'brain' : 'feed';
  const KEY = 'aiBrain.v1', FKEY = 'aiBrain.feed.v1', KS = 'aiBrain.knowledge.v1', QKEY = 'aiBrain.sync.v1:' + GRAPH;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /* ---------- persisted queue (re-read before every change: index and feed tabs share it) ---------- */
  const loadQ = () => { try { const q = JSON.parse(localStorage.getItem(QKEY)); if (q && q.ops) return Object.assign(core.emptyQueue(), q); } catch(e){} return core.emptyQueue(); };
  const saveQ = q => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch(e){ console.warn('[sync] queue not saved', e); } };
  const withQ = fn => { const q = loadQ(); const r = fn(q); saveQ(q); return r; };

  /* ---------- status ---------- */
  let sb = null, user = null, online = navigator.onLine, lastErr = '', denied = false, flushing = false, loaded = false, remoteEmpty = false;
  const canWrite = () => !!(sb && user && !denied);
  const status = () => {
    if (!sb) return 'syncing';
    if (!online || lastErr) return 'offline';
    if (!user || denied) return 'readonly';
    if (flushing || !loaded || core.pending(loadQ()) || Object.keys(loadQ().hist).length) return 'syncing';
    return 'synced';
  };
  const ICON = { synced:'☁️', syncing:'⏳', offline:'⚠️', readonly:'🔒' };
  const LABEL = { synced:'已同步到雲端', syncing:'同步中…', offline:'離線（修改先存在這台裝置，連線後自動上傳）', readonly:'唯讀：未登入，修改只存在這台裝置' };
  Object.assign(window.AISync, { enabled:true, canWrite, status, graph:GRAPH, pending:() => core.pending(loadQ()) });

  /* ---------- UI: status button + small menu (zh-TW) ---------- */
  const css = `
.sy-btn{flex:none}
.sy-btn sup{position:absolute;top:-4px;right:-4px;font-size:9px;background:#7a4b12;border-radius:99px;padding:0 4px;line-height:14px;color:#fff}
.sy-menu{position:fixed;z-index:60;top:calc(58px + env(safe-area-inset-top));right:10px;width:min(300px,calc(100vw - 20px));padding:14px;border-radius:16px;
  background:rgba(12,15,36,.96);border:1px solid rgba(160,180,255,.22);box-shadow:0 10px 40px rgba(0,0,0,.5);color:#e6ecff;font:13px/1.55 system-ui,-apple-system,"PingFang TC","Noto Sans TC",sans-serif;display:none}
.sy-menu.open{display:block}
.sy-menu h4{margin:0 0 6px;font-size:14px}
.sy-menu p{margin:4px 0;color:#b8c2e8}
.sy-menu .sy-row{display:flex;gap:6px;margin-top:8px}
.sy-menu input{flex:1;min-width:0;padding:7px 9px;border-radius:9px;border:1px solid rgba(160,180,255,.25);background:rgba(255,255,255,.06);color:inherit;font:inherit}
.sy-menu button.b{padding:7px 10px;border-radius:9px;border:1px solid rgba(160,180,255,.3);background:rgba(157,183,255,.14);color:inherit;font:inherit;cursor:pointer;white-space:nowrap}
.sy-menu button.b:hover{border-color:#9db7ff}
.sy-menu button.w{width:100%;margin-top:8px}
.sy-menu .warn{color:#ffd36e}
.sy-menu small{color:#8792bd}
body.sync-ro #saved:after{content:"（唯讀：只存在這台裝置）";color:#ffd36e}`;
  const style = document.createElement('style'); style.id = 'sync-style'; style.textContent = css; document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.className = 'ib sy-btn'; btn.type = 'button'; btn.id = 'bSync'; btn.textContent = '⏳';
  const anchor = PAGE === 'brain' ? $('#bHist') : $('#bSet');
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor); else { btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:40'; document.body.appendChild(btn); }
  const menu = document.createElement('div'); menu.className = 'sy-menu'; menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', '雲端同步');
  document.body.appendChild(menu);
  btn.onclick = e => { e.stopPropagation(); menu.classList.toggle('open'); renderMenu(); };
  document.addEventListener('click', e => { if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('open'); });
  addEventListener('keydown', e => { if (e.key === 'Escape') menu.classList.remove('open'); });

  function render(){
    const s = status(), q = loadQ(), n = core.pending(q);
    btn.innerHTML = ICON[s] + (n ? `<sup>${n}</sup>` : '');
    btn.title = LABEL[s] + (n ? `・${n} 筆待上傳` : '');
    document.body.classList.toggle('sync-ro', s === 'readonly');
    document.body.dataset.sync = s;
    if (menu.classList.contains('open')) renderMenu();
  }
  function renderMenu(){
    const s = status(), q = loadQ(), n = core.pending(q);
    let h = `<h4>${ICON[s]} ${esc(LABEL[s])}</h4>`;
    if (n) h += `<p class="warn">${n} 筆修改還沒上傳${canWrite() ? '' : '（登入後會自動上傳）'}</p>`;
    if (remoteEmpty && !canWrite()) h += `<p>雲端還沒有資料；第一位登入的人打開網站時會自動上傳種子資料。</p>`;
    if (lastErr) h += `<p class="warn">⚠ ${esc(lastErr)}</p>`;
    if (user){
      h += `<p>已登入：<b>${esc(user.email || user.user_metadata?.user_name || user.id.slice(0, 8))}</b></p>`;
      if (denied) h += `<p class="warn">這個帳號沒有寫入權限（資料庫白名單），目前是唯讀。</p>`;
      h += `<button class="b w" data-a="out">登出</button>`;
    } else {
      h += `<p>登入後就能在不同裝置即時同步、一起編輯同一顆大腦。未登入也可以看共享大腦（唯讀）。</p>
        <button class="b w" data-a="gh">用 GitHub 登入</button>
        <div class="sy-row"><input type="email" id="syEmail" placeholder="Email" autocomplete="email"><button class="b" data-a="mail">寄登入連結</button></div>
        <small>會寄一封含登入連結的信，點開就登入（請用同一個瀏覽器開）。</small>`;
    }
    if (n && !canWrite()) h += `<button class="b w" data-a="discard">捨棄本機修改，改用雲端版本</button>`;
    h += `<button class="b w" data-a="pull">↻ 重新同步</button>`;
    menu.innerHTML = h;
    menu.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
  }
  const say = msg => { if (PAGE === 'brain' && AIBrain._toast) AIBrain._toast(msg); else { const t = $('#toast'); if (t){ t.textContent = msg; t.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(() => t.classList.remove('on'), 2200); } } };
  const redirectTo = () => location.origin + location.pathname;
  async function act(a){
    if (!sb) return;
    if (a === 'gh'){ const { error } = await sb.auth.signInWithOAuth({ provider:'github', options:{ redirectTo:redirectTo() } }); if (error) say('⚠ 登入失敗：' + error.message); }
    else if (a === 'mail'){
      const email = ($('#syEmail')?.value || '').trim(); if (!/^\S+@\S+\.\S+$/.test(email)) return say('請輸入正確的 Email');
      const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo:redirectTo() } });
      say(error ? '⚠ 寄送失敗：' + error.message : '📧 登入連結已寄出，請到信箱點開');
    }
    else if (a === 'out'){ await sb.auth.signOut(); say('已登出（之後的修改只存在這台裝置）'); }
    else if (a === 'discard'){ if (confirm('捨棄這台裝置上還沒上傳的修改，改成雲端的版本？')) await discardLocal(); }
    else if (a === 'pull'){ await pullFull(); flush(); }
    render();
  }

  /* ---------- capture local brain edits (attached before the network is touched, so nothing is missed) ---------- */
  let shadow = null, shadowH = null, roToastAt = 0;
  if (PAGE === 'brain'){
    const reshadow = () => { const st = AIBrain.getState(); shadow = core.fingerprint(st); shadowH = core.historyKeys(st); };
    reshadow();
    AIBrain.on('change', d => {
      if (d && d.action === 'remote'){ reshadow(); return; }
      const st = AIBrain.getState();
      const ops = core.diff(shadow, st), hs = core.newHistory(shadowH, st);
      shadow = core.fingerprint(st); shadowH = core.historyKeys(st);
      if (!ops.length && !hs.length) return;
      withQ(q => { core.enqueue(q, ops); core.enqueueHistory(q, hs); });
      if (!canWrite() && Date.now() - roToastAt > 20000){ roToastAt = Date.now(); setTimeout(() => say('🔒 未登入：這個修改只存在這台裝置，登入後才會上傳'), 900); }
      render(); scheduleFlush();
    });
  }

  /* ---------- supabase client ---------- */
  await loadScript('./vendor/supabase.js' + V);
  try { const h = sessionStorage.getItem('aiBrain.authHash'); if (h){ sessionStorage.removeItem('aiBrain.authHash'); history.replaceState(null, '', location.pathname + location.search + h); } } catch(e){}
  sb = window.supabase.createClient(SB_URL, SB_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:'aiBrain.auth' } });
  window.AISync.client = sb;
  try { const { data } = await sb.auth.getSession(); user = data.session ? data.session.user : null; } catch(e){ user = null; }
  if (PAGE === 'feed' && /access_token=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  sb.auth.onAuthStateChange((ev, s) => {
    const was = user && user.id; user = s ? s.user : null; denied = false;
    if (ev === 'SIGNED_IN' && was !== (user && user.id)){ setTimeout(async () => { await pullFull(); flush(); userSync(true); subscribeUser(); }, 0); }
    if (ev === 'SIGNED_OUT'){ withQ(q => { q.marks = {}; q.marksShadow = null; q.marksUid = null; }); subscribeUser(); }
    render();
  });
  render();

  /* ---------- helpers ---------- */
  const isPerm = e => e && (e.code === '42501' || e.code === 'PGRST301' || e.status === 401 || e.status === 403 || /row-level security|permission denied|JWT/i.test(e.message || ''));
  const fail = e => { if (isPerm(e)){ denied = !!user; lastErr = ''; } else lastErr = (e && e.message) || String(e); render(); };
  async function fetchAll(table, build){
    const out = []; for (let from = 0; ; from += 1000){
      const { data, error } = await build(sb.from(table).select('*')).range(from, from + 999);
      if (error) throw error; out.push(...data); if (data.length < 1000) break;
    } return out;
  }
  const readJSON = k => { try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } };
  const histRow = h => ({ ts:Number(h.ts) || 0, action:h.action, payload:h.payload || {} });

  /* ---------- pull ---------- */
  let feedDirty = false;
  async function pullFull(){
    try {
      const [rows, hist] = await Promise.all([
        fetchAll('brain_entities', b => b.eq('graph_id', GRAPH).order('kind').order('id')),
        fetchAll('brain_history', b => b.eq('graph_id', GRAPH).order('ts').order('hkey'))
      ]);
      lastErr = ''; remoteEmpty = !rows.length;
      const H = hist.map(histRow);
      if (PAGE === 'brain'){
        const local = AIBrain.getState();
        if (!rows.length && !canWrite()){ loaded = true; render(); return; }       // nothing shared yet, stay local
        if (!loaded) writeJSON(KEY + '.preSync', local);                           // one backup of the device copy before the first merge
        const res = withQ(q => core.mergeRemote(local, rows, q, { full:true, migrate:AIBrain._migrate, canWrite:canWrite() }));
        res.state.history = core.mergeHistory(res.state.history, H);
        const patch = core.diff(core.fingerprint(local), res.state);
        const addH = res.state.history;
        AIBrain._applyExternal(st => { core.applyRows(st, patch); st.history = core.mergeHistory(st.history, addH); }, { ids:patch.filter(o => o.kind === 'node').map(o => o.id) });
      } else {
        const cache = readJSON(KEY);
        if (!rows.length){ loaded = true; render(); return; }
        const qc = loadQ();                                                       // feed never writes the brain queue
        const st = cache && Array.isArray(cache.nodes) ? core.mergeRemote(cache, rows, qc, { full:true }).state : core.rowsToState(rows, H);
        st.history = core.mergeHistory(st.history, H);
        writeJSON(KEY, st); feedDirty = true; reloadFeed();
      }
      loaded = true; render();
    } catch(e){ fail(e); }
  }
  async function pullSince(){
    if (!loaded) return pullFull();
    const since = loadQ().since; if (!since) return pullFull();
    try {
      const t = new Date(new Date(since).getTime() - 30000).toISOString();
      const rows = await fetchAll('brain_entities', b => b.eq('graph_id', GRAPH).gt('updated_at', t).order('kind').order('id'));
      lastErr = ''; if (rows.length) applyIncoming(rows, true);
      render();
    } catch(e){ fail(e); }
  }
  /* rows from realtime or incremental pull */
  function applyIncoming(rows, fromRest){
    const acc = withQ(q => { const a = core.acceptRows(q, rows); rows.forEach(r => core.noteVersion(q, fromRest ? r : { kind:r.kind, id:r.id, version:r.version })); return a; });
    if (!acc.length) return;
    if (PAGE === 'brain'){
      const cur = core.fingerprint(AIBrain.getState());
      const changed = acc.filter(r => { const k = core.keyOf(r.kind, r.id); return r.deleted ? cur.has(k) : (r.kind === 'meta' || cur.get(k) !== core.stable(['brain','node','link'].includes(r.kind) ? Object.assign({}, r.data, { id:r.id }) : r.data)); });
      if (!changed.length) return;
      AIBrain._applyExternal(st => core.applyRows(st, changed), { ids:changed.filter(r => r.kind === 'node').map(r => r.id) });
    } else {
      const cache = readJSON(KEY); if (!cache || !Array.isArray(cache.nodes)) return void pullFull();
      core.applyRows(cache, acc); writeJSON(KEY, cache); feedDirty = true; reloadFeed();
    }
  }
  function applyHistory(rows){
    const H = rows.map(histRow);
    if (PAGE === 'brain'){ const st = AIBrain.getState(), keys = core.historyKeys(st); const fresh = H.filter(h => !keys.has(core.hkey(h))); if (fresh.length) AIBrain._applyExternal(s => { s.history = core.mergeHistory(s.history, fresh); }, { ids:[] }); }
    else { const cache = readJSON(KEY); if (cache && Array.isArray(cache.history)){ cache.history = core.mergeHistory(cache.history, H); writeJSON(KEY, cache); } }
  }
  /* the feed re-renders the whole list, which re-mounts the shared player → wait until nothing is playing */
  function reloadFeed(){
    if (!feedDirty || !window.AIFeed) return;
    const playing = document.body.classList.contains('playing') || (AIFeed.player && !AIFeed.player.paused);
    if (playing){ clearTimeout(reloadFeed.t); reloadFeed.t = setTimeout(reloadFeed, 3000); return; }
    feedDirty = false; try { AIFeed.reload(); } catch(e){ console.error(e); }
  }
  async function discardLocal(){
    withQ(q => { q.ops = {}; q.hist = {}; });
    try {
      const [rows, hist] = await Promise.all([
        fetchAll('brain_entities', b => b.eq('graph_id', GRAPH).order('kind').order('id')),
        fetchAll('brain_history', b => b.eq('graph_id', GRAPH).order('ts').order('hkey'))
      ]);
      if (!rows.length) return say('雲端還沒有資料');
      let R = core.rowsToState(rows, hist.map(histRow));
      if (PAGE === 'brain'){ R = AIBrain._migrate(R); AIBrain._applyExternal(st => { Object.keys(st).forEach(k => delete st[k]); Object.assign(st, core.clone(R)); }); }
      else { writeJSON(KEY, R); feedDirty = true; reloadFeed(); }
      say('已改用雲端版本');
    } catch(e){ fail(e); }
  }

  /* ---------- flush (outbound queue → Supabase) ---------- */
  let flushT = 0, backoff = 2000;
  function scheduleFlush(ms = 600){ clearTimeout(flushT); flushT = setTimeout(flush, ms); }
  async function flush(){
    if (flushing || !canWrite() || !online || !loaded) return;
    flushing = true; render();
    try {
      for (;;){
        const q = loadQ(), ops = Object.values(q.ops).slice(0, 200); if (!ops.length) break;
        const rows = ops.map(o => ({ graph_id:GRAPH, kind:o.kind, id:o.id, data:o.deleted ? null : o.data, deleted:!!o.deleted }));
        const { data, error } = await sb.from('brain_entities').upsert(rows, { onConflict:'graph_id,kind,id' }).select('kind,id,version,updated_at');
        if (error) throw error;
        withQ(q2 => core.ack(q2, ops, data || []));
      }
      for (;;){
        const q = loadQ(), ent = Object.entries(q.hist).slice(0, 300); if (!ent.length) break;
        const rows = ent.map(([k, h]) => ({ graph_id:GRAPH, hkey:k, ts:Number(h.ts) || 0, action:String(h.action || ''), payload:h.payload || {} }));
        const { error } = await sb.from('brain_history').upsert(rows, { onConflict:'graph_id,hkey', ignoreDuplicates:true });
        if (error) throw error;
        withQ(q2 => ent.forEach(([k]) => delete q2.hist[k]));
      }
      lastErr = ''; backoff = 2000;
    } catch(e){ fail(e); if (!isPerm(e)){ scheduleFlush(backoff); backoff = Math.min(backoff * 2, 60000); } }
    flushing = false; render();
    flushMarks();
  }

  /* ---------- per-user: feed likes / bookmarks + knowledge score ---------- */
  function detectMarks(){
    if (!canWrite()) return;
    const cur = core.marksOf(readJSON(FKEY) || {});
    const changed = withQ(q => {
      if (q.marksUid !== user.id || !q.marksShadow) return false;
      q.marks = q.marks || {};
      const ops = core.diffMarks(q.marksShadow, cur); ops.forEach(o => { q.marks[o.node_id] = o; }); q.marksShadow = cur; return ops.length > 0;
    });
    if (changed) flushMarks();
  }
  async function userSync(full){
    if (!canWrite() || !online) return;
    try {
      if (full){
        const rows = await fetchAll('user_feed_marks', b => b.eq('user_id', user.id).order('node_id'));
        const prefs = readJSON(FKEY) || {};
        const merged = withQ(q => { if (q.marksUid !== user.id){ q.marks = {}; q.marksUid = user.id; } q.marks = q.marks || {};
          const m = core.mergeMarks(prefs, rows, q.marks); q.marksShadow = core.marksOf(m); return m; });
        prefs.likes = merged.likes; prefs.saves = merged.saves; writeJSON(FKEY, prefs);
        if (window.AIFeed && AIFeed.reloadPrefs) AIFeed.reloadPrefs();
      }
      await flushMarks();
      await syncKnowledge();
    } catch(e){ fail(e); }
  }
  let marksBusy = false;
  async function flushMarks(){
    if (marksBusy || !canWrite() || !online) return; marksBusy = true;
    try {
      const q = loadQ(); if (q.marksUid !== user.id) return;
      const ops = Object.values(q.marks || {}); if (!ops.length) return;
      const { error } = await sb.from('user_feed_marks').upsert(ops.map(o => ({ user_id:user.id, node_id:o.node_id, liked_at:o.liked_at, saved_at:o.saved_at })), { onConflict:'user_id,node_id' });
      if (error) throw error;
      withQ(q2 => ops.forEach(o => { const c = q2.marks && q2.marks[o.node_id]; if (c && c.liked_at === o.liked_at && c.saved_at === o.saved_at) delete q2.marks[o.node_id]; }));
    } catch(e){ fail(e); } finally { marksBusy = false; }
  }
  let ksSig = '';
  async function syncKnowledge(){
    if (!canWrite() || !online) return;
    try { window.KnowledgeScore && KnowledgeScore.flush && KnowledgeScore.flush(); } catch(e){}
    const local = readJSON(KS);
    const { data, error } = await sb.from('user_knowledge').select('data').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    const remote = data && data.data && data.data.nodes ? data.data : null;
    const merged = core.mergeKnowledge(local, remote); if (!merged) return;
    const sig = core.stable(merged);
    if (sig !== core.stable(local)){ writeJSON(KS, merged); try { KnowledgeScore.refresh && KnowledgeScore.refresh(); } catch(e){} }
    if (sig !== core.stable(remote) && sig !== ksSig){
      const { error:e2 } = await sb.from('user_knowledge').upsert({ user_id:user.id, data:merged }, { onConflict:'user_id' }); if (e2) throw e2;
    }
    ksSig = sig;
  }

  /* ---------- realtime ---------- */
  let buf = [], bufT = 0, firstSub = true;
  const ch = sb.channel('brain:' + GRAPH)
    .on('postgres_changes', { event:'*', schema:'public', table:'brain_entities', filter:'graph_id=eq.' + GRAPH }, p => {
      const r = p.new && p.new.kind ? p.new : null; if (!r) return;
      buf.push(r); clearTimeout(bufT); bufT = setTimeout(() => { const rows = buf; buf = []; applyIncoming(rows, false); render(); }, 250);
    })
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'brain_history', filter:'graph_id=eq.' + GRAPH }, p => { if (p.new) applyHistory([p.new]); })
    .subscribe(s => {
      if (s === 'SUBSCRIBED'){ if (firstSub) firstSub = false; else pullSince(); }   // catch up on anything missed while disconnected
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT'){ render(); }
    });
  let userCh = null;
  function subscribeUser(){
    if (userCh){ sb.removeChannel(userCh); userCh = null; }
    if (!user) return;
    userCh = sb.channel('marks:' + user.id).on('postgres_changes', { event:'*', schema:'public', table:'user_feed_marks', filter:'user_id=eq.' + user.id }, p => {
      const r = p.new; if (!r || !r.node_id) return;
      const q = loadQ(); if (q.marks && q.marks[r.node_id]) return;
      const prefs = readJSON(FKEY) || {}; prefs.likes = prefs.likes || {}; prefs.saves = prefs.saves || {};
      if (r.liked_at) prefs.likes[r.node_id] = r.liked_at; else delete prefs.likes[r.node_id];
      if (r.saved_at) prefs.saves[r.node_id] = r.saved_at; else delete prefs.saves[r.node_id];
      writeJSON(FKEY, prefs); withQ(q2 => { if (q2.marksShadow) q2.marksShadow = core.marksOf(prefs); });
      if (window.AIFeed && AIFeed.reloadPrefs) AIFeed.reloadPrefs();
    }).subscribe();
  }

  /* ---------- lifecycle ---------- */
  addEventListener('online', () => { online = true; lastErr = ''; render(); pullSince().then(flush); userSync(false); });
  addEventListener('offline', () => { online = false; render(); });
  addEventListener('aifeed:prefs', detectMarks);
  addEventListener('storage', e => { if (e.key === FKEY) detectMarks(); if (e.key === QKEY) render(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden){ detectMarks(); syncKnowledge().catch(() => {}); } else { pullSince(); flush(); } });
  setInterval(() => { detectMarks(); if (core.pending(loadQ()) || Object.keys(loadQ().hist).length) flush(); }, 15000);
  setInterval(() => { syncKnowledge().catch(() => {}); }, 60000);

  await pullFull();
  subscribeUser();
  flush();
  userSync(true);
  window.AISync.flush = flush; window.AISync.pull = pullFull; window.AISync.user = () => user;
}

function loadScript(src){
  return new Promise((ok, bad) => { if (window.supabase && window.supabase.createClient) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('無法載入 ' + src)); document.head.appendChild(s); });
}
