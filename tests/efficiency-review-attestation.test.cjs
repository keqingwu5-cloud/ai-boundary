'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {canonicalReviewBytes,verifyReviewAttestations}=require('../api/efficiency-review-attestation.cjs');
const {fromSnapshot}=require('../api/efficiency-github-source-bridge.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const pub=publicKey.export({format:'pem',type:'spki'}).toString('utf8');
const repository='owner/repo';
const snapshot={complete:true,read:[41],errors:[],unresolved:[],records:[
  {issue:41,kind:'issue',url:'https://github.com/owner/repo/issues/41',body:'public synthetic issue',version:'v1'},
  {issue:41,kind:'comment',id:7,url:'https://github.com/owner/repo/issues/41#issuecomment-7',body:'public synthetic comment',version:'v1'}
]};
const options={snapshot,repository,issue:41,purposeDigest:sha('purpose'),nowMs:1000,limits:{maxReadCalls:1,maxEstimatedMicros:100,maxCacheAgeMs:1000},risk:'low',estimatedReadMicros:50};
const roots=()=>({'synthetic-offline':{status:'active',minEpoch:2,publicKeyPem:pub,revoked:false}});
function signed(fields={}){
 const baseline=fromSnapshot(options);
 const data={sourceId:baseline.sourceId,fingerprint:baseline.revisionFingerprint,
   purposeDigest:options.purposeDigest,evidenceRef:'synthetic-offline-review:test:1',
   reviewerId:'synthetic-offline',verifiedAtMs:900,expiresAtMs:1200,policyEpoch:2,...fields};
 data.signature=crypto.sign(null,canonicalReviewBytes(data),privateKey).toString('base64url');
 return data;
}
const decide=(attestation,root=roots(),overrides={})=>fromSnapshot({...options,...overrides,
 attestations:[attestation],trustedReviewerKeys:root});
test('valid Ed25519 synthetic signed review permits a preview-only reuse',()=>{
 const r=decide(signed());
 assert.equal(r.preflight.decisions[0].action,'REUSE_VERIFIED');
 assert.equal(r.attestationEvidence.accepted,1);
 assert.equal(r.deployPermitted,false);
 assert.equal(r.externalProviderCalls,0);
});
test('signature over source binding stops modified purpose',()=>{
 const r=decide(signed(),roots(),{purposeDigest:sha('new-purpose')});
 assert.equal(r.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('modified signed fingerprint is rejected even if caller matches content',()=>{
 const a=signed();a.fingerprint=sha('tampered');
 assert.equal(decide(a).preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('modified signature is not trusted',()=>{
 const a=signed();a.signature='A'.repeat(86);
 assert.equal(decide(a).attestationEvidence.rejected,1);
 assert.equal(decide(a).preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('unrecognized key identity is not trusted',()=>{
 const a=signed();assert.equal(decide(a,{}).preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('revoked signer cannot authorize reuse',()=>{
 const r=decide(signed(),{'synthetic-offline':{...roots()['synthetic-offline'],revoked:true}});
 assert.equal(r.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('policy epoch advance invalidates old review',()=>{
 const r=decide(signed(),{'synthetic-offline':{...roots()['synthetic-offline'],minEpoch:3}});
 assert.equal(r.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('expiry invalidates signed review',()=>{
 const r=decide(signed({expiresAtMs:999}));
 assert.equal(r.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('future verified date is not accepted',()=>{
 const r=decide(signed({verifiedAtMs:1001}));
 assert.equal(r.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('signed evidenceRef cannot be silently changed',()=>{
 const a=signed();a.evidenceRef='evil';assert.equal(decide(a).preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('signed evidence with old fingerprint cannot authorize new revision',()=>{
 const old=signed();const changed={...snapshot,records:snapshot.records.map((r,i)=>i?{...r,version:'v2'}:r)};
 const r=decide(old,roots(),{snapshot:changed});
 assert.equal(r.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('raw prior reviewed=true never bypasses signing even alongside invalid attestations',()=>{
 const baseline=fromSnapshot(options);
 const fake={sourceId:baseline.sourceId,fingerprint:baseline.revisionFingerprint,
  purposeDigest:options.purposeDigest,reviewed:true,evidenceRef:'forged',verifiedAtMs:900};
 const r=fromSnapshot({...options,prior:[fake],attestations:[{...signed(),signature:'not-valid'}],trustedReviewerKeys:roots()});
 assert.equal(r.preflight.decisions[0].action,'TARGETED_VERIFY');
 assert.equal(r.attestationEvidence.rawPriorIgnored,1);
});
test('review attestation inputs must be bounded',()=>{
 assert.throws(()=>verifyReviewAttestations({attestations:new Array(1001).fill({}),nowMs:1000,trustedReviewerKeys:roots()}),/attestations_bounded_required/);
});
test('untrusted request cannot convert old unsigned prior to review without keys',()=>{
 const a=signed();const r=decide(a,{});
 assert.equal(r.attestationEvidence.trustRootConfigured,false);
 assert.equal(r.preflight.decisions[0].action,'TARGETED_VERIFY');
});
