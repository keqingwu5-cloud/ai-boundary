// 無頭瀏覽器冒煙測試：node tests/smoke.mjs [baseUrl]
// 需要 puppeteer-core 與 Chrome（或用 PUPPETEER=<puppeteer-core 的 esm 入口檔路徑>；CHROME=/usr/bin/google-chrome）。
// 檢查：兩個頁面載入沒有 JS 錯誤、config 空白時不出現同步 UI 且行為跟原本一樣（localStorage 讀寫、新增節點、復原）；
//       資料拆檔後產生的大腦／feed 跟舊的 data.js（tests/fixtures/data.legacy.js）一樣；📅 每日動態能打開、點節點、不會被 XSS。
//       SHOT=<檔名.png> 會另外存一張大腦頁打開每日動態的截圖。
const puppeteer = (await import(process.env.PUPPETEER || 'puppeteer-core')).default;   // PUPPETEER=/path/to/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js
const BASE = process.argv[2] || 'http://127.0.0.1:8871/';
const browser = await puppeteer.launch({ executablePath:process.env.CHROME || '/usr/bin/google-chrome', headless:true, args:['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/* route：{ 'data.js': 檔案內容 } → 攔截這些請求改回傳指定內容（用來換成舊的 data.js、或注入惡意的 activity.json） */
async function open(path, route, viewport){
  const ctx = await browser.createBrowserContext();             // 每次都是乾淨的 localStorage
  const page = await ctx.newPage(); const errs = [], reqs = [];
  if (viewport) await page.setViewport(viewport);
  if (route){ await page.setRequestInterception(true);
    page.on('request', r => { const k = Object.keys(route).find(k => new URL(r.url()).pathname.endsWith('/' + k));
      if (k) r.respond({ status:200, contentType:k.endsWith('.json') ? 'application/json' : 'text/javascript', body:route[k] }); else r.continue(); }); }
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('request', r => reqs.push(r.url()));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + path, { waitUntil:'domcontentloaded', timeout:60000 });
  await page.waitForFunction('document.body.dataset.ready === "1"', { timeout:30000 });
  await new Promise(r => setTimeout(r, 800));
  return { page, errs, reqs };
}
const ignorable = e => /favicon|fonts\.g|giscus|Failed to load resource/i.test(e);
{
  const { page, errs, reqs } = await open('index.html');
  const r = await page.evaluate(() => ({ errs:window.__errs, sync:window.AISync ? { enabled:window.AISync.enabled } : null, btn:!!document.getElementById('bSync'), nodes:AIBrain.getState().nodes.length, ls:!!localStorage.getItem('aiBrain.v1') }));
  ok(!errs.filter(e => !ignorable(e)).length && !r.errs.length, 'index.html: no JS errors ' + JSON.stringify([...errs, ...r.errs]));
  ok(r.sync && r.sync.enabled === false && !r.btn, 'index.html: config empty → sync disabled, no sync UI');
  ok(!reqs.some(u => /supabase/.test(u)), 'index.html: supabase-js not downloaded when config is empty');
  ok(r.ls && r.nodes > 10, 'index.html: localStorage brain saved (' + r.nodes + ' nodes)');
  const after = await page.evaluate(async () => { const id = AIBrain.addQuestion({ title:'冒煙測試問題', type:'其他' }); await new Promise(r => setTimeout(r, 400));
    const saved = JSON.parse(localStorage.getItem('aiBrain.v1')).nodes.some(n => n.id === id); AIBrain.undo(); await new Promise(r => setTimeout(r, 100));
    return { saved, undone:!AIBrain.getState().nodes.some(n => n.id === id), q:localStorage.getItem('aiBrain.sync.v1:main') }; });
  ok(after.saved && after.undone && after.q === null, 'index.html: add → localStorage, undo works, no sync queue written');
  // ↩ 併回的 🕘 紀錄可以點（打開節點）
  const mh = await page.evaluate(async () => { const st = AIBrain.getState(); const n = st.nodes.find(x => x.id === 'n_q3_e0') || st.nodes.find(x => x.parentId === 'n_q3');
    AIBrain.makeSubBrain(n.id); const b = AIBrain.getState().brains.find(x => x.rootNodeId === n.id); AIBrain.mergeBrain(b.id); await new Promise(r => setTimeout(r, 300));
    document.getElementById('bHist').click(); await new Promise(r => setTimeout(r, 300));
    const el = [...document.querySelectorAll('#hList .hi')].find(e => /併回/.test(e.textContent)); if (!el || !el.dataset.n) return { el:!!el };
    el.click(); await new Promise(r => setTimeout(r, 600)); return { el:true, n:el.dataset.n, open:document.getElementById('panel').classList.contains('open') }; });
  ok(mh.el && mh.n && mh.open, 'index.html: ↩ 併回 的 🕘 紀錄帶 nodeId、點了會打開節點 ' + JSON.stringify(mh));
  // ↺ 重置：不丟錯誤；回到「初始狀態＋種子遷移」（概念、SEED_EXTRAS 都在）；紀錄抽屜跟著更新
  const e0 = errs.length;
  const rs = await page.evaluate(async () => { const fresh = AIBrain.getState(); AIBrain.addQuestion({ title:'重置前的問題', type:'其他' });
    if (!document.getElementById('hist').classList.contains('open')) document.getElementById('bHist').click();
    document.getElementById('bReset').click(); await new Promise(r => setTimeout(r, 1200)); const st = AIBrain.getState();
    return { n:st.nodes.length, extras:st.nodes.filter(n => n.id.startsWith('n_x_')).length, open:st.nodes.filter(n => n.id.startsWith('n_x_open_')).length, concepts:Object.keys(st.concepts || {}).length,
      gone:!st.nodes.some(n => n.title === '重置前的問題'), first:document.querySelector('#hList .hi')?.textContent || '', legend:document.getElementById('legend')?.textContent || '', hcount:document.getElementById('hCount')?.textContent || '', histLen:st.history.length }; });
  ok(errs.length === e0 && rs.gone && rs.open === 60 && rs.extras >= 66 && rs.concepts > 10 && rs.legend.includes(rs.n + ' 節點'),
    `index.html: ↺ 重置不丟錯誤，回到 ${rs.n} 節點（含 ${rs.extras} 個 SEED_EXTRAS、${rs.concepts} 個概念），圖例同步 ` + JSON.stringify({ errs:errs.slice(e0), first:rs.first.slice(0, 30), legend:rs.legend.slice(-14) }));
  await page.close();
}
{
  const { page, errs, reqs } = await open('feed.html');
  const r = await page.evaluate(() => ({ errs:window.__errs, sync:window.AISync ? { enabled:window.AISync.enabled } : null, btn:!!document.getElementById('bSync'), n:AIFeed.list().length, ks:!!document.querySelector('.ks-badge') }));
  ok(!errs.filter(e => !ignorable(e)).length && !r.errs.length, 'feed.html: no JS errors ' + JSON.stringify([...errs, ...r.errs]));
  ok(r.sync && r.sync.enabled === false && !r.btn && r.ks, 'feed.html: sync disabled, no sync UI, knowledge badge still there');
  ok(r.n > 10, 'feed.html: shows ' + r.n + ' items');
  ok(!reqs.some(u => /supabase/.test(u)), 'feed.html: supabase-js not downloaded');
  const like = await page.evaluate(() => { const el = document.querySelector('.it.cur .like'); el.click(); return JSON.parse(localStorage.getItem('aiBrain.feed.v1')).likes; });
  ok(Object.keys(like).length === 1, 'feed.html: like saved to localStorage');
  await page.close();
}
{
  // 🎧 日文轉場音實驗室（main 的 #5／#6）：config 空白時，實驗室頁、種子節點、「送入主腦」匯入都照常運作
  const page = await browser.newPage(); const errs = [], reqs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errs.push('console: ' + m.text()); });
  page.on('request', r => reqs.push(r.url()));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + 'audio-lab.html', { waitUntil:'domcontentloaded', timeout:60000 });
  await page.waitForFunction('document.querySelectorAll("#resultsBody tr").length === 50', { timeout:30000 });
  const lab = await page.evaluate(() => ({ n:document.getElementById('sampleCount').textContent, ok:document.getElementById('validCount').textContent }));
  ok(lab.n === '50' && lab.ok === '50' && !errs.length, 'audio-lab.html: 50 組、50 個技術合格、沒有 JS 錯誤 ' + JSON.stringify(errs));
  const AUDIO = n => n.source && n.source.outlet === 'JP Audio Lab v1';
  await Promise.all([page.waitForNavigation({ waitUntil:'domcontentloaded', timeout:60000 }), page.click('#sendBrain')]);
  await page.waitForFunction('document.body.dataset.ready === "1"', { timeout:30000 }); await new Promise(r => setTimeout(r, 1000));
  const imp = await page.evaluate(() => { const ns = AIBrain.getState().nodes; const root = ns.find(n => n.source && n.source.outlet === 'JP Audio Lab v1');
    return { href:location.hash, root:!!root, kids:root ? ns.filter(n => n.parentId === root.id).length : 0, pend:localStorage.getItem('aiBrain.audioLab.pending.v1'),
      seeds:['', '_e01', '_e02', '_e03', '_e04', '_e05'].every(x => ns.some(n => n.id === 'n_x_jp_audio_lab_v1' + x)), syncKeys:Object.keys(localStorage).filter(k => /sync/.test(k)), errs:window.__errs }; });
  ok(imp.root && imp.kids === 5 && imp.pend === null && imp.seeds, 'index.html#audio-lab: 送入主腦 → 摘要節點＋5 個音型方向，待匯入清掉；6 個實驗室種子節點也在');
  ok(!imp.syncKeys.length && !reqs.some(u => /supabase/.test(u)) && !imp.errs.length && !errs.length, 'audio lab 匯入（config 空白）: 沒有同步佇列、沒有下載 supabase-js、沒有 JS 錯誤 ' + JSON.stringify([...errs, ...imp.errs]));
  // 同一份快照再送一次 → 不會重複新增；惡意文字只當純文字顯示
  const payload = { schemaVersion:1, experimentId:'jp-transition-audio-v1', snapshotId:'jp-transition-audio-v1@xss', evaluatedAt:'2026-10-12T00:00:00Z', totalTests:50, technicalPassCount:50, manualRatingCount:0,
    choices:[1, 2, 3, 4, 5].map(i => ({ motifId:'JP0' + i, name:'<img src=x onerror="window.__xss=' + i + '">', use:'"><svg onload="window.__xss=9">', id:'JP0' + i + '-01', variation:'original', score:90, humanAverage:null, selectionBasis:'<b>x</b>' })) };
  await page.close();
  // 新的瀏覽器設定檔：同一份快照送兩次、同一個實驗的新快照再送一次 → 還是只有 1 個摘要節點、5 個方向
  const ctx = await browser.createBrowserContext(); const p2 = await ctx.newPage(); const e2 = [];
  p2.on('pageerror', e => e2.push('pageerror: ' + e.message)); p2.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) e2.push('console: ' + m.text()); });
  await p2.goto(BASE + 'index.html', { waitUntil:'domcontentloaded', timeout:60000 });
  for (const [round, snap] of [[0, '@xss'], [1, '@xss'], [2, '@xss-later']]){
    await p2.evaluate((p, s) => localStorage.setItem('aiBrain.audioLab.pending.v1', JSON.stringify(Object.assign({}, p, { snapshotId:'jp-transition-audio-v1' + s }))), payload, snap);
    await p2.goto(BASE + 'index.html?r=' + round + '#audio-lab', { waitUntil:'domcontentloaded', timeout:60000 });
    await p2.waitForFunction('document.body.dataset.ready === "1" && !localStorage.getItem("aiBrain.audioLab.pending.v1")', { timeout:30000 }).catch(() => {}); await new Promise(r => setTimeout(r, 800));
  }
  const page2 = p2;
  const dup = await page2.evaluate(() => { const ns = AIBrain.getState().nodes; const roots = ns.filter(n => n.source && n.source.outlet === 'JP Audio Lab v1' && !n.parentId);
    const r = roots[0]; if (r){ AIBrain.select(ns.find(n => n.parentId === r.id).id); }
    return { roots:roots.length, kids:r ? ns.filter(n => n.parentId === r.id).length : 0 }; });
  await new Promise(r => setTimeout(r, 600));
  const xss = await page2.evaluate(() => ({ x:window.__xss || 0, inj:document.querySelectorAll('#pBody img[onerror], #pBody svg[onload]').length, txt:/onerror/.test(document.getElementById('pBody').textContent) }));
  ok(dup.roots === 1 && dup.kids === 5 && !e2.length, `同一份快照送兩次、同一個實驗的新快照再送 → 只有 1 個摘要節點、5 個方向（${dup.roots}／${dup.kids}） ` + JSON.stringify(e2));
  ok(!xss.x && !xss.inj && xss.txt, '匯入的惡意文字在節點面板只顯示成純文字，不會執行 ' + JSON.stringify(xss));
  await ctx.close();
}
/* ---------- 資料拆檔：跟舊 data.js 產生的種子一模一樣 ---------- */
const LEGACY = { 'data.js':fs.readFileSync(path.join(ROOT, 'tests/fixtures/data.legacy.js'), 'utf8') };
const norm = st => JSON.parse(JSON.stringify(st, (k, v) => (k === 'createdAt' || k === 'ts' || k === 'pos') ? undefined : v));
{
  const grab = async route => { const { page, errs } = await open('index.html', route); const st = await page.evaluate(() => AIBrain.getState()); const e = errs.filter(e => !ignorable(e)); await page.close(); return { st:norm(st), e }; };
  const N = await grab(), L = await grab(LEGACY);
  ok(!L.e.length && !N.e.length, 'index.html: 舊 data.js 和新的載入器都沒有錯誤');
  const nodes = s => s.nodes.map(n => JSON.stringify(n)).sort(), links = s => s.links.map(l => [l.from, l.to, l.kind].join('>')).sort();
  ok(JSON.stringify(nodes(N.st)) === JSON.stringify(nodes(L.st)) && N.st.nodes.length === L.st.nodes.length, `index.html: 新舊種子節點完全相同（${N.st.nodes.length} 個，內容逐欄比對）`);
  ok(JSON.stringify(links(N.st)) === JSON.stringify(links(L.st)), 'index.html: 新舊連結相同');
  ok(JSON.stringify([N.st.concepts, N.st.patterns, N.st.seedExtras, N.st.seedPatches]) === JSON.stringify([L.st.concepts, L.st.patterns, L.st.seedExtras, L.st.seedPatches]), 'index.html: 概念、流程、seedExtras／seedPatches 紀錄相同');
  const feed = async route => { const { page } = await open('feed.html', route); const r = await page.evaluate(() => AIFeed.list()); await page.close(); return r; };
  const fN = await feed(), fL = await feed(LEGACY);
  ok(JSON.stringify(fN) === JSON.stringify(fL), `feed.html: 新舊清單與順序相同（${fN.length} 則）`);
}

/* ---------- 📅 每日動態 ---------- */
const ACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/activity.json'), 'utf8'));
{
  const { page, errs } = await open('index.html');
  const aria0 = await page.evaluate(() => [document.getElementById('bAct').getAttribute('aria-label'), document.getElementById('bAct').getAttribute('aria-expanded')]);
  await page.click('#bAct'); await page.waitForSelector('.ac-panel.open .ac-e');
  const aria1 = await page.evaluate(() => [document.getElementById('bAct').getAttribute('aria-label'), document.getElementById('bAct').getAttribute('aria-expanded'), document.querySelector('.ac-x').getAttribute('aria-label')]);
  ok(aria0[0] === '每日動態' && aria0[1] === 'false' && aria1[0] === '每日動態' && aria1[1] === 'true' && aria1[2] === '關閉每日動態', 'index.html: #bAct／.ac-x 有固定的 aria-label，aria-expanded 跟著開關 ' + JSON.stringify([aria0, aria1]));
  const r = await page.evaluate(() => ({ n:AIActivity.entries().length, days:document.querySelectorAll('.ac-day').length, open:document.querySelectorAll('.ac-day[open]').length, shown:document.querySelectorAll('.ac-day[open] .ac-e').length, sub:document.querySelectorAll('.ac-e.sub').length }));
  ok(r.n === ACT.length && r.days === new Set(ACT.map(e => e.date)).size && r.open === 1 && r.shown > 0, `index.html: 📅 依日期分組（${r.days} 天、${r.n} 筆，最新一天展開）`);
  ok(r.sub > 0, 'index.html: 同一天裡的衍生事件縮排在父事件底下');
  const links = await page.evaluate(() => [...document.querySelectorAll('.ac-day[open] .ac-e a.lk')].map(a => [a.getAttribute('href'), a.target, a.rel]));
  ok(links.length > 0 && links.every(([h, t, rel]) => /^https:\/\/github\.com\/keqingwu5-cloud\/ai-boundary\/(commit|pull)\//.test(h) && t === '_blank' && /noopener/.test(rel)), `index.html: PR／commit 連結顯示出來（${links.length} 個，新分頁開啟）`);
  await page.click('.ac-tabs [data-v="tree"]');
  const t = await page.evaluate(() => ({ all:document.querySelectorAll('.ac-e').length, sub:document.querySelectorAll('.ac-e.sub').length, tg:document.querySelectorAll('.ac-tg').length }));
  ok(t.all === ACT.length && t.sub === ACT.filter(e => e.parentId).length && t.tg > 0, `index.html: 🌳 衍生樹顯示全部 ${t.all} 筆，${t.sub} 筆縮排在父事件底下`);
  const first = await page.$eval('.ac-tg', b => b.dataset.tg);
  await page.click('.ac-tg'); const c1 = await page.evaluate(() => document.querySelectorAll('.ac-e').length);
  await page.click(`.ac-tg[data-tg="${first}"]`); const c2 = await page.evaluate(() => document.querySelectorAll('.ac-e').length);
  ok(c1 < t.all && c2 === t.all, `index.html: ▾／▸ 收合再展開（${t.all} → ${c1} → ${c2}）`);
  await page.click('.ac-e [data-node="n_q2"]'); await new Promise(r => setTimeout(r, 600));
  const sel = await page.evaluate(() => ({ closed:!document.querySelector('.ac-panel.open'), panel:document.querySelector('#panel.open #pBody')?.textContent || '' }));
  ok(sel.closed && sel.panel.includes('世界'), 'index.html: 點節點 id → 關閉動態、在大腦打開那個節點');
  ok(!errs.filter(e => !ignorable(e)).length, 'index.html: 每日動態沒有 JS 錯誤 ' + JSON.stringify(errs));
  await page.close();
}
{
  const { page, errs } = await open('feed.html');
  await page.click('#bAct'); await page.waitForSelector('.ac-panel.open .ac-e');
  await page.click('.ac-day[open] .ac-e [data-node]');
  const id = await page.evaluate(() => document.querySelector('.ac-day[open] .ac-e [data-node]').dataset.node);
  await new Promise(r => setTimeout(r, 800));
  const r = await page.evaluate(() => ({ cur:AIFeed.current(), hash:location.hash, closed:!document.querySelector('.ac-panel.open') }));
  ok(r.closed && r.cur === id && r.hash === '#node=' + id, `feed.html: 📅 按鈕在、點節點 → 跳到 ${id}`);
  ok(!errs.filter(e => !ignorable(e)).length, 'feed.html: 每日動態沒有 JS 錯誤');
  await page.close();
}
{
  const evil = [{ id:'evil-1', date:'2026-10-11', ts:'2026-10-11T09:00:00+08:00', bot:'<img src=x onerror="window.__xss=1">', kind:'<script>window.__xss=2</script>',
    title:'<img src=x onerror="window.__xss=3">', summary:'"><svg onload="window.__xss=4">', nodes:['"><img src=x onerror="window.__xss=5">'],
    links:[{ label:'<b>x</b>', url:'javascript:window.__xss=6' }, { label:'ok', url:'https://example.com/" onmouseover="window.__xss=7' }, { label:'<i>good</i>', url:'https://example.com/ok' }], parentId:'"><img src=x onerror=window.__xss=8>' }];
  const { page } = await open('index.html', { 'content/activity.json':JSON.stringify(evil) });
  await page.click('#bAct'); await page.waitForSelector('.ac-panel.open .ac-e');
  await page.click('.ac-tabs [data-v="tree"]'); await new Promise(r => setTimeout(r, 300));
  const r = await page.evaluate(() => ({ xss:window.__xss, img:document.querySelectorAll('.ac-panel img, .ac-panel svg, .ac-panel script').length,
    js:[...document.querySelectorAll('.ac-panel a')].some(a => /^javascript:/i.test(a.getAttribute('href'))), good:[...document.querySelectorAll('.ac-panel a')].map(a => a.textContent + ' ' + a.getAttribute('href')), attrs:[...document.querySelectorAll('.ac-panel *')].some(el => [...el.attributes].some(a => /^on/i.test(a.name))) }));
  ok(r.xss === undefined && !r.img && !r.js && !r.attrs && r.good.length === 1 && r.good[0] === '↗ <i>good</i> https://example.com/ok', '每日動態：惡意的 title／bot／kind／節點 id／連結都被跳脫，javascript: 連結被拿掉 ' + JSON.stringify(r));
  await page.close();
}
if (process.env.SHOT){
  const { page } = await open('index.html#activity', null, { width:1280, height:860, deviceScaleFactor:1 });
  await page.waitForSelector('.ac-panel.open .ac-e'); await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path:process.env.SHOT }); console.log('📸 ' + process.env.SHOT);
  if (process.env.SHOT_TREE){ await page.click('.ac-tabs [data-v="tree"]'); await new Promise(r => setTimeout(r, 500)); await page.screenshot({ path:process.env.SHOT_TREE }); console.log('📸 ' + process.env.SHOT_TREE); }
  await page.close();
}
await browser.close();
{
  // 沒有 WebGL：顯示 zh-TW 說明＋短影音連結，不丟錯誤
  const b2 = await puppeteer.launch({ executablePath:process.env.CHROME || '/usr/bin/google-chrome', headless:true, args:['--no-sandbox', '--disable-webgl', '--disable-3d-apis'] });
  const page = await b2.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(BASE + 'index.html', { waitUntil:'domcontentloaded', timeout:60000 });
  await page.waitForSelector('#noGL', { timeout:30000 }).catch(() => {}); await new Promise(r => setTimeout(r, 1500));
  const r = await page.evaluate(() => { const d = document.getElementById('noGL'); return { msg:d ? d.innerText : '', link:d?.querySelector('a[href="feed.html"]') ? true : false, flag:document.body.dataset.webgl, errs:window.__errs }; });
  ok(/無法啟用 3D（WebGL）/.test(r.msg) && r.link && r.flag === '0', 'index.html（沒有 WebGL）: 顯示說明和「📱 改看短影音」連結');
  ok(!errs.length && !r.errs.length, 'index.html（沒有 WebGL）: 沒有 JS 錯誤 ' + JSON.stringify([...errs, ...r.errs]));
  await b2.close();
}
console.log(fails ? `\n${fails} 項失敗` : '\n全部通過'); process.exit(fails ? 1 : 0);
