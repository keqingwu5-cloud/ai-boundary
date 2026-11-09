/* Isolated Chromium smoke for the research-only 2D brain tree.
 * Device *emulation* is NOT an actual iPhone/iPad Safari acceptance test.
 * The screenshot artifacts contain ONLY synthetic or test-local data.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const moduleFile = process.env.PLAYWRIGHT_MODULE || '/tmp/first-brain-playwright/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(pathToFileURL(moduleFile).href);
const engine = process.env.BRAIN_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:8765';
const out = process.env.SMOKE_OUT || 'artifacts/tree-view-smoke';
await fs.mkdir(out, { recursive: true });

const browser = await (engine === 'webkit' ? webkit : chromium).launch({
  headless: true, args: engine === 'webkit' ? [] : ['--no-sandbox']
});
let completed = 0;
async function run(name, viewport, mobile) {
  const context = await browser.newContext({
    viewport, deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, isMobile: mobile
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => {
    window.__storageEvents = [];
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        window.__storageEvents.push({ method, key: String(args[0] ?? '') });
        return original.apply(this, args);
      };
    }
  });
  try {
    const response = await page.goto(origin + '/tree-view.html?demo=1', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, name + ' HTML HTTP status');
    await page.waitForFunction(() => document.querySelector('#counts')?.textContent?.includes('3 腦區'));
    assert.match(await page.locator('#status').innerText(), /合成示範資料/);
    assert.equal(await page.locator('#counts').innerText(), '3 腦區 · 9 節點');
    assert.deepEqual(await page.evaluate(() => window.__storageEvents), [], name + ' demo must not access localStorage');
    assert.ok(await page.locator('.node-button').count() >= 9, name + ' visible tree nodes');
    const pageWidth = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, width: window.innerWidth }));
    assert.ok(pageWidth.document <= pageWidth.width + 3, name + ' has unwanted horizontal overflow ' + JSON.stringify(pageWidth));
    await page.screenshot({ path: out + '/' + name + '-demo.png', fullPage: true });
    await page.locator('#search').fill('距離');
    const matching = page.locator('button.node-button').filter({ hasText: '距離的多種定義' });
    assert.equal(await matching.count(), 1, name + ' search filtering');
    await matching.click();
    assert.match(await page.locator('#detail').innerText(), /地理距離和圖譜步數不是同一種度量/);
    assert.equal(await page.locator('#detail a[href*="index.html#node="]').getAttribute('href'),
      './index.html#node=r2', name + ' 2D → 3D deep link');
    await page.locator('#search').fill('');
    const toggle = page.getByRole('button', { name: /收合 世界如棋局 子節點/ });
    assert.equal(await toggle.count(), 1, name + ' expand/collapse control exists');
    await toggle.click();
    assert.equal(await page.locator('button.node-button').filter({ hasText: '距離的多種定義' }).count(), 0,
      name + ' collapsed descendants are hidden');
    await page.getByRole('button', { name: /展開 世界如棋局 子節點/ }).click();
    assert.equal(await page.locator('button.node-button').filter({ hasText: '距離的多種定義' }).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.__storageEvents), [], name + ' demo interaction must not touch storage');
    assert.deepEqual(errors, [], name + ' page errors');

    // Separately seed a disposable browser-local snapshot: the application must never write it.
    const sample = {
      version: 2, brains: [{ id: 'main', name: '本機測試腦', parentBrainId: null, rootNodeId: null }],
      nodes: [{ id: 'local1', title: '測試用節點', brainId: 'main', parentId: null, kind: 'question',
        status: 'open', source: { who: 'synthetic', url: 'javascript:alert(1)' } }],
      links: [], history: []
    };
    const raw = JSON.stringify(sample);
    await page.evaluate(value => window.localStorage.setItem('aiBrain.v1', value), raw);
    const prior = await page.evaluate(() => window.__storageEvents.length);
    await page.goto(origin + '/tree-view.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#counts')?.textContent?.includes('1 腦區'));
    await page.locator('button.node-button').filter({ hasText: '測試用節點' }).click();
    assert.equal(await page.locator('#detail a[href^="javascript:"]').count(), 0,
      name + ' dangerous source URLs must not become links');
    assert.equal(await page.evaluate(() => window.localStorage.getItem('aiBrain.v1')), raw,
      name + ' stored snapshot is byte-identical after use');
    const ops = await page.evaluate(() => window.__storageEvents.filter(e => e.method !== 'getItem'));
    assert.deepEqual(ops, [], name + ' application must not write in the new page');
    assert.deepEqual(errors, [], name + ' errors after local snapshot');
    completed++;
    console.log('PASS ' + name + ': synthetic UI, search, collapse, responsive width, deep link, storage isolation');
  } finally {
    await context.close();
  }
}

// True same-origin navigation through the existing 3D app, not merely inspecting an href.
// Uses a fresh isolated browser context; the legacy 3D app initializes its own public seed
// and may write to disposable localStorage. The new 2D page must not write to it.
async function run2dTo3d() {
  const context = await browser.newContext({
    viewport: { width: 1080, height: 800 }, deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  try {
    const first = await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded' });
    assert.equal(first.status(), 200, engine + ' 3D base route');
    await page.waitForFunction(() =>
      document.body.dataset.ready === '1' &&
      typeof window.AIBrain?.getState === 'function', null, { timeout: 30000 });
    const seed = await page.evaluate(() => {
      const nodes = window.AIBrain.getState().nodes;
      const n = nodes.find(x => x.id === 'n_q1') || nodes.find(x => x.brainId === 'main');
      return n ? { id:n.id, title:n.title, brainId:n.brainId } : null;
    });
    assert.ok(seed && seed.id && seed.title, engine + ' existing 3D should seed real nodes');
    const rawBefore = await page.evaluate(() => localStorage.getItem('aiBrain.v1'));
    assert.ok(rawBefore, engine + ' 3D created its own isolated snapshot');
    const canvas = await page.locator('canvas#c').evaluate(el => ({
      width:el.width, height:el.height
    }));
    assert.ok(canvas.width > 0 && canvas.height > 0, engine + ' existing 3D canvas initialized');

    const second = await page.goto(origin + '/tree-view.html', { waitUntil: 'networkidle' });
    assert.equal(second.status(), 200, engine + ' 2D page route');
    await page.waitForFunction(() =>
      document.querySelector('#counts')?.textContent?.includes('節點'));
    const node = page.locator('button.node-button[data-node-id]').filter({ hasText: seed.title }).first();
    assert.ok(await node.count(), engine + ' node appears in 2D tree');
    await node.click();
    const link = page.locator('#detail a[href*="index.html#node="]');
    assert.ok(await link.count(), engine + ' 2D has 3D deep link');
    assert.equal(await link.getAttribute('href'), './index.html#node=' + encodeURIComponent(seed.id));
    const rawAfter2D = await page.evaluate(() => localStorage.getItem('aiBrain.v1'));
    assert.equal(rawAfter2D, rawBefore, engine + ' new 2D view leaves original snapshot unchanged');

    await Promise.all([
      page.waitForURL(url => url.pathname.endsWith('/index.html') && url.hash === '#node=' + encodeURIComponent(seed.id)),
      link.click()
    ]);
    await page.waitForFunction(id =>
      document.body.dataset.ready === '1' && window.AIBrain?.getState?.().nodes.some(n => n.id === id),
      seed.id, { timeout:30000 });
    await page.waitForFunction(title =>
      document.querySelector('#panel')?.classList.contains('open') &&
      document.querySelector('#pBody')?.textContent?.includes(title),
      seed.title, { timeout:15000 });
    await page.waitForTimeout(650);
    const state = await page.evaluate(() => ({
      hash: location.hash,
      panelOpen: document.querySelector('#panel')?.classList.contains('open'),
      title: document.querySelector('#pBody')?.textContent || '',
      canvasWidth: document.querySelector('#c')?.width ?? 0,
      canvasHeight: document.querySelector('#c')?.height ?? 0
    }));
    assert.equal(state.hash, '#node=' + encodeURIComponent(seed.id));
    assert.equal(state.panelOpen, true);
    assert.ok(state.title.includes(seed.title));
    assert.ok(state.canvasWidth > 0 && state.canvasHeight > 0);
    assert.deepEqual(pageErrors, [], engine + ' 3D page errors');
    await page.screenshot({ path: out + '/' + engine + '-3d-real-seed-focus.png', fullPage:false });
    console.log('PASS ' + engine + ' 2D_TO_EXISTING_3D_REAL_ROUTE ' + seed.id +
      ' (same-origin isolated seed, original 3D app, panel focus, snapshot unchanged by 2D)');
    return true;
  } finally {
    await context.close();
  }
}

try {
  await run('phone-390', { width: 390, height: 844 }, true);
  await run('tablet-820', { width: 820, height: 1180 }, true);
  await run2dTo3d();
  console.log('SUMMARY ' + completed + '/2 ' + engine.toUpperCase() + '_EMULATED_DEVICE_CHECKS_PASS; 1/1 REAL_3D_ROUTE');
} finally {
  await browser.close();
}
