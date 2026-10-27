import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAIN_SCHEMA,validateEventChain,appendResearchEvent,knowledgeAt,diagnoseTwoSystems,syntheticResearchCase} from '../research-event-chain.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const good=()=>syntheticResearchCase();
const linked={status:'linked',node:{id:'n_q1',title:'合成研究來源'}};
test('01 event history and independent branch validate',()=>{
 const events=good(),out=validateEventChain(events);
 assert.equal(out.ok,true,JSON.stringify(out));assert.equal(events.length,5);
 assert.equal(out.versions['fixture:capital-risk'],5);
});
test('02 revision is append-only and old hypothesis remains intact',()=>{
 const original=good(),first=JSON.stringify(original[0]);
 const latest={...original.at(-1),event_id:'evt:revision2',version:6,kind:'revision',
   parent_event_id:'evt:c1',branch_id:'alternative',published_at:null,reason:'新觀測形成不同分支推論',
   statement:'合成：修正替代分支結論'};
 const next=appendResearchEvent(original,latest);
 assert.equal(next.ok,true);assert.equal(next.log.length,6);
 assert.equal(JSON.stringify(next.log[0]),first);assert.equal(original.length,5);
 latest.statement='MUTATED AFTER SAVE';
 assert.notEqual(next.log.at(-1).statement,latest.statement);
});
test('03 duplicate event ID rejected instead of overwriting past',()=>{
 const x=good();x.push({...x[0],version:6});assert.equal(validateEventChain(x).reason,'event_shape_or_duplicate');
});
test('04 tampered non-sequential version rejected',()=>{
 const x=good();x[2].version=99;assert.equal(validateEventChain(x).reason,'version_gap_or_rewrite');
});
test('05 absent parent rejected',()=>{
 const x=good();x[2].parent_event_id='evt:unknown';assert.equal(validateEventChain(x).reason,'parent_or_source_missing');
});
test('06 cross-node ancestry rejected',()=>{
 const x=good();x[4].node_id='n_q2';assert.equal(validateEventChain(x).reason,'parent_or_source_missing');
});
test('07 branch can arise from an earlier middle node, without rewriting it',()=>{
 const x=good();assert.equal(x[3].parent_event_id,'evt:h1');assert.equal(x[2].parent_event_id,'evt:o1');
 assert.equal(x[0].statement,'合成假設：條件 X 必然令結果 Y 增加');
});
test('08 cannot insert evidence from future publication into a recorded event',()=>{
 const x=good();x[1].published_at='2026-11-02';assert.equal(validateEventChain(x).reason,'future_publication_leak');
});
test('09 observation available by public date is NOT historical model snapshot',()=>{
 const x=good(),asOf=knowledgeAt(x,'2026-05-01');
 assert.equal(asOf.ok,true);assert.deepEqual(asOf.recordedEventIds,[]);
 assert.deepEqual(asOf.retrospectivelyAvailableEvidenceIds,['evt:o1']);
 assert.equal(asOf.reconstructedNotOriginalSnapshot,true);
});
test('10 future counterexample does not leak into earlier reconstruction',()=>{
 const x=good(),asOf=knowledgeAt(x,'2026-07-01');
 assert.deepEqual(asOf.retrospectivelyAvailableEvidenceIds,['evt:o1']);
});
test('11 invalid dates are refused',()=>{
 const x=good();x[1].published_at='2026-02-31';assert.equal(validateEventChain(x).reason,'dates_invalid');
});
test('12 synthetic case cannot masquerade as independently sourced',()=>{
 const x=good();x[1].evidence_url='https://example.org/claimed';assert.equal(validateEventChain(x).reason,'synthetic_cannot_claim_external_evidence');
});
test('13 classify FIRST BRAIN failure without calling world model broken',()=>{
 const out=diagnoseTwoSystems({brainRef:{status:'missing',node:null},chain:good(),expectedNodeId:'n_q1'});
 assert.equal(out.worldModel,'PASS');assert.equal(out.firstBrain,'FAIL');assert.deepEqual(out.failedDomains,['first_brain']);
});
test('14 classify WORLD MODEL failure without blaming first brain',()=>{
 const x=good();x[1].published_at='2027-01-01';
 const out=diagnoseTwoSystems({brainRef:linked,chain:x,expectedNodeId:'n_q1'});
 assert.equal(out.firstBrain,'PASS');assert.equal(out.worldModel,'FAIL');assert.deepEqual(out.failedDomains,['world_model']);
});
test('15 classify ID mismatch as integration fault, not model or brain',()=>{
 const x=good().map(e=>({...e,node_id:'n_q2'}));
 const out=diagnoseTwoSystems({brainRef:linked,chain:x,expectedNodeId:'n_q1'});
 assert.equal(out.firstBrain,'PASS');assert.equal(out.worldModel,'PASS');
 assert.deepEqual(out.failedDomains,['integration']);
});
test('16 two separate broken systems must both be reported',()=>{
 const x=good();x[2].version=100;
 const out=diagnoseTwoSystems({brainRef:{status:'not_saved',node:null},chain:x,expectedNodeId:'n_q1'});
 assert.deepEqual(out.failedDomains,['first_brain','world_model']);
});
test('17 append rejects invalid mutation and leaves old events intact',()=>{
 const x=good(),first=JSON.stringify(x);
 const r=appendResearchEvent(x,{...x[3],event_id:'evt:new',version:6,parent_event_id:'evt:no'});
 assert.equal(r.ok,false);assert.equal(JSON.stringify(x),first);
});
test('18 append-only log requires revision reason',()=>{
 const x=good();delete x[2].reason;assert.equal(validateEventChain(x).reason,'revision_reason_missing');
});
test('19 retrospective view after logs saved is separate from source publication',()=>{
 const asOf=knowledgeAt(good(),'2026-10-27');
 assert.equal(asOf.recordedEventIds.length,5);
 assert.equal(asOf.retrospectivelyAvailableEvidenceIds.length,2);
});
test('20 no private storage writes in pure event constructor and diagnostic',()=>{
 const x=good();const before=JSON.stringify(x);validateEventChain(x);knowledgeAt(x,'2026-07-01');
 diagnoseTwoSystems({brainRef:linked,chain:x,expectedNodeId:'n_q1'});
 assert.equal(JSON.stringify(x),before);
});
