import test from 'node:test';
import assert from 'node:assert/strict';
import {auditBridgePreview,authorizeAuthorityMutation,instant,BRIDGE_SCHEMA} from '../research-governance-bridge.mjs';
function preview(){return {status:'candidate_only',packet:{
 schema:'tcvl.claim-ref-preview.v0.1',node_id:'n1',
 claim_locator:{system:'worldModel.verify.events.v2',external_id:'research1',canonical_id:null},
 source_event_id:'w2-sim-1',journal_version:1,approval:'candidate_only',
 classification:'hypothesis',causal_relation:'not_proven',source_independently_verified:false,
 evidence_refs:[],context_relation:{type:'context_reference',from:'n1',to:'research1'}
}};}
const build=(over={})=>auditBridgePreview({preview:preview(),...over});
const reason=(v,r)=>assert.ok(v.reason_codes.includes(r),JSON.stringify(v));
test('BR01 preserve source preview and no writes',()=>{
 const p=preview();const before=JSON.stringify(p);
 const out=auditBridgePreview({preview:p});
 assert.equal(JSON.stringify(p),before);
 assert.equal(out.status,'candidate_only');assert.equal(out.packet.schema,BRIDGE_SCHEMA);
});
test('BR02 Node ID distinct from source record ID and Claim ID absent',()=>{
 const p=build().packet;
 assert.notEqual(p.node_id,p.source_record_id);assert.equal(p.claim_id,null);
});
test('BR03 context link never becomes causation',()=>{
 const p=build().packet;
 assert.equal(p.context_relation.type,'context_reference');assert.equal(p.causal_certification,'NOT_PROVEN');
});
test('BR04 reference frame preserved, invalid rejected',()=>{
 const a=build({referenceFrame:{comparison_metric:'height',observer:'lab',population:'class1'}});
 assert.equal(a.packet.reference_frame.comparison_metric,'height');
 reason(build({referenceFrame:{unrecognized:'x'}}),'REFERENCE_FRAME_INVALID');
});
test('BR05 timezone-aware as-of checks',()=>{
 const a=build({asOf:'2026-11-08T00:00:00Z',sourceAvailableAt:'2026-11-08T07:30:00+08:00'});
 assert.equal(a.status,'candidate_only');
 reason(build({asOf:'2026-11-08T00:00:00Z',sourceAvailableAt:'2026-11-07T20:00:00-05:00'}),'SOURCE_NOT_AVAILABLE_AS_OF');
});
test('BR06 original source event and revision retained',()=>{
 const p=build().packet;assert.equal(p.source_event_id,'w2-sim-1');assert.equal(p.journal_version,1);
});
test('BR07 independent evidence and approval cannot be manufactured',()=>{
 const a=build();assert.equal(a.decision,'HOLD');reason(a,'NO_INDEPENDENT_EVIDENCE');
 assert.equal(a.packet.source_independently_verified,false);
});
test('BR08 two scenario references are not new evidence',()=>{
 const a=build({scenarioIds:['scenario-a','scenario-b']});
 assert.deepEqual(a.packet.scenario_ids,['scenario-a','scenario-b']);assert.deepEqual(a.packet.evidence_refs,[]);
});
test('BR09 no memory or production mutation authorization',()=>{
 const a=build();assert.equal(a.packet.memory_approval,'NOT_APPROVED');
 reason(authorizeAuthorityMutation(a),'BRIDGE_PREVIEW_HAS_NO_WRITE_AUTHORITY');
});
test('BR10 claimed ACK fails closed',()=>reason(build({claimedAck:{status:'ACK',receiver:'gpt2'}}),'CLAIMED_ACK_NOT_AUTHENTICATED'));
test('BR11 unknown version, source identity and relation rejected',()=>{
 for(const k of ['claim_locator','context_relation','source_event_id','journal_version']){
  const x=preview();x.packet[k]= k==='source_event_id'?'':k==='journal_version'?0:{};
  reason(auditBridgePreview({preview:x}),'SOURCE_CONTRACT_INVALID');
 }
 reason(build({relationDomain:'causes'}),'RELATION_DOMAIN_UNKNOWN');
});
test('BR12 caller data is immutable after invalid input',()=>{
 const p=preview();const b=JSON.stringify(p);
 reason(auditBridgePreview({preview:p,asOf:'2026-02-31T00:00:00Z'}),'TIME_INVALID_OR_OFFSET_MISSING');
 assert.equal(JSON.stringify(p),b);
});
test('BR13 source preview not linked rejected',()=>reason(auditBridgePreview({preview:{status:'blocked'}}),'SOURCE_PREVIEW_NOT_LINKED'));
test('BR14 no approval even when source time is before cutoff',()=>{
 const a=build({asOf:'2026-11-08T12:00:00Z',sourceAvailableAt:'2026-11-08T11:00:00Z'});
 assert.equal(a.decision,'HOLD');reason(a,'SOURCE_AVAILABILITY_NOT_INDEPENDENTLY_VERIFIED');
});
test('BR15 prospective production read path has no writer',()=>{
 assert.equal(build().packet.proposed_operation,'READ_ONLY_RESEARCH_PREVIEW');
 assert.equal(typeof authorizeAuthorityMutation,'function');
});
test('time parser rejects missing offset and invalid calendar',()=>{
 assert.equal(instant('2026-11-08T12:00:00'),null);
 assert.equal(instant('2026-02-31T12:00:00Z'),null);
 assert.equal(instant('2026-11-08T12:00:00+15:00'),null);
 assert.equal(instant('2026-11-08T12:00:00+08:00'),Date.parse('2026-11-08T04:00:00Z'));
});
test('scenario ID duplicates rejected',()=>reason(build({scenarioIds:['s1','s1']}),'SCENARIOS_INVALID'));
test('nonempty evidence refs from external preview cannot be laundered',()=>{
 const p=preview();p.packet.evidence_refs=['e1'];
 reason(auditBridgePreview({preview:p}),'SOURCE_CONTRACT_INVALID');
});