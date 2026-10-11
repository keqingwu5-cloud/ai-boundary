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
  for (let round = 0; round < 2; round++){
    await page.evaluate(p => localStorage.setItem('aiBrain.audioLab.pending.v1', JSON.stringify(p)), payload);
    await page.goto(BASE + 'index.html?r=' + round + '#audio-lab', { waitUntil:'domcontentloaded', timeout:60000 });
    await page.waitForFunction('document.body.dataset.ready === "1"', { timeout:30000 }); await new Promise(r => setTimeout(r, 800));
  }
  const dup = await page.evaluate(() => { const ns = AIBrain.getState().nodes; const roots = ns.filter(n => n.source && /#jp-transition-audio-v1%40xss$/.test(n.source.url || ''));
    const r = roots[0]; if (r){ AIBrain.select(ns.find(n => n.parentId === r.id).id); }
    return { roots:roots.length, kids:r ? ns.filter(n => n.parentId === r.id).length : 0 }; });
  await new Promise(r => setTimeout(r, 600));
  const xss = await page.evaluate(() => ({ x:window.__xss || 0, inj:document.querySelectorAll('#pBody img[onerror], #pBody svg[onload]').length, txt:/onerror/.test(document.getElementById('pBody').textContent) }));
  ok(dup.roots === 1 && dup.kids === 5, `同一份快照送兩次 → 只有 1 個摘要節點、5 個方向（${dup.roots}／${dup.kids}）`);
  ok(!xss.x && !xss.inj && xss.txt, '匯入的惡意文字在節點面板只顯示成純文字，不會執行 ' + JSON.stringify(xss));
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
