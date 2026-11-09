/**
 * Same-SHA three-axis read-only integration tests.
 * No real AI ACK, DB, private memory, network or deployment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit} from '../proof-audit-candidate.mjs';
import {createProgressJournals} from '../progress-journal-candidate.mjs';
import {createCognitiveTransition} from '../cognitive-transition-candidate.mjs';
const H='a'.repeat(64);
const source=(id,n)=>({event_id:'e2',source:{id,revision:'v1',payload:{kind:'quantity',dimension:'data',unit:'MB',value:n}}});
async function fixture(maxHistory){
 const control=createControlCycle({maxHistory});
 control.registerDomain({domain_id:'integrate',contract_revision:'v1'});
 const e1=await control.observe({event_id:'e1',domain_id:'integrate',source_id:'s1',revision:'v1',source_hash:H});
 const e2=await control.observe({event_id:'e2',domain_id:'integrate',source_id:'s2',revision:'v1',source_hash:H});
 assert.equal(e1.status,'candidate_only');assert.equal(e2.status,'candidate_only');
 const audit=createProofAudit({control});
 const proof=await audit.openProof({proof_id:'p1',event_id:'e1',expected_control_version:1,
    sector:'ENGINEERING',created_by_claim:'writer',scope_ref:'scope1'});
 assert.equal(proof.status,'candidate_only');
 const journals=createProgressJournals({audit});
 const j=await journals.createJournal({
  journal_id:'j1',project_id:'proj1',proof_id:'p1',sector:'ENGINEERING',stream:'AUTOMATION',
  expected_start:'2026-11-09',expected_due:'2026-11-20',plan_ref:'plan1'
 });
 assert.equal(j.status,'candidate_only');
 const cog=createCognitiveTransition({control,audit});
 const t=await cog.openTransition({transition_id:'t1',event_id:'e1',proof_id:'p1',project_id:'proj1',
  s0_revision:'V10',s0_hash:'b'.repeat(64),source_revision:'v1',created_by_claim:'writer'});
 assert.equal(t.status,'candidate_only');
 return {control,audit,journals,cog,v:t.version};
}
const drive=v=>({transition_id:'t1',expected_version:v,layer:'NEED',claim:'hypothesis',epistemic:'INFERRED',evidence_ref:'ev1'});
const progress=()=>({journal_id:'j1',expected_revision:1,observed_on:'2026-11-12',expected_percent:50,
 actual_percent:25,progress_status:'IN_PROGRESS',forecast_due:'2026-11-20',delay_reason_code:null,
 next_action_code:'REVIEW',evidence_ref:'ev2',recorded_by_claim:'worker',completed_on:null});

test('I01 failure of unrelated event engine invalidates dependent proof, cognition and progress',async()=>{
 const f=await fixture(3);
 assert.equal(f.cog.readTransition('t1').source_snapshot_stale,false);
 assert.equal(f.journals.readJournal('j1').snapshot_stale,false);
 const raced=await Promise.all([f.control.registerSource(source('alpha',3)),f.control.registerSource(source('beta',4))]);
 assert.equal(raced.filter(x=>x.status==='blocked').length,1);
 assert.equal(f.control.stats().engine_quarantined,true);
 assert.equal(f.control.readEvent('e1').engine_quarantined,true);
 const proof=f.audit.readProof('p1');
 assert.equal(proof.control_snapshot_stale,true,'proof must inherit global quarantine');
 const d=await f.cog.addDrive(drive(f.v));
 assert.equal(d.reason,'SOURCE_SNAPSHOT_STALE');
 const p=await f.journals.recordProgress(progress());
 assert.equal(p.reason,'PROOF_SNAPSHOT_STALE');
 assert.equal(f.cog.readTransition('t1').source_snapshot_stale,true);
 assert.equal(f.journals.readJournal('j1').snapshot_stale,true);
 assert.equal(f.cog.readTransition('t1').version,f.v);
 assert.equal(f.journals.readJournal('j1').revision,1);
});
test('I02 no failure allows benign revisions while keeping all authority HOLD',async()=>{
 const f=await fixture(12);
 const d=await f.cog.addDrive(drive(f.v));
 assert.equal(d.status,'candidate_only');
 const p=await f.journals.recordProgress(progress());
 assert.equal(p.status,'candidate_only');
 assert.equal(f.audit.readProof('p1').control_snapshot_stale,false);
 assert.equal(f.control.readEvent('e1').engine_quarantined,false);
 assert.equal(f.cog.readTransition('t1').approval,'NOT_APPROVED');
 assert.equal(f.journals.readJournal('j1').review_approved,false);
 assert.equal((await f.control.verifyHistory('e1')).local_chain_consistent,true);
 assert.equal((await f.cog.verifyTransition('t1')).local_chain_consistent,true);
 assert.equal((await f.journals.verifyJournal('j1')).local_chain_consistent,true);
});
test('I03 quarantine never grants a real remote stop or ACK',async()=>{
 const f=await fixture(3);
 await Promise.all([f.control.registerSource(source('alpha',3)),f.control.registerSource(source('beta',4))]);
 const e=f.control.readEvent('e1');
 assert.equal(e.remote_stop_confirmed,false);
 assert.equal(e.execution,'NOT_RUN');
 assert.equal(f.audit.readProof('p1').actual_ack,'NOT_VERIFIED');
 assert.equal(f.cog.readTransition('t1').approval,'NOT_APPROVED');
});
