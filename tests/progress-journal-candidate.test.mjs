import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit,AUDIT_STREAMS,AUDIT_SECTORS} from '../proof-audit-candidate.mjs';
import {createProgressJournals,JOURNAL_SCHEMA,PROGRESS_STATES} from '../progress-journal-candidate.mjs';
async function fixture(sector='ENGINEERING'){
  const control=createControlCycle();
  const domain=sector.toLowerCase();
  control.registerDomain({domain_id:domain,contract_revision:'v1'});
  await control.observe({event_id:'event1',domain_id:domain,source_id:'s1',revision:'r1',source_hash:'a'.repeat(64)});
  const audit=createProofAudit({control});
  await audit.openProof({proof_id:'p1',event_id:'event1',expected_control_version:1,
    sector,created_by_claim:'writer',scope_ref:'scope1'});
  const journals=createProgressJournals({audit});
  return {control,audit,journals,sector};
}
async function plan(f,stream='AUTOMATION',journal='j1',project='project1'){
  return f.journals.createJournal({journal_id:journal,project_id:project,proof_id:'p1',
    sector:f.sector,stream,expected_start:'2026-11-09',expected_due:'2026-11-20',plan_ref:'plan_ref'});
}
function progress(overrides={}){
 return {journal_id:'j1',expected_revision:1,observed_on:'2026-11-12',
   expected_percent:50,actual_percent:30,progress_status:'IN_PROGRESS',
   forecast_due:'2026-11-20',delay_reason_code:null,next_action_code:'TEST_MORE',
   evidence_ref:'e1',recorded_by_claim:'worker',completed_on:null,...overrides};
}
test('01 fixed journal stages',()=>assert.deepEqual(PROGRESS_STATES,['PLANNED','IN_PROGRESS','DELAYED','BLOCKED','COMPLETED']));
test('02 explicit plan captures original start and due as immutable baseline',async()=>{
  const f=await fixture();await plan(f);
  const j=f.journals.readJournal('j1');
  assert.equal(j.schema,JOURNAL_SCHEMA);
  assert.equal(j.expected_start,'2026-11-09');
  assert.equal(j.expected_due,'2026-11-20');
  assert.equal(j.progress_status,'PLANNED');
  assert.equal(j.actual_progress_percent,0);
  assert.equal(j.snapshot_stale,false);
});
test('03 current progress is distinct from expected progress with observation date',async()=>{
  const f=await fixture();await plan(f);
  assert.equal((await f.journals.recordProgress(progress())).status,'candidate_only');
  const j=f.journals.readJournal('j1');
  assert.equal(j.actual_progress_percent,30);
  assert.equal(j.expected_progress_percent,50);
  assert.equal(j.last_observed_on,'2026-11-12');
  assert.equal(j.revision,2);
  assert.equal(j.progress_status,'IN_PROGRESS');
  assert.equal(j.notification,'NOT_SENT');
});
test('04 delayed tasks must give reason, forecast due and dated evidence',async()=>{
  const f=await fixture();await plan(f);
  assert.equal((await f.journals.recordProgress(progress({progress_status:'DELAYED',delay_reason_code:null,forecast_due:'2026-11-25'}))).reason,'DELAY_EVIDENCE_OR_DATE_REQUIRED');
  assert.equal((await f.journals.recordProgress(progress({progress_status:'DELAYED',delay_reason_code:'WAIT_FOR_DATA'}))).reason,'DELAY_EVIDENCE_OR_DATE_REQUIRED');
  const r=await f.journals.recordProgress(progress({progress_status:'DELAYED',delay_reason_code:'WAIT_FOR_DATA',forecast_due:'2026-11-25'}));
  assert.equal(r.status,'candidate_only');
  const j=f.journals.readJournal('j1');
  assert.equal(j.delay_reason_code,'WAIT_FOR_DATA');
  assert.equal(j.forecast_due,'2026-11-25');
  assert.equal(j.days_shifted,5);
  assert.equal(j.expected_due,'2026-11-20');
});
test('05 overdue date requires explicit delayed classification',async()=>{
  const f=await fixture();await plan(f);
  assert.equal((await f.journals.recordProgress(progress({observed_on:'2026-11-23'}))).reason,'UNACKNOWLEDGED_DELAY');
  const r=await f.journals.recordProgress(progress({observed_on:'2026-11-23',
    progress_status:'DELAYED',delay_reason_code:'EXTERNAL_BLOCKER'}));
  assert.equal(r.status,'candidate_only');
});
test('06 invalid date like November 31, February 30 is rejected',async()=>{
  const f=await fixture();await plan(f);
  for(const observed_on of ['2026-11-31','2026-02-30','2026-11-1','2026-13-01']){
    assert.equal((await f.journals.recordProgress(progress({observed_on}))).reason,'PROGRESS_RECORD_INVALID');
  }
});
test('07 nonchronological plan, observations and forecast rejected',async()=>{
  const f=await fixture();await plan(f);
  assert.equal((await f.journals.recordProgress(progress({observed_on:'2026-11-01'}))).reason,'DATE_ORDER_INVALID');
  assert.equal((await f.journals.recordProgress(progress({forecast_due:'2026-11-01'}))).reason,'DATE_ORDER_INVALID');
  await f.journals.recordProgress(progress());
  assert.equal((await f.journals.recordProgress(progress({expected_revision:2,observed_on:'2026-11-10'}))).reason,'DATE_ORDER_INVALID');
});
test('08 completion requires 100%, completion date, and freezes future updates',async()=>{
  const f=await fixture();await plan(f);
  assert.equal((await f.journals.recordProgress(progress({progress_status:'COMPLETED',actual_percent:99,completed_on:'2026-11-12'}))).reason,'COMPLETION_CONTRACT_INVALID');
  const v=progress({progress_status:'COMPLETED',actual_percent:100,completed_on:'2026-11-12'});
  assert.equal((await f.journals.recordProgress(v)).status,'candidate_only');
  assert.equal(f.journals.readJournal('j1').completed_on,'2026-11-12');
  assert.equal((await f.journals.recordProgress(progress({expected_revision:2,observed_on:'2026-11-13',actual_percent:80}))).reason,'COMPLETED_JOURNAL_IMMUTABLE');
});
test('09 same project holds separate 4 independent log streams',async()=>{
  const f=await fixture('WATER');
  for(let i=0;i<AUDIT_STREAMS.length;i++)await plan(f,AUDIT_STREAMS[i],'j'+i,'project1');
  const j=f.journals.listProject({project_id:'project1',sector:'WATER'});
  assert.equal(j.journals.length,4);
  const p=f.journals.readJournal('j0');
  assert.equal(p.stream,'AUTOMATION');
  assert.equal(f.journals.folderFor('j2').relative_folder,'logs/WATER/project1/WORLD_MODEL');
});
test('10 journals cannot mix water, electricity or proof scope',async()=>{
  const f=await fixture('WATER');
  const r=await f.journals.createJournal({journal_id:'j1',project_id:'p',
    proof_id:'p1',sector:'ELECTRICITY',stream:'AUTOMATION',
    expected_start:'2026-11-09',expected_due:'2026-11-19',plan_ref:'p'});
  assert.equal(r.reason,'PROOF_SECTOR_OR_SNAPSHOT_MISMATCH');
});
test('11 duplicated journal id is idempotent only for exact same payload',async()=>{
  const f=await fixture();await plan(f);
  assert.equal((await plan(f)).operation,'DUPLICATE_IGNORED');
  assert.equal((await plan(f,'MEMORY')).reason,'JOURNAL_ID_COLLISION');
  assert.equal((await plan(f,'AUTOMATION','different-id')).reason,'PROOF_PROJECT_STREAM_COLLISION');
});
test('12 progress revisions CAS guard stale concurrent writes',async()=>{
  const f=await fixture();await plan(f);
  const r=await Promise.all([
    f.journals.recordProgress(progress({recorded_by_claim:'a'})),
    f.journals.recordProgress(progress({recorded_by_claim:'b'}))
  ]);
  assert.equal(r.filter(x=>x.status==='candidate_only').length,1);
  assert.equal(r.filter(x=>x.reason==='JOURNAL_VERSION_CONFLICT').length,1);
  assert.equal(f.journals.readJournal('j1').revision,2);
});
test('13 progress regression requires new plan, never overwrite old history',async()=>{
  const f=await fixture();await plan(f);await f.journals.recordProgress(progress());
  const r=await f.journals.recordProgress(progress({expected_revision:2,
    observed_on:'2026-11-13',actual_percent:20}));
  assert.equal(r.reason,'PROGRESS_REGRESSION_REQUIRES_NEW_PLAN');
  assert.equal(f.journals.readJournal('j1').entries.length,2);
});
test('14 proof mutation invalidates schedule snapshot; no updates on stale proof',async()=>{
  const f=await fixture();await plan(f);
  await f.audit.recordAction({proof_id:'p1',expected_revision:1,action_id:'a',
    performed_by_claim:'writer',action_ref:'commit',action_hash:'a'.repeat(64),result_code:'PROPOSED'});
  assert.equal(f.journals.readJournal('j1').snapshot_stale,true);
  assert.equal((await f.journals.recordProgress(progress())).reason,'PROOF_SNAPSHOT_STALE');
});
test('15 local chain verifies references but never claims external proof',async()=>{
  const f=await fixture();await plan(f);await f.journals.recordProgress(progress());
  const v=await f.journals.verifyJournal('j1');
  assert.equal(v.local_chain_consistent,true);
  assert.equal(v.checked_entries,2);
  assert.equal(v.durable,false);
  assert.equal(v.trusted_clock,false);
  const copy=f.journals.readJournal('j1');copy.entries[0].kind='FORGED';
  assert.equal(f.journals.readJournal('j1').entries[0].kind,'PLAN_REGISTERED');
});
test('16 unsafe paths, extra approval flags and missing required dates rejected',async()=>{
  const f=await fixture();
  const bad=await f.journals.createJournal({journal_id:'../evil',project_id:'p',
    proof_id:'p1',sector:'ENGINEERING',stream:'MEMORY',expected_start:'2026-11-09',
    expected_due:'2026-11-20',plan_ref:'p'});
  assert.equal(bad.reason,'JOURNAL_PLAN_INVALID');
  await plan(f);
  assert.equal((await f.journals.recordProgress({...progress(),approved:true})).reason,'PROGRESS_RECORD_INVALID');
  const {observed_on,...missingDate}=progress();
  assert.equal((await f.journals.recordProgress(missingDate)).reason,'PROGRESS_RECORD_INVALID');
});
test('17 bounded history and journal cardinality reject overflow',async()=>{
  const f=await fixture();
  const journals=createProgressJournals({audit:f.audit,maxJournals:1,maxEntries:2});
  assert.equal((await journals.createJournal({journal_id:'a',project_id:'p',proof_id:'p1',
    sector:'ENGINEERING',stream:'AUTOMATION',expected_start:'2026-11-09',
    expected_due:'2026-11-20',plan_ref:'p'})).status,'candidate_only');
  assert.equal((await journals.createJournal({journal_id:'b',project_id:'p',proof_id:'p1',
    sector:'ENGINEERING',stream:'MEMORY',expected_start:'2026-11-09',
    expected_due:'2026-11-20',plan_ref:'p'})).reason,'JOURNAL_CAPACITY');
  await journals.recordProgress({ ...progress(),journal_id:'a'});
  assert.equal((await journals.recordProgress({...progress(),journal_id:'a',expected_revision:2,observed_on:'2026-11-13',actual_percent:31})).reason,'JOURNAL_ENTRY_CAPACITY');
});
