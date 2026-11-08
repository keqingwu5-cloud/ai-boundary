import test from 'node:test';
import assert from 'node:assert/strict';
import {runPilot} from '../preview/pilot-core.mjs';

test('01 known explicit zero remains a valid value, unlike an absent blank',async()=>{
  const r=await runPilot({a:4,b:6,cState:'KNOWN',c:0});
  assert.equal(r.ok,true);
  assert.equal(r.phase,'COMPUTED');
  assert.equal(r.y.value,'10 MB');
});
test('02 C is irrelevant when the selected state is UNKNOWN, even if no numeric C was supplied',async()=>{
  const r=await runPilot({a:4,b:6,cState:'UNKNOWN',c:NaN});
  assert.equal(r.ok,true);
  assert.equal(r.phase,'INCOMPLETE');
  assert.equal(r.y.value,null);
  assert.equal(r.gap.state,'UNKNOWN');
});
test('03 mandatory A or B with invalid quantity must be rejected',async()=>{
  for (const v of [NaN,Infinity,-1,1.5,1000001,'',null]){
    const a=await runPilot({a:v,b:6});
    assert.equal(a.ok,false,'A='+String(v));
    const b=await runPilot({a:4,b:v});
    assert.equal(b.ok,false,'B='+String(v));
  }
});
test('04 known C has a strict numeric contract',async()=>{
  for (const v of [NaN,Infinity,-2,1.5,1000001,'',null]){
    const r=await runPilot({a:4,b:6,cState:'KNOWN',c:v});
    assert.equal(r.ok,false,'C='+String(v));
  }
});
test('05 invalid state fails closed',async()=>{
  const r=await runPilot({a:4,b:6,cState:'MAYBE',c:2});
  assert.equal(r.ok,false);
  assert.equal(r.reason,'C_STATE_INVALID');
});
test('06 intentional blank remains a real blank through X plus C',async()=>{
  const r=await runPilot({a:4,b:6,cState:'INTENTIONALLY_OPEN',c:0});
  assert.equal(r.ok,true);
  assert.equal(r.phase,'INCOMPLETE');
  assert.equal(r.y.value,null);
  assert.equal(r.gap.state,'INTENTIONALLY_OPEN');
});
