import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit,PROOF_SCHEMA,AUDIT_STREAMS,AUDIT_SECTORS,REVIEW_VERDICTS} from '../proof-audit-candidate.mjs';
const hashA='a'.repeat(64),hashB='b'.repeat(64);
async function fixture({sector='ENGINEERING'}={}){
  const control=createControlCycle();
  assert.equal(control.registerDomain({domain_id:'engineering',contract_revision:'r1'}).status,'candidate_only');
  await control.observe({event_id:'event1',domain_id:'engineering',source_id:'src',
    revision:'r1',source_hash:hashA});
  const audit=createProofAudit({control});
  const p=await audit.openProof({proof_id:'proof1',event_id:'event1',
    expected_control_version:1,sector,created_by_claim:'planner',
    scope_ref:'pr133'});
  assert.equal(p.status,'candidate_only');
  return {control,audit};
}
async function action(audit,{id='fix01',actor='engineer'}={}){
  return audit.recordAction({proof_id:'proof1',
    expected_revision:audit.readProof('proof1').revision,
    action_id:id,performed_by_claim:actor,action_ref:'commit123',
    action_hash:hashA,result_code:'PROPOSED'});
}
async function log(audit,stream,i){
  return audit.recordLog({proof_id:'proof1',
    expected_revision:audit.readProof('proof1').revision,
    log_id:'log'+i,stream,recorded_by_claim:'worker',
    record_ref:'ref'+i,record_hash:hashB,summary_code:'TRACE_SUMMARY_ONLY'});
}
async function review(audit,who='reviewer'){
  return audit.recordReview({proof_id:'proof1',
    expected_revision:audit.readProof('proof1').revision,
    review_id:'review'+audit.readProof('proof1').revision,
    reviewed_by_claim:who,review_ref:'review_doc',review_hash:hashB,
    verdict:'REQUEST_CHANGES'});
}
test('01 fixed four log streams, five sectors and four review verdicts',()=>{
  assert.deepEqual(AUDIT_STREAMS,['AUTOMATION','REASONING_SUMMARY','WORLD_MODEL','MEMORY']);
  assert.deepEqual(AUDIT_SECTORS,['ENGINEERING','INFRASTRUCTURE','DATA','WATER','ELECTRICITY']);
  assert.deepEqual(REVIEW_VERDICTS,['RECOMMEND','REQUEST_CHANGES','REJECT','INCONCLUSIVE']);
});
test('02 every proof starts with creator claim but no authenticated actor/reviewer',async()=>{
  const {audit}=await fixture();
  const p=audit.readProof('proof1');
  assert.equal(p.schema,PROOF_SCHEMA);
  assert.equal(p.event_id,'event1');
  assert.equal(p.created_by_claim,'planner');
  assert.equal(p.review_status,'NOT_REVIEWED');
  assert.equal(p.identity_verified,false);
  assert.equal(p.reviewer_identity_verified,false);
  assert.equal(p.baseline_approval,'NOT_APPROVED');
  assert.equal(p.actual_ack,'NOT_VERIFIED');
  assert.equal(p.memory_write,'NOT_PERFORMED');
});
test('03 who performed + who reviewed stay separated as unverified claims',async()=>{
  const {audit}=await fixture();
  assert.equal((await action(audit)).status,'candidate_only');
  const r=await review(audit);
  assert.equal(r.status,'candidate_only');
  const p=audit.readProof('proof1');
  assert.deepEqual(p.performed_by_claims,['engineer']);
  assert.deepEqual(p.reviewed_by_claims,['reviewer']);
  assert.equal(p.review_status,'REVIEW_CLAIM_ONLY');
  assert.equal(p.role_independence,'NOT_VERIFIED');
  assert.equal(p.reviews[0].approval,'NOT_GRANTED');
  assert.equal(p.authority,'none');
});
test('04 no action proof means review cannot masquerade as independent assessment',async()=>{
  const {audit}=await fixture();
  assert.equal((await review(audit)).reason,'ACTION_CLAIM_REQUIRED');
  assert.equal(audit.readProof('proof1').reviews.length,0);
});
test('05 a creator or performer cannot self-review even by repeating their claim',async()=>{
  const {audit}=await fixture();
  await action(audit);
  assert.equal((await review(audit,'planner')).reason,'SELF_REVIEW_CLAIM');
  assert.equal((await review(audit,'engineer')).reason,'SELF_REVIEW_CLAIM');
});
test('06 all four log streams link to same event and proof with explicit coverage',async()=>{
  const {audit}=await fixture();
  await action(audit);
  for(let i=0;i<AUDIT_STREAMS.length;i++)
    assert.equal((await log(audit,AUDIT_STREAMS[i],i)).status,'candidate_only');
  const p=audit.readProof('proof1');
  assert.equal(p.logs.length,4);
  assert.equal(p.event_id,'event1');
  assert.ok(Object.values(p.log_coverage).every(v=>v==='REFERENCED_UNVERIFIED'));
  assert.ok(p.logs.every(e=>e.raw_text_stored===false));
});
test('07 no misleading completeness: an absent log stays NOT_RECORDED',async()=>{
  const {audit}=await fixture();
  await log(audit,'AUTOMATION',0);
  const p=audit.readProof('proof1');
  assert.equal(p.log_coverage.AUTOMATION,'REFERENCED_UNVERIFIED');
  assert.equal(p.log_coverage.REASONING_SUMMARY,'NOT_RECORDED');
  assert.equal(p.log_coverage.WORLD_MODEL,'NOT_RECORDED');
  assert.equal(p.log_coverage.MEMORY,'NOT_RECORDED');
});
test('08 source hash refs and summary codes, not raw chain-of-thought, in contract',async()=>{
  const {audit}=await fixture();
  const result=await audit.recordLog({proof_id:'proof1',expected_revision:1,
    log_id:'secret',stream:'REASONING_SUMMARY',recorded_by_claim:'assistant',
    record_ref:'ref',record_hash:hashB,summary_code:'CONCLUSION_REVIEW',
    raw_private_reasoning:'should_never_be_written'});
  assert.equal(result.reason,'LOG_CONTRACT_INVALID');
  assert.equal(audit.readProof('proof1').logs.length,0);
});
test('09 new evidence after a review makes review STALE, not approved',async()=>{
  const {audit}=await fixture();
  await action(audit);await review(audit);
  assert.equal(audit.readProof('proof1').review_status,'REVIEW_CLAIM_ONLY');
  await log(audit,'AUTOMATION',0);
  assert.equal(audit.readProof('proof1').review_status,'STALE_REVIEW');
  assert.equal(audit.readProof('proof1').baseline_approval,'NOT_APPROVED');
});
test('10 control event revised after snapshot makes proof stale and blocks new writes',async()=>{
  const {control,audit}=await fixture();
  await action(audit);
  await control.proposeBaseline({event_id:'event1',expected_version:1,
    candidate_revision:'r2',candidate_hash:hashB,evidence_ref:'source2'});
  assert.equal(audit.readProof('proof1').control_snapshot_stale,true);
  assert.equal(audit.readProof('proof1').review_status,'STALE_CONTROL_SNAPSHOT');
  assert.equal((await log(audit,'WORLD_MODEL',0)).reason,'CONTROL_SNAPSHOT_STALE');
});
test('11 adding water or electricity projects is structured, not a privileged action',async()=>{
  for(const sector of ['INFRASTRUCTURE','DATA','WATER','ELECTRICITY']){
    const {audit}=await fixture({sector});
    const p=audit.readProof('proof1');
    assert.equal(p.sector,sector);
    assert.equal(p.publication,'NOT_PERFORMED');
    assert.equal(p.persistence,'IN_MEMORY_ONLY');
  }
});
test('12 log ID and action ID idempotency, collisions fail closed',async()=>{
  const {audit}=await fixture();
  const originalAction={proof_id:'proof1',expected_revision:1,action_id:'a1',
    performed_by_claim:'engineer',action_ref:'commit1',action_hash:hashA,result_code:'PROPOSED'};
  assert.equal((await audit.recordAction(originalAction)).status,'candidate_only');
  assert.equal((await audit.recordAction(originalAction)).operation,'DUPLICATE_IGNORED');
  assert.equal((await audit.recordAction({...originalAction,action_hash:hashB})).reason,'ACTION_ID_COLLISION');
  const originalLog={proof_id:'proof1',expected_revision:2,log_id:'l1',stream:'MEMORY',
    recorded_by_claim:'bot',record_ref:'memory_ref',record_hash:hashA,
    summary_code:'NO_MEMORY_WRITE'};
  assert.equal((await audit.recordLog(originalLog)).status,'candidate_only');
  assert.equal((await audit.recordLog(originalLog)).operation,'DUPLICATE_IGNORED');
  assert.equal((await audit.recordLog({...originalLog,record_hash:hashB})).reason,'LOG_ID_COLLISION');
});
test('13 same proof ID cannot refer to a second event/sector',async()=>{
  const {audit}=await fixture();
  const p=await audit.openProof({proof_id:'proof1',event_id:'event1',
    expected_control_version:1,sector:'WATER',created_by_claim:'planner',
    scope_ref:'pr133'});
  assert.equal(p.reason,'PROOF_ID_COLLISION');
  assert.equal(audit.readProof('proof1').sector,'ENGINEERING');
});
test('14 local hash chain verifies copied immutable history but does not attest identity',async()=>{
  const {audit}=await fixture();
  await action(audit);await log(audit,'AUTOMATION',0);await review(audit);
  const verified=await audit.verifyProof('proof1');
  assert.equal(verified.local_chain_consistent,true);
  assert.equal(verified.checked_entries,4);
  assert.equal(verified.identity_authenticated,false);
  assert.equal(verified.immutable_storage,false);
  const p=audit.readProof('proof1');p.actions[0].performed_by_claim='forged';
  assert.deepEqual(audit.readProof('proof1').performed_by_claims,['engineer']);
});
test('15 stale revision refuses concurrent review claim',async()=>{
  const {audit}=await fixture();
  await action(audit);
  const r={proof_id:'proof1',expected_revision:2,reviewed_by_claim:'reviewer',
    review_ref:'rv',review_hash:hashA,verdict:'RECOMMEND'};
  const results=await Promise.all([
    audit.recordReview({...r,review_id:'rv1'}),
    audit.recordReview({...r,review_id:'rv2'})
  ]);
  assert.equal(results.filter(x=>x.status==='candidate_only').length,1);
  assert.equal(results.filter(x=>x.reason==='AUDIT_VERSION_CONFLICT').length,1);
  assert.equal(audit.readProof('proof1').reviews.length,1);
});
test('16 proof packages cannot invent extra authorization flags',async()=>{
  const {audit}=await fixture();
  const result=await audit.recordAction({proof_id:'proof1',expected_revision:1,
    action_id:'a',performed_by_claim:'a',action_ref:'ref',action_hash:hashA,
    result_code:'DONE',authority:'production'});
  assert.equal(result.reason,'ACTION_CONTRACT_INVALID');
});
test('17 no more proof entries after configured capacity',async()=>{
  const control=createControlCycle();
  control.registerDomain({domain_id:'d',contract_revision:'v1'});
  await control.observe({event_id:'e',domain_id:'d',source_id:'s',revision:'r1',source_hash:hashA});
  const audit=createProofAudit({control,maxEntries:2});
  await audit.openProof({proof_id:'p',event_id:'e',expected_control_version:1,
    sector:'DATA',created_by_claim:'writer',scope_ref:'s'});
  await audit.recordAction({proof_id:'p',expected_revision:1,action_id:'a',
    performed_by_claim:'writer',action_ref:'ref',action_hash:hashA,result_code:'DONE'});
  const r=await audit.recordLog({proof_id:'p',expected_revision:2,log_id:'log',
    stream:'MEMORY',recorded_by_claim:'writer',record_ref:'r',record_hash:hashB,
    summary_code:'NOT_WRITTEN'});
  assert.equal(r.reason,'AUDIT_CAPACITY_REACHED');
  assert.equal(audit.readProof('p').logs.length,0);
});
test('18 event can have multiple review packages for a new source version',async()=>{
  const {control,audit}=await fixture();
  await control.proposeDirection({event_id:'event1',expected_version:1,
    direction:'RESEARCH_ONLY',reason:'request more evidence'});
  const next=await audit.openProof({proof_id:'proof2',event_id:'event1',
    expected_control_version:2,sector:'ENGINEERING',created_by_claim:'planner',
    scope_ref:'pr134'});
  assert.equal(next.status,'candidate_only');
  assert.deepEqual(audit.listProofs('event1').proof_ids,['proof1','proof2']);
  assert.equal(audit.readProof('proof1').control_snapshot_stale,true);
  assert.equal(audit.readProof('proof2').control_snapshot_stale,false);
});

test('19 per-review packet always exposes who did, who reviewed and HOLD gates',async()=>{
  const {audit}=await fixture({sector:'INFRASTRUCTURE'});
  await action(audit);
  await log(audit,'AUTOMATION',0);
  await review(audit);
  const packet=await audit.buildReviewPacket('proof1',{requiredStreams:AUDIT_STREAMS});
  assert.equal(packet.status,'candidate_only');
  assert.equal(packet.review_gate,'HOLD_PENDING_IDENTITY_AND_AUTHORITY');
  assert.equal(packet.safe_to_autopromote,false);
  assert.equal(packet.checks.WHO_PERFORMED,'CLAIM_ONLY');
  assert.equal(packet.checks.WHO_REVIEWED,'CLAIM_ONLY');
  assert.equal(packet.checks.INDEPENDENT_REVIEW,'UNVERIFIED_IDENTITY');
  assert.equal(packet.checks.AUDIT_CHAIN,'LOCAL_CONSISTENT');
  assert.equal(packet.checks.CONTROL_PIN,'PINNED_LOCAL');
  assert.equal(packet.checks.REQUIRED_LOGS,'INCOMPLETE');
  assert.deepEqual(packet.missing_log_streams,['REASONING_SUMMARY','WORLD_MODEL','MEMORY']);
  assert.equal(packet.local_integrity_confirmed,true);
  assert.equal(packet.proof.sector,'INFRASTRUCTURE');
});
test('20 a complete set of log references still cannot certify real-world approval',async()=>{
  const {audit}=await fixture({sector:'WATER'});
  await action(audit);
  for(let i=0;i<AUDIT_STREAMS.length;i++)await log(audit,AUDIT_STREAMS[i],i);
  await review(audit);
  const packet=await audit.buildReviewPacket('proof1',{requiredStreams:AUDIT_STREAMS});
  assert.equal(packet.checks.REQUIRED_LOGS,'REFERENCED_ONLY');
  assert.deepEqual(packet.missing_log_streams,[]);
  assert.equal(packet.checks.ACTUAL_ACK,'NOT_VERIFIED');
  assert.equal(packet.checks.BASELINE,'NOT_APPROVED');
  assert.equal(packet.safe_to_autopromote,false);
});
test('21 per-review packet stays stale when the control event changes',async()=>{
  const {audit,control}=await fixture({sector:'ELECTRICITY'});
  await action(audit);await review(audit);
  await control.proposeDirection({event_id:'event1',expected_version:1,
    direction:'ALTERNATIVE',reason:'new review candidate'});
  const packet=await audit.buildReviewPacket('proof1',{requiredStreams:[]});
  assert.equal(packet.checks.CONTROL_PIN,'STALE');
  assert.equal(packet.proof.review_status,'STALE_CONTROL_SNAPSHOT');
  assert.equal(packet.safe_to_autopromote,false);
});
test('22 audit packet rejects invented streams, duplicated requirements and missing proof',async()=>{
  const {audit}=await fixture();
  assert.equal((await audit.buildReviewPacket('proof1',
    {requiredStreams:['PRIVATE_CHAIN_OF_THOUGHT']})).reason,'REQUIRED_STREAMS_INVALID');
  assert.equal((await audit.buildReviewPacket('proof1',
    {requiredStreams:['AUTOMATION','AUTOMATION']})).reason,'REQUIRED_STREAMS_INVALID');
  assert.equal((await audit.buildReviewPacket('missing')).reason,'PROOF_NOT_FOUND');
});
