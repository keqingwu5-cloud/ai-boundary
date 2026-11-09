/**
 * Research-only RED/green tests for engine side-effects occurring before audit append.
 * Run under local deterministic maxHistory capacity; no network, DB or real action.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createControlCycle} from '../control-cycle-candidate.mjs';
const H='a'.repeat(64);
const qty=n=>({kind:'quantity',dimension:'data',unit:'MB',value:n});
async function fixture(maxHistory){
  const control=createControlCycle({maxHistory});
  assert.equal(control.registerDomain({domain_id:'iso',contract_revision:'v1'}).status,'candidate_only');
  const a=await control.observe({
    event_id:'evt',domain_id:'iso',source_id:'sensor',revision:'v1',source_hash:H
  });
  assert.equal(a.status,'candidate_only');
  return control;
}
const source=(id,value)=>({event_id:'evt',source:{id,revision:'v1',payload:qty(value)}});
const gap=id=>({event_id:'evt',gap:{id,revision:'v1',state:'UNKNOWN'}});

test('Q01 simultaneous sources beyond journal capacity must quarantine unlogged engine state',async()=>{
  const c=await fixture(2);
  const [a,b]=await Promise.all([c.registerSource(source('alpha',2)),c.registerSource(source('beta',5))]);
  assert.equal([a,b].filter(z=>z.status==='candidate_only').length,1);
  assert.equal([a,b].filter(z=>z.status==='blocked').length,1);
  assert.equal(c.stats().engine_quarantined,true);
  assert.equal(c.readComposition('alpha').reason,'ENGINE_STATE_QUARANTINED');
  assert.equal((await c.compose({event_id:'evt',inputIds:['alpha','beta'],rule:'quantity_sum'})).reason,'ENGINE_STATE_QUARANTINED');
  assert.equal(c.history('evt').entries.length,2);
  assert.equal((await c.verifyHistory('evt')).local_chain_consistent,true);
});
test('Q02 concurrent gap registration loss must block later gap reads',async()=>{
  const c=await fixture(2);
  const [a,b]=await Promise.all([c.registerGap(gap('gapA')),c.registerGap(gap('gapB'))]);
  assert.equal([a,b].filter(z=>z.status==='candidate_only').length,1);
  assert.equal([a,b].filter(z=>z.status==='blocked').length,1);
  assert.equal(c.stats().engine_quarantined,true);
  assert.equal(c.readComposition('gapA').reason,'ENGINE_STATE_QUARANTINED');
  assert.equal(c.readComposition('gapB').reason,'ENGINE_STATE_QUARANTINED');
  assert.equal((await c.registerGap(gap('gapC'))).reason,'ENGINE_STATE_QUARANTINED');
});
test('Q03 append failure cannot produce a success report or fake rollback',async()=>{
  const c=await fixture(2);
  await Promise.all([c.registerSource(source('alpha',2)),c.registerSource(source('beta',5))]);
  assert.equal(c.stats().engine_quarantined,true);
  assert.equal(c.stats().recovery,'RESTART_OR_RECONCILIATION_REQUIRED');
  assert.equal(c.stats().auto_recovered,false);
  assert.equal(c.readEvent('evt').execution,'NOT_RUN');
  assert.equal(c.readEvent('evt').baseline,'NOT_APPROVED');
});
test('Q04 ordinary sequential sources and composition remain inspectable',async()=>{
  const c=await fixture(10);
  const a=await c.registerSource(source('alpha',2));
  const b=await c.registerSource(source('beta',3));
  assert.equal(a.status,'candidate_only');
  assert.equal(b.status,'candidate_only');
  const out=await c.compose({
    event_id:'evt',inputIds:['alpha','beta'],rule:'quantity_sum',context:{target_unit:'MB'}
  });
  assert.equal(out.status,'candidate_only',JSON.stringify(out));
  assert.equal(c.stats().engine_quarantined,false);
  assert.equal(c.readComposition(out.result_id).status,'candidate_only');
  assert.equal((await c.verifyHistory('evt')).local_chain_consistent,true);
});
test('Q05 stop after quarantine must remain possible as local control without remote claim',async()=>{
  const c=await fixture(3);
  await Promise.all([c.registerSource(source('alpha',2)),c.registerSource(source('beta',3)),c.registerGap(gap('gapA'))]);
  const version=c.readEvent('evt').version;
  assert.equal(c.stats().engine_quarantined,true);
  const stop=await c.requestControl({
    event_id:'evt',expected_version:version,action:'STOP',operator_claim:'operator',
    grant_ref:'synthetic'
  });
  assert.equal(stop.status,'blocked');
  // Journal is full, so uncommitted STOP must never claim a remote stop.
  assert.equal(c.readEvent('evt').remote_stop_confirmed,false);
  assert.equal(c.readEvent('evt').baseline,'NOT_APPROVED');
});
test('Q06 no unlogged success when controlled engine input is valid but journal is full',async()=>{
  const c=await fixture(2);
  const first=await c.registerSource(source('alpha',2));
  assert.equal(first.status,'candidate_only');
  // At full capacity the ordinary early guard blocks, without mutating engine.
  const blocked=await c.registerSource(source('beta',5));
  assert.equal(blocked.status,'blocked');
  assert.equal(blocked.reason,'HISTORY_CAPACITY_REACHED');
  assert.equal(c.stats().engine_quarantined,false);
  assert.equal(c.readComposition('alpha').status,'candidate_only');
});
