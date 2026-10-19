const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../handoff-contract.js');
const resource = H.parseResourceUrl('https://github.com/keqingwu5-cloud/ai-boundary/issues/41');
function event(overrides={}) { return {schema:H.SCHEMA,task_id:'TASK-1',event_id:'EV-1',correlation_id:'COR-1',attempt_id:'ATT-1',idempotency_key:'KEY-1',source_agent_id:'GPT2',source_endpoint_id:'connector-g2',destination_agent_id:'GPT1',destination_endpoint_id:'connector-g1',payload_version:'1',payload_digest:'a'.repeat(64),user_original_goal:'Review issue',state:'candidate',resource,...overrides}; }
const ack={event_id:'EV-1',task_id:'TASK-1',payload_version:'1',payload_digest:'a'.repeat(64),endpoint_id:'connector-g1',attempt_id:'ATT-1',received_at:'2026-10-19T11:00:00Z',read_evidence:'read title and issue body'};
const trusted={verified:true,endpoint_id:'connector-g1',agent_id:'GPT1',verification_evidence:'signed endpoint identity assertion'};
test('Issue #41 is an issue, not a PR',()=>{assert.equal(resource.resource_type,'issue');assert.equal(resource.resource_id,'41');assert.equal(H.parseResourceUrl('https://github.com/keqingwu5-cloud/ai-boundary/pull/41').resource_type,'pull_request');});
test('resource type mismatch is rejected',()=>assert.throws(()=>H.validateResource({...resource,resource_type:'pull_request'}),/resource_type/));
test('repository and issue number mismatch are rejected',()=>{assert.throws(()=>H.validateResource({...resource,scope:'other/repo'}),/scope/);assert.throws(()=>H.validateResource({...resource,resource_id:'40'}),/resource_id/);});
test('unknown, non-HTTPS and noncanonical resources are rejected',()=>{for(const url of ['http://github.com/o/r/issues/41','https://evil.com/o/r/issues/41','https://github.com/o/r/issues/41?fake=1'])assert.throws(()=>H.parseResourceUrl(url));});
test('Notion URL normalizes page identity',()=>{const x=H.parseResourceUrl('https://app.notion.com/p/3fe0a4dc475c81369f5aea50d0b71273?pvs=204');assert.equal(x.resource_type,'notion_page');assert.equal(x.resource_id,'3fe0a4dc475c81369f5aea50d0b71273');});
test('event contract requires explicit destination endpoint',()=>assert.throws(()=>H.validateEvent(event({destination_endpoint_id:''})),/destination_endpoint_id/));
test('cannot claim ACK by setting state',()=>assert.throws(()=>H.validateEvent(event({state:'ack_received'})),/verified_ack/));
test('same idempotency key and same version is duplicate',()=>assert.equal(H.checkDuplicate([event()],event()).result,'duplicate'));
test('same idempotency key but changed version is conflict',()=>assert.equal(H.checkDuplicate([event()],event({payload_version:'2'})).result,'conflict'));
test('same key and version but changed payload is conflict',()=>assert.equal(H.checkDuplicate([event()],event({payload_digest:'b'.repeat(64)})).result,'conflict'));
test('digest must be SHA-256',()=>assert.throws(()=>H.validateEvent(event({payload_digest:'x'})),/payload_digest/));
test('different key is new',()=>assert.equal(H.checkDuplicate([event()],event({event_id:'EV-2',idempotency_key:'KEY-2'})).result,'new'));
test('retry preserves task/correlation and generates new attempt',()=>{const x=H.retry(event(),'EV-2','ATT-2','KEY-2');assert.equal(x.task_id,'TASK-1');assert.equal(x.correlation_id,'COR-1');assert.equal(x.retry_of,'EV-1');assert.equal(x.state,'candidate');});
test('retry cannot reuse identity',()=>assert.throws(()=>H.retry(event(),'EV-1','ATT-2','KEY-2'),/retry must/));
test('delivered requires independent evidence',()=>{assert.throws(()=>H.markDelivered(event({state:'queued'}),{verified:false,destination_endpoint_id:'connector-g1',evidence:'ok'}));assert.equal(H.markDelivered(event({state:'queued'}),{verified:true,destination_endpoint_id:'connector-g1',evidence:'webhook log'}).state,'delivered');});
test('ACK requires verified identity, not text claim',()=>{assert.throws(()=>H.acceptAck(event({state:'delivered'}),ack,{...trusted,verified:false}),/trusted/);assert.throws(()=>H.acceptAck(event({state:'delivered'}),ack,{...trusted,endpoint_id:'other'}),/identity/);});
test('ACK requires event and version match',()=>{assert.throws(()=>H.acceptAck(event({state:'delivered'}),{...ack,event_id:'EV-2'},trusted),/event_id/);assert.throws(()=>H.acceptAck(event({state:'delivered'}),{...ack,payload_version:'2'},trusted),/payload_version/);});
test('valid ACK records verified identity and evidence',()=>{const x=H.acceptAck(event({state:'delivered'}),ack,trusted);assert.equal(x.state,'ack_received');assert.equal(x.verified_ack.actor,'GPT1');assert.equal(x.verified_ack.read_evidence,ack.read_evidence);});
test('ACK blocked when not queued or delivered',()=>assert.throws(()=>H.acceptAck(event(),ack,trusted),/not permitted/));

test('lookup route dispatches Issue and PR separately',()=>{assert.equal(H.resolveLookup(resource).adapter,'github.fetch_issue');assert.equal(H.resolveLookup(H.parseResourceUrl('https://github.com/keqingwu5-cloud/ai-boundary/pull/41')).adapter,'github.get_pr_info');});
test('lookup route dispatches Notion page',()=>{assert.equal(H.resolveLookup(H.parseResourceUrl('https://app.notion.com/p/3fe0a4dc475c81369f5aea50d0b71273')).adapter,'notion.fetch');});
test('Notion URL rejects arbitrary query, fragment and path',()=>{for(const u of ['https://app.notion.com/p/3fe0a4dc475c81369f5aea50d0b71273?other=1','https://app.notion.com/p/3fe0a4dc475c81369f5aea50d0b71273#x','https://app.notion.com/p/invalid3fe0a4dc475c81369f5aea50d0b71273'])assert.throws(()=>H.parseResourceUrl(u));});
test('ACK digest mismatch rejected',()=>assert.throws(()=>H.acceptAck(event({state:'delivered'}),{...ack,payload_digest:'b'.repeat(64)},trusted),/payload_digest/));
test('ACK trusted verification evidence is mandatory',()=>assert.throws(()=>H.acceptAck(event({state:'delivered'}),ack,{...trusted,verification_evidence:''}),/verification_evidence/));
test('fabricated ack_received metadata is rejected',()=>assert.throws(()=>H.validateEvent(event({state:'ack_received',verified_ack:{event_id:'EV-1'}})),/matching verified_ack/));
test('retry removes stale delivery evidence and ack',()=>{const x=H.retry(event({state:'delivered',delivery_evidence:{evidence:'old'}}),'EV-2','ATT-2','KEY-2');assert.equal(x.delivery_evidence,null);assert.equal(x.verified_ack,null);});
test('duplicate key with changed resource is conflict',()=>assert.equal(H.checkDuplicate([event()],event({resource:H.parseResourceUrl('https://github.com/keqingwu5-cloud/ai-boundary/issues/42')})).result,'conflict'));
test('duplicate key with changed task is conflict',()=>assert.equal(H.checkDuplicate([event()],event({task_id:'TASK-2'})).result,'conflict'));
test('duplicate key with conflicting history is conflict',()=>assert.equal(H.checkDuplicate([event(),event({payload_digest:'b'.repeat(64)})],event()).result,'conflict'));
test('ACK state passes validation after accepted',()=>assert.equal(H.validateEvent(H.acceptAck(event({state:'delivered'}),ack,trusted)).state,'ack_received'));

test('same-event retry preserves event/idempotency but rotates attempt',()=>{
  const x=H.retryAttempt(event({state:'delivered',delivery_evidence:{evidence:'old'}}),'ATT-2');
  assert.equal(x.event_id,'EV-1');
  assert.equal(x.idempotency_key,'KEY-1');
  assert.equal(x.attempt_id,'ATT-2');
  assert.equal(x.retry_of_attempt,'ATT-1');
  assert.equal(x.state,'queued');
  assert.equal(x.delivery_evidence,null);
  assert.equal(x.verified_ack,null);
});
test('stale attempt ACK rejected after retry',()=>{
  const x=H.retryAttempt(event({state:'delivered'}),'ATT-2');
  assert.throws(()=>H.acceptAck({...x,state:'delivered'},ack,trusted),/attempt_id mismatch/);
});
test('ACK must contain an attempt ID',()=>{
  const {attempt_id,...unbound}=ack;
  assert.throws(()=>H.acceptAck(event({state:'delivered'}),unbound,trusted),/attempt_id mismatch/);
});
test('valid current-attempt ACK records attempt and passes validation',()=>{
  const x={...H.retryAttempt(event({state:'delivered'}),'ATT-2'),state:'delivered'};
  const y=H.acceptAck(x,{...ack,attempt_id:'ATT-2'},trusted);
  assert.equal(y.verified_ack.attempt_id,'ATT-2');
  assert.equal(H.validateEvent(y).state,'ack_received');
});
test('ack_received metadata with mismatched attempt is rejected',()=>{
  const accepted=H.acceptAck(event({state:'delivered'}),ack,trusted);
  assert.throws(()=>H.validateEvent({...accepted,verified_ack:{...accepted.verified_ack,attempt_id:'ATT-OLD'}}),/matching verified_ack/);
});
test('retry blocks reused attempts and previously accepted events',()=>{
  assert.throws(()=>H.retryAttempt(event(),'ATT-1'),/new attempt ID/);
  const accepted=H.acceptAck(event({state:'delivered'}),ack,trusted);
  assert.throws(()=>H.retryAttempt(accepted,'ATT-2'),/not permitted/);
});
