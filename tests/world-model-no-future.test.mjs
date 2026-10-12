// world-model.html 時間回溯不能看到未來的市場資料。
// 月份標籤是 '2026/03'，價格鍵是 '2026-03'；以前直接比字串，'/'（0x2F）比 '-'（0x2D）大，
// 所以選 2026/03 時同年 04–09 月也被算進來（SPY 762.34、BTC $83,563 是 2026-09 的值）。
// 這個測試不用瀏覽器：把頁面裡的 <script> 放進 vm，用最小的假 DOM 跑每一個滑桿月份，
// 檢查市場卡片、折線圖、累計變動、警報和匯出 JSON 的 market 欄位都沒有晚於所選月份的資料。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.env.WM_FILE || path.join(ROOT, 'world-model.html');

function load() {
  const html = fs.readFileSync(FILE, 'utf8');
  const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(c => c.includes('const prices='));
  assert.ok(code, '找不到 world-model.html 的主程式');
  const els = new Map();
  const el = sel => { if (!els.has(sel)) els.set(sel, { sel, textContent:'', innerHTML:'', className:'', value:'', children:[], handlers:{},
    addEventListener(t, f) { this.handlers[t] = f; }, replaceChildren(...c) { this.children = c; }, click() {} }); return els.get(sel); };
  for (const [id, v] of [['#capital', '100000'], ['#allocation', '10'], ['#change', '5'], ['#cost', '0.5'], ['#horizon', '12'], ['#month', '11']]) el(id).value = v;
  const blobs = [];
  const ctx = { document:{ querySelector:el, createElement:() => ({ className:'', textContent:'', click() {} }) },
    Blob:class { constructor(parts) { blobs.push(parts.join('')); } }, URL:{ createObjectURL:() => 'blob:x', revokeObjectURL() {} },
    Intl, Math, Number, JSON, setTimeout:() => 0, console };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;globalThis.__wm={months,prices,get model(){return model}};', ctx);
  return { el, blobs, wm:ctx.__wm };
}

test('每一個滑桿月份：市場卡片、折線圖、累計變動、警報、匯出都不含未來月份', () => {
  const { el, blobs, wm } = load();
  const { months, prices } = wm;
  assert.equal(months.length, 13);
  for (let i = 0; i < months.length; i++) {
    const key = months[i].replace('/', '-');
    el('#month').handlers.input({ target:{ value:String(i) } });
    const allowed = prices.filter(r => r[0] <= key);   // 正確的：同格式的鍵互比
    const last = allowed.at(-1);
    const m = JSON.parse(JSON.stringify(wm.model));   // vm 裡的陣列跟這邊不同 realm，先轉成一般物件再比
    // 市場卡片
    assert.ok(m.market && m.market.month <= key, `${months[i]}：market.month=${m.market && m.market.month}`);
    assert.equal(m.market.month, last[0], months[i]);
    assert.equal(el('#market').textContent, 'SPY ' + last[1].toFixed(2), months[i]);
    assert.ok(el('#marketMeta').textContent.endsWith(last[0] + ' 月K'), months[i]);
    for (const r of prices.filter(r => r[0] > key)) {
      assert.ok(!el('#market').textContent.includes(r[1].toFixed(2)), `${months[i]} 卡片出現 ${r[0]} 的 SPY`);
    }
    // 折線圖：兩條線各 allowed.length 個點，右下角標籤是最後一個允許的月份
    const polys = [...el('#chart').innerHTML.matchAll(/<polyline[^>]*points="([^"]*)"/g)].map(x => x[1].split(' ').length);
    assert.deepEqual(polys, [allowed.length, allowed.length], months[i]);
    assert.ok(el('#chart').innerHTML.includes('>' + last[0].replace('-', '/') + '</text>'), months[i]);
    // 累計變動
    assert.equal(el('#marketCompare').textContent, '累計變動（2025/10=100）：SPY ' + (100 * last[1] / prices[0][1]).toFixed(1) + '；BTC ' + (100 * last[2] / prices[0][2]).toFixed(1) + '。', months[i]);
    // 警報：SPY／BTC 分歧只能用允許的最後兩個月判斷
    let diverge = false;
    if (allowed.length > 1) { const a = allowed.at(-1), b = allowed.at(-2), d1 = (a[1] / b[1] - 1) * 100, d2 = (a[2] / b[2] - 1) * 100; diverge = Math.sign(d1) !== Math.sign(d2) && Math.abs(d1 - d2) > 3; }
    assert.equal(m.alerts.some(t => t.startsWith('SPY 與 BTC')), diverge, `${months[i]} 分歧警報`);
    assert.deepEqual(el('#alerts').children.map(c => c.textContent), m.alerts, months[i]);
    // 能源警報來自已發布的 CPI（日期比對），發布日不能晚於截止日
    if (m.cpi) assert.ok(m.cpi.released <= m.cutoff, months[i]);
    // 匯出 JSON
    el('#export').handlers.click();
    const out = JSON.parse(blobs.at(-1));
    assert.ok(out.market.month <= key, `${months[i]} 匯出 market.month=${out.market.month}`);
    assert.deepEqual(out.market, { month:last[0], spy:last[1], btc:last[2] }, months[i]);
    assert.deepEqual(out.alerts, m.alerts, months[i]);
  }
});

test('具體例子：選 2026/03 看到的是 2026-03（SPY 650.12），不是 2026-09（SPY 762.34）', () => {
  const { el, wm } = load();
  el('#month').handlers.input({ target:{ value:String(wm.months.indexOf('2026/03')) } });
  assert.equal(wm.model.market.month, '2026-03');
  assert.equal(el('#market').textContent, 'SPY 650.12');
  assert.ok(!el('#marketMeta').textContent.includes('83,563'));
});
