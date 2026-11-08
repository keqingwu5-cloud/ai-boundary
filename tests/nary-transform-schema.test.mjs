import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTypedTransformEngine,TRANSFORM_SCHEMA} from '../nary-transform.mjs';
const schema=JSON.parse(readFileSync(new URL('../schemas/nary-transform.preview.schema.json',import.meta.url),'utf8'));
test('S01 schema is draft 2020-12 and fixes candidate / HOLD authority',()=>{
 assert.match(schema.$schema,/2020-12/);
 assert.equal(schema.properties.status.const,'candidate_only');
 assert.equal(schema.properties.decision.const,'HOLD');
 assert.equal(schema.properties.packet.properties.authority.const,'none');
 assert.equal(schema.properties.packet.properties.memory_approval.const,'NOT_APPROVED');
 assert.equal(schema.properties.packet.properties.real_ack.const,'NOT_VERIFIED');
});
test('S02 live typed adapter output matches stable top-level contract',async()=>{
 const e=createTypedTransformEngine();
 for(const id of ['A','B'])assert.equal((await e.registerSource({id,revision:'r1',payload:{kind:'quantity',dimension:'data',unit:'bit',value:8}})).status,'registered');
 const x=await e.transform({inputIds:['A','B'],rule:'quantity_sum',context:{target_unit:'bit'}});
 const view=e.read(x.id);
 assert.equal(view.packet.schema,TRANSFORM_SCHEMA);
 assert.deepEqual(Object.keys(view).sort(),['decision','packet','status']);
 assert.equal(view.packet.typed_result.value.numerator,'16');
 assert.equal(view.packet.typed_result.value.denominator,'1');
 assert.equal(view.packet.authority,'none');
});
test('S03 trusted approval/ACK cannot be injected into public wrapper fields',async()=>{
 const e=createTypedTransformEngine();
 for(const id of ['A','B'])await e.registerSource({id,revision:'r1',payload:{kind:'quantity',dimension:'duration',unit:'ms',value:4}});
 const x=await e.transform({inputIds:['A','B'],rule:'quantity_sum',context:{target_unit:'ms'}});
 const data=e.read(x.id);
 assert.equal(data.packet.real_ack,'NOT_VERIFIED');
 assert.equal(data.packet.memory_approval,'NOT_APPROVED');
 assert.equal(Object.hasOwn(data.packet,'approved'),false);
});