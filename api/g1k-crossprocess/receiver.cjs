'use strict';
/* G1k offline child process: deterministic SYNTHETIC reviewer, NOT model API/GPT2. */
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const {serializeSigned,hash}=require('../g1h-review/independent-ack-gate.cjs');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function sourceCheck(sourcePath,expected){
 const data=fs.readFileSync(sourcePath,'utf8');
 if(digest(data)!==expected)throw Error('PINNED_SOURCE_DIGEST_MISMATCH');
 const parsed=JSON.parse(data);
 if(parsed.synthetic_only!==true||typeof parsed.original_goal!=='string'||parsed.original_goal.length<4)
  throw Error('NON_SYNTHETIC_SOURCE_DENIED');
 return parsed;
}
function produce(input){
 const {event,sourcePath,keyDir,at}=input;
 if(event.g1_understanding!==undefined||event.g1_plan!==undefined)
  throw Error('BLIND_READ_CONTAMINATED_BY_G1');
 if(event.expected_read_ref!=='https://github.com/keqingwu5-cloud/ai-boundary/issues/41')
  throw Error('UNAPPROVED_READ_REFERENCE');
 const file=sourceCheck(sourcePath,event.source_manifest_digest);
 const privateKey=crypto.createPrivateKey(fs.readFileSync(path.join(keyDir,'test-key.pem')));
 const summary='SYNTHETIC INDEPENDENT REVIEW: primary goal is '+file.original_goal+
  '; challenge: '+file.counterexample+'; test constraints: '+(file.must_preserve||[]).join('; ')+'.';
 const nonce='g1k-'+crypto.randomBytes(16).toString('hex');
 const receivedAt=new Date(at).toISOString();
 const precommitAt=new Date(at+1000).toISOString();
 const receipt={schema:'tcvl-independent-read-ack/v0.1',event_id:event.event_id,task_id:event.task_id,
  attempt_id:event.attempt_id,payload_version:event.payload_version,payload_digest:event.payload_digest,
  source_manifest_digest:event.source_manifest_digest,receiver_endpoint_id:event.destination_endpoint_id,
  receiver_agent_id:event.destination_agent_id,receiver_runtime_id:'g1k-offline-child-process',
  received_at:receivedAt,read_ref:event.expected_read_ref,read_digest:event.source_manifest_digest,
  independent_summary:summary,independent_summary_digest:hash(summary),precommit_at:precommitAt,nonce};
 receipt.precommit_digest=hash(JSON.stringify({source_manifest_digest:receipt.source_manifest_digest,
  independent_summary_digest:receipt.independent_summary_digest,
  receiver_endpoint_id:receipt.receiver_endpoint_id,nonce:receipt.nonce}));
 receipt.signature=crypto.sign(null,serializeSigned(receipt),privateKey).toString('base64url');
 return {receipt,synthetic:true,source_digest:digest(fs.readFileSync(sourcePath,'utf8'))};
}
try{
 const data=JSON.parse(fs.readFileSync(0,'utf8'));
 if(data.action==='init'){
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(data.keyDir,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(data.keyDir,'test-key.pem'),privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
  fs.writeFileSync(path.join(data.keyDir,'test-pub.pem'),publicKey.export({type:'spki',format:'pem'}),{mode:0o600,flag:'wx'});
  process.stdout.write(JSON.stringify({synthetic:true,publicKey:path.join(data.keyDir,'test-pub.pem')}));
 }else if(data.action==='produce')process.stdout.write(JSON.stringify(produce(data)));
 else throw Error('UNKNOWN_ACTION');
}catch(err){process.stderr.write(String(err.message||err));process.exitCode=2;}
