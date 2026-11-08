import test from 'node:test';
import assert from 'node:assert/strict';
import {runPilot} from '../preview/pilot-core.mjs';

test('01 default A+B computes X=10 but unknown C keeps Y empty',async()=>{
  const r=await runPilot();
  assert.equal(r.ok,true);assert.equal(r.phase,'INCOMPLETE');assert.equal(r.x.value,'10 MB');assert.equal(r.y.value,null);
  assert.equal(r.gap.state,'UNKNOWN');assert.equal(r.audit.persisted,false);
});
test('02 known C composes X+C in actual V1.5 engine',async()=>{
  const r=await runPilot({a:4,b:6,cState:'KNOWN',c:2});
  assert.equal(r.phase,'COMPUTED');assert.equal(r.x.value,'10 MB');assert.equal(r.y.value,'12 MB');
});
test('03 zero C is legitimate value not a blank',async()=>{
  const r=await runPilot({a:0,b:8,cState:'KNOWN',c:0});
  assert.equal(r.phase,'COMPUTED');assert.equal(r.y.value,'8 MB');
});
test('04 all allowed gap states except REDACTED result in preserved unknown value',async()=>{
  for(const cState of ['MISSING','UNKNOWN','UNVERIFIED','INTENTIONALLY_OPEN','NOT_APPLICABLE']){
    const r=await runPilot({a:1,b:2,cState});
    assert.equal(r.phase,'INCOMPLETE');assert.equal(r.y.value,null);assert.equal(r.gap.state,cState);
  }
});
test('05 REDACTED does not create a visible result',async()=>{
  const r=await runPilot({cState:'REDACTED'});assert.equal(r.phase,'SAFE_BLOCK');assert.equal(r.y,null);assert.equal(r.reason,'ACCESS_DENIED_OR_UNAVAILABLE');
});
test('06 invalid numeric values and state fail closed',async()=>{
  for(const params of [{a:-1},{b:1.2},{cState:'KNOWN',c:1000001},{cState:'MAGIC'}]) assert.equal((await runPilot(params)).ok,false);
});
test('07 references are opaque, not memory authority',async()=>{
  const r=await runPilot({cState:'KNOWN'});assert.match(r.x.id,/^cmp:[0-9a-f]{64}$/);
  assert.equal(r.audit.approval,'NOT_APPROVED');assert.equal(r.audit.remote_ack,'NOT_VERIFIED');
});