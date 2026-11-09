/**
 * CI-only synthetic proof bundle samples. The names, refs and hashes here are
 * deliberately fictional. Never treat them as real developer/reviewer identity.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit,AUDIT_SECTORS,AUDIT_STREAMS} from '../proof-audit-candidate.mjs';
import {createProgressJournals} from '../progress-journal-candidate.mjs';
const dir='artifacts/proof-audit-synthetic';
await mkdir(dir,{recursive:true});
const manifest={schema:'firstbrain.proof-audit.examples.v0.1',synthetic_only:true,
  real_identities_verified:false,independent_review_verified:false,
  deployment_approval:false,items:[]};
for(const sector of AUDIT_SECTORS){
  const domain=sector.toLowerCase();
  const control=createControlCycle();
  control.registerDomain({domain_id:domain,contract_revision:'demo1'});
  const event_id='synthetic:'+domain;
  await control.observe({event_id,domain_id:domain,source_id:'example',
    revision:'r1',source_hash:'a'.repeat(64)});
  const audit=createProofAudit({control});
  const proof_id='proof:'+domain;
  await audit.openProof({proof_id,event_id,expected_control_version:1,
    sector,created_by_claim:'synthetic_planner',scope_ref:'synthetic_scope'});
  const p=audit.readProof(proof_id);
  await audit.recordAction({proof_id,expected_revision:p.revision,
    action_id:'synthetic_action',performed_by_claim:'synthetic_implementer',
    action_ref:'synthetic_commit_ref',action_hash:'b'.repeat(64),
    result_code:'SYNTHETIC_EXAMPLE'});
  for(let i=0;i<AUDIT_STREAMS.length;i++){
    const stream=AUDIT_STREAMS[i];
    const r=await audit.recordLog({proof_id,expected_revision:audit.readProof(proof_id).revision,
      log_id:'synthetic_log_'+i,stream,recorded_by_claim:'synthetic_log_writer',
      record_ref:'example_log_'+i,record_hash:'c'.repeat(64),
      summary_code:'SYNTHETIC_REFERENCE'});
    if(r.status!=='candidate_only')throw Error('LOG_SAMPLE_FAILED:'+stream);
  }
  const rev=await audit.recordReview({proof_id,
    expected_revision:audit.readProof(proof_id).revision,
    review_id:'synthetic_review',reviewed_by_claim:'synthetic_reviewer',
    review_ref:'synthetic_review_ref',review_hash:'d'.repeat(64),
    verdict:'INCONCLUSIVE'});
  if(rev.status!=='candidate_only')throw Error('SYNTHETIC_REVIEW_FAILED');
  const packet=await audit.buildReviewPacket(proof_id,{requiredStreams:AUDIT_STREAMS});
  if(packet.safe_to_autopromote!==false||packet.review_gate!=='HOLD_PENDING_IDENTITY_AND_AUTHORITY'
     ||packet.checks.WHO_PERFORMED!=='CLAIM_ONLY'||packet.checks.WHO_REVIEWED!=='CLAIM_ONLY'
     ||packet.checks.REQUIRED_LOGS!=='REFERENCED_ONLY')throw Error('UNSAFE_PACKET_OUTPUT');
  const name='example-'+domain+'.json';
  await writeFile(dir+'/'+name,JSON.stringify({synthetic_only:true,packet},null,2)+'\n','utf8');

  // Actually produce separate audit folders by sector, project, and log stream.
  // All dates/percentages are synthetic examples, not real project progress.
  const project_id='pilot_'+domain,folder='logs/'+sector+'/'+project_id;
  const journalEngine=createProgressJournals({audit});
  const projectIndex={schema:'firstbrain.progress-folder-index.candidate.v0.1',
    synthetic_only:true,sector,project_id,event_id,proof_id,
    source_proof_revision:audit.readProof(proof_id).revision,streams:{}};
  const sectorDelay=['WATER','ELECTRICITY'].includes(sector);
  for(let i=0;i<AUDIT_STREAMS.length;i++){
    const stream=AUDIT_STREAMS[i],journal_id=project_id+':'+stream.toLowerCase();
    const planned=await journalEngine.createJournal({
      journal_id,project_id,proof_id,sector,stream,
      expected_start:'2026-11-09',expected_due:'2026-11-20',
      plan_ref:'synthetic_plan_'+stream.toLowerCase()
    });
    if(planned.status!=='candidate_only')throw Error('PLAN_FAILED:'+stream);
    const delayed=sectorDelay&&i<2;
    const updated=await journalEngine.recordProgress({
      journal_id,expected_revision:1,observed_on:'2026-11-13',
      expected_percent:Math.min(90,40+10*i),
      actual_percent:Math.max(0,26+7*i-(delayed?11:0)),
      progress_status:delayed?'DELAYED':'IN_PROGRESS',
      forecast_due:delayed?'2026-11-26':'2026-11-20',
      delay_reason_code:delayed?'SYNTHETIC_EXTERNAL_DEPENDENCY':null,
      next_action_code:delayed?'REPLAN_WITH_EVIDENCE':'CONTINUE_REVIEW',
      evidence_ref:'synthetic_progress_'+stream.toLowerCase(),
      recorded_by_claim:'synthetic_worker',completed_on:null
    });
    if(updated.status!=='candidate_only')throw Error('PROGRESS_FAILED:'+stream+':'+updated.reason);
    const journal=journalEngine.readJournal(journal_id);
    const verified=await journalEngine.verifyJournal(journal_id);
    const relative=journalEngine.folderFor(journal_id).relative_folder;
    if(relative!==folder+'/'+stream||verified.local_chain_consistent!==true)
      throw Error('FOLDER_OR_INTEGRITY_MISMATCH');
    const filename='2026-11-13__revision-2.json';
    await mkdir(dir+'/'+relative,{recursive:true});
    await writeFile(dir+'/'+relative+'/'+filename,
      JSON.stringify({synthetic_only:true,journal,local_verification:verified},null,2)+'\n','utf8');
    projectIndex.streams[stream]={journal_id,relative_folder:relative,
      current_file:relative+'/'+filename,
      planned_due:journal.expected_due,forecast_due:journal.forecast_due,
      actual_percent:journal.actual_progress_percent,
      expected_percent:journal.expected_progress_percent,
      progress_status:journal.progress_status,
      delay_days:journal.days_shifted,
      source_of_truth:'SYNTHETIC_ONLY'};
  }
  await writeFile(dir+'/'+folder+'/index.json',JSON.stringify(projectIndex,null,2)+'\n','utf8');
  manifest.items.push({sector,proof_id,file:name,project_id,
    project_index:folder+'/index.json',streams:Object.keys(projectIndex.streams),
    verification:'LOCAL_CANDIDATE_ONLY'});

}
await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n','utf8');
console.log('SYNTHETIC_PROOF_PACKETS_CREATED=5; PROGRESS_LOGS_CREATED=20; REAL_REVIEW_ACK=NOT_VERIFIED; DEPLOYMENT=NOT_PERFORMED');
