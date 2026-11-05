'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

const origin = 'http://127.0.0.1:8765';
const pageUrl = origin + '/index.html';
const txUrl = pageUrl + '?brainTx=1';
const ready = page => page.waitForFunction(() => window.AIBrain && document.body.dataset.ready === '1');

const snapshot = page => page.evaluate(async () => {
  const { readTransactional3D } = await import('/first-brain-idb-adapter.mjs');
  const result = await readTransactional3D('aiBrain.firstBrain.transaction.r1');
  if (!result.ok) throw Error(result.reason);
  return {
    revision: result.revision,
    mainRaw: result.mainRaw,
    undoRaw: result.undoRaw,
    receipts: result.graph.history.filter(event => event.action === 'plan.loaded').length,
    planNodes: result.graph.nodes.filter(node => node.createdBy === 'plan_import_candidate').length
  };
});

test('native 3D tabs reject a stale plan load after another tab undoes it', async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--disable-dev-shm-usage']
  });
  try {
    const context = await browser.newContext();
    context.setDefaultTimeout(5000);
    const a = await context.newPage();
    const b = await context.newPage();

    // Use the real adapter to stage only the generated legacy seed in this
    // fresh browser context. The app owns all three operations under test.
    await a.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await ready(a);
    const staged = await a.evaluate(async () => {
      const { inspectLegacy3D, stageLegacy3D } = await import('/first-brain-idb-adapter.mjs');
      const seed = inspectLegacy3D(localStorage);
      if (!seed.ok) throw Error(seed.reason);
      const result = await stageLegacy3D('aiBrain.firstBrain.transaction.r1', localStorage, {
        confirmed: true,
        expectedMainRaw: seed.mainRaw,
        expectedUndoRaw: seed.undoRaw
      });
      if (result.ok) localStorage.setItem('aiBrain.v1.persistence.authority', 'idb');
      return result;
    });
    assert.equal(staged.ok, true, staged.reason);
    await a.goto(txUrl, { waitUntil: 'domcontentloaded' });
    await ready(a);
    const before = await snapshot(a);
    assert.equal(before.revision, 1);
    assert.equal(before.receipts, 0);
    console.log('PROBE_CHECKPOINT seed_ready revision=1');

    a.once('dialog', dialog => dialog.accept());
    await a.locator('#bPlan').click();
    await a.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('已保存 9 個本機候選節點'));
    const imported = await snapshot(a);
    assert.equal(imported.revision, 2);
    assert.equal(imported.receipts, 1);
    assert.equal(imported.planNodes, 9);
    console.log('PROBE_CHECKPOINT plan_saved revision=2 nodes=9 receipts=1');

    await b.goto(txUrl, { waitUntil: 'domcontentloaded' });
    await ready(b);
    assert.equal(await b.evaluate(() => window.AIBrain.persistence().revision), 2);
    await b.locator('#bUndo').click();
    await b.waitForFunction(() => window.AIBrain.persistence().revision === 3);
    const undone = await snapshot(b);
    assert.equal(undone.revision, 3);
    assert.ok(undone.mainRaw === before.mainRaw, 'Undo restores the exact pre-import graph');
    assert.ok(undone.undoRaw === before.undoRaw, 'Undo restores the exact pre-import Undo stack');
    console.log('PROBE_CHECKPOINT undo_saved revision=3');

    assert.equal(await a.evaluate(() => window.AIBrain.persistence().revision), 2);
    await a.locator('#bPlan').press('Enter');
    await a.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('儲存版本已變動'));
    const after = await snapshot(a);
    assert.equal(after.revision, 3);
    assert.equal(after.receipts, 0);
    assert.equal(after.planNodes, 0);
    assert.ok(after.mainRaw === undone.mainRaw, 'stale reload must leave the graph unchanged');
    assert.ok(after.undoRaw === undone.undoRaw, 'stale reload must leave Undo unchanged');
    console.log('FIRST_BRAIN_NATIVE_PLAN_STALE_BLOCKED revision=3 extra_writes=0 receipts=0');
  } finally {
    await browser.close();
  }
});
