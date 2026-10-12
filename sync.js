/* sync.js — Supabase 雲端同步（大腦 index.html 讀寫；短影音 feed.html 只讀）。
   config.js 沒填 SUPABASE_URL / SUPABASE_ANON_KEY → 什麼都不做（不載入 supabase-js、不顯示 UI），跟原本一樣只用 localStorage。
   何時同步：載入時、回到這個分頁（focus／visibilitychange）、重新連線時拉一次；大腦有修改就上傳，上傳後再拉一次。
   只有在 brain_editors 名單裡、用 Email 登入的人可以讀寫雲端（P0：雲端資料是私人的，匿名不能讀）；
   其他人（含未登入）只用網站內建的公開資料，修改只存在這台裝置 🔒。
   上傳走 brain_apply()：每筆帶 base 版本；雲端已被別人改過 → 衝突，不覆寫，顯示給使用者決定（AISync.conflicts()／resolveConflict()）。 */
const CFG = window.AI_BOUNDARY_CONFIG || {};
const SB_URL = String(CFG.SUPABASE_URL || '').trim(), SB_KEY = String(CFG.SUPABASE_ANON_KEY || '').trim(), GRAPH = String(CFG.GRAPH_ID || 'main');
const V = new URL(import.meta.url).search;
window.AISync = { enabled:false, canWrite:() => false, status:() => 'off', reason:() => 'off', pending:() => 0, user:() => null, isEditor:() => false, conflicts:() => [] };

/* 就緒訊號：AISync.ready 是一個「只會 resolve、不會 reject、也不會永遠等下去」的 Promise；同時在 window 發一次 'aisync:ready'。
   - config 空白（停用）→ 立刻 resolve；
   - 啟用 → Supabase client 建好、第一次 session＋編輯名單檢查做完就 resolve（不等第一次拉取資料）；
   - 初始化失敗 → 一樣 resolve，帶 error；超過 READY_TIMEOUT_MS（預設 10 秒）還沒好也 resolve，帶 timedOut:true。
   resolve 的值＝當下的狀態快照 { enabled, status, reason, canWrite, user, error?, timedOut? }；AISync.isReady 會變成 true。 */
let readyDone = false, resolveReady;
window.AISync.isReady = false;
window.AISync.ready = new Promise(r => { resolveReady = r; });
function markReady(extra = {}){
  if (readyDone) return; readyDone = true;
  const A = window.AISync;
  // 逾時時 start() 可能還沒走到設定 AISync 的那一步：照實回報「有設定、還在連」，不要回 'off'
  const detail = A.enabled || !(SB_URL && SB_KEY)
    ? Object.assign({ enabled:!!A.enabled, status:A.status(), reason:A.reason(), canWrite:A.canWrite(), user:A.user() }, extra)
    : Object.assign({ enabled:true, status:'syncing', reason:'checking', canWrite:false, user:null }, extra);
  A.isReady = true; resolveReady(detail);
  // 停用時是同步 resolve 的；事件延到下一輪，讓後面載入的 script 也來得及加監聽（但還是建議用 await AISync.ready）
  setTimeout(() => { try { window.dispatchEvent(new CustomEvent('aisync:ready', { detail })); } catch(e){} }, 0);
}
if (SB_URL && SB_KEY){
  const ms = Number(CFG.READY_TIMEOUT_MS) > 0 ? Number(CFG.READY_TIMEOUT_MS) : 10000;
  const t = setTimeout(() => markReady({ timedOut:true }), ms);
  start().then(() => clearTimeout(t), e => {
    console.error('[sync]', e); clearTimeout(t);
    // 初始化失敗：當成「離線、不能寫」，網站照常只用這台裝置的 localStorage
    Object.assign(window.AISync, { enabled:true, status:() => 'offline', canWrite:() => false, isEditor:() => false, reason:() => window.AISync.user() ? 'not-editor' : 'anon' });
    try { document.body.dataset.sync = 'offline'; const b = document.getElementById('bSync');
      if (b){ b.textContent = '⚠️'; b.title = '連不上雲端（修改先存在這台裝置）'; b.setAttribute('aria-label', '雲端同步：離線'); } } catch(_){}
    markReady({ error:(e && e.message) || String(e) });
  });
} else markReady();

async function start(){
  const core = await import('./sync-core.js' + V), { esc } = await import('./safe.js' + V);
  const BRAIN = !!(window.AIBrain && document.getElementById('c')), SKEY = 'aiBrain.sync.v2:' + GRAPH, $ = s => document.querySelector(s);
  const loadSync = () => { try { const s = JSON.parse(localStorage.getItem(SKEY)); if (s && s.snap) return s; } catch(e){} return null; };
  let pendCache = null;                                   // 待上傳清單的快取：大腦 change 事件、拉取、上傳（存快照）時清掉
  let confCache = null;                                   // 衝突清單的快取（status() 很常被呼叫，不要每次解析快照）
  const dirty = () => { pendCache = null; confCache = null; };
  const saveSync = s => { dirty(); try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch(e){ console.warn('[sync] snapshot not saved', e); } };
  let checking = false, sb = null, user = null, editor = false, online = navigator.onLine, busy = 0, loaded = false, remoteEmpty = false, err = '', notice = '';
  const canWrite = () => !!(sb && user && editor);
  const pendingOps = () => { if (!BRAIN) return []; if (pendCache) return pendCache; const s = loadSync(); return (pendCache = s ? core.diff(s.snap, AIBrain.getState()) : []); };
  /* 'anon' 沒登入／'checking' 已登入、正在查編輯名單／'not-editor' 已登入但不在 brain_editors／'editor' 可以寫（停用時是 'off'） */
  const reason = () => !user ? 'anon' : checking ? 'checking' : editor ? 'editor' : 'not-editor';
  const conflictList = () => { if (!confCache){ const s = loadSync(); confCache = s && s.conflicts ? Object.entries(s.conflicts).map(([key, c]) => Object.assign({ key }, c)) : []; } return core.clone(confCache); };
  const conflictCount = () => (confCache || conflictList()).length;
  const status = () => !online ? 'offline' : !sb || busy || !loaded ? 'syncing' : err ? 'offline' : !canWrite() ? 'readonly' : conflictCount() ? 'conflict' : pendingOps().length ? 'syncing' : 'synced';
  const ICON = { synced:'☁️', syncing:'⏳', offline:'⚠️', readonly:'🔒', conflict:'⚠️' };
  const LABEL = { synced:'已同步到雲端', syncing:'同步中…', offline:'離線或連不上雲端（修改先存在這台裝置）', readonly:'唯讀：使用網站內建的公開資料，修改只存在這台裝置', conflict:'有修改跟雲端衝突，沒有上傳（等你決定）' };
  Object.assign(window.AISync, { enabled:true, canWrite, status, reason, graph:GRAPH, pending:() => pendingOps().length, user:() => user && { id:user.id, email:user.email || '' }, isEditor:() => canWrite(),
    conflicts:conflictList, resolveConflict:(key, choice) => resolveConflict(key, choice) });

  /* ---------- UI（zh-TW）：工具列一顆狀態鈕＋小選單 ---------- */
  const style = document.createElement('style'); style.textContent = `
.sy-btn{flex:none}.sy-btn sup{position:absolute;top:-4px;right:-4px;font-size:9px;background:#7a4b12;border-radius:99px;padding:0 4px;line-height:14px;color:#fff}
.sy-menu{position:fixed;z-index:60;top:calc(58px + env(safe-area-inset-top));right:10px;width:min(300px,calc(100vw - 20px));padding:14px;border-radius:16px;background:rgba(12,15,36,.96);
  border:1px solid rgba(160,180,255,.22);box-shadow:0 10px 40px rgba(0,0,0,.5);color:#e6ecff;font:13px/1.55 system-ui,-apple-system,"PingFang TC","Noto Sans TC",sans-serif;display:none}
.sy-menu.open{display:block}.sy-menu h4{margin:0 0 6px;font-size:14px}.sy-menu p{margin:4px 0;color:#b8c2e8}.sy-menu .warn{color:#ffd36e}.sy-menu small{color:#8792bd}
.sy-menu .row{display:flex;gap:6px;margin-top:8px}.sy-menu input{flex:1;min-width:0;padding:7px 9px;border-radius:9px;border:1px solid rgba(160,180,255,.25);background:rgba(255,255,255,.06);color:inherit;font:inherit}
.sy-menu button.b{padding:7px 10px;border-radius:9px;border:1px solid rgba(160,180,255,.3);background:rgba(157,183,255,.14);color:inherit;font:inherit;cursor:pointer;white-space:nowrap}
.sy-menu button.w{width:100%;margin-top:8px}body.sync-ro #saved:after{content:"（唯讀：只存在這台裝置）";color:#ffd36e}`;
  document.head.appendChild(style);
  const btn = Object.assign(document.createElement('button'), { className:'ib sy-btn', type:'button', id:'bSync', textContent:'⏳' });
  btn.setAttribute('aria-label', '雲端同步：同步中'); btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
  const anchor = BRAIN ? $('#bHist') : $('#bSet');
  if (anchor) anchor.parentNode.insertBefore(btn, anchor); else { btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:40'; document.body.appendChild(btn); }
  const menu = Object.assign(document.createElement('div'), { className:'sy-menu' }); menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', '雲端同步');
  document.body.appendChild(menu);
  const setOpen = on => { menu.classList.toggle('open', on); btn.setAttribute('aria-expanded', String(on)); };
  btn.onclick = e => { e.stopPropagation(); setOpen(!menu.classList.contains('open')); render(); };
  document.addEventListener('click', e => { if (!menu.contains(e.target) && !btn.contains(e.target)) setOpen(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  const ARIA = { synced:'已同步', syncing:'同步中', offline:'離線', readonly:'唯讀', conflict:'有衝突' };
  let lastKey = '';
  function render(){
    const s = status(), n = pendingOps().length, r = reason();
    btn.innerHTML = ICON[s] + (n ? `<sup>${n}</sup>` : ''); btn.title = LABEL[s] + (n ? `・${n} 筆本機修改` : '');
    btn.setAttribute('aria-label', '雲端同步：' + ARIA[s] + (n ? `，${n} 筆待上傳` : ''));   // 固定格式的 zh-TW 標籤，跟 title 一起更新
    const cl = conflictList(), key = s + '|' + r + '|' + n + '|' + cl.map(c => c.key + c.current).join(',');
    if (key !== lastKey){ lastKey = key; dispatchEvent(new CustomEvent('aisync:change', { detail:{ status:s, reason:r, pending:n, conflicts:cl.length } })); renderConflicts(cl); }
    document.body.classList.toggle('sync-ro', s === 'readonly'); document.body.dataset.sync = s; document.body.dataset.syncConflicts = String(cl.length);
    if (!menu.classList.contains('open')) return;
    let h = `<h4>${ICON[s]} ${esc(LABEL[s])}</h4>`;
    if (n) h += `<p class="warn">${n} 筆修改還沒上傳${canWrite() ? '' : '（唯讀，不會上傳）'}</p>`;
    if (notice) h += `<p class="warn">${esc(notice)}</p>`;
    if (err) h += `<p class="warn">⚠ ${esc(err)}</p>`;
    if (remoteEmpty && !canWrite()) h += `<p>雲端還沒有資料；編輯者第一次登入時會自動上傳。</p>`;
    if (user) h += `<p>已登入：<b>${esc(user.email || user.id.slice(0, 8))}</b>${editor ? '（編輯者）' : ''}</p><button class="b w" data-a="out">登出</button>`;
    else h += `<p>編輯者用 Email 登入後就能跨裝置同步、一起編輯。未登入時看到的是網站內建的公開資料；共享大腦只有編輯者登入後才看得到。</p>
      <div class="row"><input type="email" id="syEmail" placeholder="Email" autocomplete="email"><button class="b" data-a="mail">寄登入連結</button></div>
      <small>會寄一封登入連結，請用同一個瀏覽器點開。</small>`;
    h += `<button class="b w" data-a="pull">↻ 重新同步</button>`;
    menu.innerHTML = h; menu.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
  }
  /* ---------- 衝突橫幅（zh-TW）：逐筆決定「改用雲端版本」或「用我的版本覆蓋」 ---------- */
  const titleOf = (c, side) => { const d = side && side.data; return c.kind === 'node' ? (d && d.title) || c.id : c.kind === 'brain' ? (d && d.name) || c.id : c.kind + '：' + c.id; };
  function renderConflicts(cl = conflictList()){
    let el = document.getElementById('syncConflict');
    if (!cl.length || !canWrite()){ if (el) el.remove(); return; }
    if (!el){ el = document.createElement('div'); el.id = 'syncConflict'; el.setAttribute('role', 'alert');
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(64px + env(safe-area-inset-top));z-index:70;width:min(560px,calc(100vw - 20px));max-height:50vh;overflow:auto;padding:12px 14px;border-radius:14px;background:rgba(74,52,12,.97);border:1px solid rgba(255,211,110,.45);color:#fff4d6;font:13px/1.6 system-ui,-apple-system,"PingFang TC","Noto Sans TC",sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5)';
      document.body.appendChild(el); }
    const bs = 'margin:6px 6px 0 0;padding:5px 9px;border-radius:9px;border:1px solid rgba(255,211,110,.5);background:rgba(255,255,255,.08);color:inherit;font:inherit;cursor:pointer';
    el.innerHTML = `<div>⚠ 有 ${cl.length} 筆修改沒有上傳：雲端上的同一個項目已經被別人（或你的另一台裝置）改過。為了不覆蓋對方的修改，你的版本只保留在這台裝置，請逐筆決定。</div>`
      + cl.map(c => `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,211,110,.25)"><b>${esc(titleOf(c, c.mine))}</b><br><small>雲端目前：${c.cloud.deleted ? '已刪除' : '「' + esc(titleOf(c, c.cloud)) + '」'}（版本 ${esc(c.current ?? '—')}）・你的版本根據：版本 ${esc(c.base ?? '新項目')}${c.mine.deleted ? '・你刪除了它' : ''}</small><br>`
        + `<button type="button" data-ck="${esc(c.key)}" data-cv="cloud" style="${bs}">改用雲端版本</button><button type="button" data-ck="${esc(c.key)}" data-cv="mine" style="${bs}">用我的版本覆蓋</button></div>`).join('');
    el.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => resolveConflict(b.dataset.ck, b.dataset.cv));
  }
  const say = msg => { if (BRAIN) return AIBrain._toast(msg); const t = $('#toast'); if (t){ t.textContent = msg; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2400); } };
  async function act(a){
    if (!sb) return;
    if (a === 'mail'){
      const email = ($('#syEmail')?.value || '').trim(); if (!/^\S+@\S+\.\S+$/.test(email)) return say('請輸入正確的 Email');
      const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo:location.origin + location.pathname } });
      say(error ? '⚠ 寄送失敗：' + error.message : '📧 登入連結已寄出，請到信箱點開');
    } else if (a === 'out'){ await sb.auth.signOut(); say('已登出（之後的修改只存在這台裝置）'); }
    else if (a === 'pull') await pull();
    render();
  }

  /* ---------- 大腦的修改 → 排程上傳（佇列是無狀態的：每次都是 diff(snapshot, 現在)） ---------- */
  let roToast = 0, flushT = 0;
  if (BRAIN) AIBrain.on('change', d => {
    dirty();
    if (!d || d.action === 'remote') return render();
    if (d.action === 'import'){                        // 同步模式下匯入只做加法：雲端已有、檔案裡沒有的實體留著，不寫墓碑
      const s = loadSync(); if (s) AIBrain._applyExternal(st => { const have = core.fingerprint(st);
        Object.entries(s.snap).forEach(([k, v]) => { if (!(k in have)){ const [kind, id] = core.splitKey(k); core.putEntity(st, kind, id, JSON.parse(v)); } }); });
    }
    if (!canWrite() && Date.now() - roToast > 20000){ roToast = Date.now(); setTimeout(() => say(reason() === 'anon' ? '🔒 未登入：修改只存在這台裝置' : reason() === 'checking' ? '⏳ 正在確認編輯權限…' : '🔒 你不在編輯名單：修改只存在這台裝置'), 900); }
    clearTimeout(flushT); flushT = setTimeout(flush, 800); render();
  });

  /* ---------- Supabase client（只有 Email magic link） ---------- */
  await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = './vendor/supabase.js' + V; s.onload = ok; s.onerror = () => bad(new Error('無法載入 supabase.js')); document.head.appendChild(s); });
  try { const h = sessionStorage.getItem('aiBrain.authHash'); if (h){ sessionStorage.removeItem('aiBrain.authHash'); history.replaceState(null, '', location.pathname + location.search + h); } } catch(e){}
  sb = window.supabase.createClient(SB_URL, SB_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:'aiBrain.auth' } });
  window.AISync.client = sb;
  try { user = (await sb.auth.getSession()).data.session?.user || null; } catch(e){ user = null; }
  sb.auth.onAuthStateChange((ev, s) => { const was = user?.id; user = s?.user || null; if (was !== user?.id){ editor = false; notice = ''; setTimeout(async () => { await checkEditor(); await pull(); }, 0); } render(); });

  /* 401／JWT 過期 → 先刷新 session 再重試一次；403／RLS → 不是編輯者（唯讀） */
  const isAuthErr = e => e && (e.status === 401 || e.code === 'PGRST301' || e.code === 'PGRST303' || /jwt|token/i.test(e.message || ''));
  const isDenied = e => e && (e.status === 403 || e.code === '42501' || /row-level security|permission denied/i.test(e.message || ''));
  async function call(fn){
    let r = await fn();
    if (r.error && isAuthErr(r.error) && user){
      const ref = await sb.auth.refreshSession();
      if (!ref.error && ref.data.session){ user = ref.data.session.user; r = await fn(); }
      else { notice = '登入已過期，請重新登入'; user = null; editor = false; await sb.auth.signOut({ scope:'local' }).catch(() => {}); }
    }
    if (r.error && isDenied(r.error)){ editor = false; notice = '你不在編輯名單：目前是唯讀'; }
    return r;
  }
  async function checkEditor(){
    editor = false; if (!user) return;
    checking = true; render();
    const { data, error } = await call(() => sb.rpc('is_graph_editor', { p_graph:GRAPH })).finally(() => { checking = false; });
    editor = !error && data === true;
    notice = error ? '' : editor ? '' : '你已登入，但不在編輯名單（brain_editors）：目前是唯讀';
  }
  async function fetchAll(table, order){
    const out = []; for (let from = 0; ; from += 1000){
      const r = await call(() => sb.from(table).select('*').eq('graph_id', GRAPH).order(order[0]).order(order[1]).range(from, from + 999));
      if (r.error) throw r.error; out.push(...r.data); if (r.data.length < 1000) return out;
    }
  }
  const histRow = h => ({ ts:Number(h.ts) || 0, action:h.action, payload:h.payload || {} });
  const fail = e => { err = (e && e.message) || String(e); render(); };

  /* ---------- 拉取（大腦：合併進 3D 場景；feed：只讀，交給 AIFeed.reload） ---------- */
  async function pull(){
    if (!online) return render();
    if (!canWrite()){ loaded = true; remoteEmpty = false; err = ''; return render(); }   // P0：雲端只有編輯者讀得到；其他人用內建資料，不打雲端
    busy++; render();
    try {
      const [rows, hist] = await Promise.all([fetchAll('brain_entities', ['kind', 'id']), fetchAll('brain_history', ['ts', 'hkey'])]);
      const H = hist.map(histRow); err = ''; remoteEmpty = !rows.length;
      if (!BRAIN){
        if (rows.length && window.AIFeed){ let local = null; try { local = JSON.parse(localStorage.getItem('aiBrain.v1')); } catch(e){}
          const res = core.merge(local && Array.isArray(local.nodes) ? local : core.rowsToState([]), rows, H, loadSync());
          AIFeed.reload(res.state); }
      } else if (!rows.length){
        if (canWrite()){ saveSync({ snap:{}, hkeys:[] }); setTimeout(flush, 0); }  // 雲端是空的：編輯者把目前的大腦整份上傳（種子）
      } else {
        const local = AIBrain.getState();
        const res = core.merge(local, rows, H, loadSync(), { migrate:AIBrain._migrate, canWrite:canWrite() });
        const patch = core.diff(core.fingerprint(local), res.state), H2 = res.state.history;
        if (patch.length || H2.length !== local.history.length)
          AIBrain._applyExternal(st => { patch.forEach(o => core.putEntity(st, o.kind, o.id, o.deleted ? null : o.data)); st.history = core.mergeHistory(st.history, H2); },
            { ids:patch.filter(o => o.kind === 'node').map(o => o.id) });
        saveSync(res.sync);
        if (canWrite() && (res.pending.length || core.pendingHistory(AIBrain.getState(), res.sync).length)) setTimeout(flush, 0);
      }
      loaded = true;
    } catch(e){ fail(e); }
    busy--; render();
  }
  /* ---------- 上傳 ---------- */
  let flushing = false;
  async function flush(){
    if (!BRAIN || flushing || !canWrite() || !online) return render();
    const s = loadSync(); if (!s) return pull();
    flushing = true; busy++; render();
    let newConflicts = 0;
    try {
      const st = AIBrain.getState(), ops = core.uploadable(s, st), hist = core.pendingHistory(st, s);
      for (let i = 0; i < ops.length; i += 200){
        const part = ops.slice(i, i + 200);
        const r = await call(() => sb.rpc('brain_apply', { p_graph:GRAPH, p_ops:core.toApplyOps(s, part) }));
        if (r.error) throw r.error; core.ackResult(s, part, r.data); saveSync(s);
        newConflicts += ((r.data && r.data.conflicts) || []).length;
      }
      for (let i = 0; i < hist.length; i += 300){
        const part = hist.slice(i, i + 300);
        const r = await call(() => sb.from('brain_history').upsert(part.map(h => ({ graph_id:GRAPH, hkey:core.hkey(h), ts:h.ts, action:String(h.action).slice(0, 40), payload:h.payload || {} })), { onConflict:'graph_id,hkey', ignoreDuplicates:true }));
        if (r.error) throw r.error; core.ack(s, [], part); saveSync(s);
      }
      err = '';
      if (newConflicts){ say(`⚠ ${newConflicts} 筆修改跟雲端衝突，沒有覆蓋雲端（請看上方提示）`); dispatchEvent(new CustomEvent('aisync:conflict', { detail:{ conflicts:conflictList() } })); }
      if (ops.length || hist.length) setTimeout(pull, 300);   // 寫完再拉一次，順便拿到別人的修改
    } catch(e){ if (!isDenied(e)) fail(e); }
    flushing = false; busy--; render();
  }
  /* 使用者處理衝突：'cloud' 改用雲端版本（拒絕這次提案）；'mine' 以衝突時看到的雲端版本為 base 重送（雲端若又變了 → 新衝突） */
  async function resolveConflict(key, choice){
    if (!canWrite()) return false;
    let s = loadSync(); if (!s || !s.conflicts || !s.conflicts[key]) return false;
    try {
      if (choice === 'mine'){
        const op = core.resolveMineOp(s, AIBrain.getState(), key);
        const r = await call(() => sb.rpc('brain_apply', { p_graph:GRAPH, p_ops:[op] })); if (r.error) throw r.error;
        core.ackResult(s, [op], r.data); saveSync(s);
        if ((r.data.conflicts || []).length){ say('⚠ 雲端剛剛又被改過，請再確認一次'); render(); return false; }
        say('✓ 已用你的版本更新雲端');
      } else {
        await pull(); s = loadSync();
        const c = s.conflicts[key]; if (!c) return true;          // 拉取時本機已經跟雲端一樣 → 衝突已自然消失
        const v = s.snap[key];                                     // 拉取後 snap ＝ 雲端最新內容（沒有 → 雲端已刪除）
        AIBrain._applyExternal(st => core.putEntity(st, c.kind, c.id, v ? JSON.parse(v) : null), { ids:[c.id] });
        delete s.conflicts[key]; if (s.base) delete s.base[key]; saveSync(s);
        if (c && c.proposalId != null) await call(() => sb.rpc('brain_reject_proposal', { p_graph:GRAPH, p_id:c.proposalId }));
        say('↺ 已改用雲端版本');
      }
      setTimeout(pull, 200); render(); return true;
    } catch(e){ fail(e); say('⚠ 沒有完成：' + ((e && e.message) || e)); return false; }
  }
  /* 給 app.js：同步模式下「重置」只重置這台裝置＝捨棄本機修改、改用雲端版本（不會動到共享大腦） */
  window.AISync.resetLocal = async fallback => {
    if (!canWrite()){ fallback && fallback(); return; }   // 非編輯者讀不到雲端：重置成內建資料
    try {
      const [rows, hist] = await Promise.all([fetchAll('brain_entities', ['kind', 'id']), fetchAll('brain_history', ['ts', 'hkey'])]);
      if (!rows.length){ fallback && fallback(); return; }
      const H = hist.map(histRow), raw = core.rowsToState(rows, H), M = core.repair(AIBrain._migrate(core.clone(raw)));
      M.history = core.mergeHistory(H, []);
      saveSync({ snap:core.fingerprint(canWrite() ? raw : M), hkeys:H.map(core.hkey) });
      AIBrain._applyExternal(st => { Object.keys(st).forEach(k => delete st[k]); Object.assign(st, core.clone(M)); }, { keepUndo:true });   // ↶ 還能回到重置前
      say('↺ 已改用雲端版本（只影響這台裝置）');
    } catch(e){ fail(e); say('⚠ 連不上雲端，沒有重置'); }
  };

  let lastPull = 0; const maybePull = () => { if (Date.now() - lastPull > 5000){ lastPull = Date.now(); pull(); } };
  addEventListener('online', () => { online = true; err = ''; pull().then(flush); });
  addEventListener('offline', () => { online = false; render(); });
  addEventListener('storage', e => { if (e.key === SKEY || e.key === 'aiBrain.v1'){ dirty(); render(); } });   // 別的分頁改了快照或大腦
  addEventListener('focus', maybePull);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) maybePull(); });
  render(); await checkEditor(); markReady(); lastPull = Date.now(); await pull();
  Object.assign(window.AISync, { pull, flush });
}
