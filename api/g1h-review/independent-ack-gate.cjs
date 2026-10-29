'use strict';
/* Independent ACK verification candidate (local, not deployed).
 * This DOES NOT create an independent GPT2 runtime, trusted owner key,
 * actual conversation read or semantic understanding.
 * The trust object must be operator-pinned, never from task/receipt.
 */
const {verify,createHash}=require('node:crypto');
const HEX64=/^[a-f0-9]{64}$/;
const fail=reason=>({ok:false,status:'BLOCKED',reason});
const hash=x=>createHash('sha256').update(String(x),'utf8').digest('hex');
const fields=['schema','event_id','task_id','attempt_id','payload_version','payload_digest',
 'source_manifest_digest','receiver_endpoint_id','receiver_agent_id','receiver_runtime_id',
 'received_at','read_ref','read_digest','independent_summary_digest','precommit_at',
 'precommit_digest','nonce'];
const serializeSigned=r=>Buffer.from(JSON.stringify(Object.fromEntries(fields.map(k=>[k,r[k]]))),'utf8');

function verifyIndependentAck(event,receipt,trust,now=new Date().toISOString()){
 if(!event||!receipt||!trust||typeof trust!=='object')return fail('REQUIRED_INPUT_MISSING');
 if(trust.operator_approved!==true||trust.key_source!=='operator_pinned'||
    !trust.publicKey||!trust.endpoint_id||!trust.agent_id||!trust.runtime_id)
  return fail('TRUST_ROOT_NOT_CONFIGURED');
 if(event.source_endpoint_id===trust.endpoint_id||event.source_agent_id===trust.agent_id)
  return fail('REVIEWER_NOT_INDEPENDENT');
 if(!HEX64.test(event.payload_digest||'')||!HEX64.test(event.source_manifest_digest||''))
  return fail('INVALID_SOURCE_DIGEST');
 if(receipt.schema!=='tcvl-independent-read-ack/v0.1')return fail('INVALID_ACK_SCHEMA');
 for(const k of ['event_id','task_id','attempt_id','payload_version','payload_digest','source_manifest_digest'])
  if(!event[k]||receipt[k]!==event[k])return fail('SOURCE_VERSION_OR_ATTEMPT_MISMATCH');
 for(const [field,expected] of [['receiver_endpoint_id',trust.endpoint_id],['receiver_agent_id',trust.agent_id],['receiver_runtime_id',trust.runtime_id]])
  if(receipt[field]!==expected)return fail('RECEIVER_IDENTITY_MISMATCH');
 if(typeof receipt.read_ref!=='string'||!/^https:\/\//.test(receipt.read_ref)||
    !HEX64.test(receipt.read_digest||'')||!HEX64.test(receipt.independent_summary_digest||'')||
    !HEX64.test(receipt.precommit_digest||'')||
    typeof receipt.nonce!=='string'||!/^[-\w]{16,128}$/.test(receipt.nonce))
  return fail('READ_OR_PRECOMMIT_EVIDENCE_MISSING');
 if(receipt.read_digest!==event.source_manifest_digest)return fail('READ_CONTENT_VERSION_MISMATCH');
 if(typeof receipt.independent_summary!=='string'||
    receipt.independent_summary.trim().length<20||
    hash(receipt.independent_summary)!==receipt.independent_summary_digest)
  return fail('INDEPENDENT_SUMMARY_INVALID');
 const expectedPrecommit=hash(JSON.stringify({
  source_manifest_digest:receipt.source_manifest_digest,
  independent_summary_digest:receipt.independent_summary_digest,
  receiver_endpoint_id:receipt.receiver_endpoint_id,nonce:receipt.nonce}));
 if(expectedPrecommit!==receipt.precommit_digest)return fail('PRECOMMIT_BINDING_FAILED');
 const nowTs=Date.parse(now),receivedTs=Date.parse(receipt.received_at),precommitTs=Date.parse(receipt.precommit_at);
 if(!Number.isFinite(nowTs)||!Number.isFinite(receivedTs)||!Number.isFinite(precommitTs)||
    receivedTs>precommitTs||precommitTs>nowTs+30000||receivedTs<nowTs-86400000)
  return fail('READ_OR_PRECOMMIT_TIME_INVALID');
 if(event.g1_reveal_at&&!(precommitTs<Date.parse(event.g1_reveal_at)))
  return fail('BLIND_REVIEW_SEQUENCE_INVALID');
 // A non-atomic freshness predicate is a preliminary check, not replay protection.
 if(trust.ledger_verified!==true||typeof trust.isFreshNonce!=='function')
  return fail('DURABLE_REPLAY_LEDGER_REQUIRED');
 if(trust.isFreshNonce(receipt.nonce,event.event_id,receipt.attempt_id)!==true)
  return fail('NONCE_REPLAY_OR_UNVERIFIED');
 if(typeof receipt.signature!=='string'||!/^[A-Za-z0-9_-]{80,120}$/.test(receipt.signature))
  return fail('ACK_SIGNATURE_INVALID');
 let valid=false;
 try{
  const signature=Buffer.from(receipt.signature,'base64url');
  if(signature.length!==64||signature.toString('base64url')!==receipt.signature)
   return fail('ACK_SIGNATURE_NOT_CANONICAL');
  valid=verify(null,serializeSigned(receipt),trust.publicKey,signature);
 }catch{return fail('ACK_SIGNATURE_INVALID');}
 if(!valid)return fail('ACK_SIGNATURE_INVALID');
 return {ok:true,status:'INDEPENDENT_SIGNED_READ_RECEIPT_VERIFIED',
  receiptHash:hash(serializeSigned(receipt).toString('utf8')),
  caveat:'This proves a trusted key signed a claim, not a real GPT2 read or semantic E2E.'};
}
function decideRetry({ack_transport_state,side_effect_state,durable_reconciliation,external_idempotency_verified}={}){
 if(ack_transport_state==='unknown'||side_effect_state==='unknown')
  return {allowRetry:false,state:'RECONCILIATION_REQUIRED'};
 if(ack_transport_state==='confirmed')return {allowRetry:false,state:'DONE'};
 if(ack_transport_state!=='not_committed'||side_effect_state!=='none'||
   durable_reconciliation!==true||external_idempotency_verified!==true)
  return {allowRetry:false,state:'UNVERIFIED_NO_RETRY'};
 return {allowRetry:true,state:'RETRY_SAFE_BY_VERIFIED_LEDGER'};
}
module.exports={verifyIndependentAck,decideRetry,serializeSigned,hash};
