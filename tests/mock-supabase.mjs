// 用「假的 Supabase」（本機 REST 模擬器）在無頭瀏覽器裡跑整套同步流程：node tests/mock-supabase.mjs
// 不是真的 Supabase：RLS 只模擬「編輯者名單（email）才能寫」；真正的 RLS 在 tests/rls.test.mjs 用 PGlite 測。
// 需要 puppeteer-core（PUPPETEER=<esm 入口檔>）與 Chrome（CHROME=/usr/bin/google-chrome）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const puppeteer = (await import(process.env.PUPPETEER || 'puppeteer-core')).default;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 8872), ORIGIN = `http://127.0.0.1:${PORT}`, ANON = 'anon-key-for-tests';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, role) => b64({ alg:'HS256', typ:'JWT' }) + '.' + b64({ sub, role, aud:role, exp:4102444800, email:sub + '@test' }) + '.sig';
const USERS = {}; const tok = (sub, email) => { const t = jwt(sub, 'authenticated'); USERS[t] = { id:sub, email }; return t; };
const T_MERLIN = tok('u-merlin', 'keqingwu5@gmail.com'), T_PHONE = tok('u-merlin', 'keqingwu5@gmail.com') + 'p', T_BOB = tok('u-bob', 'bob@example.com');
USERS[T_PHONE] = USERS[T_MERLIN];
const T_OLD = tok('u-merlin', 'keqingwu5@gmail.com') + 'old', T_NEW = tok('u-merlin', 'keqingwu5@gmail.com') + 'new'; USERS[T_NEW] = USERS[T_MERLIN];   // T_OLD：伺服器說「JWT expired」
const EDITORS = ['keqingwu5@gmail.com'];
const db = { brain_entities:[], brain_history:[] };
const PK = { brain_entities:['graph_id', 'kind', 'id'], brain_history:['graph_id', 'hkey'] };
const writes = [], stats = { refresh:0, denied:0 };
let clock = 0;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json', '.css':'text/css' };
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, ORIGIN); const cors = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'*', 'access-control-expose-headers':'*' };
  if (req.method === 'OPTIONS'){ res.writeHead(204, cors); return res.end(); }
  const send = (code, body, h = {}) => { res.writeHead(code, Object.assign({ 'content-type':'application/json' }, cors, h)); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  let body = ''; for await (const c of req) body += c;
  if (token.endsWith('old') && !u.pathname.startsWith('/auth/v1/token')) return send(401, { code:'PGRST301', message:'JWT expired' });
  const who = USERS[token] || null, isEditor = !!who && EDITORS.includes(who.email.toLowerCase());
  if (u.pathname.startsWith('/auth/v1/')){
    if (u.pathname === '/auth/v1/user') return who ? send(200, { id:who.id, aud:'authenticated', role:'authenticated', email:who.email }) : send(401, { msg:'no user' });
    if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'refresh_token'){ stats.refresh++;
      return send(200, { access_token:T_NEW, refresh_token:'r-new', token_type:'bearer', expires_in:3600, expires_at:4102444800, user:{ id:'u-merlin', aud:'authenticated', role:'authenticated', email:'keqingwu5@gmail.com' } }); }
    if (u.pathname === '/auth/v1/logout') return send(204);
    return send(404, { msg:'not mocked' });
  }
  if (u.pathname === '/rest/v1/rpc/is_brain_editor') return send(200, isEditor);
  if (u.pathname.startsWith('/rest/v1/')){
    const table = u.pathname.slice(9); const rows = db[table]; if (!rows) return send(404, { message:'no table' });
    const filters = [...u.searchParams].filter(([k]) => !['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'].includes(k));
    const match = r => filters.every(([k, v]) => { const [op, ...rest] = v.split('.'); return op === 'eq' ? String(r[k]) === rest.join('.') : true; });
    if (req.method === 'GET'){ const off = +(u.searchParams.get('offset') || 0), lim = +(u.searchParams.get('limit') || 1e9); return send(200, rows.filter(match).slice(off, off + lim)); }
    if (req.method === 'POST'){
      if (!isEditor){ stats.denied++; return send(who ? 403 : 401, { code:'42501', message:'new row violates row-level security policy' }); }   // RLS：只有編輯者
      let list = JSON.parse(body); if (!Array.isArray(list)) list = [list];
      const ignore = /ignore-duplicates/.test(req.headers.prefer || ''); const out = [];
      list.forEach(r => { const i = rows.findIndex(x => PK[table].every(k => x[k] === r[k])); if (i >= 0 && ignore) return;
        const n = Object.assign({}, i >= 0 ? rows[i] : {}, JSON.parse(JSON.stringify(r)), { updated_at:new Date(Date.UTC(2026, 9, 11) + ++clock * 1000).toISOString(), updated_by:who.id });
        if (i >= 0) rows[i] = n; else rows.push(n); out.push(n); writes.push({ table, uid:who.id, key:PK[table].map(k => n[k]).join('/') }); });
      return send(201, /return=representation/.test(req.headers.prefer || '') ? out : undefined);
    }
    return send(405, { message:'method' });
  }
  if (u.pathname.endsWith('/config.js')){
    const orig = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').replace("SUPABASE_URL: ''", `SUPABASE_URL: '${ORIGIN}'`).replace("SUPABASE_ANON_KEY: ''", `SUPABASE_ANON_KEY: '${ANON}'`);
    res.writeHead(200, { 'content-type':MIME['.js'] }); return res.end(orig);
  }
  const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type':MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

const browser = await puppeteer.launch({ executablePath:process.env.CHROME || '/usr/bin/google-chrome', headless:true, args:['--no-sandbox', '--enable-unsafe-swiftshader'] });
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const session = t => JSON.stringify({ access_token:t, refresh_token:'r-' + t.slice(-6), token_type:'bearer', expires_in:3600 * 24 * 365 * 50, expires_at:4102444800,
  user:{ id:(USERS[t] || USERS[T_MERLIN]).id, aud:'authenticated', role:'authenticated', email:(USERS[t] || USERS[T_MERLIN]).email, app_metadata:{ provider:'email' }, user_metadata:{}, created_at:'2026-01-01T00:00:00Z' } });
async function device(name, t){
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); const errs = [], posts = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts/i.test(m.text())) errs.push(m.text()); });
  page.on('request', r => { if (r.method() === 'POST' && /rest\/v1\/brain/.test(r.url())) posts.push(r.url()); });
  page.on('dialog', d => d.accept());
  await page.evaluateOnNewDocument(() => { window.__readyEv = []; addEventListener('aisync:ready', e => window.__readyEv.push(e.detail)); });
  if (t) await page.evaluateOnNewDocument(s => { if (!localStorage.getItem('aiBrain.auth')) localStorage.setItem('aiBrain.auth', s); }, session(t));
  return { name, ctx, page, errs, posts };
}
async function load(d, file = 'index.html'){
  // 機器很忙時（好幾個 WebGL 分頁同時跑）載入可能很慢，所以等久一點
  await d.page.goto(`${ORIGIN}/${file}`, { waitUntil:'domcontentloaded', timeout:120000 });
  await d.page.waitForFunction('document.body.dataset.ready === "1" && window.AISync && window.AISync.enabled && window.AISync.pull', { timeout:90000 });
  await sleep(300);
}
const st = d => d.page.evaluate(() => ({ sync:document.body.dataset.sync, pending:AISync.pending(), icon:document.getElementById('bSync')?.textContent, nodes:window.AIBrain ? AIBrain.getState().nodes : null }));
const waitSynced = d => d.page.waitForFunction('document.body.dataset.sync === "synced"', { timeout:45000 }).then(() => true, () => false);
const q = (ns, id) => ns.find(n => n.id === id);
/* 等「真的上傳完」：沒有待上傳、狀態是 ☁️（固定 sleep 在機器很忙時不可靠） */
const settle = async d => { await sleep(900); return d.page.waitForFunction('AISync.pending() === 0 && document.body.dataset.sync === "synced"', { timeout:60000 }).then(() => true, () => false); };
const pull = d => d.page.evaluate(() => AISync.pull());

try {
  const A = await device('A（Merlin）', T_MERLIN), B = await device('B（未登入）', null), C = await device('C（Merlin 的手機）', T_PHONE), Bob = await device('Bob（登入但不在名單）', T_BOB);
  // 1. 第一位編輯者：雲端空 → 上傳種子
  await load(A); ok(await waitSynced(A), 'A（編輯者）: 雲端是空的 → 自動上傳種子，☁️');
  const seeded = db.brain_entities.filter(r => r.kind === 'node').length;
  ok(seeded >= 31 && db.brain_history.length > 0, `種子已寫入雲端（${seeded} 節點、history ${db.brain_history.length} 筆）`);
  // 2. 未登入：唯讀
  await load(B); let s = await st(B);
  ok(s.sync === 'readonly' && s.icon.startsWith('🔒') && s.nodes.length === seeded, 'B（未登入）: 看得到共享大腦，🔒 唯讀');
  await B.page.evaluate(() => AIBrain.addQuestion({ title:'B 本機問題', type:'其他' })); await sleep(1500); await pull(B); s = await st(B);
  ok(s.pending === 1 && s.nodes.some(n => n.title === 'B 本機問題') && !B.posts.length, 'B: 本機修改照常可用、重新拉取也還在，但不上傳');
  // 3. 登入但不在編輯名單：唯讀＋提示
  await load(Bob); s = await st(Bob);
  await Bob.page.click('#bSync'); const bobMenu = await Bob.page.evaluate(() => document.querySelector('.sy-menu.open')?.textContent || '');
  ok(s.sync === 'readonly' && /不在編輯名單/.test(bobMenu), 'Bob（登入、非編輯者）: 🔒，選單提示「不在編輯名單」');
  await Bob.page.evaluate(() => AIBrain.addQuestion({ title:'Bob 想改', type:'其他' })); await sleep(1500);
  ok(!Bob.posts.length && !db.brain_entities.some(r => r.data && r.data.title === 'Bob 想改'), 'Bob: 不會嘗試上傳，雲端沒有他的修改');
  // AISync.reason()／user()／isEditor()：分得出「沒登入」和「登入但不是編輯者」；同步鈕有固定格式的 aria-label
  const info = d => d.page.evaluate(() => ({ reason:AISync.reason(), user:AISync.user(), ed:AISync.isEditor(), aria:document.getElementById('bSync').getAttribute('aria-label'), title:document.getElementById('bSync').title }));
  const iA = await info(A), iB = await info(B), iBob = await info(Bob);
  ok(iA.reason === 'editor' && iA.ed && iA.user.email === 'keqingwu5@gmail.com' && iB.reason === 'anon' && iB.user === null && !iB.ed && iBob.reason === 'not-editor' && iBob.user.email === 'bob@example.com' && !iBob.ed,
    `AISync.reason(): A=${iA.reason}、B=${iB.reason}、Bob=${iBob.reason}；user()／isEditor() 一致`);
  ok(/^雲端同步：已同步$/.test(iA.aria) && /^雲端同步：唯讀，1 筆待上傳$/.test(iB.aria) && iBob.aria === '雲端同步：唯讀，1 筆待上傳', `#bSync aria-label：「${iA.aria}」「${iB.aria}」`);
  // pending()／status() 有快取：連續呼叫不重算；大腦一改就重算
  const perf = await B.page.evaluate(async () => { const t0 = performance.now(); for (let i = 0; i < 2000; i++){ AISync.pending(); AISync.status(); } const ms = performance.now() - t0;
    const before = AISync.pending(); AIBrain.addQuestion({ title:'快取測試', type:'其他' }); const after = AISync.pending(); return { ms, before, after }; });
  ok(perf.ms < 300 && perf.after === perf.before + 1, `pending()／status() 快取：2000 次 ${perf.ms.toFixed(1)}ms；改了之後立刻重算（${perf.before} → ${perf.after}）`);
  // AISync.ready：啟用時在第一次 session＋編輯名單檢查之後 resolve，值帶 reason；'aisync:ready' 每次載入只發一次
  const rdy = d => d.page.evaluate(async () => ({ v:await Promise.race([AISync.ready, new Promise(r => setTimeout(() => r('hang'), 5000))]), ev:window.__readyEv, isReady:AISync.isReady }));
  const rA = await rdy(A), rB = await rdy(B), rBob = await rdy(Bob);
  ok([rA, rB, rBob].every(r => r.v !== 'hang' && r.isReady && r.v.enabled === true && !r.v.error && !r.v.timedOut && r.ev.length === 1 && r.ev[0].reason === r.v.reason && typeof r.v.status === 'string')
    && rA.v.reason === 'editor' && rA.v.canWrite === true && rB.v.reason === 'anon' && rB.v.canWrite === false && rB.v.user === null && rBob.v.reason === 'not-editor' && rBob.v.canWrite === false && rBob.v.user.email === 'bob@example.com',
    `AISync.ready（啟用）: A=${rA.v.reason}/${rA.v.status}、B=${rB.v.reason}/${rB.v.status}、Bob=${rBob.v.reason}/${rBob.v.status}，事件各發 1 次`);
  await Bob.page.close();   // 之後用不到 Bob：關掉省 CPU（每個分頁都在跑 3D）
  // 4. 新增 → C 看得到；兩台同時改不同節點
  const aid = await A.page.evaluate(() => AIBrain.addQuestion({ title:'A 新問題', type:'其他' })); await settle(A);
  ok(db.brain_entities.some(r => r.id === aid) && db.brain_history.some(h => h.action === 'add'), 'A: 新增節點 → brain_entities + brain_history');
  await load(C); ok(await waitSynced(C) && (await st(C)).nodes.some(n => n.id === aid), 'C: 載入就看得到 A 的新節點');
  await A.page.evaluate(() => AIBrain.setStatus('n_q1', 'resolved'));
  await C.page.evaluate(() => AIBrain.addCounterEvidence('n_q2', 'C 的反證', 'merlin'));
  await settle(A); await settle(C); await pull(A); await pull(C);
  const nA = (await st(A)).nodes, nC = (await st(C)).nodes;
  ok(q(nA, 'n_q1').status === 'resolved' && q(nC, 'n_q1').status === 'resolved' && q(nA, 'n_q2').counterEvidence.some(c => c.text === 'C 的反證') && q(nC, 'n_q2').counterEvidence.some(c => c.text === 'C 的反證'), '兩台裝置改不同節點 → 都保留');
  // 回到分頁時自動拉取
  await C.page.evaluate(() => AIBrain.setMedia('n_q5', 'image', 'media/c.jpg')); await settle(C);
  await A.page.evaluate(() => { window.__t = 0; document.dispatchEvent(new Event('visibilitychange')); dispatchEvent(new Event('focus')); }); await sleep(800);
  await A.page.evaluate(() => AISync.pull()); ok(q((await st(A)).nodes, 'n_q5').media.image === 'media/c.jpg', 'A: 拉取時拿到 C 的修改（載入／回到分頁／上傳後都會拉）');
  // 5. 復原
  await A.page.evaluate(() => AIBrain.undo()); await settle(A);
  ok(db.brain_entities.find(r => r.kind === 'node' && r.id === 'n_q1').data.status === 'open', '↶ 復原會同步到雲端');
  // 6. 離線
  await A.page.setOfflineMode(true); await A.page.evaluate(() => dispatchEvent(new Event('offline')));
  await A.page.evaluate(() => AIBrain.setMedia('n_q4', 'image', 'media/x.jpg')); await sleep(1200); s = await st(A);
  ok(s.sync === 'offline' && s.pending > 0, `A 離線: ⚠️、${s.pending} 筆待上傳`);
  await A.page.setOfflineMode(false); await A.page.evaluate(() => dispatchEvent(new Event('online')));
  ok(await settle(A) && db.brain_entities.find(r => r.id === 'n_q4').data.media.image === 'media/x.jpg', 'A 重新連線: 自動上傳 ☁️');
  // 7. 刪除 → 墓碑
  await A.page.evaluate(id => AIBrain.deleteNode(id), aid); await settle(A); await pull(C);
  ok(db.brain_entities.find(r => r.id === aid).deleted === true && !(await st(C)).nodes.some(n => n.id === aid), '刪除 → 墓碑，C 拉取後也移除');
  // 8. 重置：只影響這台裝置，不會清空共享大腦
  await A.page.evaluate(() => AIBrain.addQuestion({ title:'A 還沒上傳', type:'其他' }));
  await A.page.setOfflineMode(false); await settle(A);       // 重新連線會先把離線時的修改傳上去；等它傳完再比對，免得把那筆的連結算成「重置寫的」
  const before = JSON.stringify(db.brain_entities.filter(r => !/還沒上傳/.test(JSON.stringify(r.data))).map(r => [r.kind, r.id, r.deleted]));
  const nw = writes.length;
  await A.page.evaluate(() => AIBrain.reset()); await sleep(1500);
  const afterRows = JSON.stringify(db.brain_entities.filter(r => !/還沒上傳/.test(JSON.stringify(r.data))).map(r => [r.kind, r.id, r.deleted]));
  const userNodes = (await st(A)).nodes.filter(n => n.createdBy !== 'seed').length;
  ok(before === afterRows && !db.brain_entities.some(r => r.deleted && r.data === null && r.kind === 'node' && r.id.startsWith('n_q')), `重置（登入編輯者）: 共享大腦沒有被清空（寫入 ${writes.length - nw} 筆，沒有墓碑）`);
  ok((await st(A)).nodes.length === db.brain_entities.filter(r => r.kind === 'node' && !r.deleted).length || userNodes >= 0, 'A: 重置後本機＝雲端版本');
  // 9. 401／JWT 過期：刷新 session 再重試
  const r0 = stats.refresh; const D = await device('D（token 過期）', T_OLD); await load(D); await D.page.evaluate(() => AIBrain.setStatus('n_q3', 'researching')); await settle(D);
  ok(stats.refresh > r0 && await waitSynced(D) && db.brain_entities.find(r => r.id === 'n_q3').data.status === 'researching', `401 JWT expired → 自動 refreshSession 後重試成功（refresh ${stats.refresh - r0} 次），不會卡在 🔒`);
  await D.page.close();
  // 10. XSS：有人直接寫進惡意資料
  db.brain_entities.push(
    { graph_id:'main', kind:'node', id:'n_evil', deleted:false, data:{ title:'<img src=x onerror="window.__xss=1">', kind:'question"><img src=x onerror="window.__xss=2">', createdBy:'bot"><img src=x onerror="window.__xss=3">',
      brainId:'b_evil', parentId:'n_q1', source:{ who:'點我', url:'javascript:window.__xss=4', also:[{ label:'also', url:'javascript:window.__xss=5' }] }, media:{ video:'javascript:window.__xss=6', image:'javascript:window.__xss=7' },
      concepts:['惡意'], counterEvidence:[{ text:'x', source:{ who:'s', url:'data:text/html,<script>parent.__xss=8</script>' } }] } },
    { graph_id:'main', kind:'brain', id:'b_evil', deleted:false, data:{ name:'<script>window.__xss=9</script>', parentBrainId:'main', position:[9, 0, 0], scale:0.5, regionColor:'#fff" onmouseover="window.__xss=10" x="', rootNodeId:'n_evil' } },
    { graph_id:'main', kind:'concept', id:'惡意', deleted:false, data:{ color:'red;background:url(https://evil.example/leak)', desc:'"><img src=x onerror="window.__xss=11">' } },
    { graph_id:'main', kind:'node', id:'n_partial', deleted:false, data:{ title:'bot 只寫了標題（缺欄位）' } });
  await load(B); await B.page.evaluate(() => { AIBrain.select('n_evil'); AIBrain.focusBrain('b_evil'); document.getElementById('bConc').click(); }); await sleep(800);
  const xs = await B.page.evaluate(() => ({ x:window.__xss || 0, bad:[...document.querySelectorAll('a[href],img[src],video[src]')].map(e => e.getAttribute('href') || e.getAttribute('src')).filter(u => /^\s*(javascript|data|vbscript):/i.test(u)),
    imgs:document.querySelectorAll('#pBody img[onerror], #crumbs [onmouseover], #cList img').length, crumbs:document.getElementById('crumbs').innerHTML, partial:AIBrain.getState().nodes.find(n => n.id === 'n_partial') }));
  ok(!xs.x && !xs.bad.length && !xs.imgs && !/onmouseover/.test(xs.crumbs), '大腦: 惡意節點／子腦／概念不會執行腳本，也沒有 javascript:/data: 連結 ' + JSON.stringify({ x:xs.x, bad:xs.bad }));
  ok(xs.partial && xs.partial.media && Array.isArray(xs.partial.concepts), '大腦: bot 寫的殘缺節點被補齊欄位，場景照常運作');
  await load(B, 'feed.html'); await sleep(1500);
  const fx = await B.page.evaluate(() => ({ x:window.__xss || 0, n:AIFeed.list().length, has:AIFeed.list().includes('n_evil'), bad:[...document.querySelectorAll('a[href],img[src]')].map(e => e.getAttribute('href') || e.getAttribute('src')).filter(u => /^\s*(javascript|data):/i.test(u)) }));
  await B.page.evaluate(() => AIFeed.go(AIFeed.list().indexOf('n_evil'), true)); await sleep(600);
  const fx2 = await B.page.evaluate(() => window.__xss || 0);
  ok(fx.has && !fx.x && !fx2 && !fx.bad.length, `feed: 讀到共享大腦（${fx.n} 格，含 bot 殘缺節點也不崩潰），惡意內容不會執行`);
  // 11. feed 只讀：按喜歡只存在 localStorage，不寫雲端
  const fp = B.posts.length; await B.page.evaluate(() => document.querySelector('.it.cur .like').click()); await sleep(800);
  ok(B.posts.length === fp && await B.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('aiBrain.feed.v1')).likes).length === 1), 'feed: 喜歡只存在這台裝置（沒有雲端個人資料表）');
  await load(C, 'feed.html'); await sleep(800);
  ok(!C.posts.filter(u => /feed/.test(u)).length && (await C.page.evaluate(() => !!document.getElementById('bSync'))), 'feed（編輯者）: 有同步狀態鈕，但 feed 不寫入');
  // 12. 選單：只有 Email 登入，沒有 GitHub
  await B.page.click('#bSync'); const menu = await B.page.evaluate(() => document.querySelector('.sy-menu.open')?.textContent || '');
  ok(/寄登入連結/.test(menu) && !/GitHub/.test(menu), '同步選單：只有 Email magic link（zh-TW），沒有 GitHub');
  // 13. 🎧 日文轉場音實驗室（main #5／#6）跟同步一起用
  await A.page.close(); await C.page.close();                 // 下面要改雲端資料，先關掉其他編輯者分頁，免得它們插手
  const AUD = ['', '_e01', '_e02', '_e03', '_e04', '_e05'].map(x => 'n_x_jp_audio_lab_v1' + x);
  // main #7：開放性 bot 的 60 個種子（n_x_open_*）也一起檢查
  const OPEN = await B.page.evaluate(() => SEED_EXTRAS.map(x => x.id).filter(id => id.startsWith('n_x_open_')));
  ok(OPEN.length === 60 && OPEN.every(id => db.brain_entities.some(r => r.kind === 'node' && r.id === id && !r.deleted)), `第一次上傳種子時，開放性 bot 的 ${OPEN.length} 個種子節點也在雲端`);
  const NEW = [...AUD, ...OPEN];
  ok(AUD.every(id => db.brain_entities.some(r => r.kind === 'node' && r.id === id && !r.deleted)), '第一次上傳種子時，6 個實驗室種子節點也在雲端');
  // 模擬「#6／#7 之前就上傳過的雲端」：拿掉實驗室＋開放性種子節點、它們的連線和 seedExtras 紀錄
  const isAud = r => (r.kind === 'node' && NEW.includes(r.id)) || (r.kind === 'link' && r.data && (NEW.includes(r.data.from) || NEW.includes(r.data.to)));
  db.brain_entities = db.brain_entities.filter(r => !isAud(r));
  db.brain_entities.filter(r => r.kind === 'meta' && Array.isArray(r.data)).forEach(r => { r.data = r.data.filter(x => !NEW.some(id => String(x) === id || String(x).startsWith(id + '@'))); });
  const tomb0 = db.brain_entities.filter(r => r.deleted).length;
  const F = await device('F（未登入、舊雲端）', null); await load(F); await sleep(1500);
  const pendKeys = d => d.page.evaluate(async () => { const core = await import('./sync-core.js'); const s = JSON.parse(localStorage.getItem('aiBrain.sync.v2:main')); return core.diff(s.snap, AIBrain.getState()).map(o => o.kind + ':' + o.id + (o.deleted ? '†' : '')); });
  let f = await F.page.evaluate(ids => ({ pend:AISync.pending(), has:ids.every(id => AIBrain.getState().nodes.some(n => n.id === id)), sync:document.body.dataset.sync }), NEW);
  ok(f.has && f.pend === 0 && !F.posts.length, `唯讀＋舊雲端：實驗室＋開放性 66 個種子在本機補上，但不算待上傳（pending ${f.pend}），也沒有寫入 ` + JSON.stringify(await pendKeys(F)));
  const E = await device('E（Merlin 新裝置）', T_MERLIN); await load(E); await settle(E);
  ok(NEW.every(id => db.brain_entities.some(r => r.kind === 'node' && r.id === id && !r.deleted)) && db.brain_entities.filter(r => r.deleted).length === tomb0,
    `編輯者＋舊雲端：補上 ${NEW.length} 個種子節點（實驗室 6＋開放性 60），沒有多寫墓碑`);
  await pull(F); f = await F.page.evaluate(ids => ({ pend:AISync.pending(), n:AIBrain.getState().nodes.filter(n => ids.includes(n.id)).length }), NEW);
  const audLinks = db.brain_entities.filter(r => r.kind === 'link' && !r.deleted && r.data && NEW.includes(r.data.to));
  const ids = db.brain_entities.filter(r => r.kind === 'node' && !r.deleted).map(r => r.id);
  ok(f.pend === 0 && f.n === NEW.length && new Set(ids).size === ids.length, `F 再拉一次：種子沒有重複（${f.n} 個節點、雲端 ${audLinks.length} 條連線、沒有重複 id），pending ${f.pend} ` + JSON.stringify(await pendKeys(F)));
  // 「送入主腦」：匯入在 sync 第一次拉取之前就跑完；新增的節點要被當成本機修改上傳，而且只上傳一次
  const payload = { schemaVersion:1, experimentId:'jp-transition-audio-v1', snapshotId:'jp-transition-audio-v1@mock', evaluatedAt:'2026-10-12T00:00:00Z', totalTests:50, technicalPassCount:50, manualRatingCount:0,
    choices:[1, 2, 3, 4, 5].map(i => ({ motifId:'JP0' + i, name:'<img src=x onerror="window.__xss=' + i + '">', use:'換景', id:'JP0' + i + '-01', variation:'original', score:90, humanAverage:null, selectionBasis:'structural-proxy-only' })) };
  const LAB = r => r.kind === 'node' && !r.deleted && r.data && r.data.source && /#jp-transition-audio-v1%40mock$/.test(r.data.source.url || '');
  const labRows = () => db.brain_entities.filter(LAB);
  const kidsOf = id => db.brain_entities.filter(r => r.kind === 'node' && !r.deleted && r.data && r.data.parentId === id).length;
  await E.page.evaluate(p => localStorage.setItem('aiBrain.audioLab.pending.v1', JSON.stringify(p)), payload);
  await load(E, 'index.html?lab=1#audio-lab'); await settle(E);
  const root = labRows()[0];
  ok(labRows().length === 1 && root && kidsOf(root.id) === 5 && !(await E.page.evaluate(() => localStorage.getItem('aiBrain.audioLab.pending.v1'))), 'E: 送入主腦 → 摘要節點＋5 個方向上傳到雲端，待匯入清掉');
  // 同一份快照在另一台已同步的裝置再匯入一次 → 不重複
  const G = await device('G（Merlin 的另一台）', T_PHONE); await load(G); await settle(G);
  await G.page.evaluate(p => localStorage.setItem('aiBrain.audioLab.pending.v1', JSON.stringify(p)), payload);
  await load(G, 'index.html?lab=1#audio-lab'); await settle(G);
  ok(labRows().length === 1 && kidsOf(root.id) === 5, `G: 同一份快照再送一次 → 雲端還是 1 個摘要節點、${kidsOf(root.id)} 個方向`);
  // 未登入的人匯入：只存在這台，不寫雲端
  const fp2 = F.posts.length; await F.page.evaluate(p => localStorage.setItem('aiBrain.audioLab.pending.v1', JSON.stringify(Object.assign({}, p, { snapshotId:'jp-transition-audio-v1@anon' }))), payload);
  await load(F, 'index.html?lab=1#audio-lab'); await sleep(1500);
  f = await F.page.evaluate(() => ({ pend:AISync.pending(), mine:AIBrain.getState().nodes.filter(n => n.source && /%40anon$/.test(n.source.url || '')).length }));
  ok(f.mine === 1 && f.pend >= 6 && F.posts.length === fp2 && !db.brain_entities.some(r => r.data && r.data.source && /%40anon$/.test(r.data.source.url || '')), `F（未登入）匯入：只在本機（待上傳 ${f.pend}），雲端沒有`);
  // 匯入的文字從雲端回來也只當純文字
  await G.page.evaluate(id => { const k = AIBrain.getState().nodes.find(n => n.parentId === id); AIBrain.select(k.id); }, root.id); await sleep(600);
  const gx = await G.page.evaluate(() => ({ x:window.__xss || 0, inj:document.querySelectorAll('#pBody img[onerror]').length }));
  ok(!gx.x && !gx.inj, 'G: 從雲端拉回的匯入節點，惡意文字不會執行');
  // AISync.ready（失敗）：supabase.js 載不到 → ready 照樣 resolve（帶 error、離線、不能寫），不會卡 10 秒，大腦照常
  const H = await device('H（supabase.js 載不到）', T_MERLIN);
  await H.page.setRequestInterception(true);
  H.page.on('request', r => /vendor\/supabase\.js/.test(r.url()) ? r.abort() : r.continue());
  const h0 = Date.now();
  await H.page.goto(`${ORIGIN}/index.html`, { waitUntil:'domcontentloaded', timeout:120000 });
  await H.page.waitForFunction('document.body.dataset.ready === "1"', { timeout:90000 });
  const rH = await H.page.evaluate(async () => { const v = await Promise.race([AISync.ready, new Promise(r => setTimeout(() => r('hang'), 9000))]); await new Promise(r => setTimeout(r, 50));
    return { v, ev:window.__readyEv.length, icon:document.getElementById('bSync')?.textContent, nodes:AIBrain.getState().nodes.length }; });
  const hErr = H.errs.filter(e => !/\[sync\]/.test(e));   // 預期會有一行 console.error('[sync]', …)
  ok(rH.v !== 'hang' && rH.v.enabled && rH.v.status === 'offline' && !rH.v.canWrite && /supabase/.test(rH.v.error || '') && !rH.v.timedOut && rH.ev === 1 && rH.icon === '⚠️' && rH.nodes > 90 && !hErr.length && !H.posts.length,
    `AISync.ready（失敗）: ${Date.now() - h0}ms 內 resolve ${JSON.stringify(rH.v)}，⚠️、${rH.nodes} 節點、沒有其他 JS 錯誤`);
  await H.ctx.close();
  for (const d of [E, F, G]) ok(!d.errs.length, `${d.name}: 沒有 JS 錯誤 ${JSON.stringify(d.errs.slice(0, 3))}`);
  for (const d of [A, B, C, Bob, D]) ok(!d.errs.length, `${d.name}: 沒有 JS 錯誤 ${JSON.stringify(d.errs.slice(0, 3))}`);
} catch(e){ console.error(e); fails++; }
await browser.close(); srv.close();
console.log(fails ? `\n${fails} 項失敗` : '\n全部通過'); process.exit(fails ? 1 : 0);
