'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const memory = require('../memory-workflow-core.js');

const E01 = 'fb86-e01-41978009026';
const E02 = 'fb86-e02-41981874640';
const C01 = 'fb86-synthetic-counterexample-01';
const W02 = 'fb86-w02';
const NODE = 'fb86-fixture-node';
const QUESTION = '兩頁都讀到同一版本，後寫為什麼會被拒？';
const CI = 'https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/41981874640';
const SHA = '948869202d0c185e1ba127d93e4ccbd97f70909d';
const pack = (...items) => ({ schema: memory.PACK_SCHEMA, items });

const observed = {
  id:E02, question:QUESTION, purpose:'核對寫入點的版本檢查',
  content:'隔離 Chrome 合成案例。A 通過版本 1 初檢。B 先提交版本 2。A 進入原生寫入交易後收到 stale_revision，讀回 B 的主圖與 Undo 一致。',
  reason:'限於此受測提交、瀏覽器及合成資料。',
  evidence:SHA+' '+CI, evidenceLevel:'fact'
};
const comparison = {
  id:E01, question:'舊分頁在 Undo 後何時被拒？', purpose:'區分預檢與交易',
  content:'B 復原到版本 3。A 仍為版本 2，在送出寫入交易前就被拒。',
  reason:'早期拒絕的對照案例。',
  evidence:'https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/41978009026',
  evidenceLevel:'fact'
};
const synthetic = {
  id:C01, question:QUESTION, purpose:'演練反證與重驗',
  content:'合成反例。假設 A 在相同條件下仍覆寫 B。',
  reason:'試跑注入的待核對假說，需另行複驗。',
  evidence:'synthetic fixture', evidenceLevel:'hypothesis'
};

function candidateState(...items) {
  // Mirrors the existing import UI's staging shape without opening its vault.
  return { memories:[], audit:[], candidates:items.map(item=>({
    ...item, id:'pending-'+item.id, originId:item.id, status:'pending'
  })) };
}

async function worldFixture() {
  const ledger = await import('../world-verification-ledger.mjs');
  const bridge = await import('../research-context-bridge.mjs');
  const compat = await import('../concept-reuse-compat.mjs');
  const values = new Map();
  const storage = {
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,String(value))
  };
  // The lock stub exercises the API contract, not browser lock concurrency.
  const lock = { request:async (_name,_options,fn)=>fn({}) };
  storage.setItem('aiBrain.v1',JSON.stringify({
    version:2, brains:[{id:'main'}], nodes:[{id:NODE,brainId:'main',title:'Synthetic E02',pos:[0,0,0]}],
    links:[],history:[]
  }));
  const brainRef = bridge.readNodeContext(storage,NODE);
  assert.equal(brainRef.status,'linked');
  const row = {
    id:W02, hypothesis:'共享權威存檔時，寫入點必須再驗版本。',
    falsifier:'相同條件下，已過期的寫入仍改動勝方存檔。',
    source:CI, createdOn:'2026-11-05',deadline:'2026-11-05',status:'待驗證'
  };
  const saved=await ledger.appendWorldLedgerLocked(storage,null,{
    type:'create', row, sourceNodeId:NODE, eventId:'fb86-pilot-create',
    reason:'isolated E02 candidate'
  },lock);
  assert.equal(saved.ok,true,saved.reason);
  return {ledger,compat,storage,lock,brainRef,saved};
}

test('recall distinguishes the write-time E02 conflict from the E01 precheck',()=>{
  const initial=memory.planImport(pack(observed,comparison),candidateState());
  assert.equal(initial.accepted.length,2);
  const state=candidateState(...initial.accepted.map(({item})=>item));
  const [hit]=memory.recall(QUESTION,state);
  assert.equal(hit.id,'pending-'+E02);
  assert.equal(hit.type,'pending');
  assert.ok(hit.evidence.includes(SHA));
  assert.ok(hit.evidence.includes(CI));
  assert.equal(memory.recall(comparison.question,state)[0].id,'pending-'+E01);
  assert.equal(state.memories.length,0);
});

test('W02 preview links a real ledger row and keeps evidence verification manual',async()=>{
  const {compat,storage,brainRef,ledger}=await worldFixture();
  const before=storage.getItem(ledger.JOURNAL_KEY);
  const preview=compat.previewWorldClaimReference({storage,brainRef,recordId:W02});
  assert.equal(preview.status,'candidate_only');
  assert.equal(preview.packet.source_url_hint,CI);
  assert.equal(preview.packet.research_status,'待驗證');
  assert.deepEqual(preview.packet.evidence_refs,[]);
  assert.equal(preview.packet.source_independently_verified,false);
  const handoff={recordId:W02,evidenceId:E02,ci:CI};
  const [hit]=memory.recall(QUESTION,candidateState(observed));
  assert.equal(hit.id,'pending-'+handoff.evidenceId);
  assert.ok(hit.evidence.includes(handoff.ci));
  assert.equal(storage.getItem(ledger.JOURNAL_KEY),before);
});

test('synthetic counterexample marks recheck, preserves E02, and dedupes on resend',async()=>{
  const {ledger,storage,lock,saved}=await worldFixture();
  const original=candidateState(observed);
  const planned=memory.planImport(pack(synthetic),original);
  assert.deepEqual(planned.conflicts,[C01]);
  assert.deepEqual(planned.accepted[0].possibleConflictWith,['pending-'+E02]);
  const next=candidateState(observed,planned.accepted[0].item);
  assert.deepEqual(next.candidates[0],original.candidates[0]);
  assert.equal(next.candidates[1].evidenceLevel,'hypothesis');
  assert.deepEqual(memory.planImport(pack(synthetic),next).duplicated,[C01]);

  const changed=await ledger.appendWorldLedgerLocked(storage,saved.rawV2,{
    type:'status',recordId:W02,status:'證據不足',sourceNodeId:NODE,
    eventId:'fb86-pilot-recheck',reason:'合成反例 '+C01+'；暫列證據不足，需重驗。'
  },lock);
  assert.equal(changed.ok,true,changed.reason);
  assert.equal(changed.rows[0].status,'證據不足');
  assert.equal(ledger.rowsAtVersion(storage,1).rows[0].status,'待驗證');
  assert.ok(changed.events[1].reason.includes(C01));
  assert.equal(next.memories.length,0);
});

test('missing lock or mismatched source stops the pilot handoff',async()=>{
  const {ledger,storage,compat,saved}=await worldFixture();
  const blocked=await ledger.appendWorldLedgerLocked(storage,saved.rawV2,{
    type:'status',recordId:W02,status:'證據不足',reason:'fixture'
  },null);
  assert.equal(blocked.reason,'web_locks_unavailable');
  const preview=compat.previewWorldClaimReference({
    storage,brainRef:{status:'linked',node:{id:'wrong-fixture-node'}},recordId:W02
  });
  assert.equal(preview.reason,'source_identity_missing_or_changed');
  assert.equal(storage.getItem(ledger.JOURNAL_KEY),saved.rawV2);
});
