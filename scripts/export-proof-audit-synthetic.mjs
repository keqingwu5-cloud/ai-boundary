/**
 * CI-only synthetic proof bundle samples. The names, refs and hashes here are
 * deliberately fictional. Never treat them as real developer/reviewer identity.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit,AUDIT_SECTORS,AUDIT_STREAMS} from '../proof-audit-candidate.mjs';
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
  manifest.items.push({sector,proof_id,file:name,verification:'LOCAL_CANDIDATE_ONLY'});
}
await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n','utf8');
console.log('SYNTHETIC_PROOF_PACKETS_CREATED=5; REAL_REVIEW_ACK=NOT_VERIFIED; DEPLOYMENT=NOT_PERFORMED');
