'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createFileStore}=require('../testenv/loop/file-store.cjs');
const {createApi}=require('../api/mainbrain-api.cjs');
const {createHmacAuth}=require('../api/auth-adapter.cjs');
const {createPollingWorker}=require('../api/polling-worker-candidate.cjs');
const {createLocalClient}=require('../testenv/loop/local-client.cjs');
const {mintToken}=require('../testenv/loop/token.cjs');
const {createMockExecutor}=require('../testenv/loop/mock-executor.cjs');
async function setup(t){
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'brain-wire-'));t.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
 let now=Date.now();const clock=()=>new Date(now).toISOString();
 const store=createFileStore({dataDir,clock,leaseSeconds:10});
 const keys={origin:'o'.repeat(32),worker:'w'.repeat(32),stranger:'s'.repeat(32)};
 const api=createApi({store,authenticate:createHmacAuth({keys}),clock});
 const token=(endpoint_id,scopes)=>mintToken({secret:keys[endpoint_id],endpoint_id,scopes});
 const client=createLocalClient({api,tokenProvider:scopes=>token('worker',scopes)});
 const grant=store.createGrant({grant_id:'g',task_id:'T',source_endpoint_id:'origin',destination_endpoint_id:'worker',expires_at:new Date(now+86400000).toISOString()});
 await api.send({headers:{authorization:'Bearer '+token('origin',['tasks:send'])},body:{event_id:'E',task_id:'T',destination_endpoint_id:'worker',idempotency_key:'K',payload_version:'v1',payload:{instruction:'hello'}}});
 return {store,client,api,token,grant,dataDir,clock,advance:()=>now+=11000};
}
test('new worker uses authenticated local API through durable MOCK ACK and reload',async t=>{
 const {store,client,dataDir,clock}=await setup(t);
 const worker=createPollingWorker({client,performTask:createMockExecutor({store})});
 assert.equal((await worker.runOnce()).state,'processed');
 const reopened=createFileStore({dataDir,clock});const e=await reopened.get('E');
 assert.equal(e.state,'ack_received');assert.equal(e.result_kind,'MOCK');assert.equal(e.result_integrity,'ok');
 assert.ok(e.external_intent_at);assert.equal(reopened.snapshot().cost_ledger.length,1);
 assert.equal(reopened.snapshot().meta.total_cost_usd,0);
 assert.equal((await worker.runOnce()).state,'idle');
});
test('ACK transport loss after commit is read back without duplicate execution',async t=>{
 const {store,client}=await setup(t);const ack=client.ack;
 client.ack=async p=>{await ack(p);throw Error('response lost');};
 assert.equal((await createPollingWorker({client,performTask:createMockExecutor({store})}).runOnce()).state,'processed_readback');
 assert.equal(store.snapshot().cost_ledger.length,1);assert.equal((await store.get('E')).state,'ack_received');
});
test('ACK failure before commit persists evidence and blocked survives reopening',async t=>{
 const {store,client,dataDir,clock,advance}=await setup(t);client.ack=async()=>{throw Error('unavailable')};
 assert.equal((await createPollingWorker({client,performTask:createMockExecutor({store})}).runOnce()).state,'reconciliation_required');
 advance();const reopened=createFileStore({dataDir,clock});assert.deepEqual(await reopened.lease({destination_endpoint_id:'worker'}),[]);
 const e=await reopened.get('E');assert.equal(e.state,'blocked');assert.equal(e.outcome_reports.length,1);assert.match(e.outcome_reports[0].evidence_reference,/^synthetic:receipt:/);
 assert.equal(e.attempt_count,1);
});
test('expired lease is quarantined on restart without another provider dispatch',async t=>{
 const {store,client,dataDir,clock,advance}=await setup(t);const [lease]=await client.receive();
 await client.intent({event_id:'E',attempt_id:lease.current_attempt_id});advance();
 const reopened=createFileStore({dataDir,clock});assert.deepEqual(await reopened.lease({destination_endpoint_id:'worker'}),[]);
 const e=await reopened.get('E');assert.equal(e.state,'blocked');assert.equal(e.current_attempt_id,lease.current_attempt_id);assert.equal(e.attempt_count,1);
});
test('revoked grant blocks provider but permits bounded authenticated outcome report',async t=>{
 const {store,client}=await setup(t);const intent=client.intent;
 client.intent=async p=>{await intent(p);store.revokeGrant({grant_id:'g'});};
 const result=await createPollingWorker({client,performTask:async()=>assert.fail('provider forbidden')}).runOnce();
 assert.equal(result.state,'reconciliation_required');const e=await store.get('E');assert.equal(e.state,'blocked');assert.equal(e.outcome_reports.length,1);
});
test('report replay binds actor, digest and content without granting requeue',async t=>{
 const {store,client,api,token}=await setup(t);const [e]=await client.receive();
 const p={event_id:'E',attempt_id:e.current_attempt_id,payload_digest:e.payload_digest,report_id:'report-0001',reason:'execution_outcome_unknown',evidence_reference:'synthetic:receipt:ok'};
 await client.report(p);assert.equal((await client.report(p)).already_recorded,true);
 await assert.rejects(client.report({...p,evidence_reference:'synthetic:receipt:changed'}),{code:'EVENT_CONFLICT'});
 await assert.rejects(api.report({headers:{authorization:'Bearer '+token('stranger',['tasks:report'])},body:p}),{code:'EVENT_CONFLICT'});
 await assert.rejects(client.report({...p,payload_digest:'a'.repeat(64)}),{code:'EVENT_CONFLICT'});
 assert.equal((await store.get('E')).outcome_reports.length,1);assert.deepEqual(await client.receive(),[]);
});
test('preflight failure can retry but intent failure cannot silently requeue',async t=>{
 const {store,client}=await setup(t);
 const worker=createPollingWorker({client,prepareTask:async()=>{throw Error('invalid')},performTask:async()=>assert.fail('provider')});
 assert.equal((await worker.runOnce()).state,'failed_attempt');assert.equal((await store.get('E')).state,'queued');
});
test('execution without intent and unimplemented file pagination fail explicitly',async t=>{
 const {store,client}=await setup(t);const [e]=await client.receive();
 await assert.rejects(client.execute({event_id:'E',attempt_id:e.current_attempt_id,execution_evidence:'fake'}),{code:'EVENT_CONFLICT'});
 await assert.rejects(store.get('E',{limit:5}),{code:'BAD_REQUEST'});
});
