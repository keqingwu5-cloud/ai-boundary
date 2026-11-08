'use strict';
// CI public GitHub issue smoke ONLY: no secrets in output, no writes, no model calls.
const crypto=require('node:crypto');
const {createGitHubReader}=require('../api/task-locator-github-adapter.cjs');
const {inspectGitHubAndPlan}=require('../api/efficiency-github-source-bridge.cjs');
const purposeDigest=crypto.createHash('sha256').update('PUBLIC_CI_READONLY_EFFICIENCY_SMOKE').digest('hex');
(async()=>{
 const repository=process.env.GITHUB_REPOSITORY||'keqingwu5-cloud/ai-boundary';
 const reader=createGitHubReader({repository,token:process.env.GITHUB_TOKEN||''});
 const result=await inspectGitHubAndPlan({reader,repository,issue:41,purposeDigest,
  prior:[],nowMs:Date.now(),limits:{maxReadCalls:1,maxEstimatedMicros:1000,maxCacheAgeMs:1000},
  risk:'low',contradiction:false,estimatedReadMicros:500});
 const out={scope:'PUBLIC_GITHUB_ONLY',source_status:result.source_status,
  sourceDigest:result.sourceDigest,revisionFingerprint:result.revisionFingerprint,
  readerMethodCalls:result.readerMethodCalls,action:result.preflight.decisions[0].action,
  externalProviderCalls:result.externalProviderCalls,actualRemoteAck:result.actualRemoteAck,
  noDispatch:result.deployPermitted===false&&result.sourceProposal?.dispatch_permitted===false,
  modelTokenUsage:result.providerTokenSavings,actualCostSavings:result.realDollarSavings};
 process.stdout.write(JSON.stringify(out)+'\n');
 if(result.source_status!=='COMPLETE_REVISION_SCOPED'||out.action!=='TARGETED_VERIFY'||!out.noDispatch)
   process.exitCode=2;
})().catch(e=>{console.error('PUBLIC_GITHUB_SMOKE_FAILED:'+String(e.message||e));process.exitCode=2;});
