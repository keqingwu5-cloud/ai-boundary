import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGapAwareEngine,GAP_SCHEMA} from '../gap-aware-composition.mjs';
const schema=JSON.parse(readFileSync(new URL('../schemas/gap-aware-composition.preview.schema.json',import.meta.url),'utf8'));
const mk=async()=>{
 const e=createGapAwareEngine();
 await e.registerKnown({id:'A',revision:'r1',payload:{kind:'quantity',value:0,dimension:'data',unit:'bit'}});
 await e.registerGap({id:'G',revision:'r1',state:'INTENTIONALLY_OPEN'});
 return e;
};
test('SC01 schema declares candidate-only/HOLD or blocked/HOLD output',()=>{
 assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
 assert.equal(schema.oneOf.length,2);
 assert.deepEqual(schema.oneOf.map(x=>x.properties.status.const),['blocked','candidate_only']);
});
test('SC02 absent value is null and distinct from known zero',async()=>{
 const e=await mk();const unknown=e.read('G'),known=e.read('A');
 assert.equal(unknown.packet.value,null);assert.equal(unknown.packet.state,'INTENTIONALLY_OPEN');
 assert.equal(known.packet.kind,'known_source_ref');assert.equal('value' in known.packet,false);
});
test('SC03 partial output always carries blanks and forbids automatic fill',async()=>{
 const e=await mk();const res=await e.compose({inputIds:['A','G'],rule:'quantity_sum',context:{target_unit:'bit'}});
 const p=e.read(res.id).packet;
 assert.equal(p.schema,GAP_SCHEMA);assert.equal(p.kind,'partial_composition');
 assert.equal(p.automatic_fill,false);assert.equal(p.computed_value,null);
 assert.deepEqual(p.blanks.map(x=>x.state),['INTENTIONALLY_OPEN']);
});
test('SC04 schema cannot represent APPROVED or verified ACK',()=>{
 const partial=schema.oneOf[1].properties.packet.oneOf[2].properties;
 assert.equal(partial.authority.const,'none');
 assert.equal(partial.memory_approval.const,'NOT_APPROVED');
 assert.equal(partial.real_ack.const,'NOT_VERIFIED');
 assert.equal(partial.automatic_fill.const,false);
});
test('SC05 concealed source cannot surface read projection',async()=>{
 const e=await mk();await e.registerGap({id:'R',revision:'r1',state:'REDACTED'});
 const p=e.read('R');assert.equal(p.status,'blocked');assert.equal(p.packet,null);
});