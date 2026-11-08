'use strict';
// A/B demonstration with deterministic synthetic records only.
// Review work units != tokens, provider charges, GitHub HTTP calls or actual time savings.
const crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {planPreflight}=require('../api/efficiency-cost-preflight.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const purposeDigest=sha('synthetic-benchmark-purpose');
const review=body=>sha('review:'+body);
function runScenario(count){
 if(![10,100,1000].includes(count))throw Error('supported_synthetic_sizes_10_100_1000');
 const sources=[],prior=[],latest=[],cached=[];
 for(let i=0;i<count;i++){
  const original='PUBLIC_SYNTHETIC_'+i+':'+'.'.repeat(2048);
  const changed=i%10===0;
  const current=changed?original+':REVISION_2':original;
  const sourceId='fixture:source:'+i;
  const beforeFingerprint=sha(original),currentFingerprint=sha(current);
  latest.push(current);cached.push(review(original));
  sources.push({sourceId,status:'complete',risk:'low',contradiction:false,
    fingerprint:currentFingerprint,estimatedReadMicros:100});
  prior.push({sourceId,reviewed:true,evidenceRef:'synthetic-only:'+i,
    fingerprint:beforeFingerprint,purposeDigest,verifiedAtMs:1000});
 }
 const baselineStart=performance.now();
 const baselineResults=latest.map(review);
 const baselineMs=performance.now()-baselineStart;
 const selectiveStart=performance.now();
 const preflight=planPreflight({sources,prior,purposeDigest,nowMs:1100,
    limits:{maxReadCalls:count,maxEstimatedMicros:count*100,maxCacheAgeMs:200}});
 let candidateReviewUnits=0,reused=0;
 const candidateResults=preflight.decisions.map((decision,i)=>{
  if(decision.action==='REUSE_VERIFIED'){reused++;return cached[i];}
  if(decision.action==='TARGETED_VERIFY'){candidateReviewUnits++;return review(latest[i]);}
  throw Error('unexpected_decision:'+decision.action);
 });
 const candidateMs=performance.now()-selectiveStart;
 const expectedChanged=count/10;
 const falseNegatives=preflight.decisions.filter((d,i)=>i%10===0&&d.action!=='TARGETED_VERIFY').length;
 return {records:count,changedRecords:expectedChanged,
    baselineReviewUnits:count,candidateReviewUnits,reusedReviewUnits:reused,
    knownChangedFalseNegatives:falseNegatives,
    outputsMatchBaseline:JSON.stringify(baselineResults)===JSON.stringify(candidateResults),
    timingDiagnosticsMs:{baselineReview:Math.round(baselineMs*1000)/1000,
      candidatePreflightAndReview:Math.round(candidateMs*1000)/1000},
    sourceFetchCallsMeasured:false,modelTokenUsage:'NOT_MEASURED',
    providerBilling:'NOT_MEASURED',actualCostSavingsUsd:'UNKNOWN',
    evidenceScope:'SYNTHETIC_FIXTURES_ONLY'};
}
if(require.main===module){
 process.stdout.write(JSON.stringify({cases:[10,100,1000].map(runScenario),
   caution:'Synthetic review-unit reuse, NOT real token/API/cost/time savings.'},null,2)+'\n');
}
module.exports={runScenario};
