'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium } = require('playwright-core');
const { PACK_SCHEMA } = require('../memory-workflow-core.js');

const origin = 'http://127.0.0.1:8765';
const question = '兩頁都讀到同一版本，後寫為什麼會被拒？';
const ci = 'https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/41981874640';
const sha = '948869202d0c185e1ba127d93e4ccbd97f70909d';
const nodeId = 'fb86-synthetic-node';
const hypothesis = 'W02｜共享權威存檔時，寫入點必須再驗版本。';
const password = 'synthetic-fb86-browser-vault';
const vaultKey = 'aiBoundary.privateMemory.v1';

const observed = {
  id: 'fb86-e02-41981874640', question, purpose: '核對原生寫入交易的版本檢查',
  content: 'E02｜A 到達寫入交易後被拒，B 的主圖與 Undo 讀回一致。',
  evidence: sha + ' ' + ci, reason: '隔離 Chrome 合成案例', evidenceLevel: 'fact'
};
const counter = {
  id: 'fb86-synthetic-counterexample-01', question, purpose: '演練反證待審',
  content: 'C01｜合成反例，假設 A 在相同條件下仍覆寫 B。',
  evidence: 'Synthetic fixture', reason: '需複驗的假說', evidenceLevel: 'hypothesis'
};

const waitText = (page, selector, needle) => page.waitForFunction(
  ({ selector, needle }) => document.querySelector(selector)?.textContent.includes(needle),
  { selector, needle }
);
const envelope = page => page.evaluate(key => localStorage.getItem(key), vaultKey);

async function importItem(page, item, confirm, feedback) {
  if (confirm) page.once('dialog', dialog => dialog.accept());
  await page.locator('#memoryPackInput').setInputFiles({
    name: 'synthetic-memory-pack.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ schema: PACK_SCHEMA, items: [item] }))
  });
  await waitText(page, '#feedback', feedback);
}

async function recall(page) {
  await page.getByRole('tab', { name: '候選審核' }).click();
  await page.locator('#recallQuery').fill(question);
  await page.locator('#recallRun').click();
  await waitText(page, '#recallResults', sha);
  const card = page.locator('#recallResults .card').filter({ hasText: sha });
  assert.match(await card.textContent(), /待審候選/);
  assert.ok((await card.textContent()).includes(ci));
}

test('native browser verifies E02 memory recall and W02 manual review boundaries', async () => {
  const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext();
    context.setDefaultTimeout(8000);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const mem = await context.newPage();
    await mem.goto(origin + '/memory.html', { waitUntil:'domcontentloaded' });
    await mem.locator('#passphrase').fill(password);
    await mem.locator('#confirmPassphrase').fill(password);
    await mem.locator('#unlockButton').click();
    await mem.locator('#workspace').waitFor({ state:'visible' });
    await importItem(mem, observed, true, '已加密匯入 1 筆待審候選');
    const saved = await envelope(mem);
    assert.equal(JSON.parse(saved).cipher, 'AES-256-GCM');
    assert.ok(!saved.includes(sha));
    await mem.reload({ waitUntil:'domcontentloaded' });
    await mem.locator('#passphrase').fill(password);
    await mem.locator('#unlockButton').click();
    await mem.locator('#workspace').waitFor({ state:'visible' });
    await recall(mem);
    console.log('E02_BROWSER_RECALL_PASS encrypted_reopen=1 pending=1');

    const world = await context.newPage();
    await world.addInitScript(nodeId => {
      localStorage.setItem('aiBrain.v1', JSON.stringify({
        version:2, brains:[{id:'main'}],
        nodes:[{id:nodeId,brainId:'main',title:'Synthetic E02',pos:[0,0,0]}],
        links:[],history:[]
      }));
    }, nodeId);
    await world.goto(origin + '/world-model.html?node=' + nodeId, { waitUntil:'domcontentloaded' });
    await world.waitForFunction(() => document.body.dataset.researchLink === 'linked');
    assert.equal(await world.evaluate(() => !!navigator.locks), true);
    await world.getByText('新增待驗證假設（僅儲存在這台裝置）', { exact:true }).click();
    await world.locator('#verifyHypothesis').fill(hypothesis);
    await world.locator('#verifyFalsifier').fill('相同條件下，已過期的寫入仍改動勝方存檔。');
    await world.locator('#verifyDate').fill('2026-11-05');
    await world.locator('#verifyDeadline').fill('2026-12-01');
    await world.locator('#verifySource').fill(ci);
    await world.getByRole('button', { name:'保存待驗證假設' }).click();
    await waitText(world, '#worldHistoryCount', '版本 1');
    await world.locator('summary').filter({hasText:'本機研究紀錄'}).click();
    const claim = world.locator('#verifyList .verify-case').filter({ hasText:hypothesis });
    assert.equal(await claim.getByRole('link', {name:'來源連結'}).getAttribute('href'), ci);
    await recall(mem);
    console.log('W02_BROWSER_MANUAL_LINK_PASS journal=1 source_hint_matches=1');

    await importItem(mem, counter, true, '已加密匯入 1 筆待審候選');
    await recall(mem);
    await waitText(mem, '#recallResults', 'C01｜合成反例');
    const withCounter = await envelope(mem);
    await importItem(mem, counter, false, '沒有新增候選；重複 1 筆');
    assert.equal(await envelope(mem), withCounter);
    await claim.getByRole('combobox', {name:'研究狀態'}).selectOption('證據不足');
    await waitText(world, '#worldHistoryCount', '版本 2');
    const trace = await world.evaluate(async () => {
      const { readWorldLedger, rowsAtVersion } = await import('/world-verification-ledger.mjs');
      const { previewWorldClaimReference } = await import('/concept-reuse-compat.mjs');
      const { readNodeContext } = await import('/research-context-bridge.mjs');
      const ledger = readWorldLedger(localStorage);
      const id = ledger.rows[0].id;
      return {
        statuses: [rowsAtVersion(localStorage,1).rows[0].status, ledger.rows[0].status],
        events: ledger.events.map(event => event.type),
        preview: previewWorldClaimReference({
          storage:localStorage, brainRef:readNodeContext(localStorage,window.BrainResearchLink.sourceNodeId),recordId:id
        })
      };
    });
    assert.deepEqual(trace.statuses, ['待驗證','證據不足']);
    assert.deepEqual(trace.events, ['create','status']);
    assert.equal(trace.preview.status, 'candidate_only');
    assert.equal(trace.preview.packet.source_url_hint, ci);
    assert.deepEqual(trace.preview.packet.evidence_refs, []);
    assert.equal(trace.preview.packet.source_independently_verified, false);
    assert.equal(await envelope(mem), withCounter);
    console.log('FB86_BROWSER_FEEDBACK_PASS deduped=1 journal_versions=2 manual_evidence_ref=1');
  } finally {
    await browser.close();
  }
});
