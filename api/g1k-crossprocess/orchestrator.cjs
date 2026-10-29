'use strict';
/* All input files are synthetic and local. Child process is NOT an actual AI receiver.
 * Prior G1h contract used as review-only boundary, not trusted production. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {stageIndependentClaimForReview}=require('../g1h-review/crosslayer-ack-review.cjs');
const {hash,serializeSigned,decideRetry}=require('../g1h-review/independent-ack-gate.cjs');
const {reserve}=require('./receipt-ledger.cjs');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const sourceRef='https://github.com/keqingwu5-cloud/ai-boundary/issues/41';
function child(file,input){const r=spawnSync(process.execPath,[path.join(__dirname,file)],{input:JSON.stringify(input),encoding:'utf8',timeout:8000});if(r.status!==0)throw Error('OFFLINE_CHILD_'+r.stderr.trim());return JSON.parse(r.stdout);}
function build({dir=fs.mkdtempSync(path.join(os.tmpdir(),'g1k-syn-')),eventPatch={},sourcePatch={},apiPatch={},receiptPatch={},trustPatch={},adapterPatch={},clock=Date.now()-5000,skipPublication=false,sourceTamperAfterSign=false,revoked=false,unknownTransport=false}={}){
 fs.mkdirSync(dir,{recursive:true});const sourcePath=path.join(dir,'synthetic-public-source.json');
 const seed={synthetic_only:true,original_goal:'preserve original facts while checking cross-agent message meaning',
  counterexample:'a later paraphrase can silently remove the evidence of a negative case',
  must_preserve:['preserve originals','retain negative-test history','owner approval before production'],...sourcePatch};
 fs.writeFileSync(sourcePath,JSON.stringify(seed),{mode:0o600});const sourceDigest=digest(fs.readFileSync(sourcePath,'utf8'));
 const keyDir=path.join(dir,'keys');child('receiver.cjs',{action:'init',keyDir});
 const event={event_id:'G1K-SYN-EVENT',task_id:'G1K-SYN-TASK',attempt_id:'G1K-SYN-ATTEMPT',
  payload_version:'v1',payload_digest:digest(JSON.stringify({task:'offline synthetic handoff'})),
  source_manifest_digest:sourceDigest,source_endpoint_id:'g1k-origin-process',source_agent_id:'GPT1',
  destination_endpoint_id:'g1k-synthetic-receiver',destination_agent_id:'SYNTHETIC-G2',
  expected_read_ref:sourceRef,...eventPatch};
 // Process boundary: only the source manifest, NOT GPT1's interpretation, reaches child.
 const produced=child('receiver.cjs',{action:'produce',event,sourcePath,keyDir,at:clock});
 const receipt={...produced.receipt,...receiptPatch};
 if(sourceTamperAfterSign)fs.appendFileSync(sourcePath,'TAMPER');
 // Synthetic 'external' publication file: the caller controls this fixture; no live third-party attestations.
 const publicationPath=path.join(dir,'precommit.json');const publishedAt=new Date(clock+2000).toISOString();
 if(!skipPublication)fs.writeFileSync(publicationPath,JSON.stringify({synthetic:true,
  precommit_digest:receipt.precommit_digest,published_at:publishedAt}),{mode:0o600,flag:'wx'});
 event.g1_reveal_at=new Date(clock+3000).toISOString();const now=new Date(clock+4000).toISOString();
 const apiRecord={event_id:event.event_id,task_id:event.task_id,
  payload_version:event.payload_version,payload_digest:event.payload_digest,
  current_attempt_id:event.attempt_id,destination_endpoint_id:event.destination_endpoint_id,
  state:'ack_received',...apiPatch};
 const apiReceipt={event_id:event.event_id,attempt_id:event.attempt_id,
  endpoint_id:event.destination_endpoint_id,channel:'api',kind:'ack',evidence:{reference:'synthetic:api-ack'}};
 const publicKey=crypto.createPublicKey(fs.readFileSync(path.join(keyDir,'test-pub.pem')));
 const trust={operator_approved:!revoked,key_source:'operator_pinned',publicKey,
  endpoint_id:event.destination_endpoint_id,agent_id:event.destination_agent_id,
  runtime_id:'g1k-offline-child-process',ledger_verified:true,
  isFreshNonce:()=>true,...trustPatch};
 const attestation=(extra={})=>({verified:true,receipt_hash:hash(serializeSigned(receipt).toString('utf8')),
  event_id:event.event_id,task_id:event.task_id,attempt_id:event.attempt_id,
  evidence_ref:'synthetic:test-attestor',...extra});
 const sourceVerifier={async verifyRead(){const actual=digest(fs.readFileSync(sourcePath,'utf8'));
  return attestation({ref:sourceRef,digest:actual,verified:actual===event.source_manifest_digest});}};
 const identityVerifier={async verifyRuntime(){return attestation({
  agent_id:trust.agent_id,endpoint_id:trust.endpoint_id,runtime_id:trust.runtime_id});}};
 const precommitVerifier={async verifyPublication(){
  if(!fs.existsSync(publicationPath))return {verified:false};
  const p=JSON.parse(fs.readFileSync(publicationPath,'utf8'));
  return attestation({precommit_digest:p.precommit_digest,published_at:p.published_at});}};
 const nonceLedger={async consumeOnce(p){return reserve(path.join(dir,'local-nonce-ledger'),p)}};
 const adapters={sourceVerifier,identityVerifier,precommitVerifier,nonceLedger,...adapterPatch};
 async function run(){
  if(unknownTransport)return {ok:false,status:'RECONCILIATION_REQUIRED',
   retry:decideRetry({ack_transport_state:'unknown',side_effect_state:'unknown'}),
   actual_gpt2_ack_verified:false};
  return stageIndependentClaimForReview({event,apiRecord,apiReceipt,receipt,trust,now,...adapters});
 }
 return {dir,event,apiRecord,apiReceipt,receipt,trust,adapters,run,sourcePath,publicationPath,
  precommitDigest:receipt.precommit_digest};
}
module.exports={build,child,sourceRef};
