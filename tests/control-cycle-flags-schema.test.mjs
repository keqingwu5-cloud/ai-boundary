import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createControlCycle,CONTROL_SCHEMA} from '../control-cycle-candidate.mjs';

const schema=JSON.parse(readFileSync(new URL('../schemas/control-cycle-flags.preview.schema.json',import.meta.url),'utf8'));
const candidate=async()=>{
  const c=createControlCycle();
  c.registerDomain({domain_id:'one',contract_revision:'1'});
  await c.observe({event_id:'ev1',domain_id:'one',source_id:'source1',revision:'r1',source_hash:'a'.repeat(64)});
  return c.readEvent('ev1');
};

test('01 JSON Schema v2020-12, fixed candidate label and no extra fields',()=>{
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.schema.const,CONTROL_SCHEMA);
});
test('02 every required field exists on the actual engine output',async()=>{
  const out=await candidate();
  assert.deepEqual(Object.keys(out).sort(),schema.required.slice().sort());
});
test('03 all constant labels agree with runtime; none auto-certify',async()=>{
  const out=await candidate();
  for(const [field,shape] of Object.entries(schema.properties)){
    if(Object.hasOwn(shape,'const'))assert.equal(out[field],shape.const,field);
    if(shape.enum)assert.ok(shape.enum.includes(out[field]),field);
  }
  assert.equal(out.remote_stop_confirmed,false);
  assert.equal(out.baseline,'NOT_APPROVED');
  assert.equal(out.decision,'HOLD');
});
test('04 exact event schema preserves identifiers and source revision',async()=>{
  const out=await candidate();
  assert.equal(out.event_id,'ev1');
  assert.equal(out.domain_id,'one');
  assert.equal(out.observed_revision,'r1');
  assert.match(out.observed_hash,/^[0-9a-f]{64}$/);
});
