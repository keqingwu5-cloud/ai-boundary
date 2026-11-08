'use strict';
// Synthetic only. Keys generated inside this test process, never written to repo.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const stable=require('../vendor/fast-json-stable-stringify-v2.1.0.cjs');
const {reviewTrustedSource,sealDigest}=require('../api/source-baseline-attestation.cjs');
const scope='github:keqingwu5-cloud/ai-boundary:issue:41';
const now='2026-11-08T14:00:00.000Z';
const earlier='2026-11-08T13:59:00.000Z';
const expiry='2026-11-08T14:04:00.000Z';
const baselineIssued='2026-11-07T01:00:00.000Z';
function graph(title='A'){
 return {version:2,brains:[{id:'main',parentBrainId:null,rootNodeId:null,position:[0,0,0]}],
  nodes:[{id:'n1',brainId:'main',parentId:null,pos:[0,0,0],title}],links:[],history:[]};
}
const digest=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const pair=()=>crypto.generateKeyPairSync('ed25519');
const sourceKeys=pair(),curatorKeys=pair(),wrongKeys=pair();
const publicPem=key=>key.export({type:'spki',format:'pem'});
const trust={
 source_readers:{'reader-test-1':{public_key_pem:publicPem(sourceKeys.publicKey),allowed_scopes:[scope]}},
 baseline_curators:{'curator-test-1':{public_key_pem:publicPem(curatorKeys.publicKey),allowed_scopes:[scope]}}
};
function sign(role,statement,key){
 const message=Buffer.from('ai-boundary:attested-'+role+':v1\n'+stable(statement),'utf8');
 return crypto.sign(null,message,key).toString('base64url');
}
const makeSource=(raw=JSON.stringify(graph()),revision='r1',purpose='purpose-A')=>{
 const statement={format:'attested-source-v1',issuer_id:'reader-test-1',scope,source_id:'source-1',
  source_revision:revision,purpose_id:purpose,raw_source_digest:digest(raw),
  issued_at:earlier,expires_at:expiry};
 return {raw,attestation:{statement,signature:sign('source',statement,sourceKeys.privateKey)}};
};
let initial;
async function originBaseline(){
 initial ||= await (async()=>{
  const src=makeSource();
  const res=await reviewTrustedSource({source:src,trust,now,expected_scope:scope});
  assert.equal(res.state,'WAIT_BASELINE');
  return {source:src,review:res};
 })();
 return initial;
}
async function makePackage(){
 const b=await originBaseline();
 const statement={format:'attested-baseline-v1',issuer_id:'curator-test-1',scope,source_id:'source-1',
  sequence:1,source_revision:'r1',purpose_id:'purpose-A',
  content_digest:b.review.content_digest,history_digest:b.review.history_digest,
  raw_source_digest:b.review.raw_source_digest,review_ref:'synthetic-review-fixture',
  previous_seal_digest:null,issued_at:baselineIssued};
 const attestation={statement,signature:sign('baseline',statement,curatorKeys.privateKey)};
 const head={scope,source_id:'source-1',sequence:1,seal_digest:sealDigest(attestation)};
 return {attestation,head};
}
const run=async({source=makeSource(),baseline,head,registry=trust,time=now,targetScope=scope}={})=>
  reviewTrustedSource({source,baseline,head,trust:registry,now:time,expected_scope:targetScope});
test('TRUST-00 valid attested source absent baseline cannot persist itself',async()=>{
 const r=await run();assert.equal(r.state,'WAIT_BASELINE');assert.equal(r.approved,false);
 assert.equal(r.action,'NO_EXTERNAL_EFFECT');assert.equal(r.real_source_verified,false);
});
test('TRUST-01 attested pinned curator baseline permits no-change comparison',async()=>{
 const {attestation,head}=await makePackage();
 const r=await run({baseline:attestation,head});
 assert.equal(r.state,'NO_CHANGE');assert.equal(r.local_source_signature_valid,true);
 assert.equal(r.local_baseline_signature_valid,true);assert.equal(r.approved,false);
});
test('TRUST-02 genuinely changed source becomes candidate, never effective',async()=>{
 const {attestation,head}=await makePackage();
 const r=await run({source:makeSource(JSON.stringify(graph('B')),'r2'),baseline:attestation,head});
 assert.equal(r.state,'REVIEW_CANDIDATE');assert.equal(r.approved,false);assert.equal(r.action,'NO_EXTERNAL_EFFECT');
});
test('TRUST-03 spoofed source raw bytes are quarantined',async()=>{
 const src=makeSource();src.raw=JSON.stringify(graph('forged'));
 const r=await run({source:src});assert.equal(r.state,'QUARANTINED');
 assert.equal(r.reason,'SOURCE_DIGEST_MISMATCH');
});
test('TRUST-04 altered signed source metadata is refused',async()=>{
 const src=makeSource();src.attestation.statement.source_revision='r2';
 const r=await run({source:src});assert.equal(r.reason,'SOURCE_BAD_SIGNATURE');
});
test('TRUST-05 untrusted source public key refused',async()=>{
 const src=makeSource();const stmt=src.attestation.statement;
 src.attestation.signature=sign('source',stmt,wrongKeys.privateKey);
 const r=await run({source:src});assert.equal(r.reason,'SOURCE_BAD_SIGNATURE');
});
test('TRUST-06 missing source reader key quarantined',async()=>{
 const src=makeSource();src.attestation.statement.issuer_id='unknown-reader';
 const r=await run({source:src});assert.equal(r.reason,'SOURCE_UNTRUSTED_ISSUER');
});
test('TRUST-07 expired source attestation is refused',async()=>{
 const r=await run({time:'2026-11-08T14:10:00.000Z'});
 assert.equal(r.reason,'SOURCE_EXPIRED');
});
test('TRUST-08 future source attestation is refused',async()=>{
 const src=makeSource();src.attestation.statement.issued_at='2026-11-08T14:30:00.000Z';
 src.attestation.signature=sign('source',src.attestation.statement,sourceKeys.privateKey);
 const r=await run({source:src});assert.equal(r.reason,'SOURCE_FUTURE');
});
test('TRUST-09 cross-issue statement despite valid signature rejected by scope',async()=>{
 const src=makeSource();src.attestation.statement.scope='github:keqingwu5-cloud/ai-boundary:issue:32';
 src.attestation.signature=sign('source',src.attestation.statement,sourceKeys.privateKey);
 const r=await run({source:src});assert.equal(r.reason,'SOURCE_EXPECTED_SCOPE_MISMATCH');
});
test('TRUST-10 curator baseline without anchored trusted head never becomes authority',async()=>{
 const {attestation}=await makePackage();
 const r=await run({baseline:attestation});assert.equal(r.state,'QUARANTINED');
 assert.equal(r.reason,'BASELINE_HEAD_UNPINNED');
});
test('TRUST-11 tampered signature on curator baseline rejected',async()=>{
 const {attestation,head}=await makePackage();attestation.statement.review_ref='fabricated';
 const r=await run({baseline:attestation,head});
 assert.equal(r.reason,'BASELINE_BAD_SIGNATURE');
});
test('TRUST-12 old signed baseline cannot masquerade as newer approved head',async()=>{
 const {attestation,head}=await makePackage();head.sequence=2;
 const r=await run({baseline:attestation,head});
 assert.equal(r.reason,'BASELINE_HEAD_MISMATCH');
});
test('TRUST-13 trusted head with wrong digest quarantined',async()=>{
 const {attestation,head}=await makePackage();head.seal_digest='0'.repeat(64);
 const r=await run({baseline:attestation,head});
 assert.equal(r.reason,'BASELINE_HEAD_MISMATCH');
});
test('TRUST-14 source purpose drift still routes counterevidence',async()=>{
 const {attestation,head}=await makePackage();
 const r=await run({source:makeSource(JSON.stringify(graph('B')),'r2','purpose-B'),baseline:attestation,head});
 assert.equal(r.state,'NEED_COUNTEREVIDENCE');assert.equal(r.reason,'PURPOSE_MISMATCH');
});
test('TRUST-15 caller cannot use source reader as baseline curator',async()=>{
 const {attestation,head}=await makePackage();
 const registry=structuredClone(trust);
 registry.baseline_curators['curator-test-1'].public_key_pem=registry.source_readers['reader-test-1'].public_key_pem;
 const r=await run({baseline:attestation,head,registry});
 assert.equal(r.reason,'TRUST_ROLE_OVERLAP');
});
test('TRUST-16 forged test issuer identity never leaks raw private content',async()=>{
 const src=makeSource('{SECRET_PRIVATE_SOURCE_BROKEN');
 const r=await run({source:src});assert.doesNotMatch(JSON.stringify(r),/SECRET_PRIVATE_SOURCE_BROKEN/);
});
test('TRUST-17 malformed baseline without signed review reference is refused',async()=>{
 const {attestation,head}=await makePackage();
 delete attestation.statement.review_ref;
 attestation.signature=sign('baseline',attestation.statement,curatorKeys.privateKey);
 const r=await run({baseline:attestation,head});
 assert.equal(r.reason,'BASELINE_INVALID_CONTRACT');
});
test('TRUST-18 no downgrade to untrusted baseline after earlier valid head',async()=>{
 const {head}=await makePackage();
 const r=await run({baseline:null,head});
 assert.equal(r.reason,'BASELINE_MISSING_WITH_TRUSTED_HEAD');
});
test('TRUST-19 signed but non-member scope key is not trusted',async()=>{
 const src=makeSource();const registry=structuredClone(trust);
 registry.source_readers['reader-test-1'].allowed_scopes=['github:other/repository:issue:99'];
 const r=await run({source:src,registry});
 assert.equal(r.reason,'SOURCE_SCOPE_DENIED');
});

test('TRUST-20 caller must fix expected scope; signed statement cannot self-scope',async()=>{
 const r=await reviewTrustedSource({source:makeSource(),trust,now});
 assert.equal(r.state,'QUARANTINED');
 assert.equal(r.reason,'EXPECTED_SCOPE_REQUIRED');
});
test('TRUST-21 even an allowlisted cross-issue statement cannot override caller target',async()=>{
 const foreign='github:keqingwu5-cloud/ai-boundary:issue:32';
 const src=makeSource();src.attestation.statement.scope=foreign;
 src.attestation.signature=sign('source',src.attestation.statement,sourceKeys.privateKey);
 const registry=structuredClone(trust);
 registry.source_readers['reader-test-1'].allowed_scopes.push(foreign);
 const r=await run({source:src,registry});
 assert.equal(r.reason,'SOURCE_EXPECTED_SCOPE_MISMATCH');
});
test('TRUST-22 valid signed source with invalid graph still quarantined by graph validator',async()=>{
 const invalid=graph();invalid.links.push({id:'z1',from:'n1',to:'missing',kind:'cross'});
 const r=await run({source:makeSource(JSON.stringify(invalid))});
 assert.equal(r.state,'QUARANTINED');assert.equal(r.reason,'GRAPH_INVALID');
});
