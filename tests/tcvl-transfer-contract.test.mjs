import test from 'node:test';
import assert from 'node:assert/strict';
import {
 defaultManifest,validateManifest,directionDefaults,validateDirectionConfig,
 draftMessage,validateEnvelope,resolveInbound,resolveOutbound,
 receiptDecision,transition,explainTransfer
} from '../tcvl-transfer-contract.mjs';

const UUID={
 message_id:'11111111-1111-4111-8111-111111111111',
 correlation_id:'22222222-2222-4222-8222-222222222222',
 project_id:'33333333-3333-4333-8333-333333333333',
 task_id:'44444444-4444-4444-8444-444444444444'
};
const build=(dir='inbound',overrides={})=>draftMessage({
 ...UUID,connector_id:'gpt1-manual',direction:dir,
 event_type:dir==='inbound'?'result':'task',
 payload_schema:dir==='inbound'?'tcvl.result.v1':'tcvl.task.v1',
 created_at:'2026-10-15T13:30:00.000Z',payload:{id:'demo'},attempt:0,...overrides
});
const enable=(cfg,mode='manual')=>({...cfg,enabled:true,mode});
test('fresh manifest has distinct inbound and outbound rules disabled',()=>{
 const m=defaultManifest('gpt1-manual','GPT①','ai-role');
 assert.deepEqual(validateManifest(m),[]);
 assert.notStrictEqual(m.inbound,m.outbound);
 assert.notDeepEqual(m.inbound.allowed_event_types,m.outbound.allowed_event_types);
 assert.equal(m.inbound.enabled,false);assert.equal(m.outbound.enabled,false);
});
test('manual outbound may be enabled without automatically enabling inbound',()=>{
 const m=defaultManifest('gpt1-manual','GPT①','ai-role');
 m.status='configured';m.outbound.enabled=true;
 assert.deepEqual(validateManifest(m),[]);
 assert.equal(m.inbound.enabled,false);
});
test('network channel cannot be marked online from unreviewed manifest',()=>{
 const m=defaultManifest();m.status='configured';m.inbound.enabled=true;m.inbound.mode='https';
 assert.ok(validateManifest(m).some(e=>e.includes('unreviewed_network_connector_forbidden')));
});
test('unknown manifest keys and tokens are forbidden',()=>{
 const m=defaultManifest();m.api_token='secret';
 assert.ok(validateManifest(m).includes('unknown_manifest_field'));
});
test('source verification and human approval cannot be disabled on enabled directions',()=>{
 const c=enable(directionDefaults('inbound'));c.require_source_verification=false;
 assert.ok(validateDirectionConfig(c,'inbound').includes('review_and_source_verification_required'));
});
test('manual transport cannot request automatic retries',()=>{
 const c=enable(directionDefaults('outbound'));c.retry.max_attempts=2;
 assert.ok(validateDirectionConfig(c,'outbound').includes('manual_retry_must_be_zero'));
});
test('safe field mappings differ by direction and duplicates are invalid',()=>{
 const m=defaultManifest();
 m.inbound.field_map=[{source:'external_id',target:'task_id'}];
 m.outbound.field_map=[{source:'task_id',target:'external_id'}];
 assert.deepEqual(validateManifest(m),[]);
 m.inbound.field_map.push({source:'another',target:'task_id'});
 assert.ok(validateManifest(m).some(e=>e.includes('field_map_invalid')));
});
test('field mapping cannot inject code or unsupported fields',()=>{
 const c=directionDefaults('inbound');c.field_map=[{source:'__proto__.constructor()',target:'task_id'}];
 assert.ok(validateDirectionConfig(c,'inbound').includes('field_map_invalid'));
});
test('message preserves correlation, task, provenance and starts draft',()=>{
 const r=build();
 assert.equal(r.ok,true);assert.equal(r.value.status,'draft');assert.equal(r.value.provenance.verified_source,false);
 assert.equal(r.value.correlation_id,UUID.correlation_id);assert.equal(r.value.task_id,UUID.task_id);
 assert.deepEqual(validateEnvelope(r.value),[]);
});
test('invalid IDs, times and empty payloads are refused',()=>{
 assert.equal(build('inbound',{project_id:'bad'}).ok,false);
 assert.equal(build('inbound',{created_at:'yesterday'}).ok,false);
 assert.equal(build('inbound',{payload:{}}).ok,false);
});
test('disabled inbound and outbound channels block without side effects',()=>{
 assert.equal(resolveInbound(directionDefaults('inbound'),build('inbound').value).decision,'blocked');
 assert.equal(resolveOutbound(directionDefaults('outbound'),build('outbound').value).decision,'blocked');
});
test('unverified inbound is quarantined, not committed to memory',()=>{
 const c=enable(directionDefaults('inbound'));const result=resolveInbound(c,build('inbound').value);
 assert.equal(result.decision,'quarantine');assert.ok(result.errors.includes('source_unverified'));
});
test('verified inbound remains awaiting human review, not automatically approved',()=>{
 const c=enable(directionDefaults('inbound'));const value=build('inbound').value;
 value.provenance.verified_source=true;
 assert.equal(resolveInbound(c,value).decision,'awaiting_human_review');
});
test('outbound starts with source verification, then human approval',()=>{
 const c=enable(directionDefaults('outbound'));const e=build('outbound').value;
 assert.equal(resolveOutbound(c,e).decision,'awaiting_source_verification');
 e.provenance.verified_source=true;
 assert.equal(resolveOutbound(c,e).decision,'awaiting_human_approval');
});
test('channel direction, event type and schema cannot silently be mixed',()=>{
 const c=enable(directionDefaults('inbound'));
 assert.equal(resolveInbound(c,build('outbound').value).decision,'invalid');
 let e=build('inbound',{event_type:'status'}).value;
 assert.equal(resolveInbound(c,e).decision,'quarantine');
 e=build('inbound',{payload_schema:'tcvl.evidence.v1'}).value;
 assert.ok(resolveInbound(c,e).errors.includes('inbound_payload_schema_mismatch'));
});
test('message payload over channel maximum is held',()=>{
 const c=enable({...directionDefaults('inbound'),max_bytes:1024});
 const e=build('inbound',{payload:{huge:'x'.repeat(2000)}}).value;
 e.provenance.verified_source=true;
 assert.ok(resolveInbound(c,e).errors.includes('payload_size_exceeded'));
});
test('received does not equal processed; invalid transition blocked',()=>{
 assert.equal(transition('sent','accepted').ok,true);
 assert.equal(transition('accepted','processed').ok,false);
 assert.equal(transition('processed','running').ok,false);
});
test('stop requested does not certify remote stopped',()=>{
 assert.equal(transition('sent','stop_requested').ok,true);
 assert.equal(transition('stop_requested','stopped').ok,true);
 assert.equal(transition('stop_requested','processed').ok,true);
});
test('a claimed but unverified receipt cannot claim delivery',()=>{
 const r=receiptDecision({previous_status:'sent',next_status:'accepted',receipt_message_id:UUID.message_id,
  correlation_id:UUID.correlation_id,claimed_source:'AI',verified_source:false});
 assert.deepEqual(r,{ok:false,reason:'receipt_source_unverified'});
});
test('rejection has immediate reason, impact and next action',()=>{
 const bad=receiptDecision({previous_status:'accepted',next_status:'rejected',receipt_message_id:UUID.message_id,
  correlation_id:UUID.correlation_id,claimed_source:'AI',verified_source:true});
 assert.equal(bad.ok,false);
 const good=receiptDecision({previous_status:'accepted',next_status:'rejected',receipt_message_id:UUID.message_id,
  correlation_id:UUID.correlation_id,claimed_source:'AI',verified_source:true,reason:'Missing evidence',
  impact:'Affects dependent task',next_action:'Request sources'});
 assert.equal(good.ok,true);assert.equal(good.rejected_alert,true);
});
test('result explanation does not misrepresent status as factual verification',()=>{
 assert.match(explainTransfer(build('inbound').value).disclaimer,/不等於內容經過事實查證/);
});
