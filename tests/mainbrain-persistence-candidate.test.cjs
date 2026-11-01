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
    if(has(q,'WITH stale AS'))return {rows:[]};
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
    if(has(q,'WITH stale AS'))return {rows:[]};
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
    if(has(q,'WITH stale AS'))return {rows:[]};
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
  const w=createPollingWorker({client,
    prepareTask:async()=>{throw Error('local input failed');},
    performTask:async()=>{throw Error('must not call external handler');}});
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

test('HTTP worker client only accepts secure service roots',()=>{
  const {createHttpTaskClient}=require('../api/http-task-client-candidate.cjs');
  for(const url of ['http://api.example.com/','https://api.example.com/path',
    'https://user:pass@api.example.com/']) {
    assert.throws(()=>createHttpTaskClient({baseUrl:url,tokenProvider:async()=> 'x',httpFetch:async()=>{}}),/HTTPS service root/);
  }
});
test('HTTP worker client transmits scoped bearer token without exposing it in result',async()=>{
  const {createHttpTaskClient}=require('../api/http-task-client-candidate.cjs');
  const calls=[];
  const client=createHttpTaskClient({baseUrl:'https://api.example.com/',
    tokenProvider:async action=>'signed-'+action,
    httpFetch:async(url,options)=>{
      calls.push({url,options});
      return {ok:true,json:async()=>({data:[]})};
    }});
  assert.deepEqual(await client.receive(),[]);
  assert.equal(calls[0].url,'https://api.example.com/v1/tasks/receive');
  assert.equal(calls[0].options.headers.authorization,'Bearer signed-receive');
  assert.equal(calls[0].options.method,'POST');
});
test('HTTP worker client rejects missing credentials and server denial',async()=>{
  const {createHttpTaskClient}=require('../api/http-task-client-candidate.cjs');
  const uncredentialed=createHttpTaskClient({baseUrl:'https://api.example.com/',
    tokenProvider:async()=>'',httpFetch:async()=>{throw Error('should not fetch');}});
  await assert.rejects(uncredentialed.receive(),/authenticated token/);
  const forbidden=createHttpTaskClient({baseUrl:'https://api.example.com/',
    tokenProvider:async()=> 'fake',httpFetch:async()=>({ok:false,json:async()=>({error:'FORBIDDEN'})})});
  await assert.rejects(forbidden.receive(),e=>e.code==='FORBIDDEN');
});

// This batch is safety-focused and does not use a real model or service.
test('uncertain ACK quarantines once; external handler is not retried',async()=>{
 const log=[];
 const client={receive:async()=>[{...event,current_attempt_id:UUID}],
   execute:async()=>log.push('execute'),
   ack:async()=>{log.push('ack');throw Error('ack timeout');},
   status:async()=>({state:'executed',current_attempt_id:UUID}),
   fail:async p=>log.push('fail:'+p.reason)};
 const w=createPollingWorker({client,performTask:async task=>{
   assert.match(task.execution_idempotency_key,/^[0-9a-f]{64}$/);
   log.push('model');return {execution_evidence:'e',receipt_evidence:'r'};
 }});
 assert.equal((await w.runOnce()).state,'reconciliation_required');
 assert.deepEqual(log,['model','execute','ack','fail:reconciliation_required']);
});
test('ACK transport timeout with committed receipt is confirmed by bound readback',async()=>{
 const log=[];
 const client={receive:async()=>[{...event,current_attempt_id:UUID}],
   execute:async()=>log.push('execute'),ack:async()=>{throw Error('timeout');},
   status:async()=>({...event,current_attempt_id:UUID,state:'ack_received'}),
   fail:async()=>log.push('fail')};
 const w=createPollingWorker({client,performTask:async()=>({execution_evidence:'e',receipt_evidence:'r'})});
 assert.equal((await w.runOnce()).state,'processed_readback');
 assert(!log.includes('fail'));
});
test('unconfirmed failure receipt throws P0, never reports processed',async()=>{
 const logs=[];
 const client={receive:async()=>[{...event,current_attempt_id:UUID}],
   execute:async()=>{},ack:async()=>{throw Error('timeout');},
   status:async()=>{throw Error('status unavailable');},
   fail:async()=>{throw Error('fail unavailable')}};
 const w=createPollingWorker({client,logger:x=>logs.push(x),
   performTask:async()=>({execution_evidence:'e',receipt_evidence:'r'})});
 await assert.rejects(w.runOnce(),/fail unavailable/);
 assert(logs.some(x=>x.action==='p0_failure_receipt_unconfirmed'));
});
test('store lease quarantines expired attempts and emits one durable alert record',async()=>{
 const expired={...event,state:'leased',current_attempt_id:UUID,lease_until:'2026-10-20T05:59:00Z'};
 const {store,calls}=harness(q=>{
   if(has(q,'WITH stale AS'))return {rows:[expired]};
   if(has(q,"state='queued'"))return {rows:[]};
   return {rows:[]};
 });
 assert.deepEqual(await store.lease({destination_endpoint_id:'target'}),[]);
 assert(calls.some(x=>has(x.sql,'INSERT INTO mainbrain_api.alerts')));
 assert(calls.some(x=>has(x.sql,'lease_expired_reconciliation_required'))===false ||
   calls.some(x=>x.params?.includes('lease_expired_reconciliation_required')));
 assert(!calls.some(x=>has(x.sql,'INSERT INTO mainbrain_api.attempts')));
});
test('uncertain fail is blocked and writes alert without a requeue',async()=>{
 const leased={...event,state:'executed',current_attempt_id:UUID,
   lease_until:'2026-10-20T06:01:00Z',attempt_count:1};
 const {store,calls}=harness(q=>{
   if(has(q,'SELECT * FROM mainbrain_api.events'))return {rows:[leased]};
   if(has(q,'FROM mainbrain_api.grants'))return {rows:[grant]};
   if(has(q,"SET state='blocked'"))return {rows:[{...leased,state:'blocked'}]};
   return {rows:[]};
 });
 const result=await store.fail({event_id:'EV1',attempt_id:UUID,endpoint_id:'target',reason:'reconciliation_required'});
 assert.equal(result.state,'blocked');
 assert(calls.some(x=>has(x.sql,'INSERT INTO mainbrain_api.alerts')));
 assert(!calls.some(x=>has(x.sql,"SET state=$2,next_attempt_at")));
});
test('status readback is authenticated GET with strict event ID',async()=>{
 const {createHttpTaskClient}=require('../api/http-task-client-candidate.cjs');
 const calls=[];
 const client=createHttpTaskClient({baseUrl:'https://api.example.com/',
   tokenProvider:async()=> 'read-only-status',
   httpFetch:async(url,opt)=>{calls.push([url,opt]);return {ok:true,json:async()=>({data:{state:'blocked'}})}}});
 assert.deepEqual(await client.status({event_id:'EV1'}),{state:'blocked'});
 assert.equal(calls[0][1].method,'GET');
 assert.match(calls[0][0],/\/v1\/tasks\/EV1$/);
 await assert.rejects(client.status({event_id:'../secrets'}),/canonical event ID/);
});

test('authenticated status contains clear anomaly guidance without claiming notification delivery',async()=>{
 const {store}=harness(q=>{
  if(q.startsWith('SELECT * FROM mainbrain_api.events'))return {rows:[event]};
  if(q.includes('FROM mainbrain_api.alerts'))return {rows:[{
    alert_code:'EXTERNAL_OUTCOME_UNKNOWN',severity:'P0',status:'open',
    occurrences:3,details:{attempt_id:UUID},first_seen_at:NOW,last_seen_at:NOW
  }]};
  return {rows:[]};
 });
 const status=await store.get('EV1');
 assert.equal(status.alerts.length,1);
 assert.equal(status.alerts[0].severity,'P0');
 assert.equal(status.alerts[0].occurrences,3);
 assert.match(status.alerts[0].reason,/不確定/);
 assert.match(status.alerts[0].impact,/重複執行/);
 assert.match(status.alerts[0].next_action,/核對/);
 assert.equal(status.alerts[0].delivery,'inbox_only_not_pushed');
 assert.equal(status.alerts[0].dispatch_effect,'requeue_blocked_only');
 assert.equal(status.alerts[0].external_execution_state,'unknown');
 assert.equal(status.alerts[0].external_stop_confirmed,false);
});
test('lease timeout alert keeps execution outcome unknown',async()=>{
 const {store}=harness(q=>{
  if(q.startsWith('SELECT * FROM mainbrain_api.events'))return {rows:[{...event,state:'blocked'}]};
  if(q.includes('FROM mainbrain_api.alerts'))return {rows:[{
   alert_code:'LEASE_EXPIRED_OUTCOME_UNKNOWN',severity:'P0',status:'open',
   occurrences:1,details:{attempt_id:UUID},first_seen_at:NOW,last_seen_at:NOW
  }]};
  return {rows:[]};
 });
 const result=await store.get('EV1');
 assert.equal(result.state,'blocked');
 assert.equal(result.alerts[0].dispatch_effect,'requeue_blocked_only');
 assert.equal(result.alerts[0].external_execution_state,'unknown');
 assert.equal(result.alerts[0].external_stop_confirmed,false);
 assert.equal(result.alerts[0].delivery,'inbox_only_not_pushed');
});
test('alert schema deduplicates by event ID and reason',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../api/persistence-candidate.sql'),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS mainbrain_api\.alerts/);
 assert.match(sql,/PRIMARY KEY\(event_id, alert_code\)/);
});

test('watchdog quarantines expired leases without starting a worker',async()=>{
 const {createLeaseWatchdog}=require('../api/lease-watchdog-candidate.cjs');
 const expired={...event,state:'leased',current_attempt_id:UUID,
   lease_until:'2026-10-20T05:59:00.000Z'};
 const {store,calls}=harness(q=>{
   if(q.includes('WITH stale AS'))return {rows:[expired]};
   return {rows:[]};
 });
 const logger=[];
 const watchdog=createLeaseWatchdog({store,destinationEndpointId:'target',logger:x=>logger.push(x)});
 assert.deepEqual(await watchdog.runOnce(),
   {state:'checked',quarantined:1,delivery:'inbox_only_not_pushed'});
 assert(calls.some(x=>x.sql.includes('lease_expired_reconciliation_required')||
   x.params?.includes('lease_expired_reconciliation_required')));
 assert(calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.alerts')));
 assert(!calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.attempts')));
 assert(!calls.some(x=>x.sql.includes("state='queued' AND next_attempt_at")));
 assert.equal(logger[0].delivery,'inbox_only_not_pushed');
});
test('watchdog never reports success after a failed sweep and never calls a model',async()=>{
 const {createLeaseWatchdog}=require('../api/lease-watchdog-candidate.cjs');
 const logger=[];
 const watchdog=createLeaseWatchdog({
   store:{sweepExpired:async()=>{throw Error('isolated database unavailable');}},
   destinationEndpointId:'target',logger:x=>logger.push(x)
 });
 await assert.rejects(watchdog.runOnce(),/isolated database unavailable/);
 assert.deepEqual(logger,[]);
});
test('standalone sweep refuses an empty destination and never leases new work',async()=>{
 const {store,calls}=harness(q=>({rows:[]}));
 await assert.rejects(store.sweepExpired({destination_endpoint_id:''}),/required/);
 assert.equal(await store.sweepExpired({destination_endpoint_id:'target'}),0);
 assert(calls.some(x=>x.sql.includes('WITH stale AS')));
 assert(!calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.attempts')));
});
