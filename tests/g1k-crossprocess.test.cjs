'use strict';
/* G1k: Node subprocesses + local synthetic sources, no network/GPT2/PG. */
const test=require('node:test');const a=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {spawn}=require('node:child_process');
const {build,child}=require('../api/g1k-crossprocess/orchestrator.cjs');
const {decideRetry}=require('../api/g1h-review/independent-ack-gate.cjs');
const {reserve}=require('../api/g1k-crossprocess/receipt-ledger.cjs');
const dir=()=>fs.mkdtempSync(path.join(os.tmpdir(),'g1k-test-'));
const run=x=>x.run();
test('T01 two isolated processes deliver synthetic source and stage, no actual GPT2 claim',async()=>{
 const r=await run(build());a.equal(r.ok,true);a.equal(r.status,'SIGNED_CLAIM_STAGED_FOR_EXTERNAL_REVIEW');
 a.equal(r.actual_gpt2_ack_verified,false);a.equal(r.cross_ai_e2e_verified,false);a.equal(r.semantic_alignment_verified,false);
});
test('T01 child process test public key exists; source fixture remains untouched',()=>{
 const x=build();a.equal(fs.existsSync(path.join(x.dir,'keys','test-pub.pem')),true);
 a.equal(fs.readFileSync(x.sourcePath,'utf8').includes('synthetic_only'),true);
});
test('T02 identical ACK replay denied by local fs exclusion',async()=>{
 const x=build(),one=await x.run(),two=await x.run();a.equal(one.ok,true);
 a.equal(two.ok,false);a.equal(two.reason,'NONCE_ALREADY_USED_OR_LEDGER_UNVERIFIED');
});
test('T02 concurrent in-process attempts only one consume',async()=>{
 const x=build(),r=await Promise.all([x.run(),x.run(),x.run()]);a.equal(r.filter(y=>y.ok).length,1);
});
test('T02 concurrent independent OS processes cannot reserve same nonce twice',async()=>{
 const where=path.join(dir(),'ledger');const body=JSON.stringify({dir:where,event_id:'E',attempt_id:'A',nonce:'N',receipt_hash:'x'.repeat(64)});
 const all=await Promise.all(Array.from({length:5},()=>new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[path.join(__dirname,'../api/g1k-crossprocess/reserve-child.cjs')]);let output='',errors='';
  p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>errors+=b);
  p.on('error',reject);p.on('exit',code=>code===0?resolve(JSON.parse(output)):reject(Error(errors)));
  p.stdin.end(body);
 })));
 a.equal(all.filter(x=>x.consumed).length,1);
});
test('T02 post-process restart retains local duplicate gate',()=>{
 const where=path.join(dir(),'ledger'),body={dir:where,event_id:'E',attempt_id:'A',nonce:'N',receipt_hash:'x'.repeat(64)};
 a.equal(reserve(where,body).consumed,true);
 a.equal(child('reserve-child.cjs',body).consumed,false);
});
test('T03 G1 interpretation is never sent to blind receiver before precommit',()=>{
 const x=build();a.equal('g1_understanding' in x.receipt,false);
 a.equal(Date.parse(x.receipt.precommit_at)<Date.parse(x.event.g1_reveal_at),true);
});
test('T03 source payload edited after child signed is detected independently',async()=>{
 const r=await run(build({sourceTamperAfterSign:true}));a.equal(r.ok,false);
 a.equal(r.reason,'READ_SOURCE_NOT_INDEPENDENTLY_PROVEN');
});
test('T03 cannot feed private/nonsynthetic source',()=>{
 a.throws(()=>build({sourcePatch:{synthetic_only:false}}),/NON_SYNTHETIC_SOURCE_DENIED/);
});
test('T03 receiver denies unapproved source URL',()=>{
 a.throws(()=>build({eventPatch:{expected_read_ref:'https://evil.example.test'}}),/UNAPPROVED_READ_REFERENCE/);
});
test('T03 receiver refuses G1 interpretation before blind review',()=>{
 a.throws(()=>build({eventPatch:{g1_understanding:'pre-copied interpretation'}}),/BLIND_READ_CONTAMINATED/);
});
test('T04 absent precommit publication blocks staged receipt',async()=>{
 const r=await run(build({skipPublication:true}));a.equal(r.ok,false);a.equal(r.reason,'PRECOMMIT_NOT_INDEPENDENTLY_PUBLISHED');
});
test('T04 forged precommit digest fails before nonce consumed',async()=>{
 const x=build(),p=JSON.parse(fs.readFileSync(x.publicationPath));p.precommit_digest='f'.repeat(64);
 fs.writeFileSync(x.publicationPath,JSON.stringify(p));const r=await x.run();a.equal(r.reason,'PRECOMMIT_NOT_INDEPENDENTLY_PUBLISHED');
});
test('T04 post-reveal precommit blocked on timeline',async()=>{
 const x=build();x.event.g1_reveal_at=x.receipt.received_at;
 const r=await x.run();a.equal(r.ok,false);
 a.match(r.reason,/BLIND_REVIEW_SEQUENCE_INVALID|PRECOMMIT_PUBLICATION_TIMELINE_INVALID/);
});
test('T05 outdated API attempt denied',async()=>{
 const r=await run(build({apiPatch:{current_attempt_id:'OLD'}}));
 a.equal(r.reason,'API_CURRENT_ATTEMPT_MISMATCH');
});
test('T05 payload version mismatch denied',async()=>{
 const r=await run(build({apiPatch:{payload_version:'v0'}}));
 a.equal(r.reason,'API_EVENT_PAYLOAD_VERSION_MISMATCH');
});
test('T05 payload digest mismatch denied',async()=>{
 const r=await run(build({apiPatch:{payload_digest:'f'.repeat(64)}}));
 a.equal(r.reason,'API_EVENT_PAYLOAD_DIGEST_MISMATCH');
});
test('T05 signed attempt altered after signing denied',async()=>{
 const r=await run(build({receiptPatch:{attempt_id:'OLD'}}));
 a.equal(r.reason,'SIGNED_RECEIPT_ATTEMPT_MISMATCH');
});
test('T05 tamper signed summary after signing denied',async()=>{
 const r=await run(build({receiptPatch:{independent_summary:'tampered human input'}}));
 a.match(r.reason,/SIGNED_CLAIM_INDEPENDENT_SUMMARY_INVALID/);
});
test('T06 revoked operator trust blocks independent claims',async()=>{
 const r=await run(build({revoked:true}));a.equal(r.reason,'SIGNED_CLAIM_TRUST_ROOT_NOT_CONFIGURED');
});
test('T06 source and receiver same identity denied',async()=>{
 const r=await run(build({eventPatch:{source_agent_id:'SYNTHETIC-G2'}}));
 a.equal(r.reason,'SIGNED_CLAIM_REVIEWER_NOT_INDEPENDENT');
});
test('T06 forged runtime attestation claim cannot pass',async()=>{
 const x=build();x.adapters.identityVerifier.verifyRuntime=async()=>({verified:true,evidence_ref:'synthetic:forged',
  receipt_hash:'WRONG',event_id:x.event.event_id,task_id:x.event.task_id,attempt_id:x.event.attempt_id,
  agent_id:x.trust.agent_id,endpoint_id:x.trust.endpoint_id,runtime_id:x.trust.runtime_id});
 a.equal((await x.run()).reason,'RUNTIME_NOT_INDEPENDENTLY_ATTESTED');
});
test('T07 unknown side effect and ACK must halt retry and reconcile',async()=>{
 const r=await run(build({unknownTransport:true}));
 a.equal(r.status,'RECONCILIATION_REQUIRED');a.equal(r.retry.allowRetry,false);
});
test('T07 ambiguous transport result never treated as safe to repeat',()=>{
 a.equal(decideRetry({ack_transport_state:'unknown',side_effect_state:'none'}).allowRetry,false);
 a.equal(decideRetry({ack_transport_state:'not_committed',side_effect_state:'unknown'}).allowRetry,false);
});
test('T07 clean failure still needs durable reconciliation and idempotency proof',()=>{
 a.equal(decideRetry({ack_transport_state:'not_committed',side_effect_state:'none'}).allowRetry,false);
 a.equal(decideRetry({ack_transport_state:'not_committed',side_effect_state:'none',durable_reconciliation:true,external_idempotency_verified:true}).allowRetry,true);
});
test('T08 simulated crash left nonce reservation; recovery fails closed',async()=>{
 const x=build(),r=await x.run();a.equal(r.ok,true);
 // Lost response: local reservation persists, unlike unchecked retries.
 a.equal((await x.run()).ok,false);
});
test('T08 corruption in local ledger reservation is not promoted or reused',()=>{
 const where=path.join(dir(),'ledger'),body={dir:where,event_id:'E',attempt_id:'A',nonce:'N',receipt_hash:'x'.repeat(64)};
 const first=reserve(where,body);a.equal(first.consumed,true);
 const p=path.join(where,fs.readdirSync(where)[0]);fs.truncateSync(p,0);
 a.equal(reserve(where,body).consumed,false);
});
test('T08 signing key can only be a test key not a trusted GPT2 identity',async()=>{
 const x=build(),r=await x.run();a.equal(r.ok,true);
 a.equal(r.actual_gpt2_ack_verified,false);a.equal(r.semantic_alignment_verified,false);
});
const {inspectAfterBlindPrecommit}=require('../api/g1k-crossprocess/semantic-review.cjs');
function semantics(x,{g1Understanding='',g1Plan='',receiverSummary=x.receipt.independent_summary,precommitPublishedAt}={}){
 const p=JSON.parse(fs.readFileSync(x.publicationPath,'utf8'));
 return inspectAfterBlindPrecommit({sourcePath:x.sourcePath,g1Understanding,g1Plan,receiverSummary,
  precommitPublishedAt:precommitPublishedAt||p.published_at,g1RevealAt:x.event.g1_reveal_at});
}
test('T03/G1 semantic blind review catches a dropped constraint in GPT1 interpretation',()=>{
 const x=build();const r=semantics(x,{g1Understanding:'preserve originals',g1Plan:'nothing else'});
 a.equal(r.status,'NEEDS_HUMAN_SEMANTIC_REVIEW');a.equal(r.lexical_gap_detected,true);
 a.deepEqual(r.g1_missing,['retain negative-test history','owner approval before production']);
});
test('T03/G2 lexical term coverage detects a synthetic receiver omission',()=>{
 const x=build();const r=semantics(x,{g1Understanding:'preserve originals retain negative-test history owner approval before production',receiverSummary:'preserve originals'});
 a.equal(r.lexical_gap_detected,true);a.equal(r.synthetic_receiver_missing.length,2);
});
test('T03 even exact matching terms cannot auto-approve GPT2 semantic alignment',()=>{
 const x=build();const r=semantics(x,{g1Understanding:'preserve originals retain negative-test history owner approval before production'});
 a.equal(r.lexical_gap_detected,false);a.equal(r.semantic_alignment_verified,false);a.equal(r.actual_gpt2_ack_verified,false);
});
test('T04 lexical comparison blocks if precommit appears after G1 meaning reveal',()=>{
 const x=build();const r=semantics(x,{precommitPublishedAt:new Date(Date.parse(x.event.g1_reveal_at)+1000).toISOString()});
 a.equal(r.status,'BLOCKED');a.equal(r.reason,'SEMANTIC_REVIEW_ORDER_UNPROVEN');
});
test('T06 semantic check denies missing required original constraints',()=>{
 const x=build({sourcePatch:{must_preserve:undefined}});
 const r=semantics(x,{});a.equal(r.status,'BLOCKED');a.equal(r.reason,'SOURCE_CONSTRAINTS_MISSING');
});
