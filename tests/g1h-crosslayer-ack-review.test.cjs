'use strict';
/* G1h isolated test suite. Synthetic keys, fake attestors, no actual GPT2. */
const test=require('node:test'),assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {hash,serializeSigned}=require('../api/g1h-review/independent-ack-gate.cjs');
const {classifyApiAck,stageIndependentClaimForReview}=
 require('../api/g1h-review/crosslayer-ack-review.cjs');
const kp=generateKeyPairSync('ed25519');
const sourceRef='https://github.com/keqingwu5-cloud/ai-boundary/issues/41';
const now='2026-10-29T12:12:00.000Z';
const event={
 event_id:'G1H-SYN-EVT',task_id:'G1H-SYN-TASK',attempt_id:'G1H-SYN-ATTEMPT',
 payload_version:'v1',payload_digest:'a'.repeat(64),source_manifest_digest:'b'.repeat(64),
 source_endpoint_id:'synthetic-gpt1-endpoint',source_agent_id:'GPT1',
 destination_endpoint_id:'synthetic-gpt2-endpoint',destination_agent_id:'GPT2',
 expected_read_ref:sourceRef,g1_reveal_at:'2026-10-29T12:06:00.000Z'
};
function fixture(){
 const apiRecord={state:'ack_received',event_id:event.event_id,task_id:event.task_id,
  current_attempt_id:event.attempt_id,destination_endpoint_id:event.destination_endpoint_id,
  payload_version:event.payload_version,payload_digest:event.payload_digest};
 const apiReceipt={event_id:event.event_id,attempt_id:event.attempt_id,
  endpoint_id:event.destination_endpoint_id,channel:'api',kind:'ack',
  evidence:{reference:'synthetic:api'}};
 const trust={operator_approved:true,key_source:'operator_pinned',publicKey:kp.publicKey,
  endpoint_id:event.destination_endpoint_id,agent_id:'GPT2',runtime_id:'synthetic-runtime',
  ledger_verified:true,isFreshNonce:()=>true};
 const receipt={schema:'tcvl-independent-read-ack/v0.1',event_id:event.event_id,
  task_id:event.task_id,attempt_id:event.attempt_id,payload_version:event.payload_version,
  payload_digest:event.payload_digest,source_manifest_digest:event.source_manifest_digest,
  receiver_endpoint_id:trust.endpoint_id,receiver_agent_id:trust.agent_id,
  receiver_runtime_id:trust.runtime_id,received_at:'2026-10-29T12:01:00.000Z',
  read_ref:sourceRef,read_digest:event.source_manifest_digest,
  independent_summary:'Synthetic signed summary; NOT ChatGPT receiving or understanding.',
  precommit_at:'2026-10-29T12:02:00.000Z',nonce:'synthetic-g1h-nonce-001'};
 receipt.independent_summary_digest=hash(receipt.independent_summary);
 receipt.precommit_digest=hash(JSON.stringify({
  source_manifest_digest:receipt.source_manifest_digest,
  independent_summary_digest:receipt.independent_summary_digest,
  receiver_endpoint_id:receipt.receiver_endpoint_id,nonce:receipt.nonce}));
 const resign=()=>receipt.signature=sign(null,serializeSigned(receipt),kp.privateKey).toString('base64url');
 resign();const consumed=new Set();
 const attestation=(extra={})=>({
  verified:true,receipt_hash:hash(serializeSigned(receipt).toString('utf8')),
  event_id:event.event_id,task_id:event.task_id,attempt_id:event.attempt_id,
  evidence_ref:'synthetic:evidence',...extra
 });
 const adapters={
  sourceVerifier:{async verifyRead(){return attestation({ref:sourceRef,digest:event.source_manifest_digest})}},
  identityVerifier:{async verifyRuntime(){return attestation({
   endpoint_id:trust.endpoint_id,agent_id:trust.agent_id,runtime_id:trust.runtime_id})}},
  precommitVerifier:{async verifyPublication(){return attestation({
   precommit_digest:receipt.precommit_digest,published_at:'2026-10-29T12:03:00.000Z'})}},
  nonceLedger:{async consumeOnce({nonce}){
   if(consumed.has(nonce))return {consumed:false};
   consumed.add(nonce);return {verified:true,consumed:true,evidence_ref:'synthetic:nonce'};
  }}
 };
 return {event:{...event},apiRecord,apiReceipt,receipt,trust,adapters,consumed,resign,attestation};
}
const check=x=>classifyApiAck(x);
const stage=x=>stageIndependentClaimForReview({...x,...x.adapters,now});
test('API ACK remains API_ACK_ONLY; never GPT2 read/semantic E2E',()=>{
 const r=check(fixture());assert.equal(r.ok,true);
 assert.equal(r.status,'API_ACK_ONLY');
 assert.equal(r.actual_gpt2_ack_verified,false);
 assert.equal(r.semantic_alignment_verified,false);
 assert.equal(r.cross_ai_e2e_verified,false);
});
test('missing API record fails closed',()=>{
 const x=fixture();delete x.apiRecord;
 assert.equal(check(x).reason,'API_EVIDENCE_MISSING');
});
test('leased event is not recorded API ACK',()=>{
 const x=fixture();x.apiRecord.state='leased';
 assert.equal(check(x).reason,'API_STATE_NOT_ACK_RECEIVED');
});
test('non-API receipt channel rejected',()=>{
 const x=fixture();x.apiReceipt.channel='chatgpt';
 assert.equal(check(x).reason,'NOT_THE_API_ACK_CHANNEL');
});
test('stale DB attempt blocked',()=>{
 const x=fixture();x.apiRecord.current_attempt_id='stale';
 assert.equal(check(x).reason,'API_CURRENT_ATTEMPT_MISMATCH');
});
test('stale receipt attempt blocked',()=>{
 const x=fixture();x.apiReceipt.attempt_id='old';
 assert.equal(check(x).reason,'API_RECEIPT_BOUND_TO_WRONG_ATTEMPT_OR_ENDPOINT');
});
test('API task mismatch blocked',()=>{
 const x=fixture();x.apiRecord.task_id='cross-task';
 assert.equal(check(x).reason,'API_EVENT_TASK_ID_MISMATCH');
});
test('API digest mismatch blocked',()=>{
 const x=fixture();x.apiRecord.payload_digest='c'.repeat(64);
 assert.equal(check(x).reason,'API_EVENT_PAYLOAD_DIGEST_MISMATCH');
});
test('API payload version mismatch blocked',()=>{
 const x=fixture();x.apiRecord.payload_version='v2';
 assert.equal(check(x).reason,'API_EVENT_PAYLOAD_VERSION_MISMATCH');
});
test('API destination mismatch blocked',()=>{
 const x=fixture();x.apiRecord.destination_endpoint_id='other';
 assert.equal(check(x).reason,'API_DESTINATION_MISMATCH');
});
test('signed claim wrong attempt blocked',async()=>{
 const x=fixture();x.receipt.attempt_id='old';x.resign();
 assert.equal((await stage(x)).reason,'SIGNED_RECEIPT_ATTEMPT_MISMATCH');
});
test('signed claim wrong source URL blocked',async()=>{
 const x=fixture();x.receipt.read_ref='https://evil.example.test/other';x.resign();
 assert.equal((await stage(x)).reason,'SIGNED_RECEIPT_CANONICAL_SOURCE_MISMATCH');
});
test('receiver trust identity mismatch blocked',async()=>{
 const x=fixture();x.trust.agent_id='other';
 assert.equal((await stage(x)).reason,'RECEIVER_TRUST_IDENTITY_MISMATCH');
});
test('source attestation must bind exact receipt hash',async()=>{
 const x=fixture();
 x.adapters.sourceVerifier.verifyRead=async()=>x.attestation({
  ref:sourceRef,digest:event.source_manifest_digest,receipt_hash:'wrong'});
 assert.equal((await stage(x)).reason,'READ_SOURCE_NOT_INDEPENDENTLY_PROVEN');
});
test('runtime attestation must bind agent ID',async()=>{
 const x=fixture();
 x.adapters.identityVerifier.verifyRuntime=async()=>x.attestation({
  endpoint_id:x.trust.endpoint_id,runtime_id:x.trust.runtime_id,agent_id:'OTHER'});
 assert.equal((await stage(x)).reason,'RUNTIME_NOT_INDEPENDENTLY_ATTESTED');
});
test('precommit attestation must bind receipt hash',async()=>{
 const x=fixture();
 x.adapters.precommitVerifier.verifyPublication=async()=>x.attestation({
  precommit_digest:x.receipt.precommit_digest,
  published_at:'2026-10-29T12:03:00.000Z',receipt_hash:'other'});
 assert.equal((await stage(x)).reason,'PRECOMMIT_NOT_INDEPENDENTLY_PUBLISHED');
});
test('external source evidence must bind task and attempt',async()=>{
 const x=fixture();
 x.adapters.sourceVerifier.verifyRead=async()=>x.attestation({
  ref:sourceRef,digest:event.source_manifest_digest,task_id:'wrong'});
 assert.equal((await stage(x)).reason,'READ_SOURCE_NOT_INDEPENDENTLY_PROVEN');
});
test('synthetic signed claim only STAGED; GPT2 and E2E remain false',async()=>{
 const x=fixture(),r=await stage(x);assert.equal(r.ok,true);
 assert.equal(r.status,'SIGNED_CLAIM_STAGED_FOR_EXTERNAL_REVIEW');
 assert.equal(r.api_ack_recorded,true);
 assert.equal(r.actual_gpt2_ack_verified,false);
 assert.equal(r.semantic_alignment_verified,false);
 assert.equal(r.cross_ai_e2e_verified,false);
});
test('synthetic atomic nonce double consume allows one staged claim',async()=>{
 const x=fixture(),r=await Promise.all([stage(x),stage(x)]);
 assert.deepEqual(r.map(v=>v.ok).sort(),[false,true]);
});
test('missing independent runtime attestor fails closed',async()=>{
 const x=fixture();delete x.adapters.identityVerifier;
 const r=await stage(x);
 assert.equal(r.ok,false);
 assert.equal(r.reason,'INDEPENDENT_RUNTIME_ATTESTATION_REQUIRED');
});
