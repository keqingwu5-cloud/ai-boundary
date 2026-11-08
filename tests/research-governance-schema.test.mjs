import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditBridgePreview} from '../research-governance-bridge.mjs';
const schema=JSON.parse(readFileSync(new URL('../schemas/research-governance-bridge.preview.schema.json',import.meta.url),'utf8'));
function make(){
 const p={status:'candidate_only',packet:{schema:'tcvl.claim-ref-preview.v0.1',node_id:'n1',
   claim_locator:{system:'worldModel.verify.events.v2',external_id:'r1',canonical_id:null},
   source_event_id:'ev1',journal_version:1,approval:'candidate_only',classification:'hypothesis',
   causal_relation:'not_proven',source_independently_verified:false,evidence_refs:[],
   context_relation:{type:'context_reference',from:'n1',to:'r1'}}};
 return auditBridgePreview({preview:p});
}
test('SC01 schema announces JSON Schema Draft2020-12 and exactly candidate/blocked',()=>{
 assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
 assert.equal(schema.oneOf.length,2);
 assert.deepEqual(schema.$defs.base.properties.status.enum,['candidate_only','blocked']);
});
test('SC02 packet fields match required frozen output contract',()=>{
 const p=make().packet,defined=schema.$defs.packet;
 assert.deepEqual(Object.keys(p).sort(),defined.required.slice().sort());
 assert.equal(defined.additionalProperties,false);
});
test('SC03 schema forbids synthesized approval, ACK, and causal proof',()=>{
 const packet=schema.$defs.packet.properties;
 assert.equal(packet.memory_approval.const,'NOT_APPROVED');
 assert.equal(packet.causal_certification.const,'NOT_PROVEN');
 assert.equal(packet.authority.const,'none');
 assert.equal(packet.ack.properties.status.const,'NOT_VERIFIED');
 assert.equal(schema.$defs.base.properties.decision.const,'HOLD');
});