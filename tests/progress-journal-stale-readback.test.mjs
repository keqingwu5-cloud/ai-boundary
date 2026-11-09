/**
 * Read-only progress/source-staleness tests for PR #135 candidate.
 * A locally complete journal must never hide a stale parent proof.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit} from '../proof-audit-candidate.mjs';
import {createProgressJournals} from '../progress-journal-candidate.mjs';
async function setup(){
  const control=createControlCycle();
  control.registerDomain({domain_id:'eng',contract_revision:'v1'});
  const e=await control.observe({
    event_id:'e1',domain_id:'eng',source_id:'sensor',revision:'v1',source_hash:'a'.repeat(64)
  });
  assert.equal(e.status,'candidate_only');
  const audit=createProofAudit({control});
  const p=await audit.openProof({
    proof_id:'p1',event_id:'e1',expected_control_version:1,
    sector:'ENGINEERING',created_by_claim:'writer',scope_ref:'scope1'
  });
  assert.equal(p.status,'candidate_only');
  const j=createProgressJournals({audit});
  const plan={
    journal_id:'j1',project_id:'project1',proof_id:'p1',sector:'ENGINEERING',
    stream:'AUTOMATION',expected_start:'2026-11-09',expected_due:'2026-11-20',plan_ref:'ref1'
  };
  const created=await j.createJournal(plan);assert.equal(created.status,'candidate_only');
  return {control,audit,j,plan};
}
async function advanceProof(audit){
  const r=await audit.recordAction({
    proof_id:'p1',expected_revision:1,action_id:'action1',
    performed_by_claim:'worker',action_ref:'synthetic',
    action_hash:'a'.repeat(64),result_code:'OBSERVED'
  });
  assert.equal(r.status,'candidate_only');
}
test('J01 exact duplicate before proof changes remains idempotent',async()=>{
  const f=await setup();
  const d=await f.j.createJournal(f.plan);
  assert.equal(d.operation,'DUPLICATE_IGNORED');
  assert.equal(f.j.readJournal('j1').snapshot_stale,false);
});
test('J02 exact duplicate AFTER proof revision must not announce success',async()=>{
  const f=await setup();
  await advanceProof(f.audit);
  const old=f.j.readJournal('j1');
  const d=await f.j.createJournal(f.plan);
  assert.equal(d.status,'blocked');
  assert.equal(d.reason,'PROOF_SNAPSHOT_STALE');
  assert.equal(f.j.readJournal('j1').revision,old.revision);
});
test('J03 project list must mark stale proof even when journal is locally intact',async()=>{
  const f=await setup();
  await advanceProof(f.audit);
  const listed=f.j.listProject({project_id:'project1',sector:'ENGINEERING'});
  assert.equal(listed.status,'candidate_only');
  assert.equal(listed.journals.length,1);
  assert.equal(listed.journals[0].snapshot_stale,true);
  assert.equal(listed.journals[0].safe_to_promote,false);
  assert.equal(f.j.readJournal('j1').snapshot_stale,true);
});
test('J04 nonstale project list still refuses automatic approval',async()=>{
  const f=await setup();
  const listed=f.j.listProject({project_id:'project1',sector:'ENGINEERING'});
  assert.equal(listed.journals[0].snapshot_stale,false);
  assert.equal(listed.journals[0].safe_to_promote,false);
  assert.equal(listed.decision,'HOLD');
  assert.equal(listed.review_approved,false);
});
test('J05 already-stale journal cannot append new progress',async()=>{
  const f=await setup();
  await advanceProof(f.audit);
  const r=await f.j.recordProgress({
    journal_id:'j1',expected_revision:1,observed_on:'2026-11-12',
    expected_percent:60,actual_percent:40,progress_status:'IN_PROGRESS',
    forecast_due:'2026-11-20',delay_reason_code:null,next_action_code:'REVIEW_REQUIRED',
    evidence_ref:'ref2',recorded_by_claim:'actor-claim',completed_on:null
  });
  assert.equal(r.reason,'PROOF_SNAPSHOT_STALE');
  assert.equal(f.j.readJournal('j1').revision,1);
});
