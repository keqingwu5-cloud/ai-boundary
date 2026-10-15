// P0 保護基線：真的瀏覽器（headless Chrome＋SwiftShader）裡的本機存檔驗收。node tests/p0-browser.mjs
// 需要 puppeteer-core（PUPPETEER=<esm 入口檔>）與 Chrome（CHROME=/usr/bin/google-chrome）。config.js 空白（不連雲端）。
// 情境：損毀存檔不覆寫＋從備份還原、容量已滿、另一分頁寫入（衝突橫幅／保留此分頁／載入最新）、備份輪替與排除鍵、世界模型納入備份與保護、輕量復原快照。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const puppeteer = (await import(process.env.PUPPETEER || 'puppeteer-core')).default;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 8873), ORIGIN = `http://127.0.0.1:${PORT}`;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json', '.css':'text/css' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, ORIGIN), f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type':MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath:process.env.CHROME || '/usr/bin/google-chrome', headless:true, args:['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ignorable = e => /favicon|fonts\.g|Failed to load resource/i.test(e);
const pages = [];
async function tab(ctx, file = 'index.html'){
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errs.push(m.text()); });
  page.on('dialog', d => d.accept());
  const t = { page, errs, file }; pages.push(t); await go(t, file); return t;
}
async function go(t, file = t.file){
  await t.page.goto(`${ORIGIN}/${file}`, { waitUntil:'domcontentloaded', timeout:120000 });
  await t.page.waitForFunction(file.startsWith('world-model') ? 'document.body.dataset.wmBackupReady === "1"' : 'document.body.dataset.ready === "1"', { timeout:90000 });
  await sleep(400);
}
const ls = (t, k) => t.page.evaluate(k => localStorage.getItem(k), k);
const backupKeys = t => t.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('aiBrain.backup.')).sort());
/* 會跳 confirm() 的按鈕：在頁面裡排程點擊（不讓 evaluate 被對話框卡住），並先把分頁切到前景 */
const clickLater = async (t, sel) => { await t.page.bringToFront(); await t.page.evaluate(sel => setTimeout(() => document.querySelector(sel).click(), 0), sel); };
const persist = t => t.page.evaluate(() => ({ mode:document.body.dataset.persist, banner:document.getElementById('persistBanner')?.textContent || '', status:AIBrain.persistenceStatus() }));

try {
  // ---------- 1. 損毀存檔：不覆寫、好備份保留、可還原 ----------
  {
    const ctx = await browser.createBrowserContext(); const A = await tab(ctx);
    await A.page.evaluate(() => AIBrain.addQuestion({ title:'好資料的問題', type:'其他' })); await sleep(500);
    await go(A);                                          // 重新載入：資料有變 → 寫一份好備份
    const good = await ls(A, 'aiBrain.v1'), goodBk = await backupKeys(A);
    ok(goodBk.length >= 1 && /好資料的問題/.test(good), `正常載入：存檔＋${goodBk.length} 份備份`);
    for (const corrupt of ['{"version":2,"brains":[{"id":"main"}],"nodes":[', JSON.stringify({ version:99, brains:[], nodes:[], links:[], history:[] })]){
      await A.page.evaluate(c => localStorage.setItem('aiBrain.v1', c), corrupt);
      for (let i = 0; i < 3; i++){
        await go(A);
        await A.page.evaluate(() => AIBrain.addQuestion({ title:'保護模式下的修改', type:'其他' })); await sleep(400);
      }
      const p = await persist(A);
      ok(p.mode === 'blocked' && /資料保護模式/.test(p.banner) && /原始存檔沒有被覆寫/.test(p.banner), `損毀存檔（${corrupt.slice(0, 18)}…）: 顯示保護橫幅（${p.status.error}）`);
      ok(await ls(A, 'aiBrain.v1') === corrupt, '連續重新整理＋修改 3 次：損毀原文一個字都沒被覆寫（沒有用種子蓋掉）');
      ok(JSON.stringify(await backupKeys(A)) === JSON.stringify(goodBk), '好的備份還在，沒有被壞資料輪替掉');
    }
    // 從備份還原（點橫幅按鈕）
    await A.page.click('#persistBanner [data-pa="restore"]'); await sleep(200);
    const nav = A.page.waitForNavigation({ timeout:60000 }).catch(() => null);
    await A.page.click('#persistBanner [data-pa="restoreKey"]'); await nav;
    await A.page.waitForFunction('document.body.dataset.ready === "1"', { timeout:90000 }); await sleep(400);
    const after = await persist(A), restored = JSON.parse(await ls(A, 'aiBrain.v1'));
    ok(after.mode === 'ok' && restored.nodes.some(n => n.title === '好資料的問題') && !restored.nodes.some(n => n.title === '保護模式下的修改'),
      '「從備份還原」：重新載入後恢復好資料，保護模式解除');
    const q = await A.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('aiBrain.backup.quarantine.')).map(k => JSON.parse(localStorage.getItem(k)).entries['aiBrain.v1']));
    ok(q.some(v => /"version":99/.test(v)), '還原前的損毀原文另存成隔離副本（不會丟）');
    await ctx.close();
  }
  // ---------- 2. 容量已滿 ----------
  {
    const ctx = await browser.createBrowserContext(); const A = await tab(ctx);
    const before = await ls(A, 'aiBrain.v1');
    await A.page.evaluate(() => { const orig = Storage.prototype.setItem; window.__origSet = orig;
      Storage.prototype.setItem = function(k, v){ if (k === 'aiBrain.v1'){ const e = new DOMException('quota', 'QuotaExceededError'); throw e; } return orig.call(this, k, v); };
      window.__ev = []; AIBrain.on('persistence', s => window.__ev.push(s.mode)); AIBrain.addQuestion({ title:'空間滿時的修改', type:'其他' }); });
    await sleep(600);
    const p = await persist(A);
    ok(p.mode === 'save-failed' && p.status.error === 'QUOTA_EXCEEDED' && /儲存空間已滿/.test(p.banner) && await ls(A, 'aiBrain.v1') === before, '容量已滿：原存檔不變，顯示「儲存空間已滿」橫幅');
    await A.page.evaluate(() => { Storage.prototype.setItem = window.__origSet; }); await A.page.click('#persistBanner [data-pa="retry"]'); await sleep(500);
    const p2 = await persist(A), ev = await A.page.evaluate(() => window.__ev);
    ok(p2.mode === 'ok' && /空間滿時的修改/.test(await ls(A, 'aiBrain.v1')) && ev.join() === 'save-failed,ok', `空間恢復後「再試一次」：修改存進去，事件 ${ev.join('→')}`);
    await ctx.close();
  }
  // ---------- 3. 另一分頁寫入 ----------
  {
    const ctx = await browser.createBrowserContext(); const T1 = await tab(ctx), T2 = await tab(ctx);
    await T1.page.evaluate(() => { window.__ev = []; addEventListener('aibrain:persistence', e => window.__ev.push(e.detail.mode)); });
    await T2.page.evaluate(() => AIBrain.addQuestion({ title:'分頁 2 的問題', type:'其他' })); await sleep(800);
    let p = await persist(T1);
    ok(p.mode === 'conflict' && /另一個分頁已經更新/.test(p.banner) && (await T1.page.evaluate(() => window.__ev)).includes('conflict'), '分頁 1 偵測到分頁 2 寫入：顯示 zh-TW 衝突橫幅＋aibrain:persistence 事件（不是靜默停存）');
    await T1.page.evaluate(() => AIBrain.addQuestion({ title:'分頁 1 的問題', type:'其他' })); await sleep(600);
    let raw = await ls(T1, 'aiBrain.v1');
    ok(/分頁 2 的問題/.test(raw) && !/分頁 1 的問題/.test(raw), '衝突時分頁 1 不覆寫分頁 2 的存檔');
    await clickLater(T1, '#persistBanner [data-pa="keep"]'); await sleep(600);
    raw = await ls(T1, 'aiBrain.v1');
    const bk = await T1.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('aiBrain.backup.')).map(k => JSON.parse(localStorage.getItem(k))).filter(b => b.reason === 'before-tab-overwrite').map(b => b.entries['aiBrain.v1']));
    ok(/分頁 1 的問題/.test(raw) && (await persist(T1)).mode === 'ok' && bk.some(v => /分頁 2 的問題/.test(v)), '「保留這個分頁的版本」：分頁 1 寫入，分頁 2 的版本先存成備份');
    // 現在輪到分頁 2 衝突 → 「載入最新版本」：分頁 2 未存的修改先存成備份
    await T2.page.bringToFront(); p = await persist(T2); ok(p.mode === 'conflict', '分頁 2 也看到衝突橫幅');
    await T2.page.evaluate(() => AIBrain.addQuestion({ title:'分頁 2 沒存到的修改', type:'其他' })); await sleep(400);
    const nav = T2.page.waitForNavigation({ timeout:60000 }).catch(() => null);
    await clickLater(T2, '#persistBanner [data-pa="reload"]'); await nav;
    await T2.page.waitForFunction('document.body.dataset.ready === "1"', { timeout:90000 }); await sleep(400);
    const st2 = await T2.page.evaluate(() => ({ mode:document.body.dataset.persist, nodes:AIBrain.getState().nodes.map(n => n.title),
      saved:Object.keys(localStorage).filter(k => k.startsWith('aiBrain.backup.')).map(k => JSON.parse(localStorage.getItem(k))).filter(b => b.reason === 'unsaved-tab-before-reload').map(b => b.entries['aiBrain.v1']) }));
    ok(st2.mode === 'ok' && st2.nodes.includes('分頁 1 的問題') && st2.saved.some(v => /分頁 2 沒存到的修改/.test(v)), '「載入最新版本」：分頁 2 換成最新存檔，自己沒存到的修改已存成備份（沒有靜默遺失）');
    await ctx.close();
  }
  // ---------- 4. 備份輪替與排除鍵；世界模型納入備份 ----------
  {
    const ctx = await browser.createBrowserContext(); const A = await tab(ctx);
    await A.page.evaluate(() => { localStorage.setItem('worldModel.verify.v1', JSON.stringify([{ id:'v1', hypothesis:'CPI 加速則下次必升息', falsifier:'x', createdOn:'2026-10-01', deadline:'2026-11-01', status:'待驗證' }]));
      localStorage.setItem('aiBrain.audioLab.jpTransitions.v1', '{"big":"' + 'x'.repeat(200000) + '"}'); });
    for (let i = 0; i < 8; i++){ await A.page.evaluate(i => AIBrain.addQuestion({ title:'第 ' + i + ' 次重新整理前', type:'其他' }), i); await sleep(400); await go(A); }
    const info = await A.page.evaluate(() => { const bs = Object.keys(localStorage).filter(k => k.startsWith('aiBrain.backup.')).map(k => JSON.parse(localStorage.getItem(k)));
      return { n:bs.length, keys:[...new Set(bs.flatMap(b => Object.keys(b.entries)))].sort(), wm:bs.every(b => b.entries['worldModel.verify.v1']), list:AIBrain.listBackups().length,
        bytes:Object.keys(localStorage).filter(k => k.startsWith('aiBrain.backup.')).reduce((a, k) => a + localStorage.getItem(k).length, 0), undo:(localStorage.getItem('aiBrain.v1.undo') || '').length }; });
    ok(info.n <= 3 && info.list === info.n, `8 次「修改＋重新整理」後只留 ${info.n} 份備份（${Math.round(info.bytes / 1024)} KB），不會塞滿 localStorage`);
    ok(info.wm && info.keys.includes('worldModel.verify.v1') && !info.keys.some(k => k === 'aiBrain.v1.undo' || k.startsWith('aiBrain.audioLab.') || k.startsWith('aiBrain.auth') || k.startsWith('aiBrain.sync.')),
      `備份內容的鍵：${info.keys.join('、')}（含世界模型；不含 undo／audioLab／auth／sync）`);
    // 世界模型被清空 → 從備份還原
    const bk = await A.page.evaluate(() => AIBrain.listBackups()[0].key);
    await A.page.evaluate(() => localStorage.setItem('worldModel.verify.v1', '[]'));
    const nav = A.page.waitForNavigation({ timeout:60000 }).catch(() => null);
    await A.page.evaluate(k => AIBrain.restoreBackup(k), bk); await nav; await A.page.waitForFunction('document.body.dataset.ready === "1"', { timeout:90000 });
    ok(/CPI 加速/.test(await ls(A, 'worldModel.verify.v1')), 'AIBrain.restoreBackup()：世界模型紀錄跟主腦一起從備份還原');
    // world-model.html：紀錄損毀時不覆寫
    await A.page.evaluate(() => localStorage.setItem('worldModel.verify.v1', '{"oops":'));
    const W = await tab(ctx, 'world-model.html');
    await W.page.evaluate(() => { document.querySelector('#verifyHypothesis').value = '新假設'; document.querySelector('#verifyFalsifier').value = '推翻條件';
      document.querySelector('#verifyDeadline').value = '2099-01-01'; document.querySelector('#verifyForm').requestSubmit(); });
    await sleep(300);
    const w = await W.page.evaluate(() => ({ store:document.body.dataset.verifyStore, notice:document.getElementById('verifyProtect')?.textContent || '', msg:document.getElementById('verifyFormStatus').textContent, raw:localStorage.getItem('worldModel.verify.v1') }));
    ok(w.store === 'protected' && /原始內容沒有被覆寫/.test(w.notice) && w.raw === '{"oops":' && /資料保護/.test(w.msg), 'world-model.html：紀錄損毀時顯示保護提示，新增也不覆寫原文');
    await ctx.close();
  }
  // ---------- 5. 輕量復原快照（沒有 history）----------
  {
    const ctx = await browser.createBrowserContext(); const A = await tab(ctx);
    await A.page.evaluate(() => { const { history, ...lite } = AIBrain.getState(); lite.nodes = lite.nodes.map(n => n.id === 'n_q6' ? { ...n, title:'輕量快照裡的標題' } : n);
      localStorage.setItem('aiBrain.v1.undo', JSON.stringify([JSON.stringify(lite)])); });
    await go(A);
    const r = await A.page.evaluate(() => { const h = AIBrain.getState().history.length; AIBrain.undo(); const s = AIBrain.getState(); return { gone:s.nodes.find(n => n.id === 'n_q6')?.title === '輕量快照裡的標題', h:s.history.length, h0:h, undoLen:JSON.parse(localStorage.getItem('aiBrain.v1.undo') || '[]').length }; });
    ok(r.gone && r.h === r.h0, `輕量復原快照被接受：復原生效，history 沿用（${r.h} 筆）` + (r.gone ? '' : ' ' + JSON.stringify(r)));
    await ctx.close();
  }
  for (const t of pages) ok(!t.errs.length, `${t.file}: 沒有 JS 錯誤 ${JSON.stringify(t.errs.slice(0, 3))}`);
} catch(e){ console.error(e); fails++; }
await browser.close(); srv.close();
console.log(fails ? `\n${fails} 項失敗` : '\n全部通過'); process.exit(fails ? 1 : 0);
