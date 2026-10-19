'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createPostgresStore}=require('../api/pg-store-candidate.cjs');
const {createPollingWorker}=require('../api/polling-worker-candidate.cjs');
const NOW='2026-10-20T06:00:00.000Z',UUID='11111111-1111-4111-8111-111111111111';
const grant={grant_id:'G1',task_id:'T1',source_endpoint_id:'source',destination_endpoint_id:'target',
  allowed_actions:['send','receive','execute','ack'],expires_at:'2026-10-21T00:00:00Z',revoked_at:null,
  stopped:false,max_attempts:3};
const event={event_id:'EV1',task_id:'T1',source_endpoint_id:'source',destination_endpoint_id:'target',
  idempotency_key:'KEY1',payload_version:'1',payload_digest:'a'.repeat(64),payload:{text:'synthetic'},
  state:'queued',grant_id:'G1',attempt_count:0,created_at:NOW,lease_until:null,current_attempt_id:null};
function harness(onQuery) {
  const calls=[];
  const c={query:async(sql,params=[])=>{
    calls.push({sql,params});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};
    return onQuery(sql,params)||{rows:[]};
  },release:()=>calls.push({sql:'RELEASE'})};
  const pool={connect:async()=>c,query:async(sql,params)=>c.query(sql,params)};
  const store=createPostgresStore({pool,clock:()=>NOW,makeAttemptId:()=>UUID,leaseSeconds:60});
  return {store,calls,pool};
}
const has=(q,part)=>q.includes(part);
test('candidate migration requires grant+attempt history and revokes client access',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../api/persistence-candidate.sql'),'utf8');
  assert.match(sql,/mainbrain_api\.grants/);
  assert.match(sql,/mainbrain_api\.attempts/);
  assert.match(sql,/REVOKE ALL ON ALL TABLES/);
  assert.match(sql,/ADD COLUMN IF NOT EXISTS grant_id/);
});
test('store refuses a missing pg-compatible connection',()=>assert.throws(()=>createPostgresStore({}),/pool/));
test('no valid task grant rejects enqueue and rolls back without insertion',async()=>{
  const {store,calls}=harness(()=>({rows:[]}));
  await assert.rejects(store.enqueue(event),/effective task-scoped human grant/);
  assert(calls.some(c=>c.sql==='ROLLBACK'));
  assert(!calls.some(c=>has(c.sql,'INSERT INTO mainbrain_api.events')));
});
test('valid grant allows transactional enqueue with append-only event log',async()=>{
  const {store,calls}=harness(q=>{
    if(has(q,'FROM mainbrain_api.grants'))return {rows:[grant]};
    if(has(q,'INSERT INTO mainbrain_api.events'))return {rows:[event]};
    return {rows:[]};
  });
  const x=await store.enqueue(event);
  assert.equal(x.event_id,'EV1');
  assert(calls.some(c=>has(c.sql,'ON CONFLICT DO NOTHING')));
  assert(calls.some(c=>has(c.sql,'INSERT INTO mainbrain_api.event_logs')));
  assert.deepEqual(calls.filter(c=>['BEGIN','COMMIT'].includes(c.sql)).map(c=>c.sql),['BEGIN','COMMIT']);
});
test('lease claims queued work atomically with FOR UPDATE SKIP LOCKED and durable attempt',async()=>{
  const leased={...event,state:'leased',attempt_count:1,current_attempt_id:UUID,lease_until:'2026-10-20T06:01:00Z'};
  const {store,calls}=harness(q=>{
    if(has(q,'SKIP LOCKED'))return {rows:[event]};
    if(has(q,'FROM mainbrain_api.grants'))return {rows:[grant]};
    if(has(q,'UPDATE mainbrain_api.events')&&has(q,'RETURNING *'))return {rows:[leased]};
    return {rows:[]};
  });
  const leasedEvents=await store.lease({destination_endpoint_id:'target'});
  assert.equal(leasedEvents[0].current_attempt_id,UUID);
  assert(calls.some(c=>has(c.sql,'INSERT INTO mainbrain_api.attempts')));
  assert(calls.some(c=>has(c.sql,'INSERT INTO mainbrain_api.event_logs')));
  assert(calls.some(c=>c.sql==='COMMIT'));
});
test('revoked grant blocks leasing rather than running task',async()=>{
  const {store,calls}=harness(q=>{
    if(has(q,'SKIP LOCKED'))return {rows:[event]};
    if(has(q,'FROM mainbrain_api.grants'))return {rows:[{...grant,revoked_at:NOW}]};
    return {rows:[]};
  });
  assert.deepEqual(await store.lease({destination_endpoint_id:'target'}),[]);
  assert(calls.some(c=>has(c.sql,"SET state='blocked'")));
  assert(!calls.some(c=>has(c.sql,'INSERT INTO mainbrain_api.attempts')));
});
test('expired attempt quota fails task before any fresh lease',async()=>{
  const {store,calls}=harness(q=>{
    if(has(q,'SKIP LOCKED'))return {rows:[{...event,attempt_count:3}]};
    if(has(q,'FROM mainbrain_api.grants'))return {rows:[grant]};
    return {rows:[]};
  });
  assert.deepEqual(await store.lease({destination_endpoint_id:'target'}),[]);
  assert(calls.some(c=>has(c.sql,"SET state='failed'")));
});
test('stale attempt ACK is rejected before receipts or status update',async()=>{
  const e={...event,state:'executed',current_attempt_id:UUID,lease_until:'2026-10-20T06:01:00Z',attempt_count:1};
  const {store,calls}=harness(q=>{
    if(has(q,'SELECT * FROM mainbrain_api.events'))return {rows:[e]};
    if(has(q,'FROM mainbrain_api.grants'))return {rows:[grant]};
    return {rows:[]};
  });
  await assert.rejects(store.ack({event_id:'EV1',attempt_id:'22222222-2222-4222-8222-222222222222',
    endpoint_id:'target',payload_digest:e.payload_digest,payload_version:'1',receipt_evidence:'X',channel:'api'}),/invalid attempt/);
  assert(calls.some(c=>c.sql==='ROLLBACK'));
  assert(!calls.some(c=>has(c.sql,'INSERT INTO mainbrain_api.receipts')));
});
test('valid ACK records receipt, status and event log in one transaction',async()=>{
  const e={...event,state:'executed',current_attempt_id:UUID,lease_until:'2026-10-20T06:01:00Z',attempt_count:1};
  const {store,calls}=harness(q=>{
    if(has(q,'SELECT * FROM mainbrain_api.events'))return {rows:[e]};
    if(has(q,'FROM mainbrain_api.grants'))return {rows:[grant]};
    if(has(q,'UPDATE mainbrain_api.events'))return {rows:[{...e,state:'ack_received'}]};
    return {rows:[]};
  });
  const result=await store.ack({event_id:'EV1',attempt_id:UUID,endpoint_id:'target',
    payload_digest:e.payload_digest,payload_version:'1',receipt_evidence:'ref',channel:'api'});
  assert.equal(result.state,'ack_received');
  assert(calls.some(c=>has(c.sql,'INSERT INTO mainbrain_api.receipts')));
  assert(calls.some(c=>has(c.sql,'INSERT INTO mainbrain_api.event_logs')));
  assert(calls.some(c=>c.sql==='COMMIT'));
});
test('ACK rejects an expired or revoked grant',async()=>{
  const e={...event,state:'leased',current_attempt_id:UUID,lease_until:'2026-10-20T06:01:00Z'};
  const {store,calls}=harness(q=>{
    if(has(q,'SELECT * FROM mainbrain_api.events'))return {rows:[e]};
    if(has(q,'FROM mainbrain_api.grants'))return {rows:[{...grant,stopped:true}]};
    return {rows:[]};
  });
  await assert.rejects(store.ack({event_id:'EV1',attempt_id:UUID,endpoint_id:'target',
    payload_digest:e.payload_digest,payload_version:'1',receipt_evidence:'ref',channel:'api'}),/grant revoked/);
  assert(!calls.some(c=>has(c.sql,'INSERT INTO mainbrain_api.receipts')));
});
test('worker idle mode never creates phantom results',async()=>{
  const calls=[];
  const w=createPollingWorker({client:{
    receive:async()=>[],execute:async()=>calls.push('execute'),
    ack:async()=>calls.push('ack'),fail:async()=>calls.push('fail')
  },performTask:async()=>({execution_evidence:'ok',receipt_evidence:'ok'})});
  assert.deepEqual(await w.runOnce(),{state:'idle'});
  assert.deepEqual(calls,[]);
});
test('worker executes current attempt then returns API ACK',async()=>{
  const calls=[];
  const client={
    receive:async()=>[{...event,state:'leased',current_attempt_id:UUID}],
    execute:async p=>calls.push(['execute',p]),
    ack:async p=>calls.push(['ack',p]),
    fail:async p=>calls.push(['fail',p])
  };
  const w=createPollingWorker({client,performTask:async x=>{
    assert.equal(x.attempt_id,UUID);
    return {execution_evidence:'synthetic-execution',receipt_evidence:'synthetic-receipt'};
  }});
  const result=await w.runOnce();
  assert.equal(result.state,'processed');
  assert.deepEqual(calls.map(x=>x[0]),['execute','ack']);
  assert.equal(calls[1][1].payload_digest,event.payload_digest);
});
test('worker reports handler failure without acknowledging work',async()=>{
  const calls=[];
  const client={
    receive:async()=>[{...event,current_attempt_id:UUID}],
    execute:async()=>calls.push('execute'),ack:async()=>calls.push('ack'),
    fail:async()=>calls.push('fail')
  };
  const w=createPollingWorker({client,performTask:async()=>{throw Error('failed');}});
  assert.equal((await w.runOnce()).state,'failed_attempt');
  assert.deepEqual(calls,['fail']);
});
test('worker refuses receipt-free output and fails closed on unrecorded failure',async()=>{
  const client={
    receive:async()=>[{...event,current_attempt_id:UUID}],
    execute:async()=>{throw Error('should not execute');},
    ack:async()=>{throw Error('should not acknowledge');},
    fail:async()=>{throw Error('persistent receipt unavailable');}
  };
  const w=createPollingWorker({client,performTask:async()=>({execution_evidence:'x'})});
  await assert.rejects(w.runOnce(),/persistent receipt unavailable/);
});
