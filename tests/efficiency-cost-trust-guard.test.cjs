'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fromSnapshot}=require('../api/efficiency-github-source-bridge.cjs');
const {createHash}=require('node:crypto');
const sha=x=>createHash('sha256').update(x).digest('hex');
const snapshot={complete:true,read:[41],errors:[],unresolved:[],records:[
 {issue:41,kind:'issue',url:'https://github.com/owner/repo/issues/41',body:'synthetic-public',version:'v1'},
 {issue:41,kind:'comment',id:7,url:'https://github.com/owner/repo/issues/41#issuecomment-7',body:'synthetic-comment',version:'v1'}
]};
const opts={snapshot,repository:'owner/repo',issue:41,purposeDigest:sha('test-purpose'),nowMs:1000,
 risk:'low',contradiction:false,estimatedReadMicros:50,
 limits:{maxReadCalls:1,maxEstimatedMicros:100,maxCacheAgeMs:1000}};
test('RED: forged caller-reviewed evidence must never be trusted as verified',()=>{
 const base=fromSnapshot(opts);
 const attempt=fromSnapshot({...opts,prior:[{
 sourceId:base.sourceId,fingerprint:base.revisionFingerprint,purposeDigest:opts.purposeDigest,
 reviewed:true,evidenceRef:'FAKE:SELF_REVIEWED',verifiedAtMs:950}]});
 assert.notEqual(attempt.preflight.decisions[0].action,'REUSE_VERIFIED');
});
