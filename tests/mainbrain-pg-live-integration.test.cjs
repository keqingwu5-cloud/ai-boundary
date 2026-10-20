'use strict';
// Real PostgreSQL integration tests. NEVER point this file at a persistent DB.
// The workflow provisions its own disposable PostgreSQL service/container.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const {createPostgresStore}=require('../api/pg-store-candidate.cjs');
const {createHttpServer}=require('../api/http-server.cjs');
const {createHttpTaskClient}=require('../api/http-task-client-candidate.cjs');
const {createPollingWorker}=require('../api/polling-worker-candidate.cjs');

if(process.env.PG_TEST_ISOLATED!=='true') throw Error('refusing live DB tests without explicit disposable DB flag');
if(process.env.PGDATABASE!=='mainbrain_ci_isolated') throw Error('refusing to run outside expected throwaway DB');
if(!['127.0.0.1','localhost'].includes(process.env.PGHOST)) throw Error('refusing non-loopback DB');
const db=new Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
  user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE,max:8});
const baseTime=Date.now();
function iso(offset=0){return new Date(baseTime+offset).toISOString();}
function id(prefix){return prefix+'-'+crypto.randomUUID();}
function payloadFor(o){return {event_id:o.eventId,task_id:o.taskId,
  source_endpoint_id:o.source,destination_endpoint_id:o.destination,
  idempotency_key:o.key,payload_version:'1',payload_digest:'a'.repeat(64),
  payload:{text:'synthetic payload for isolated CI'}};}
async function fixture({maxAttempts=3,actions=['send','receive','execute','ack']}={}) {
  const o={grantId:id('GRANT'),taskId:id('TASK'),eventId:id('EV'),
    source:id('src'),destination:id('dst'),key:id('KEY'),now:0};
  await db.query(`INSERT INTO mainbrain_api.grants
    (grant_id,task_id,source_endpoint_id,destination_endpoint_id,
     allowed_actions,expires_at,max_attempts)
     VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7)`,
    [o.grantId,o.taskId,o.source,o.destination,actions,iso(3600000),maxAttempts]);
  const store=createPostgresStore({pool:db,clock:()=>iso(o.now),leaseSeconds:10});
  return {...o,store};
}
async function enqueue(o){return o.store.enqueue(payloadFor(o));}
async function getReceipts(eventId){return (await db.query(
  'SELECT * FROM mainbrain_api.receipts WHERE event_id=$1',[eventId])).rows;}
async function getAttempts(eventId){return (await db.query(
  'SELECT * FROM mainbrain_api.attempts WHERE event_id=$1 ORDER BY attempt_no',[eventId])).rows;}

before(async()=>{
  // Unprivileged roles are only created in this disposable CI database.
  await db.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  END $$`);
  await db.query(readFileSync(path.join(__dirname,'../api/schema.sql'),'utf8'));
  await db.query(readFileSync(path.join(__dirname,'../api/persistence-candidate.sql'),'utf8'));
});
after(async()=>{await db.end();});

test('actual PG transactions enforce grant, idempotency and durable storage',async()=>{
  const o=await fixture();
  const a=await enqueue(o),b=await enqueue(o);
  assert.equal(a.event_id,o.eventId);
  assert.equal(b.event_id,a.event_id);
  const persisted=(await db.query('SELECT * FROM mainbrain_api.events WHERE event_id=$1',[o.eventId])).rows;
  assert.equal(persisted.length,1);
  assert.equal(persisted[0].grant_id,o.grantId);
  await assert.rejects(o.store.enqueue({...payloadFor(o),payload_digest:'b'.repeat(64)}),
    e=>e.code==='IDEMPOTENCY_CONFLICT');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM mainbrain_api.events WHERE event_id=$1',[o.eventId])).rows[0].n,1);
});
test('two concurrent PostgreSQL workers can lease an event only once',async()=>{
  const o=await fixture();
  await enqueue(o);
  const [a,b]=await Promise.all([
    o.store.lease({destination_endpoint_id:o.destination}),
    o.store.lease({destination_endpoint_id:o.destination})
  ]);
  const claimed=[...a,...b];
  assert.equal(claimed.length,1);
  assert.equal(claimed[0].state,'leased');
  assert.equal((await getAttempts(o.eventId)).length,1);
  assert.equal((await db.query('SELECT attempt_count FROM mainbrain_api.events WHERE event_id=$1',[o.eventId])).rows[0].attempt_count,1);
});
test('expired lease recovers with different attempt and rejects stale ACK',async()=>{
  const o=await fixture();
  await enqueue(o);
  const first=(await o.store.lease({destination_endpoint_id:o.destination}))[0];
  assert(first.current_attempt_id);
  o.now=11000; // advance injected clock, no real sleep
  const second=(await o.store.lease({destination_endpoint_id:o.destination}))[0];
  assert(second.current_attempt_id && second.current_attempt_id!==first.current_attempt_id);
  assert.equal((await getAttempts(o.eventId)).length,2);
  const invalid={event_id:o.eventId,attempt_id:first.current_attempt_id,
    endpoint_id:o.destination,payload_digest:first.payload_digest,
    payload_version:'1',receipt_evidence:'stale',channel:'api'};
  await assert.rejects(o.store.ack(invalid),e=>e.code==='EVENT_CONFLICT');
  assert.equal((await getReceipts(o.eventId)).length,0);
  const curr={...invalid,attempt_id:second.current_attempt_id,receipt_evidence:'live synthetic'};
  const accepted=await o.store.ack(curr);
  assert.equal(accepted.state,'ack_received');
  assert.equal((await getReceipts(o.eventId)).length,1);
  await assert.rejects(o.store.ack(curr),e=>e.code==='EVENT_CONFLICT');
});
test('STOP/revoked grant is checked again before ACK and after lease expiry',async()=>{
  const o=await fixture();
  await enqueue(o);
  const first=(await o.store.lease({destination_endpoint_id:o.destination}))[0];
  await db.query('UPDATE mainbrain_api.grants SET stopped=true WHERE grant_id=$1',[o.grantId]);
  await assert.rejects(o.store.ack({event_id:o.eventId,attempt_id:first.current_attempt_id,
    endpoint_id:o.destination,payload_digest:first.payload_digest,payload_version:'1',
    receipt_evidence:'ref',channel:'api'}),e=>e.code==='FORBIDDEN');
  o.now=11000;
  assert.deepEqual(await o.store.lease({destination_endpoint_id:o.destination}),[]);
  const status=await o.store.get(o.eventId);
  assert.equal(status.state,'blocked');
  assert.equal((await getReceipts(o.eventId)).length,0);
});
test('bounded worker failures requeue with backoff then exhaust attempts',async()=>{
  const o=await fixture({maxAttempts:2});
  await enqueue(o);
  const leased=(await o.store.lease({destination_endpoint_id:o.destination}))[0];
  const result=await o.store.fail({event_id:o.eventId,attempt_id:leased.current_attempt_id,
    endpoint_id:o.destination,reason:'synthetic worker failure'});
  assert.equal(result.state,'queued');
  assert.deepEqual(await o.store.lease({destination_endpoint_id:o.destination}),[]);
  o.now=31000;
  const second=(await o.store.lease({destination_endpoint_id:o.destination}))[0];
  assert(second.current_attempt_id && second.current_attempt_id!==leased.current_attempt_id);
  const exhausted=await o.store.fail({event_id:o.eventId,attempt_id:second.current_attempt_id,
    endpoint_id:o.destination,reason:'another synthetic failure'});
  assert.equal(exhausted.state,'failed');
  o.now=100000;
  assert.deepEqual(await o.store.lease({destination_endpoint_id:o.destination}),[]);
  assert.equal((await getAttempts(o.eventId)).length,2);
});
test('failed audit write atomically rolls back ACK receipt and state',async()=>{
  const o=await fixture();
  await enqueue(o);
  const leased=(await o.store.lease({destination_endpoint_id:o.destination}))[0];
  const common={event_id:o.eventId,attempt_id:leased.current_attempt_id,endpoint_id:o.destination};
  await o.store.markExecuted({...common,execution_evidence:'real PG isolated test'});
  await db.query("ALTER TABLE mainbrain_api.event_logs ADD CONSTRAINT ci_deny_ack_log CHECK (action <> 'ack_received')");
  try{
    await assert.rejects(o.store.ack({...common,payload_digest:leased.payload_digest,payload_version:'1',
      receipt_evidence:'should roll back',channel:'api'}));
    assert.equal((await o.store.get(o.eventId)).state,'executed');
    assert.equal((await getReceipts(o.eventId)).filter(r=>r.kind==='ack').length,0);
  }finally{
    await db.query('ALTER TABLE mainbrain_api.event_logs DROP CONSTRAINT ci_deny_ack_log');
  }
});
test('real HTTP service + PostgreSQL + polling worker delivers API ACK',async()=>{
  const o=await fixture();
  const authenticate=async req=>{
    const t=req.headers?.authorization;
    const endpoint=t==='Bearer test-source'?o.source:t==='Bearer test-worker'?o.destination:null;
    return endpoint?{verified:true,endpoint_id:endpoint,
      scopes:['tasks:send','tasks:receive','tasks:execute','tasks:ack','tasks:status']}:null;
  };
  const server=createHttpServer({store:o.store,authenticate});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url='http://127.0.0.1:'+server.address().port+'/';
    const requestBody={event_id:o.eventId,task_id:o.taskId,destination_endpoint_id:o.destination,
      idempotency_key:o.key,payload_version:'1',payload:{text:'isolated CI HTTP worker'}};
    const response=await fetch(url+'v1/tasks/send',{method:'POST',
      headers:{authorization:'Bearer test-source','content-type':'application/json'},
      body:JSON.stringify(requestBody)});
    assert.equal(response.status,200);
    const worker=createPollingWorker({client:createHttpTaskClient({baseUrl:url,
      tokenProvider:async()=> 'test-worker'}),
      performTask:async context=>{
        assert.equal(context.event_id,o.eventId);
        return {execution_evidence:'synthetic real-HTTP execution',
          receipt_evidence:'synthetic real-HTTP receipt'};
      }});
    assert.equal((await worker.runOnce()).state,'processed');
    const status=await o.store.get(o.eventId);
    assert.equal(status.state,'ack_received');
    const receipts=await getReceipts(o.eventId);
    assert.deepEqual(receipts.map(x=>x.kind).sort(),['ack','execution']);
    assert(receipts.every(x=>x.channel==='api'));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
