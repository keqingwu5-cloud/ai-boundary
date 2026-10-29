'use strict';
/* G1g candidate fail-closed boundary after signature-claim verification.
 * Requires independent, trusted and durable adapters in real deployments.
 * Local unit tests use synthetic mocks only; not a live ChatGPT receipt.
 */
const {verifyIndependentAck,hash,serializeSigned}=require('./independent-ack-gate.cjs');
const validRef=v=>typeof v==='string'&&/^https:\/\/github\.com\/keqingwu5-cloud\/ai-boundary\/(issues\/\d+|pull\/\d+)$/.test(v);
const fail=reason=>({ok:false,status:'BLOCKED',reason,actual_gpt2_ack_verified:false,cross_ai_e2e_verified:false});
const verified=v=>v&&v.verified===true&&typeof v.evidence_ref==='string'&&v.evidence_ref.length>0;
async function stageSignedReadClaim({event,receipt,trust,now,sourceVerifier,precommitVerifier,identityVerifier,nonceLedger}={}){
 if(!event||!receipt)return fail('INPUT_MISSING');
 if(!validRef(event.expected_read_ref))return fail('TRUSTED_SOURCE_REF_NOT_PINNED');
 if(receipt.read_ref!==event.expected_read_ref)return fail('READ_REF_NOT_EXPECTED_SOURCE');
 if(!sourceVerifier||typeof sourceVerifier.verifyRead!=='function')
  return fail('INDEPENDENT_SOURCE_READ_PROOF_REQUIRED');
 if(!identityVerifier||typeof identityVerifier.verifyRuntime!=='function')
  return fail('INDEPENDENT_RUNTIME_ATTESTATION_REQUIRED');
 if(!precommitVerifier||typeof precommitVerifier.verifyPublication!=='function')
  return fail('EXTERNAL_PRECOMMIT_PROOF_REQUIRED');
 if(!nonceLedger||typeof nonceLedger.consumeOnce!=='function')
  return fail('DURABLE_ATOMIC_NONCE_LEDGER_REQUIRED');
 const signed=verifyIndependentAck(event,receipt,trust,now);
 if(!signed.ok)return fail('SIGNED_CLAIM_'+signed.reason);
 const receipt_hash=hash(serializeSigned(receipt).toString('utf8'));
 let source,identity,publication;
 try{
  [source,identity,publication]=await Promise.all([
   sourceVerifier.verifyRead({ref:event.expected_read_ref,expected_digest:event.source_manifest_digest,receipt_hash}),
   identityVerifier.verifyRuntime({endpoint_id:trust.endpoint_id,agent_id:trust.agent_id,runtime_id:trust.runtime_id,receipt_hash}),
   precommitVerifier.verifyPublication({precommit_digest:receipt.precommit_digest,receipt_hash})
  ]);
 }catch(_){return fail('EXTERNAL_EVIDENCE_VERIFIER_FAILED');}
 if(!verified(source)||source.ref!==event.expected_read_ref||source.digest!==event.source_manifest_digest)
  return fail('READ_SOURCE_NOT_INDEPENDENTLY_PROVEN');
 if(!verified(identity)||identity.runtime_id!==trust.runtime_id||identity.endpoint_id!==trust.endpoint_id)
  return fail('RUNTIME_NOT_INDEPENDENTLY_ATTESTED');
 if(!verified(publication)||publication.precommit_digest!==receipt.precommit_digest)
  return fail('PRECOMMIT_NOT_INDEPENDENTLY_PUBLISHED');
 const published=Date.parse(publication.published_at),received=Date.parse(receipt.received_at),revealed=Date.parse(event.g1_reveal_at);
 if(!Number.isFinite(published)||!Number.isFinite(received)||!Number.isFinite(revealed)||
    published<received||published>=revealed||published>Date.parse(now))
  return fail('PRECOMMIT_PUBLICATION_TIMELINE_INVALID');
 let outcome;
 try{
  outcome=await nonceLedger.consumeOnce({
   task_id:event.task_id,event_id:event.event_id,attempt_id:event.attempt_id,
   nonce:receipt.nonce,receipt_hash,source_digest:event.source_manifest_digest,
   receiver_endpoint_id:trust.endpoint_id});
 }catch(_){return fail('ATOMIC_NONCE_CONSUME_FAILED');}
 if(!outcome||outcome.consumed!==true||!verified(outcome))
  return fail('NONCE_ALREADY_USED_OR_LEDGER_UNVERIFIED');
 return {ok:true,status:'SIGNED_READ_CLAIM_STAGED_FOR_INDEPENDENT_REVIEW',
  actual_gpt2_ack_verified:false,cross_ai_e2e_verified:false,
  receipt_hash,record_ref:outcome.evidence_ref,
  evidence_refs:[source.evidence_ref,identity.evidence_ref,publication.evidence_ref],
  caution:'Real GPT2 independently read, interpreted and responded is NOT established.'};
}
module.exports={stageSignedReadClaim,validRef};
