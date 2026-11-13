'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {createLocalWorkerClient}=require('./local-worker-client.cjs');
const {mintToken}=require('./token.cjs');
const {createHmacAuth}=require('../queue-wt/api/auth-adapter.cjs');
const {createApi:legacyApi}=require('../queue-wt/api/mainbrain-api.cjs');
// Required fixed-source inputs: no silent skip or replacement by mocks.
if(!process.env.CANDIDATE_API || !process.env.CANDIDATE_WORKER) throw Error('fixed candidate API and worker paths required');
const {createApi}=require(path.resolve(process.env.CANDIDATE_API));
const {createPollingWorker}=require(path.resolve(process.env.CANDIDATE_WORKER));
const secret='synthetic-local-worker-test-secret-0001';
const event={event_id:'synthetic-event',task_id:'task',current_attempt_id:'12345678-1234-1234-1234-123456789abc',payload_digest:'a'.repeat(64),payload_version:'1',payload:{},source_endpoint_id:'origin',destination_endpoint_id:'worker'};
function fixture({deny=false,scopesOverride}={}) {
  const calls=[];let state='leased';
  const record=(name,result)=>async p=>{calls.push({name,p});return result;};
  // Deliberately a recording store double, not durable storage evidence.
  const store={lease:record('lease',[event]),markExternalIntent:record('intent',{}),
    authorizeDispatch:record('authorize',{authorized:!deny}),
    markExecuted:record('execute',{}),ack:async p=>{calls.push({name:'ack',p});state='ack_received';},
    fail:record('fail',{}),recordOutcome:record('report',{}),
    get:async()=>({...event,state})};
  const api=createApi({store,authenticate:createHmacAuth({keys:{worker:secret}})});
  const requested=[];
  const client=createLocalWorkerClient({api,protocol:'intent-v1',tokenProvider:({action,scopes})=>{
    requested.push({action,scopes});return mintToken({secret,endpoint_id:'worker',scopes:scopesOverride||scopes});
  }});
  return {client,calls,requested};
}
test('new worker uses real API authentication and ordered intent/authorize/execute/ack',async()=>{
  const f=fixture();let executions=0;
  const worker=createPollingWorker({client:f.client,performTask:async()=>{executions++;return {execution_evidence:'synthetic:execution',receipt_evidence:'synthetic:receipt:ok'};}});
  assert.equal((await worker.runOnce()).state,'processed');assert.equal(executions,1);
  assert.deepEqual(f.calls.map(c=>c.name),['lease','intent','authorize','execute','ack']);
  assert.ok(f.calls.slice(1).every(c=>c.p.endpoint_id==='worker'&&c.p.attempt_id===event.current_attempt_id));
  assert.equal((await f.client.status({event_id:event.event_id})).state,'ack_received');
  assert.deepEqual(f.requested.at(-1).scopes,['tasks:status']);
});
test('denied dispatch makes zero executor calls and uses separately scoped evidence report',async()=>{
  const f=fixture({deny:true});let executions=0;
  const worker=createPollingWorker({client:f.client,performTask:async()=>{executions++;}});
  assert.equal((await worker.runOnce()).state,'reconciliation_required');assert.equal(executions,0);
  assert.deepEqual(f.calls.map(c=>c.name),['lease','intent','authorize','report']);
  assert.deepEqual(f.requested.at(-1).scopes,['tasks:report']);
  assert.equal(f.calls.at(-1).p.payload_digest,event.payload_digest);
});
test('execute scope cannot impersonate report scope',async()=>{
  const f=fixture({scopesOverride:['tasks:execute']});
  await assert.rejects(f.client.report({event_id:event.event_id,attempt_id:event.current_attempt_id,payload_digest:event.payload_digest,report_id:'r1',reason:'execution_outcome_unknown'}),{code:'UNAUTHORIZED'});
  assert.equal(f.calls.length,0);
});
test('legacy API cannot be advertised as intent protocol',()=>{
  const api=legacyApi({store:{},authenticate:async()=>null});
  assert.throws(()=>createLocalWorkerClient({api,protocol:'intent-v1',tokenProvider:()=>''}),/missing: intent,authorize,report/);
  const client=createLocalWorkerClient({api,protocol:'legacy',tokenProvider:()=>''});
  assert.equal(client.intent,undefined);
});
test('new API with an incomplete store rejects before task execution',async()=>{
  const api=createApi({store:{},authenticate:createHmacAuth({keys:{worker:secret}})});
  const client=createLocalWorkerClient({api,protocol:'intent-v1',tokenProvider:({scopes})=>mintToken({secret,endpoint_id:'worker',scopes})});
  await assert.rejects(client.intent({event_id:event.event_id,attempt_id:event.current_attempt_id}),/markExternalIntent/);
});
