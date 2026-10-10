// 用「假的 Supabase」（本機 REST 模擬器）在無頭瀏覽器裡跑整套同步流程：node tests/mock-supabase.mjs
// 不是真的 Supabase：沒有 Realtime（WebSocket 會連不上，改用 AISync.pull() 拉取）、RLS 只模擬「沒登入不能寫」。
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
const USERS = { [jwt('u-merlin', 'authenticated')]:'u-merlin', [jwt('u-phone', 'authenticated')]:'u-merlin', [jwt('u-bob', 'authenticated')]:'u-bob' };
const db = { brain_entities:[], brain_history:[], user_feed_marks:[], user_knowledge:[] };
const PK = { brain_entities:['graph_id', 'kind', 'id'], brain_history:['graph_id', 'hkey'], user_feed_marks:['user_id', 'node_id'], user_knowledge:['user_id'] };
const writes = [];
let clock = 0;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.css':'text/css' };
const srv = http.createServer(async (req, res) => {
  const u = new URL(req.url, ORIGIN); const cors = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'*', 'access-control-expose-headers':'*' };
  if (req.method === 'OPTIONS'){ res.writeHead(204, cors); return res.end(); }
  const send = (code, body, h = {}) => { res.writeHead(code, Object.assign({ 'content-type':'application/json' }, cors, h)); res.end(body === undefined ? '' : JSON.stringify(body)); };
  const token = (req.headers.authorization || '').replace(/^Bearer /, ''); const uid = USERS[token] || null;
  if (u.pathname.startsWith('/auth/v1/')){
    if (u.pathname === '/auth/v1/user') return uid ? send(200, { id:uid, aud:'authenticated', role:'authenticated', email:uid + '@test' }) : send(401, { msg:'no user' });
    if (u.pathname === '/auth/v1/logout') return send(204);
    return send(404, { msg:'not mocked' });
  }
  if (u.pathname.startsWith('/rest/v1/')){
    const table = u.pathname.slice(9); const rows = db[table]; if (!rows) return send(404, { message:'no table' });
    const filters = [...u.searchParams].filter(([k]) => !['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'].includes(k));
    const match = r => filters.every(([k, v]) => { const [op, ...rest] = v.split('.'); const val = rest.join('.'); return op === 'eq' ? String(r[k]) === val : op === 'gt' ? String(r[k]) > val : true; });
    const own = r => !('user_id' in r) || r.user_id === uid;
    if (req.method === 'GET'){
      let out = rows.filter(match).filter(own);
      const off = +(u.searchParams.get('offset') || 0), lim = +(u.searchParams.get('limit') || 1e9);
      out = out.slice(off, off + lim);
      if ((req.headers.accept || '').includes('vnd.pgrst.object')) return out.length ? send(200, out[0]) : send(406, { code:'PGRST116', message:'0 rows' });
      return send(200, out);
    }
    if (req.method === 'POST'){
      if (!uid) return send(401, { code:'42501', message:'new row violates row-level security policy' });
      let body = ''; for await (const c of req) body += c; let list = JSON.parse(body); if (!Array.isArray(list)) list = [list];
      const ignore = /ignore-duplicates/.test(req.headers.prefer || ''); const out = [];
      list.forEach(r => {
        if ('user_id' in PK[table].reduce((o, k) => (o[k] = 1, o), {}) && r.user_id !== uid) return;
        const i = rows.findIndex(x => PK[table].every(k => x[k] === r[k]));
        const now = new Date(Date.UTC(2026, 9, 11) + ++clock * 1000).toISOString();
        if (i >= 0 && ignore) return;
        const n = Object.assign({}, i >= 0 ? rows[i] : {}, JSON.parse(JSON.stringify(r)), { updated_at:now });
        if (table === 'brain_entities'){ n.version = i >= 0 ? rows[i].version + 1 : 1; n.updated_by = uid; n.created_by = r.data && r.data.createdBy || null; }
        if (i >= 0) rows[i] = n; else rows.push(n); out.push(n); writes.push({ table, uid, key:PK[table].map(k => n[k]).join('/') });
      });
      return send(201, /return=representation/.test(req.headers.prefer || '') ? out : undefined);
    }
    return send(405, { message:'method' });
  }
  // static site; config.js is replaced so the site talks to this mock
  if (u.pathname.endsWith('/config.js') || u.pathname === '/config.js'){
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
const session = tok => JSON.stringify({ access_token:tok, refresh_token:'r-' + tok.slice(-6), token_type:'bearer', expires_in:3600 * 24 * 365 * 50, expires_at:4102444800,
  user:{ id:USERS[tok], aud:'authenticated', role:'authenticated', email:USERS[tok] + '@test', app_metadata:{ provider:'email' }, user_metadata:{}, created_at:'2026-01-01T00:00:00Z' } });
async function device(name, tok){
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/WebSocket|realtime|Failed to load resource|fonts/i.test(m.text())) errs.push(m.text()); });
  if (tok) await page.evaluateOnNewDocument(s => { if (!localStorage.getItem('aiBrain.auth')) localStorage.setItem('aiBrain.auth', s); }, session(tok));
  return { name, ctx, page, errs };
}
async function load(d, file = 'index.html'){
  await d.page.goto(`${ORIGIN}/${file}`, { waitUntil:'domcontentloaded' });
  await d.page.waitForFunction('document.body.dataset.ready === "1" && window.AISync && window.AISync.enabled && window.AISync.pull', { timeout:30000 });
  await d.page.waitForFunction('!["syncing"].includes(document.body.dataset.sync)', { timeout:20000 }).catch(() => {});
}
const st = d => d.page.evaluate(() => ({ sync:document.body.dataset.sync, pending:AISync.pending(), icon:document.getElementById('bSync')?.textContent, nodes:window.AIBrain ? AIBrain.getState().nodes : null }));
const waitSynced = d => d.page.waitForFunction('document.body.dataset.sync === "synced"', { timeout:15000 }).then(() => true, () => false);

try {
  const A = await device('A', Object.keys(USERS)[0]), B = await device('B (未登入)', null), C = await device('C', Object.keys(USERS)[1]);
  // 1. first authenticated device seeds the empty project
  await load(A); ok(await waitSynced(A), 'A（登入）: 雲端是空的 → 自動上傳種子，狀態 ☁️');
  const seeded = db.brain_entities.filter(r => r.kind === 'node').length;
  ok(seeded >= 31 && db.brain_entities.some(r => r.kind === 'meta' && r.id === 'seedPatches') && db.brain_history.length > 0, `種子已寫入雲端（${seeded} 節點、seedPatches/seedExtras、history ${db.brain_history.length} 筆）`);
  // 2. anonymous viewer: read-only
  await load(B); let s = await st(B);
  ok(s.sync === 'readonly' && s.icon.startsWith('🔒') && s.nodes.length === seeded, 'B（未登入）: 看得到共享大腦，狀態 🔒 唯讀');
  const before = writes.length;
  await B.page.evaluate(() => AIBrain.addQuestion({ title:'B 本機問題', type:'其他' })); await sleep(1500); s = await st(B);
  ok(s.pending > 0 && writes.length === before && !db.brain_entities.some(r => r.data && r.data.title === 'B 本機問題'), `B: 本機修改照常可用但不上傳（${s.pending} 筆待上傳）`);
  ok(await B.page.evaluate(() => document.body.classList.contains('sync-ro')), 'B: 介面標示唯讀（body.sync-ro、🔒）');
  // 3. A adds a node → server; C (another device of Merlin) loads and sees it
  const aid = await A.page.evaluate(() => AIBrain.addQuestion({ title:'A 新問題', type:'其他', createdBy:'merlin' })); await waitSynced(A);
  ok(db.brain_entities.some(r => r.id === aid && r.data.title === 'A 新問題') && db.brain_history.some(h => h.action === 'add'), 'A: 新增節點 → 寫進 brain_entities + brain_history');
  await load(C); ok(await waitSynced(C), 'C（同一個帳號的另一台裝置）: 載入完成 ☁️');
  ok((await st(C)).nodes.some(n => n.id === aid), 'C: 看得到 A 剛新增的節點');
  // 4. concurrent edits on different nodes
  await A.page.evaluate(() => AIBrain.setStatus('n_q1', 'resolved'));
  await C.page.evaluate(() => AIBrain.addCounterEvidence('n_q2', 'C 的反證', 'merlin'));
  await waitSynced(A); await waitSynced(C);
  await A.page.evaluate(() => AISync.pull()); await C.page.evaluate(() => AISync.pull()); await sleep(300);
  const nA = (await st(A)).nodes, nC = (await st(C)).nodes;
  const q = (ns, id) => ns.find(n => n.id === id);
  ok(q(nA, 'n_q1').status === 'resolved' && q(nC, 'n_q1').status === 'resolved' && q(nA, 'n_q2').counterEvidence.some(c => c.text === 'C 的反證') && q(nC, 'n_q2').counterEvidence.some(c => c.text === 'C 的反證'),
    '兩台裝置同時改不同節點 → 兩邊的修改都保留（沒有整份覆蓋）');
  // 5. undo on A syncs as an edit, and doesn't revert C's edit
  await A.page.evaluate(() => AIBrain.undo()); await waitSynced(A);
  const sv = db.brain_entities.find(r => r.kind === 'node' && r.id === 'n_q1');
  ok(sv.data.status === 'open' && q((await st(A)).nodes, 'n_q2').counterEvidence.some(c => c.text === 'C 的反證'), '↶ 復原：只撤銷 A 自己的動作並同步到雲端，C 的反證還在');
  // 6. offline queue
  await A.page.setOfflineMode(true); await A.page.evaluate(() => dispatchEvent(new Event('offline')));
  await A.page.evaluate(() => AIBrain.setMedia('n_q4', 'image', 'media/x.jpg')); await sleep(800); s = await st(A);
  ok(s.sync === 'offline' && s.pending > 0, `A 離線: 修改進佇列（⚠️，${s.pending} 筆）`);
  await A.page.setOfflineMode(false); await A.page.evaluate(() => dispatchEvent(new Event('online')));
  ok(await waitSynced(A) && db.brain_entities.find(r => r.id === 'n_q4').data.media.image === 'media/x.jpg', 'A 重新連線: 佇列自動上傳 ☁️');
  // 7. deletion → tombstone, other device removes it
  await A.page.evaluate(id => AIBrain.deleteNode(id), aid); await waitSynced(A);
  await C.page.evaluate(() => AISync.pull()); await sleep(300);
  ok(db.brain_entities.find(r => r.id === aid).deleted === true && !(await st(C)).nodes.some(n => n.id === aid), '刪除 → 雲端墓碑（deleted=true），C 也跟著移除');
  // 8. feed: same shared brain, likes go to user_feed_marks
  await load(C, 'feed.html'); await sleep(500);
  const feed = await C.page.evaluate(() => ({ n:AIFeed.list().length, sync:document.body.dataset.sync, btn:!!document.getElementById('bSync') }));
  ok(feed.btn && feed.n >= seeded - 1, `feed.html: 讀同一顆共享大腦（${feed.n} 格），工具列有同步按鈕`);
  await C.page.evaluate(() => document.querySelector('.it.cur .like').click()); await sleep(1500);
  ok(db.user_feed_marks.some(r => r.user_id === 'u-merlin' && r.liked_at), '喜歡 → user_feed_marks（只屬於這個使用者）');
  // the like shows up on another device of the same user
  await load(A, 'feed.html'); await sleep(1500);
  ok(await A.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('aiBrain.feed.v1') || '{}').likes || {}).length > 0), '同一帳號的另一台裝置拿到喜歡');
  ok(db.user_knowledge.some(r => r.user_id === 'u-merlin'), '知識掌握度上傳到 user_knowledge');
  // 9. B logs in → its local edit gets uploaded
  await B.page.evaluate(s => localStorage.setItem('aiBrain.auth', s), session(Object.keys(USERS)[2]));
  await load(B); ok(await waitSynced(B), 'B 登入後重新載入: 本機修改自動上傳 ☁️');
  ok(db.brain_entities.some(r => r.data && r.data.title === 'B 本機問題'), 'B 的本機問題已進雲端');
  // 10. menu renders, no JS errors anywhere
  await A.page.click('#bSync'); const menu = await A.page.evaluate(() => document.querySelector('.sy-menu.open')?.textContent || '');
  ok(/登出|登入/.test(menu), '同步選單可以打開（zh-TW）');
  for (const d of [A, B, C]) ok(!d.errs.length, `${d.name}: 沒有 JS 錯誤 ${JSON.stringify(d.errs.slice(0, 3))}`);
} catch(e){ console.error(e); fails++; }
await browser.close(); srv.close();
console.log(fails ? `\n${fails} 項失敗` : '\n全部通過'); process.exit(fails ? 1 : 0);
