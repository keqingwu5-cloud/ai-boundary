'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {runScenario}=require('./efficiency-cost-ab-benchmark.cjs');
for(const n of [10,100,1000]){
 test('synthetic A/B '+n+' records: unchanged evidence reused without missing known changes',()=>{
  const r=runScenario(n);
  assert.equal(r.records,n);
  assert.equal(r.baselineReviewUnits,n);
  assert.equal(r.changedRecords,n/10);
  assert.equal(r.candidateReviewUnits,n/10);
  assert.equal(r.reusedReviewUnits,n-n/10);
  assert.equal(r.knownChangedFalseNegatives,0);
  assert.equal(r.outputsMatchBaseline,true);
  assert.equal(r.actualCostSavingsUsd,'UNKNOWN');
  assert.equal(r.providerBilling,'NOT_MEASURED');
  assert.equal(r.modelTokenUsage,'NOT_MEASURED');
  assert.equal(r.sourceFetchCallsMeasured,false);
 });
}
test('benchmark cannot silently expand into unknown inputs',()=>assert.throws(()=>runScenario(10000),/supported_synthetic_sizes/));
