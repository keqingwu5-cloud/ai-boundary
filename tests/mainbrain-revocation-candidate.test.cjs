'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPostgresStore}=require('../api/pg-store-candidate.cjs');
const {createPollingWorker}=require('../api/polling-worker-candidate.cjs');
const UUID='11111111-1111-4111-8111-111111111111',NOW='2026-10-20T06:00:00.000Z';
const validGrant={grant_id:'G1',task_id:'T1',source_endpoint_id:'source',destination_endpoint_id:'target',
 allowed_actions:['send','receive','execute','ack'],expires_at:'2026-10-21T00:00:00Z',revoked_at:null,stopped:false,max_attempts:3};
const row={event_id:'EV1',task_id:'T1',source_endpoint_id:'source',destination_endpoint_id:'target',
 payload_digest:'a'.repeat(64),payload_version:'1',payload:{x:'test'},
 state:'leased',grant_id:'G1',current_attempt_id:UUID,
 lease_until:'2026-10-20T06:01:00.000Z',external_intent_at:NOW,attempt_count:1};
function harness(handle){
 const calls=[];
 const c={query:async(sql,params=[])=>{calls.push({sql,params});if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};return handle(sql,params)||{rows:[]};},release:()=>{}};
 const pool={connect:async()=>c,query:async(sql,params)=>c.query(sql,params)};
 return {store:createPostgresStore({pool,clock:()=>NOW}),calls};
}
test('P0-A dispatch authorization refuses revoked grant after committed intent',async()=>{
 const revoked={...validGrant,revoked_at:'2026-10-20T05:59:59.000Z'};
 const {store,calls}=harness(sql=>{
   if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
   if(sql.includes('FROM mainbrain_api.grants'))return {rows:[revoked]};
   return {rows:[]};
 });
 await assert.rejects(store.authorizeDispatch({event_id:'EV1',attempt_id:UUID,endpoint_id:'target'}),/grant revoked/);
 assert(calls.some(x=>x.sql==='ROLLBACK'));
 assert(!calls.some(x=>x.sql.includes('SET state=')||x.sql.includes('INSERT INTO mainbrain_api.receipts')));
});
test('P0-A worker never calls provider if last pre-dispatch authorization fails',async()=>{
 const calls=[],forbidden=Object.assign(Error('revoked'),{code:'FORBIDDEN'});
 const client={
  receive:async()=>[{...row}],intent:async()=>{calls.push('intent');},
  authorize:async()=>{calls.push('authorize');throw forbidden;},
  execute:async()=>{calls.push('execute');},ack:async()=>{calls.push('ack');},
  fail:async()=>{calls.push('fail');throw forbidden;},
  report:async p=>{calls.push('report:'+p.reason);return {state:'blocked'};},
  status:async()=>({state:'leased',current_attempt_id:UUID})
 };
 const w=createPollingWorker({client,performTask:async()=>{calls.push('provider');throw Error('should not run');}});
 const result=await w.runOnce();
 assert.equal(result.state,'reconciliation_required');
 assert.deepEqual(calls,['intent','authorize','report:dispatch_authorization_unconfirmed']);
});
test('P0-C reporting after grant revocation records bounded evidence without granting execution',async()=>{
 const revoked={...validGrant,revoked_at:'2026-10-20T05:59:59.000Z'};
 const report={event_id:'EV1',attempt_id:UUID,endpoint_id:'target',
  payload_digest:row.payload_digest,report_id:'outcome-'+UUID,
  reason:'execution_outcome_unknown',evidence_reference:'receipt:synthetic'};
 const saved={...report};
 const {store,calls}=harness((sql)=>{
  if(sql.includes('SELECT * FROM mainbrain_api.events'))return {rows:[row]};
  if(sql.includes('FROM mainbrain_api.grants'))return {rows:[revoked]};
  if(sql.includes('INSERT INTO mainbrain_api.outcome_reports'))return {rows:[saved]};
  if(sql.includes("SET state='blocked'"))return {rows:[{...row,state:'blocked'}]};
  return {rows:[]};
 });
 const result=await store.recordOutcome(report);
 assert.equal(result.state,'blocked');
 assert.equal(result.recorded,true);
 assert(calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.outcome_reports')));
 assert(calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.event_logs')));
 assert(!calls.some(x=>x.sql.includes('FROM mainbrain_api.grants')));
 assert(!calls.some(x=>x.sql.includes("SET state='queued'")||x.sql.includes('INSERT INTO mainbrain_api.attempts')));
});
test('P0-C forged or stale destination cannot append evidence',async()=>{
 const {store,calls}=harness(sql=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
  return {rows:[]};
 });
 const data={event_id:'EV1',attempt_id:UUID,endpoint_id:'fake',
  payload_digest:row.payload_digest,report_id:'outcome-'+UUID,reason:'execution_outcome_unknown'};
 await assert.rejects(store.recordOutcome(data),/attempt|endpoint/);
 await assert.rejects(store.recordOutcome({...data,endpoint_id:'target',attempt_id:'22222222-2222-4222-8222-222222222222'}),/attempt|endpoint/);
 assert(!calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.outcome_reports')));
});
test('P0-C report idempotency returns original record but rejects changed replay',async()=>{
 const original={event_id:'EV1',attempt_id:UUID,endpoint_id:'target',payload_digest:row.payload_digest,
  report_id:'outcome-'+UUID,reason:'execution_outcome_unknown',evidence_reference:'receipt:1'};
 const {store,calls}=harness(sql=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[{...row,state:'blocked'}]};
  if(sql.includes('INSERT INTO mainbrain_api.outcome_reports'))return {rows:[]};
  if(sql.includes('FROM mainbrain_api.outcome_reports'))return {rows:[original]};
  return {rows:[]};
 });
 const result=await store.recordOutcome(original);
 assert.equal(result.recorded,true);
 await assert.rejects(store.recordOutcome({...original,evidence_reference:'receipt:tampered'}),/CONFLICT|conflict|changed/i);
 assert(!calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.event_logs')));
});
test('P0-C outcome reporting cannot accept arbitrary reasons, oversized evidence or missing digest',async()=>{
 const {store,calls}=harness(()=>({rows:[]}));
 for(const p of [
 {reason:'grant_admin_write'},
 {reason:'execution_outcome_unknown',evidence_reference:'X'.repeat(513)},
 {reason:'execution_outcome_unknown',payload_digest:''}
 ]){
  await assert.rejects(store.recordOutcome({event_id:'EV1',attempt_id:UUID,
   endpoint_id:'target',report_id:'outcome-'+UUID,payload_digest:row.payload_digest,...p}),/reason|evidence|digest|request/i);
 }
 assert.equal(calls.length,0);
});
