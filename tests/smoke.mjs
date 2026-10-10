// 無頭瀏覽器冒煙測試：node tests/smoke.mjs [baseUrl]
// 需要 puppeteer-core 與 Chrome（或用 PUPPETEER=<puppeteer-core 的 esm 入口檔路徑>；CHROME=/usr/bin/google-chrome）。
// 檢查：兩個頁面載入沒有 JS 錯誤、config 空白時不出現同步 UI 且行為跟原本一樣（localStorage 讀寫、新增節點、復原）。
const puppeteer = (await import(process.env.PUPPETEER || 'puppeteer-core')).default;   // PUPPETEER=/path/to/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js
const BASE = process.argv[2] || 'http://127.0.0.1:8871/';
const browser = await puppeteer.launch({ executablePath:process.env.CHROME || '/usr/bin/google-chrome', headless:true, args:['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
async function open(path){
  const page = await browser.newPage(); const errs = [], reqs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('request', r => reqs.push(r.url()));
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
await browser.close();
console.log(fails ? `\n${fails} 項失敗` : '\n全部通過'); process.exit(fails ? 1 : 0);
