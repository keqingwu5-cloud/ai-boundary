'use strict';
/*
 * G1h - offline, review-only bridge between PR #52 API receipts
 * and an independent signed-claim review candidate.
 * NOT a trusted identity provider, GPT2 runtime, live ACK or deployment.
 */
const {stageSignedReadClaim}=require('./ack-acceptance-v02.cjs');
const fail=(reason,phase='API_RECEIPT')=>({
 ok:false,phase,status:'BLOCKED',reason,
 api_ack_recorded:false,actual_gpt2_ack_verified:false,
 semantic_alignment_verified:false,cross_ai_e2e_verified:false
});
const sameString=(a,b)=>typeof a==='string'&&a.length>0&&a===b;
const evidenceString=x=>typeof x==='string'&&x.length>0;
function classifyApiAck({event,apiRecord,apiReceipt}={}){
 if(!event||!apiRecord||!apiReceipt)return fail('API_EVIDENCE_MISSING');
 if(apiRecord.state!=='ack_received')return fail('API_STATE_NOT_ACK_RECEIVED');
 if(apiReceipt.channel!=='api'||apiReceipt.kind!=='ack')
  return fail('NOT_THE_API_ACK_CHANNEL');
 for(const field of ['event_id','task_id','payload_version','payload_digest']){
  if(!sameString(apiRecord[field],event[field]))
   return fail('API_EVENT_'+field.toUpperCase()+'_MISMATCH');
 }
 if(!sameString(apiRecord.destination_endpoint_id,event.destination_endpoint_id))
  return fail('API_DESTINATION_MISMATCH');
 if(!sameString(apiRecord.current_attempt_id,event.attempt_id))
  return fail('API_CURRENT_ATTEMPT_MISMATCH');
 if(!sameString(apiReceipt.event_id,event.event_id)||
    !sameString(apiReceipt.attempt_id,event.attempt_id)||
    !sameString(apiReceipt.endpoint_id,event.destination_endpoint_id))
  return fail('API_RECEIPT_BOUND_TO_WRONG_ATTEMPT_OR_ENDPOINT');
 if(!evidenceString(apiReceipt.evidence?.reference))
  return fail('API_RECEIPT_REFERENCE_MISSING');
 return {ok:true,phase:'API_RECEIPT',status:'API_ACK_ONLY',
  api_ack_recorded:true,actual_gpt2_ack_verified:false,
  semantic_alignment_verified:false,cross_ai_e2e_verified:false,
  event_id:event.event_id,attempt_id:event.attempt_id,channel:'api',
  caution:'API ACK does not attest an independent GPT2 read.'};
}
function bound(source,receiptHash,event,trust,kind){
 if(!source||source.verified!==true||!evidenceString(source.evidence_ref)||
    !sameString(source.receipt_hash,receiptHash)||
    !sameString(source.event_id,event.event_id)||
    !sameString(source.task_id,event.task_id)||
    !sameString(source.attempt_id,event.attempt_id))return false;
 if(kind==='runtime'&&(!sameString(source.agent_id,trust.agent_id)||
    !sameString(source.endpoint_id,trust.endpoint_id)||
    !sameString(source.runtime_id,trust.runtime_id)))return false;
 return true;
}
function wrapVerifier(adapter,method,kind,event,trust){
 if(!adapter||typeof adapter[method]!=='function')return null;
 return {[method]:async args=>{
  const ret=await adapter[method](args);
  if(!bound(ret,args.receipt_hash,event,trust,kind))return {verified:false};
  return ret;
 }};
}
async function stageIndependentClaimForReview({
 event,apiRecord,apiReceipt,receipt,trust,now,
 sourceVerifier,identityVerifier,precommitVerifier,nonceLedger
}={}){
 const api=classifyApiAck({event,apiRecord,apiReceipt});
 if(!api.ok)return api;
 if(!receipt||!sameString(receipt.attempt_id,event.attempt_id))
  return fail('SIGNED_RECEIPT_ATTEMPT_MISMATCH','INDEPENDENT_CLAIM');
 if(!evidenceString(receipt.read_ref)||
    !sameString(receipt.read_ref,event.expected_read_ref))
  return fail('SIGNED_RECEIPT_CANONICAL_SOURCE_MISMATCH','INDEPENDENT_CLAIM');
 if(!trust||!sameString(trust.endpoint_id,event.destination_endpoint_id)||
    !sameString(trust.agent_id,event.destination_agent_id))
  return fail('RECEIVER_TRUST_IDENTITY_MISMATCH','INDEPENDENT_CLAIM');
 const staged=await stageSignedReadClaim({
  event,receipt,trust,now,nonceLedger,
  sourceVerifier:wrapVerifier(sourceVerifier,'verifyRead','source',event,trust),
  identityVerifier:wrapVerifier(identityVerifier,'verifyRuntime','runtime',event,trust),
  precommitVerifier:wrapVerifier(precommitVerifier,'verifyPublication','publication',event,trust)
 });
 if(!staged.ok)return {...fail(staged.reason,'INDEPENDENT_CLAIM'),detail:staged};
 return {...api,phase:'INDEPENDENT_CLAIM',
  status:'SIGNED_CLAIM_STAGED_FOR_EXTERNAL_REVIEW',
  receipt_hash:staged.receipt_hash,receipt_record_ref:staged.record_ref,
  required_before_acceptance:[
   'REAL_GPT2_INDEPENDENT_READ_AND_IDENTITY',
   'INDEPENDENT_SEMANTIC_REVIEW',
   'OWNER_APPROVED_AUTHORITY_AND_RUNTIME',
   'DURABLE_AUDITED_RECEIPT_PERSISTENCE'],
  caution:'Synthetic signed claims and mocked verifier callbacks never constitute a GPT2 ACK.'};
}
module.exports={classifyApiAck,stageIndependentClaimForReview};
