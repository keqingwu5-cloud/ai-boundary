/**
 * Fail-closed source and proof snapshot tests. Synthetic in-memory fixtures only.
 * These are expected to be RED on #139 before the V0.3 source-pinning repair.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit} from '../proof-audit-candidate.mjs';
import {createCognitiveTransition} from '../cognitive-transition-candidate.mjs';
const H=c=>c.repeat(64);

async function fixture({maxRefs=1024,auditProxy=null}={}){
  const control=createControlCycle();
  const audit=createProofAudit({control});
  const d=await control.registerDomain({domain_id:'isolation-domain',contract_revision:'v01',description:'synthetic'});
  assert.equal(d.status,'candidate_only');
  const observed=await control.observe({
    event_id:'evt-1',domain_id:'isolation-domain',source_id:'synthetic-input',
    revision:'V11',source_hash:H('a'),baseline_ref:'V10-claim'
  });
  assert.equal(observed.status,'candidate_only');
  const proof=await audit.openProof({
    proof_id:'proof-1',event_id:'evt-1',expected_control_version:observed.version,
    sector:'ENGINEERING',created_by_claim:'operator-claim',scope_ref:'scope-1'
  });
  assert.equal(proof.status,'candidate_only');
  const cog=createCognitiveTransition({control,audit:auditProxy?auditProxy(audit):audit,maxRefs});
  const opened=await cog.openTransition({
    transition_id:'transition-1',event_id:'evt-1',proof_id:'proof-1',
    project_id:'proj-1',s0_revision:'V10',s0_hash:H('b'),
    source_revision:'synth-rev',created_by_claim:'operator-claim'
  });
  assert.equal(opened.status,'candidate_only');
  return {control,audit,cog,v:opened.version};
}
const drive=v=>({transition_id:'transition-1',expected_version:v,layer:'NEED',
  claim:'synthetic hypothesis',epistemic:'INFERRED',evidence_ref:'evidence-1'});
const action=v=>({transition_id:'transition-1',expected_version:v,action_id:'action-1',
  kind:'RESEARCH_ONLY',predicted_s1:{revision:'v11'},
  confidence:0.6,assumptions:[],counterfactual_ref:'cf-1'});
const observation=v=>({transition_id:'transition-1',expected_version:v,o1_revision:'observed-v11',
  o1_hash:H('c'),observed_at:'2026-11-09',source_ref:'sensor-1'});
const calibration=v=>({transition_id:'transition-1',expected_version:v,action_id:'action-1',
  error_summary:'synthetic hypothesis check',counter_evidence_ref:'evidence-2',revised_confidence:0.4});
const memory=v=>({transition_id:'transition-1',expected_version:v,kind:'COUNTERFACTUAL',
  ref_id:'reference-1',summary_hash:H('d'),epistemic:'INFERRED'});
const assertNoAppend=(cog,before)=>{
  const after=cog.readTransition('transition-1');
  assert.equal(after.version,before.version);
  assert.equal(after.history_head_hash,before.history_head_hash);
  for(const key of ['drivers','actions','observations','calibrations','memory_refs'])
    assert.equal(after[key].length,before[key].length,key);
  assert.deepEqual(after.times,before.times);
};
const block=async(promise,reason='SOURCE_SNAPSHOT_STALE')=>{
  const result=await promise;
  assert.equal(result.status,'blocked',JSON.stringify(result));
  assert.equal(result.reason,reason,JSON.stringify(result));
  assert.equal(result.approval,'NOT_APPROVED');
};
async function advanceControl(control){
  const changed=await control.proposeDirection({
    event_id:'evt-1',expected_version:1,direction:'RESEARCH_ONLY',reason:'synthetic revision'});
  assert.equal(changed.status,'candidate_only');
}
async function advanceProof(audit){
  const result=await audit.recordLog({
    proof_id:'proof-1',expected_revision:1,log_id:'log-1',stream:'WORLD_MODEL',
    recorded_by_claim:'operator-claim',record_ref:'public-ref-1',
    record_hash:H('e'),summary_code:'RESEARCH_ONLY'
  });
  assert.equal(result.status,'candidate_only');
}
test('S01 control advances after open: addDrive must be blocked without a partial append',async()=>{
  const {control,cog,v}=await fixture(),before=cog.readTransition('transition-1');
  await advanceControl(control);
  await block(cog.addDrive(drive(v)));
  assertNoAppend(cog,before);
});
test('S02 proof advances after open: proposeAction must be blocked without a partial append',async()=>{
  const {audit,cog,v}=await fixture(),before=cog.readTransition('transition-1');
  await advanceProof(audit);
  await block(cog.proposeAction(action(v)));
  assertNoAppend(cog,before);
});
test('S03 control advances after valid action: observation is blocked and time unchanged',async()=>{
  const {control,cog,v}=await fixture();
  const out=await cog.proposeAction(action(v));assert.equal(out.status,'candidate_only');
  const before=cog.readTransition('transition-1');
  await advanceControl(control);
  await block(cog.recordObservation(observation(out.version)));
  assertNoAppend(cog,before);
});
test('S04 control advances after valid prediction and observation: calibration is blocked',async()=>{
  const {control,cog,v}=await fixture();
  const a=await cog.proposeAction(action(v));assert.equal(a.status,'candidate_only');
  const o=await cog.recordObservation(observation(a.version));assert.equal(o.status,'candidate_only');
  const before=cog.readTransition('transition-1');
  await advanceControl(control);
  await block(cog.calibrate(calibration(o.version)));
  assertNoAppend(cog,before);
});
test('S05 proof advances after open: memory reference is blocked',async()=>{
  const {audit,cog,v}=await fixture(),before=cog.readTransition('transition-1');
  await advanceProof(audit);
  await block(cog.addMemoryRef(memory(v)));
  assertNoAppend(cog,before);
});
test('S06 stale proof stays visible as history but must be explicitly marked stale',async()=>{
  const {audit,cog}=await fixture();
  await advanceProof(audit);
  const out=cog.readTransition('transition-1');
  assert.equal(out.status,'candidate_only');
  assert.equal(out.source_snapshot_stale,true);
  assert.equal(out.safe_to_revise,false);
  assert.equal(out.approval,'NOT_APPROVED');
});
test('S07 local chain integrity does not suppress stale-source status',async()=>{
  const {control,cog}=await fixture();
  await advanceControl(control);
  const r=await cog.verifyTransition('transition-1');
  assert.equal(r.local_chain_consistent,true);
  assert.equal(r.source_snapshot_stale,true);
  assert.equal(r.durable,false);
  assert.equal(r.approval,'NOT_APPROVED');
});
test('S08 calibration cannot claim observed error without any O1',async()=>{
  const {cog,v}=await fixture();
  const a=await cog.proposeAction(action(v));assert.equal(a.status,'candidate_only');
  const before=cog.readTransition('transition-1');
  await block(cog.calibrate(calibration(a.version)),'OBSERVATION_REQUIRED');
  assertNoAppend(cog,before);
});
test('S09 no partial side state when ref limit exhausted',async()=>{
  const {cog,v}=await fixture({maxRefs:1});
  const before=cog.readTransition('transition-1');
  await block(cog.recordObservation(observation(v)),'REF_CAPACITY_REACHED');
  assertNoAppend(cog,before);
});
test('S10 readback mutations cannot overwrite canonical side state',async()=>{
  const {cog,v}=await fixture();
  const a=await cog.proposeAction(action(v));assert.equal(a.status,'candidate_only');
  const first=cog.readTransition('transition-1');
  first.actions[0].predicted_s1.revision='evil';
  first.times.OBSERVATION='2030-01-01';
  const again=cog.readTransition('transition-1');
  assert.equal(again.actions[0].predicted_s1.revision,'v11');
  assert.equal(again.times.OBSERVATION,'UNKNOWN');
});
test('S11 committed proof version changing during append hash must fail closed',async()=>{
  let reads=0;
  const {cog,v}=await fixture({auditProxy:audit=>({
    readProof(id){const proof=audit.readProof(id);reads++;return reads>=4?{...proof,revision:proof.revision+1}:proof;}
  })});
  const before=cog.readTransition('transition-1');
  await block(cog.addDrive(drive(v)));
  assertNoAppend(cog,before);
});
test('S12 unmodified source still permits normal candidate flow without approval',async()=>{
  const {cog,v}=await fixture();
  const a=await cog.proposeAction(action(v));assert.equal(a.status,'candidate_only');
  const o=await cog.recordObservation(observation(a.version));assert.equal(o.status,'candidate_only');
  const c=await cog.calibrate(calibration(o.version));assert.equal(c.status,'candidate_only');
  const m=await cog.addMemoryRef(memory(c.version));assert.equal(m.status,'candidate_only');
  const verified=await cog.verifyTransition('transition-1');
  assert.equal(verified.local_chain_consistent,true);
  assert.equal(verified.source_snapshot_stale,false);
  assert.equal(verified.approval,'NOT_APPROVED');
  assert.equal(cog.readTransition('transition-1').version,m.version);
});
