import test from 'node:test';
import assert from 'node:assert/strict';
import { payloadHash, prepareBatch, compareObservedRuns } from '../research/efficiency-v01/efficiency-core.mjs';
const rule = 'a'.repeat(40);
const item = (overrides = {}) => ({ projectId:'AI-BOUNDARY', taskId:'P0-001', kind:'RESEARCH_READ_ONLY', sourceRef:'https://github.com/keqingwu5-cloud/ai-boundary/issues/150', sourceRevision:'d2ec331ea4fa68d5a2713f12f5d4706b8effb21a', ruleSha:rule, payload:{a:1,b:2}, ...overrides });
const batch = (items, prior=[]) => prepareBatch({ items, prior, activeRuleSha:rule });

test('accept one new candidate, never claim execution',()=>{const r=batch([item()]);assert.equal(r.stats.accepted,1);assert.equal(r.decisions[0].status,'ACCEPT_CANDIDATE');assert.equal(r.decisions[0].executed,undefined);});
test('same item repeated in one batch deduplicates',()=>{const r=batch([item(),item()]);assert.deepEqual(r.decisions.map(x=>x.status),['ACCEPT_CANDIDATE','DUPLICATE_SKIP']);});
test('cross-run dedup uses an externally read-back ledger snapshot',()=>{const r=batch([item()]);const next=batch([item()],r.ledgerCandidates);assert.equal(next.stats.duplicate,1);});
test('payload object key order does not affect hashes',()=>{assert.equal(payloadHash({a:1,b:2}),payloadHash({b:2,a:1}));});
test('same identity with changed payload fails closed',()=>{const r=batch([item()]);const conflict=batch([item({payload:{a:9,b:2}})],r.ledgerCandidates);assert.equal(conflict.decisions[0].reason,'IDENTITY_PAYLOAD_CONFLICT');assert.equal(conflict.stats.blocked,1);});
test('new source revision remains a new candidate',()=>{const r=batch([item()]);const v=batch([item({sourceRevision:'new-document-version'})],r.ledgerCandidates);assert.equal(v.stats.accepted,1);});
test('stale rules block task before scheduling',()=>{const r=batch([item({ruleSha:'b'.repeat(40)})]);assert.equal(r.decisions[0].reason,'STALE_RULE_SHA');});
test('missing proof source is blocked',()=>{const r=batch([item({sourceRef:''})]);assert.equal(r.stats.blocked,1);});
test('bad rule SHA blocks all operation',()=>{assert.throws(()=>prepareBatch({items:[item()],activeRuleSha:'v1'}),/full Git commit SHA/);});
test('non-JSON payload is blocked',()=>{const r=batch([item({payload:{bad:()=>1}})]);assert.equal(r.decisions[0].reason,'INVALID_PAYLOAD');});
test('malformed previous ledger blocks rather than assuming no history',()=>{assert.throws(()=>batch([item()],[{task:{},payloadHash:'bad'}]),/Invalid prior ledger/);});
test('conflicted historical ledger fails closed',()=>{const old=batch([item()]).ledgerCandidates[0];assert.throws(()=>batch([item()],[old,{...old,payloadHash:'f'.repeat(64)}]),/Conflicting prior ledger/);});
const verified = (durationMs,qualified,extras={}) => ({durationMs,qualified,evidenceRef:'test://synthetic-fixture',reviewerId:'fixture-reviewer',...extras});
test('observed throughput uses independently qualified outcomes',()=>{const r=compareObservedRuns([verified(1000,true,{costUsd:0.1})],[verified(500,true,{costUsd:0.1})]);assert.equal(r.qualifiedThroughputRatio,2);});
test('missing baseline qualified outputs makes speedup unknown',()=>{const r=compareObservedRuns([verified(1000,false)],[verified(500,true)]);assert.equal(r.qualifiedThroughputRatio,null);});
test('invalid observed timing cannot be accepted as performance proof',()=>{assert.throws(()=>compareObservedRuns([verified(0,true)],[verified(1,true)]),/durationMs/);});
test('missing cost cannot be invented',()=>{const r=compareObservedRuns([verified(100,true)],[verified(100,true,{costUsd:0.5})]);assert.equal(r.baseline.costUsd,null);});

test('bare claims without evidence cannot be used in performance results',()=>{assert.throws(()=>compareObservedRuns([{durationMs:100,qualified:true}],[verified(100,true)]),/evidenceRef/);});
