import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlCycle,CONTROL_SCHEMA,CONTROL_MODES,NOTIFICATION_KINDS,DIRECTIONS} from '../control-cycle-candidate.mjs';
const hash='a'.repeat(64);
const qty=n=>({kind:'quantity',dimension:'data',unit:'MB',value:n});
const init=async()=>{
  const c=createControlCycle();
  assert.equal(c.registerDomain({domain_id:'culture',contract_revision:'r1'}).status,'candidate_only');
  const e=await c.observe({event_id:'ev1',domain_id:'culture',source_id:'source1',revision:'r2',source_hash:hash});
  assert.equal(e.status,'candidate_only');
  return c;
};
test('01 published flag vocabulary is orthogonal and fixed',()=>{
  assert.equal(CONTROL_SCHEMA,'firstbrain.trusted-control-cycle.candidate.v0.1');
  assert.deepEqual(CONTROL_MODES,['STOP','OBSERVE','TEST','CONTROLLED']);
  assert.deepEqual(NOTIFICATION_KINDS,['WARNING','FAILURE','EXECUTION','CORRECTION','REVIEW']);
  assert.deepEqual(DIRECTIONS,['REUSE','ALTERNATIVE','CHALLENGE_PREMISE','STOP','RESEARCH_ONLY']);
});
test('02 observation is never automatic approval, ACK or deployment',async()=>{
  const c=await init();const v=c.readEvent('ev1');
  assert.equal(v.observation,'RECORDED_UNVERIFIED');
  assert.equal(v.baseline,'NOT_APPROVED');
  assert.equal(v.execution,'NOT_RUN');
  assert.equal(v.remote_ack,'NOT_VERIFIED');
  assert.equal(v.authority,'none');
  assert.equal(v.control_mode,'OBSERVE');
});
test('03 idempotent exact observation vs same ID different content',async()=>{
  const c=await init();
  const same=await c.observe({event_id:'ev1',domain_id:'culture',source_id:'source1',revision:'r2',source_hash:hash});
  assert.equal(same.operation,'DUPLICATE_IGNORED');
  const conflict=await c.observe({event_id:'ev1',domain_id:'culture',source_id:'source1',revision:'r3',source_hash:hash});
  assert.equal(conflict.reason,'EVENT_ID_COLLISION');
  assert.equal(c.readEvent('ev1').version,1);
});
test('04 baseline proposal cannot promote observed V11 to approved',async()=>{
  const c=await init();
  const r=await c.proposeBaseline({event_id:'ev1',expected_version:1,candidate_revision:'V11',candidate_hash:hash,evidence_ref:'source3'});
  assert.equal(r.status,'candidate_only');
  assert.equal(c.readEvent('ev1').baseline,'NOT_APPROVED');
  assert.equal(c.readEvent('ev1').execution,'NOT_RUN');
  assert.match(JSON.stringify(c.history('ev1')),/NOT_APPROVED/);
  assert.equal(typeof c.approveBaseline,'undefined');
});
test('05 expected version gates simultaneous or stale proposal',async()=>{
  const c=await init();
  assert.equal((await c.proposeDirection({event_id:'ev1',expected_version:0,direction:'REUSE',reason:'look'})).reason,'VERSION_CONFLICT');
  assert.equal((await c.proposeDirection({event_id:'ev1',expected_version:1,direction:'CHALLENGE_PREMISE',reason:'contrary observation'})).status,'candidate_only');
  assert.equal((await c.proposeDirection({event_id:'ev1',expected_version:1,direction:'REUSE',reason:'stale'})).reason,'VERSION_CONFLICT');
  assert.equal(c.readEvent('ev1').direction,'CHALLENGE_PREMISE');
});
test('06 five notification outputs share one event ID and are NOT_SENT',async()=>{
  const c=await init();
  const kinds=NOTIFICATION_KINDS;
  for(let i=0;i<kinds.length;i++){
    const r=await c.queueNotification({event_id:'ev1',expected_version:i+1,
      notification_id:'n'+i,kind:kinds[i],evidence_ref:'evidence1'});
    assert.equal(r.delivery,'NOT_SENT');
  }
  const repeated=await c.queueNotification({event_id:'ev1',expected_version:6,
    notification_id:'n0',kind:'WARNING',evidence_ref:'evidence1'});
  assert.equal(repeated.operation,'DUPLICATE_IGNORED');
  assert.equal(c.readEvent('ev1').notification_count,5);
  const collision=await c.queueNotification({event_id:'ev1',expected_version:6,
    notification_id:'n0',kind:'FAILURE',evidence_ref:'evidence1'});
  assert.equal(collision.reason,'NOTIFICATION_ID_COLLISION');
});
test('07 alleged receiver receipt does not become real ACK',async()=>{
  const c=await init();
  const r=await c.recordReceiptClaim({event_id:'ev1',expected_version:1,receiver_claim:'gpt2',receipt_ref:'unverified'});
  assert.equal(r.status,'candidate_only');
  const h=c.history('ev1').entries;
  assert.equal(h.at(-1).details.actual_ack,'NOT_VERIFIED');
  assert.equal(c.readEvent('ev1').remote_ack,'NOT_VERIFIED');
});
test('08 STOP blocks local composition but cannot claim remote stop',async()=>{
  const c=await init();
  const r=await c.requestControl({event_id:'ev1',expected_version:1,action:'STOP',
    operator_claim:'user1',grant_ref:'declared1'});
  assert.equal(r.local_mode,'STOP');
  assert.equal(r.remote_stop_confirmed,false);
  assert.equal(c.readEvent('ev1').local_stop,true);
  assert.equal((await c.registerSource({event_id:'ev1',source:{id:'A',revision:'r1',payload:qty(2)}})).reason,'LOCAL_STOP_ACTIVE');
  assert.equal((await c.compose({event_id:'ev1',inputIds:['A','B'],rule:'quantity_sum'})).reason,'LOCAL_STOP_ACTIVE');
});
test('09 mere START or SET_CONTROLLED request does not start worker',async()=>{
  const c=await init();
  for(const action of ['START','SET_CONTROLLED']){
    const r=await c.requestControl({event_id:'ev1',expected_version:c.readEvent('ev1').version,
      action,operator_claim:'gpt1',grant_ref:'unverified-grant'});
    assert.equal(r.status,'candidate_only');
    assert.equal(c.readEvent('ev1').control_mode,'OBSERVE');
    assert.equal(c.readEvent('ev1').execution,'NOT_RUN');
  }
});
test('10 true V1.6 A+B -> X+C typed result references are reusable',async()=>{
  const c=await init();
  for(const [id,val] of [['A',4],['B',6],['C',2]]){
    const x=await c.registerSource({event_id:'ev1',source:{id,revision:'r1',payload:qty(val)}});
    assert.equal(x.status,'candidate_only');
  }
  const x=await c.compose({event_id:'ev1',inputIds:['A','B'],rule:'quantity_sum',context:{target_unit:'MB'}});
  assert.equal(x.status,'candidate_only');
  const y=await c.compose({event_id:'ev1',inputIds:[x.result_id,'C'],rule:'quantity_sum',context:{target_unit:'MB'}});
  assert.equal(y.status,'candidate_only');
  assert.equal(c.readComposition(y.result_id).packet.typed_result.value.numerator,'12');
  assert.equal(c.readEvent('ev1').baseline,'NOT_APPROVED');
});
test('11 explicit UNKNOWN retains a missing value when composing with X',async()=>{
  const c=await init();
  for(const [id,val] of [['A',4],['B',6]]){
    await c.registerSource({event_id:'ev1',source:{id,revision:'r1',payload:qty(val)}});
  }
  const x=await c.compose({event_id:'ev1',inputIds:['A','B'],rule:'quantity_sum',context:{target_unit:'MB'}});
  await c.registerGap({event_id:'ev1',gap:{id:'U',revision:'r1',state:'UNKNOWN'}});
  const y=await c.compose({event_id:'ev1',inputIds:[x.result_id,'U'],rule:'quantity_sum',context:{target_unit:'MB'}});
  assert.equal(y.composition_status,'created_partial');
  const p=c.readComposition(y.result_id).packet;
  assert.equal(p.computed_value,null);assert.equal(p.blanks[0].state,'UNKNOWN');
});
test('12 revision invalidates old result; original gap remains inspectable',async()=>{
  const c=await init();
  await c.registerSource({event_id:'ev1',source:{id:'A',revision:'r1',payload:qty(4)}});
  await c.registerGap({event_id:'ev1',gap:{id:'U',revision:'r1',state:'UNKNOWN'}});
  const y=await c.compose({event_id:'ev1',inputIds:['A','U'],rule:'quantity_sum',context:{target_unit:'MB'}});
  const r=await c.reviseGap({event_id:'ev1',gap:{id:'U',expectedRevision:'r1',revision:'r2',state:'UNVERIFIED'}});
  assert.equal(r.status,'candidate_only');
  assert.equal(c.readComposition(y.result_id).reason,'STALE_DEPENDENCY');
});
test('13 REDACTED does not disclose even partial calculation IDs',async()=>{
  const c=await init();
  await c.registerSource({event_id:'ev1',source:{id:'A',revision:'r1',payload:qty(4)}});
  await c.registerGap({event_id:'ev1',gap:{id:'hidden',revision:'r1',state:'REDACTED'}});
  const out=await c.compose({event_id:'ev1',inputIds:['A','hidden'],rule:'quantity_sum',context:{target_unit:'MB'}});
  assert.equal(out.status,'blocked');
  assert.equal(out.reason,'ACCESS_DENIED_OR_UNAVAILABLE');
  assert.equal(out.result_id,undefined);
});
test('14 independent domains can expand without adding a new AI or data store',async()=>{
  const c=await init();
  assert.equal(c.registerDomain({domain_id:'physics',contract_revision:'r2'}).status,'candidate_only');
  const z=await c.observe({event_id:'ev2',domain_id:'physics',source_id:'source2',
    revision:'r9',source_hash:'b'.repeat(64)});
  assert.equal(z.status,'candidate_only');
  assert.equal(c.stats().domains,2);
  assert.equal(c.stats().approved_baselines,0);
});
test('15 local ledger hash chain and defensive history copies',async()=>{
  const c=await init();
  await c.proposeDirection({event_id:'ev1',expected_version:1,direction:'ALTERNATIVE',reason:'try another'});
  const h=c.history('ev1');h.entries[0].kind='FORGED';
  assert.equal((await c.verifyHistory('ev1')).local_chain_consistent,true);
  assert.equal(c.history('ev1').entries[0].kind,'OBSERVED');
});
test('16 bounded capacity fails closed, without fake unbounded storage',async()=>{
  const c=createControlCycle({maxDomains:1,maxEvents:1,maxHistory:2});
  c.registerDomain({domain_id:'a',contract_revision:'v1'});
  assert.equal(c.registerDomain({domain_id:'b',contract_revision:'v1'}).reason,'DOMAIN_CAPACITY_REACHED');
  await c.observe({event_id:'e1',domain_id:'a',source_id:'s1',revision:'r1',source_hash:hash});
  assert.equal((await c.observe({event_id:'e2',domain_id:'a',source_id:'s2',revision:'r1',source_hash:hash})).reason,'EVENT_CAPACITY_REACHED');
  await c.proposeDirection({event_id:'e1',expected_version:1,direction:'STOP',reason:'test'});
  assert.equal((await c.proposeDirection({event_id:'e1',expected_version:2,direction:'REUSE',reason:'beyond limit'})).reason,'HISTORY_CAPACITY_REACHED');
});
test('17 rejects unknown fields and impersonated status flags',async()=>{
  const c=await init();
  assert.equal((await c.observe({event_id:'evil',domain_id:'culture',source_id:'s',
    revision:'r1',source_hash:hash,approved:true})).reason,'OBSERVATION_CONTRACT_INVALID');
  assert.equal((await c.proposeBaseline({event_id:'ev1',expected_version:1,
    candidate_revision:'r2',candidate_hash:hash,evidence_ref:'r',approved:true})).reason,'BASELINE_PROPOSAL_INVALID');
  assert.equal((await c.requestControl({event_id:'ev1',expected_version:1,action:'DEPLOY',
    operator_claim:'user1',grant_ref:'dummy'})).reason,'CONTROL_REQUEST_INVALID');
});

test('18 simultaneous state updates cannot write duplicate sequence numbers',async()=>{
  const c=await init();
  const p={event_id:'ev1',expected_version:1,reason:'concurrent direction'};
  const responses=await Promise.all([
    c.proposeDirection({...p,direction:'REUSE'}),
    c.proposeDirection({...p,direction:'ALTERNATIVE'})
  ]);
  assert.equal(responses.filter(r=>r.status==='candidate_only').length,1);
  assert.equal(responses.filter(r=>r.reason==='VERSION_CONFLICT').length,1);
  const h=c.history('ev1').entries;
  assert.deepEqual(h.map(v=>v.sequence),[1,2]);
  assert.equal((await c.verifyHistory('ev1')).local_chain_consistent,true);
});
test('19 N-way 4-source calculations and provenance remain candidate-only',async()=>{
  const c=await init();
  for(const [id,val] of [['A',1],['B',2],['C',3],['D',4]]){
    const r=await c.registerSource({event_id:'ev1',source:{id,revision:'r1',payload:qty(val)}});
    assert.equal(r.status,'candidate_only');
  }
  const x=await c.compose({event_id:'ev1',inputIds:['A','B','C','D'],
    rule:'quantity_sum',context:{target_unit:'MB'}});
  assert.equal(x.status,'candidate_only');
  assert.equal(c.readComposition(x.result_id).packet.typed_result.value.numerator,'10');
  assert.equal(c.readEvent('ev1').baseline,'NOT_APPROVED');
  assert.equal(c.readEvent('ev1').remote_ack,'NOT_VERIFIED');
});
