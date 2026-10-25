'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const room=require('../tcvl-data-room-core.js'),contract=require('../handoff-contract.js'),adapter=require('../tcvl-handoff-adapter.js');
const at='2026-10-16T07:00:00.000Z';
function fixture(){
 let r=room.createRoom({projectId:'p1',batchId:'b1',title:'sandbox',at});
 r=room.registerOriginal(r,{id:'src1',title:'test',locator:'PRIVATE-REF',custodian:'human',version:'v1',at,eventId:'e1'});
 r=room.assign(r,{roleId:'GPT2',owner:'human',duty:'review',reviewer:'human2',at,eventId:'e2'});
 r=room.submit(r,{id:'sub1',roleId:'GPT2',originalIds:['src1'],source:'manual',summary:'summary',evidence:'evidence',gaps:'unknown',next:'review',at,eventId:'e3'});
 return r;
}
const opts=()=>({permission_verified:true,policy_verified:true,task_id:'task1',event_id:'evt1',correlation_id:'corr1',attempt_id:'att1',idempotency_key:'key1',source_agent_id:'GPT1',source_endpoint_id:'source',destination_agent_id:'GPT2',destination_endpoint_id:'dest',payload_version:'v1',payload_digest:'a'.repeat(64),user_original_goal:'audit',resource_url:'https://github.com/keqingwu5-cloud/ai-boundary/issues/56'});
function approved(){return room.review(fixture(),{submissionId:'sub1',decision:'approved_for_archive',reviewer:'human2',reason:'verified',impact:'none',next:'candidate',at,eventId:'e4'});}
test('positive: approved metadata maps to valid candidate, never ACK',()=>{const r=approved(),out=adapter.convert(r,'sub1',opts());assert.equal(contract.validateEvent(out.event),out.event);assert.equal(out.event.state,'candidate');assert.equal(out.audit.ack_status,'unverified');assert.equal(r.submissions[0].reviewState,'approved_for_archive');});
test('negative: pending or rejected review blocked',()=>{assert.throws(()=>adapter.convert(fixture(),'sub1',opts()),/review/);const r=room.review(fixture(),{submissionId:'sub1',decision:'rejected',reviewer:'human2',reason:'bad',impact:'risk',next:'retry',at,eventId:'e4'});assert.throws(()=>adapter.convert(r,'sub1',opts()),/review/);});
test('negative: missing permission or policy blocked',()=>{assert.throws(()=>adapter.convert(approved(),'sub1',{...opts(),permission_verified:false}),/authorization/);assert.throws(()=>adapter.convert(approved(),'sub1',{...opts(),policy_verified:false}),/authorization/);});
test('negative: wrong resource type and digest blocked',()=>{assert.throws(()=>adapter.convert(approved(),'sub1',{...opts(),resource_url:'https://github.com/a/b/blob/1'}),/URL/);assert.throws(()=>adapter.convert(approved(),'sub1',{...opts(),payload_digest:'bad'}),/digest/);});
test('legacy: original PR28 room remains unchanged',()=>{const r=approved(),snapshot=JSON.stringify(r);adapter.convert(r,'sub1',opts());assert.equal(JSON.stringify(r),snapshot);});
test('cross-module: duplicate and conflict detected',()=>{const e=adapter.convert(approved(),'sub1',opts()).event;assert.equal(contract.checkDuplicate([e],e).result,'duplicate');assert.equal(contract.checkDuplicate([e],{...e,payload_digest:'b'.repeat(64)}).result,'conflict');});
test('cross-module: manual report cannot be accepted as trusted ACK',()=>{const e=adapter.convert(approved(),'sub1',opts()).event;assert.throws(()=>contract.acceptAck(e,{event_id:e.event_id},{}),/trusted/);assert.throws(()=>contract.markDelivered(e,{verified:true,destination_endpoint_id:'dest',evidence:'manual'}),/queued/);});
test('cross-module: retry remains candidate and resets ACK',()=>{const e=adapter.convert(approved(),'sub1',opts()).event;const r=contract.retry(e,'evt2','att2','key2');assert.equal(r.state,'candidate');assert.equal(r.verified_ack,null);assert.equal(r.retry_of,'evt1');});
