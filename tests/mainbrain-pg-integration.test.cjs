'use strict';
// Runs ONLY with a throwaway PostgreSQL service container in GitHub Actions.
// No Supabase, production DB, credentials, or migrations are touched.
const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const {createPostgresStore}=require('../api/pg-store-candidate.cjs');
const url=process.env.MAINBRAIN_TEST_DATABASE_URL;
if(!url)throw Error('MAINBRAIN_TEST_DATABASE_URL must point to isolated PostgreSQL test service');
const pool=new Pool({connectionString:url,max:8,connectionTimeoutMillis:5000});
const BASE='2030-01-01T00:00:00.000Z';
let time=Date.parse(BASE);
let counter=0;
const now=()=>new Date(time).toISOString();
const store=()=>createPostgresStore({pool,clock:now,leaseSeconds:60,makeAttemptId:randomUUID});
const newId=()=>String(++counter);
async function makeGrant({task,src='sender',dest='receiver',actions=['send','receive','execute','ack'],stopped=false,revoked=false,maxAttempts=3}={}) {
  const grantId='GRANT-'+newId();
  await pool.query(
    'INSERT INTO mainbrain_api.grants (grant_id,task_id,source_endpoint_id,destination_endpoint_id,allowed_actions,expires_at,stopped,revoked_at,max_attempts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [grantId,task,src,dest,actions,'2030-01-10T00:00:00Z',stopped,revoked?BASE:null,maxAttempts]);
  return grantId;
}
function payload(task){const n=newId();return {event_id:'EVENT-'+n,task_id:task,source_endpoint_id:'sender',
  destination_endpoint_id:'receiver',idempotency_key:'KEY-'+n,payload_version:'1',payload_digest:'a'.repeat(64),
  payload:{text:'synthetic-'+n},state:'queued',created_at:now()};}
before(async()=>{
  // Mimic expected Supabase roles in THIS disposable database only.
  for(const role of ['anon','authenticated']){
    const r=await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);
    if(!r.rowCount)await pool.query('CREATE ROLE '+role+' NOLOGIN');
  }
  await pool.query(fs.readFileSync(path.join(__dirname,'../api/schema.sql'),'utf8'));
  await pool.query(fs.readFileSync(path.join(__dirname,'../api/persistence-candidate.sql'),'utf8'));
});
beforeEach(async()=>{
  // Every real-DB test starts from an empty disposable dataset.
  // Avoid accidentally leasing another test's previously queued task.
  await pool.query('TRUNCATE TABLE mainbrain_api.receipts, mainbrain_api.attempts, mainbrain_api.event_logs, mainbrain_api.events, mainbrain_api.grants RESTART IDENTITY CASCADE');
  time=Date.parse(BASE);
});
after(async()=>{await pool.end();});
test('live PostgreSQL: denied enqueue leaves no event',async()=>{
  const p=payload('T-nogrant');
  await assert.rejects(store().enqueue(p),e=>e.code==='FORBIDDEN');
  const r=await pool.query('SELECT 1 FROM mainbrain_api.events WHERE event_id=$1',[p.event_id]);
  assert.equal(r.rowCount,0);
});
test('live PostgreSQL: granted transaction persists event and audit; duplicate is idempotent',async()=>{
  const task='T-accept-'+newId();await makeGrant({task});
  const s=store(),p=payload(task);
  const a=await s.enqueue(p),b=await s.enqueue(p);
  assert.equal(a.event_id,p.event_id);assert.equal(b.event_id,p.event_id);
  const rows=await pool.query('SELECT * FROM mainbrain_api.events WHERE event_id=$1',[p.event_id]);
  assert.equal(rows.rowCount,1);
  const log=await pool.query('SELECT action FROM mainbrain_api.event_logs WHERE event_id=$1',[p.event_id]);
  assert.deepEqual(log.rows.map(x=>x.action),['queued']);
  await assert.rejects(s.enqueue({...p,payload_digest:'b'.repeat(64)}),e=>e.code==='IDEMPOTENCY_CONFLICT');
});
test('live PostgreSQL: two workers cannot lease the same queued attempt concurrently',async()=>{
  const task='T-race-'+newId();await makeGrant({task});
  const s=store(),p=payload(task);await s.enqueue(p);
  const [a,b]=await Promise.all([s.lease({destination_endpoint_id:'receiver'}),s.lease({destination_endpoint_id:'receiver'})]);
  assert.equal(a.length+b.length,1);
  const winner=a[0]||b[0];
  assert.equal(winner.state,'leased');
  const r=await pool.query('SELECT * FROM mainbrain_api.attempts WHERE event_id=$1',[p.event_id]);
  assert.equal(r.rowCount,1);
  assert.equal(r.rows[0].attempt_id,winner.current_attempt_id);
});
test('live PostgreSQL: execution and ACK are durable and bound to current attempt',async()=>{
  const task='T-exec-'+newId();await makeGrant({task});
  const s=store(),p=payload(task);await s.enqueue(p);
  const e=(await s.lease({destination_endpoint_id:'receiver'}))[0],attempt=e.current_attempt_id;
  await assert.rejects(s.ack({event_id:p.event_id,attempt_id:randomUUID(),endpoint_id:'receiver',
    payload_digest:p.payload_digest,payload_version:'1',receipt_evidence:'invalid',channel:'api'}),e=>e.code==='EVENT_CONFLICT');
  assert.equal((await s.markExecuted({event_id:p.event_id,attempt_id:attempt,endpoint_id:'receiver',
    execution_evidence:'synthetic-execution'})).state,'executed');
  assert.equal((await s.ack({event_id:p.event_id,attempt_id:attempt,endpoint_id:'receiver',
    payload_digest:p.payload_digest,payload_version:'1',receipt_evidence:'synthetic-ack',channel:'api'})).state,'ack_received');
  const r=await pool.query('SELECT channel,kind,attempt_id FROM mainbrain_api.receipts WHERE event_id=$1 ORDER BY kind',[p.event_id]);
  assert.equal(r.rowCount,2);assert(r.rows.every(x=>x.channel==='api' && x.attempt_id===attempt));
  const log=await pool.query('SELECT action FROM mainbrain_api.event_logs WHERE event_id=$1 ORDER BY id',[p.event_id]);
  assert.deepEqual(log.rows.map(x=>x.action),['queued','leased','executed','ack_received']);
  await assert.rejects(s.ack({event_id:p.event_id,attempt_id:attempt,endpoint_id:'receiver',
    payload_digest:p.payload_digest,payload_version:'1',receipt_evidence:'replay',channel:'api'}),
  e=>e.code==='EVENT_CONFLICT');
});
test('live PostgreSQL: lease expiry reclaims with new durable attempt; old ACK rejected',async()=>{
  const task='T-reclaim-'+newId();await makeGrant({task});
  const s=store(),p=payload(task);await s.enqueue(p);
  const first=(await s.lease({destination_endpoint_id:'receiver'}))[0];
  time+=61000;
  try{
    const second=(await s.lease({destination_endpoint_id:'receiver'}))[0];
    assert(second);assert.notEqual(first.current_attempt_id,second.current_attempt_id);
    assert.equal(second.attempt_count,2);
    await assert.rejects(s.ack({event_id:p.event_id,attempt_id:first.current_attempt_id,endpoint_id:'receiver',
      payload_digest:p.payload_digest,payload_version:'1',receipt_evidence:'stale',channel:'api'}),e=>e.code==='EVENT_CONFLICT');
    const r=await pool.query('SELECT attempt_no FROM mainbrain_api.attempts WHERE event_id=$1 ORDER BY attempt_no',[p.event_id]);
    assert.deepEqual(r.rows.map(x=>x.attempt_no),[1,2]);
  }finally{time-=61000;}
});
test('live PostgreSQL: revoked grant prevents newly queued lease',async()=>{
  const task='T-revoked-'+newId(),grant=await makeGrant({task});
  const s=store(),p=payload(task);await s.enqueue(p);
  await pool.query('UPDATE mainbrain_api.grants SET revoked_at=$2 WHERE grant_id=$1',[grant,now()]);
  assert.deepEqual(await s.lease({destination_endpoint_id:'receiver'}),[]);
  const state=(await s.get(p.event_id)).state;
  assert.equal(state,'blocked');
});
test('live PostgreSQL: grant STOP between lease and execution blocks side effects',async()=>{
  const task='T-stop-'+newId(),grant=await makeGrant({task});
  const s=store(),p=payload(task);await s.enqueue(p);
  const lease=(await s.lease({destination_endpoint_id:'receiver'}))[0];
  await pool.query('UPDATE mainbrain_api.grants SET stopped=true WHERE grant_id=$1',[grant]);
  await assert.rejects(s.markExecuted({event_id:p.event_id,attempt_id:lease.current_attempt_id,
    endpoint_id:'receiver',execution_evidence:'should-reject'}),e=>e.code==='FORBIDDEN');
  const r=await pool.query('SELECT 1 FROM mainbrain_api.receipts WHERE event_id=$1',[p.event_id]);
  assert.equal(r.rowCount,0);
});
test('live PostgreSQL: ACK write failure rolls back all changes and retains prior state',async()=>{
  const task='T-rollback-'+newId();await makeGrant({task});
  const s=store(),p=payload(task);await s.enqueue(p);
  const e=(await s.lease({destination_endpoint_id:'receiver'}))[0];
  const clientPool={connect:async()=>{
    const c=await pool.connect();
    return {query:(sql,args)=>{
      if(typeof sql==='string' && sql.startsWith('INSERT INTO mainbrain_api.receipts')) throw Error('simulated durable receipt failure');
      return c.query(sql,args);
    },release:()=>c.release()};
  },query:pool.query.bind(pool)};
  const fault=createPostgresStore({pool:clientPool,clock:now});
  await assert.rejects(fault.ack({event_id:p.event_id,attempt_id:e.current_attempt_id,endpoint_id:'receiver',
    payload_digest:p.payload_digest,payload_version:'1',receipt_evidence:'fail',channel:'api'}),/simulated durable receipt failure/);
  assert.equal((await s.get(p.event_id)).state,'leased');
  const log=await pool.query('SELECT action FROM mainbrain_api.event_logs WHERE event_id=$1',[p.event_id]);
  assert.deepEqual(log.rows.map(x=>x.action),['queued','leased']);
  const receipts=await pool.query('SELECT 1 FROM mainbrain_api.receipts WHERE event_id=$1',[p.event_id]);
  assert.equal(receipts.rowCount,0);
});
