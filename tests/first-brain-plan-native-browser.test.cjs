'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');

const pageUrl = 'http://127.0.0.1:8765/index.html';
const txUrl = pageUrl + '?brainTx=1';
const dbName = 'aiBrain.firstBrain.transaction.r1';
const ready = page => page.waitForFunction(() => window.AIBrain && document.body.dataset.ready === '1');
const waitToast = (page, text) => page.waitForFunction(text =>
  document.querySelector('#toast')?.textContent.includes(text), text);

const snapshot = page => page.evaluate(async dbName => {
  const { readTransactional3D } = await import('/first-brain-idb-adapter.mjs');
  const result = await readTransactional3D(dbName);
  if (!result.ok) throw Error(result.reason);
  return {
    revision: result.revision,
    mainRaw: result.mainRaw,
    undoRaw: result.undoRaw,
    receipts: result.graph.history.filter(event => event.action === 'plan.loaded').length,
    planNodes: result.graph.nodes.filter(node => node.createdBy === 'plan_import_candidate').length
  };
}, dbName);

async function openWriter(page) {
  await page.goto(txUrl, { waitUntil: 'domcontentloaded' });
  await ready(page);
}

async function withSeededBrowser(run) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--disable-dev-shm-usage']
  });
  try {
    const context = await browser.newContext();
    context.setDefaultTimeout(8000);
    const a = await context.newPage();

    // Stage only the synthetic legacy seed. All mutations under test use the app.
    await a.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await ready(a);
    const staged = await a.evaluate(async dbName => {
      const { inspectLegacy3D, stageLegacy3D } = await import('/first-brain-idb-adapter.mjs');
      const seed = inspectLegacy3D(localStorage);
      if (!seed.ok) throw Error(seed.reason);
      const result = await stageLegacy3D(dbName, localStorage, {
        confirmed: true,
        expectedMainRaw: seed.mainRaw,
        expectedUndoRaw: seed.undoRaw
      });
      if (result.ok) localStorage.setItem('aiBrain.v1.persistence.authority', 'idb');
      return result;
    }, dbName);
    assert.equal(staged.ok, true, staged.reason);
    await openWriter(a);
    const before = await snapshot(a);
    assert.equal(before.revision, 1);
    assert.equal(before.receipts, 0);
    console.log('PROBE_CHECKPOINT seed_ready revision=1');

    await run({ context, a, before });
  } finally {
    await browser.close();
  }
}

async function clickPlan(page) {
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#bPlan').click();
}

function assertSameSnapshot(actual, expected) {
  assert.equal(actual.revision, expected.revision);
  assert.equal(actual.receipts, expected.receipts);
  assert.equal(actual.planNodes, expected.planNodes);
  assert.ok(actual.mainRaw === expected.mainRaw, 'stored graph bytes differ');
  assert.ok(actual.undoRaw === expected.undoRaw, 'stored Undo bytes differ');
}

test('native 3D tabs reject a stale plan load after another tab undoes it', async () => {
  await withSeededBrowser(async ({ context, a, before }) => {
    await clickPlan(a);
    await waitToast(a, '已保存 9 個本機候選節點');
    const imported = await snapshot(a);
    assert.equal(imported.revision, 2);
    assert.equal(imported.receipts, 1);
    assert.equal(imported.planNodes, 9);
    console.log('PROBE_CHECKPOINT plan_saved revision=2 nodes=9 receipts=1');

    const b = await context.newPage();
    await openWriter(b);
    assert.equal(await b.evaluate(() => window.AIBrain.persistence().revision), 2);
    await b.locator('#bUndo').click();
    await b.waitForFunction(() => window.AIBrain.persistence().revision === 3);
    const undone = await snapshot(b);
    assertSameSnapshot(undone, { ...before, revision: 3 });
    console.log('PROBE_CHECKPOINT undo_saved revision=3');

    assert.equal(await a.evaluate(() => window.AIBrain.persistence().revision), 2);
    await a.locator('#bPlan').click();
    await waitToast(a, '儲存版本已變動');
    assertSameSnapshot(await snapshot(a), undone);
    console.log('FIRST_BRAIN_NATIVE_PLAN_STALE_BLOCKED revision=3 extra_writes=0 receipts=0');
  });
});

test('native plan loses a same-revision race at the IndexedDB write gate', async () => {
  await withSeededBrowser(async ({ context, a, before }) => {
    const b = await context.newPage();
    await openWriter(b);
    assert.equal(await b.evaluate(() => window.AIBrain.persistence().revision), before.revision);

    // Pause A after its real confirmation and initial revision check, at the
    // adapter's pre-write legacy fence. The native transaction remains intact.
    await a.evaluate(dbName => {
      const confirm = window.confirm.bind(window);
      const digest = SubtleCrypto.prototype.digest;
      const transaction = IDBDatabase.prototype.transaction;
      const trace = window.__raceTrace = { armed: false, reached: false, writeTransactions: 0 };
      const hold = new Promise(resolve => { trace.release = resolve; });
      window.confirm = function (message) {
        const accepted = confirm(message);
        if (accepted) trace.armed = true;
        return accepted;
      };
      SubtleCrypto.prototype.digest = async function (...args) {
        if (trace.armed) {
          trace.armed = false;
          trace.reached = true;
          await hold;
        }
        return digest.apply(this, args);
      };
      IDBDatabase.prototype.transaction = function (...args) {
        if (this.name === dbName && args[1] === 'readwrite') trace.writeTransactions++;
        return transaction.apply(this, args);
      };
    }, dbName);
    await clickPlan(a);
    await a.waitForFunction(() => window.__raceTrace.reached && window.AIBrain.persistence().pending);
    assert.equal(await a.evaluate(() => window.__raceTrace.writeTransactions), 0);
    console.log('RACE_CHECKPOINT a_passed_precheck revision=1');

    const edit = await b.evaluate(async () => {
      const node = window.AIBrain.getState().nodes[0];
      const status = node.status === 'researching' ? 'resolved' : 'researching';
      window.AIBrain.setStatus(node.id, status);
      return { id: node.id, status, ok: await window.AIBrain.whenIdle() };
    });
    assert.equal(edit.ok, true);
    const winner = await snapshot(b);
    assert.equal(winner.revision, 2);
    assert.equal(winner.receipts, 0);
    assert.equal(winner.planNodes, 0);
    assert.equal(JSON.parse(winner.mainRaw).nodes.find(node => node.id === edit.id).status, edit.status);
    assert.equal(JSON.parse(winner.undoRaw).at(-1), before.mainRaw);
    console.log('RACE_CHECKPOINT b_edit_committed revision=2');

    await a.evaluate(() => { window.__raceTrace.release(); });
    await waitToast(a, '交易未完成：stale_revision');
    assert.equal(await a.evaluate(() => window.AIBrain.whenIdle()), false);
    assert.equal(await a.evaluate(() => window.__raceTrace.writeTransactions), 1);
    assertSameSnapshot(await snapshot(a), winner);
    console.log('NATIVE_PLAN_RACE_PASS a_write_transactions=1 revision=2 receipts=0');
  });
});

test('native plan aborts after a successful put request and recovers on a new action', async () => {
  await withSeededBrowser(async ({ a, before }) => {
    await a.evaluate(dbName => {
      const put = IDBObjectStore.prototype.put;
      const trace = window.__abortTrace = { requests: 0, planEvents: 0 };
      trace.restore = () => { IDBObjectStore.prototype.put = put; };
      window.AIBrain.on('change', event => {
        if (event?.action === 'plan.loaded') trace.planEvents++;
      });
      IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args);
        const tx = this.transaction;
        if (tx.db.name === dbName && tx.mode === 'readwrite' && this.name === 'snapshots') {
          request.addEventListener('success', () => {
            trace.requests++;
            tx.abort();
          }, { once: true });
        }
        return request;
      };
    }, dbName);
    await clickPlan(a);
    await waitToast(a, '交易未完成：transaction_aborted');
    assert.equal(await a.evaluate(() => window.AIBrain.whenIdle()), false);
    assert.deepEqual(await a.evaluate(() => ({
      requests: window.__abortTrace.requests, planEvents: window.__abortTrace.planEvents
    })), { requests: 1, planEvents: 0 });
    assertSameSnapshot(await snapshot(a), before);
    console.log('ABORT_CHECKPOINT put_succeeded transaction_aborted revision=1 receipts=0');

    // Remove the intentional fault and start a new, explicitly confirmed load.
    await a.evaluate(() => { window.__abortTrace.restore(); });
    await clickPlan(a);
    await waitToast(a, '已保存 9 個本機候選節點');
    assert.equal(await a.evaluate(() => window.__abortTrace.planEvents), 1);
    const recovered = await snapshot(a);
    assert.equal(recovered.revision, 2);
    assert.equal(recovered.planNodes, 9);
    assert.equal(recovered.receipts, 1);
    assert.equal(JSON.parse(recovered.undoRaw).at(-1), before.mainRaw);
    await a.reload({ waitUntil: 'domcontentloaded' });
    await ready(a);
    assertSameSnapshot(await snapshot(a), recovered);
    console.log('NATIVE_PLAN_ABORT_RECOVERY_PASS revision=2 nodes=9 receipts=1 reload_verified=1');
  });
});
