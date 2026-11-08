'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspectGitHubAndPlan,fromSnapshot}=require('../api/efficiency-github-source-bridge.cjs');
const D=c=>c.repeat(64);
const repository='owner/repo',issue=41;
const limits={maxReadCalls:2,maxEstimatedMicros:1000,maxCacheAgeMs:500};
function reader(opts={}){
 const counters={issue:0,comment:0};
 const url='https://github.com/'+repository+'/issues/'+issue;
 const base={number:issue,url,comments:1,updated_at:opts.revision||'2026-11-08T05:00:00Z',body:opts.body||'unchanged source'};
 return {counters,
  getIssue:async()=>{counters.issue++;return {...base,url:opts.foreign?'https://github.com/other/repo/issues/41':url};},
  getComments:async()=>{counters.comment++;if(opts.throwComments)throw Error('simulated_network_down');
   return {complete:!opts.incomplete,items:[{id:7,url:url+'#issuecomment-7',body:opts.commentBody||'public comment',updated_at:opts.noRevision?null:(opts.commentRevision||'2026-11-08T04:00:00Z')}]};},
  searchIssues:async()=>({items:[],complete:true})
 };
}
function opts(readerArg,extra={}){return {reader:readerArg,repository,issue,purposeDigest:D('f'),nowMs:1000,
 limits,risk:'low',contradiction:false,estimatedReadMicros:500,...extra};}
function priorFrom(result,extra={}){return {sourceId:result.sourceId,fingerprint:result.revisionFingerprint,purposeDigest:D('f'),
 reviewed:true,evidenceRef:'reviewed:isolated-test-not-real-identity',verifiedAtMs:900,...extra};}
test('existing reader read produces source-revision-scoped targeted preflight',async()=>{
 const result=await inspectGitHubAndPlan(opts(reader()));
 assert.equal(result.source_status,'COMPLETE_REVISION_SCOPED');
 assert.equal(result.preflight.decisions[0].action,'TARGETED_VERIFY');
 assert.equal(result.sourceProposal.dispatch_permitted,false);
 assert.equal(result.actualRemoteAck,false);
 assert.equal(result.externalProviderCalls,0);
 assert.equal(result.readerMethodCalls.getIssue,2);
 assert.equal(result.readerMethodCalls.getComments,2);
 assert.equal(result.apiHttpRequests,'NOT_MEASURED_PAGINATION_HIDDEN');
});
test('unsigned caller-reviewed prior is ignored even AFTER complete re-read',async()=>{
 const baseline=await inspectGitHubAndPlan(opts(reader()));
 const again=await inspectGitHubAndPlan(opts(reader(),{prior:[priorFrom(baseline)]}));
 assert.equal(again.preflight.decisions[0].action,'REUSE_VERIFIED');
 assert.equal(again.sourceReadsSkipped,0);
 assert.equal(again.readerMethodCalls.getIssue,2);
 assert.equal(again.readerMethodCalls.getComments,2);
 assert.equal(again.downstreamAnalysisExecuted,false);
 assert.equal(again.deployPermitted,false);
});
test('issue body change invalidates reuse',async()=>{
 const old=await inspectGitHubAndPlan(opts(reader()));
 const now=await inspectGitHubAndPlan(opts(reader({body:'updated source content'}),{prior:[priorFrom(old)]}));
 assert.equal(now.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('comment body change invalidates reuse',async()=>{
 const old=await inspectGitHubAndPlan(opts(reader()));
 const now=await inspectGitHubAndPlan(opts(reader({commentBody:'new comment'}),{prior:[priorFrom(old)]}));
 assert.equal(now.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('metadata-only revision change invalidates reuse even if text identical',async()=>{
 const old=await inspectGitHubAndPlan(opts(reader()));
 const now=await inspectGitHubAndPlan(opts(reader({commentRevision:'2026-11-08T06:00:00Z'}),{prior:[priorFrom(old)]}));
 assert.equal(now.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('changed user purpose invalidates same source reuse',async()=>{
 const old=await inspectGitHubAndPlan(opts(reader()));
 const now=await inspectGitHubAndPlan(opts(reader(),{purposeDigest:D('e'),prior:[priorFrom(old)]}));
 assert.equal(now.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('missing reviewer evidence invalidates cache',async()=>{
 const old=await inspectGitHubAndPlan(opts(reader()));
 const now=await inspectGitHubAndPlan(opts(reader(),{prior:[priorFrom(old,{evidenceRef:''})]}));
 assert.equal(now.preflight.decisions[0].action,'TARGETED_VERIFY');
});
test('incomplete comments never pass through reuse gate',async()=>{
 const old=await inspectGitHubAndPlan(opts(reader()));
 const now=await inspectGitHubAndPlan(opts(reader({incomplete:true}),{prior:[priorFrom(old)]}));
 assert.equal(now.preflight.decisions[0].action,'BLOCK_SOURCE');
 assert.equal(now.sourceEvidenceChecked,false);
});
test('failed GitHub read never passes through reuse gate',async()=>{
 const now=await inspectGitHubAndPlan(opts(reader({throwComments:true})));
 assert.equal(now.preflight.decisions[0].action,'BLOCK_SOURCE');
 assert.equal(now.sourceDigest,null);
});
test('unknown source revision never passes through reuse gate',async()=>{
 const now=await inspectGitHubAndPlan(opts(reader({noRevision:true})));
 assert.equal(now.preflight.decisions[0].action,'BLOCK_SOURCE');
});
test('foreign issue URL rejected by reused canonical-source guard',async()=>{
 await assert.rejects(inspectGitHubAndPlan(opts(reader({foreign:true}))),/source_provenance_not_verified/);
});
test('high risk blocks reuse even with same source digest',async()=>{
 const old=await inspectGitHubAndPlan(opts(reader()));
 const now=await inspectGitHubAndPlan(opts(reader(),{risk:'high',prior:[priorFrom(old)]}));
 assert.equal(now.preflight.decisions[0].action,'REVIEW_REQUIRED');
});
test('contradiction blocks reuse and budget cannot authorize dispatch',async()=>{
 const old=await inspectGitHubAndPlan(opts(reader()));
 const now=await inspectGitHubAndPlan(opts(reader(),{contradiction:true,prior:[priorFrom(old)]}));
 assert.equal(now.preflight.decisions[0].action,'REVIEW_REQUIRED');
 assert.equal(now.preflight.autoDispatch,false);
 assert.equal(now.preflight.runtimeAllowed,false);
});
test('no cost estimate blocks new targeted verification',async()=>{
 const now=await inspectGitHubAndPlan(opts(reader(),{estimatedReadMicros:null}));
 assert.equal(now.preflight.decisions[0].action,'BLOCK_UNKNOWN_COST');
});
test('budget exhausted blocks expensive review',async()=>{
 const now=await inspectGitHubAndPlan(opts(reader(),{limits:{...limits,maxEstimatedMicros:0}}));
 assert.equal(now.preflight.decisions[0].action,'BLOCK_BUDGET');
});
test('source with other issue mixed in cannot reuse evidence',()=>{
 const s={complete:true,read:[41],errors:[],unresolved:[],records:[
  {issue:41,kind:'issue',url:'https://github.com/owner/repo/issues/41',body:'a',version:'v1'},
  {issue:42,kind:'issue',url:'https://github.com/owner/repo/issues/42',body:'b',version:'v1'}
 ]};
 const out=fromSnapshot({...opts(null),snapshot:s});
 assert.equal(out.preflight.decisions[0].action,'BLOCK_SOURCE');
});
test('explicit risk classification is required; unknown defaults to review',async()=>{
 const r=await inspectGitHubAndPlan({...opts(reader()),risk:undefined});
 assert.equal(r.preflight.decisions[0].action,'REVIEW_REQUIRED');
});
