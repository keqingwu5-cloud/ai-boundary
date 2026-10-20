'use strict';
// Real PostgreSQL integration test against an ephemeral CI service ONLY.
// Refuses non-loopback endpoints and non-dedicated database names.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const {createPostgresStore}=require('../api/pg-store-candidate.cjs');
const connectionString=process.env.MAINBRAIN_CI_PG_URL;
if(!connectionString)throw Error('MAINBRAIN_CI_PG_URL required for dedicated CI integration job');
const url=new URL(connectionString);
if(!['localhost','127.0.0.1'].includes(url.hostname)||
   url.pathname!=='/candidate_queue' || url.username!=='candidate' ||
   process.env.MAINBRAIN_CI_PG_ONLY!=='yes')
  throw Error('refusing to run PostgreSQL integration test outside dedicated local CI database');
const pool=new Pool({connectionString,max:8,connectionTimeoutMillis:3000});
function input(id,task='CI-TASK'){
  return {event_id:id,task_id:task,source_endpoint_id:'ci-sender',
    destination_endpoint_id:'ci-worker',idempotency_key:'idem-'+id,
    payload_version:'1',payload_digest:'a'.repeat(64),payload:{text:'synthetic'}};
}
function aStore(){return createPostgresStore({pool,leaseSeconds:60});}
test('real PostgreSQL: isolated transaction, concurrency, grant and failure paths',async t=>{
  try {
    // api/schema.sql currently requires these Supabase-like roles.
    // These roles are created ONLY in the disposable PostgreSQL service.
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$;`);
    await pool.query(fs.readFileSync(path.join(__dirname,'../api/schema.sql'),'utf8'));
    await pool.query(fs.readFileSync(path.join(__dirname,'../api/persistence-candidate.sql'),'utf8'));
    await pool.query(`INSERT INTO mainbrain_api.grants
      (grant_id,task_id,source_endpoint_id,destination_endpoint_id,allowed_actions,expires_at,max_attempts)
      VALUES ('CI-G1','CI-TASK','ci-sender','ci-worker',
      ARRAY['send','receive','execute','ack'],now()+INTERVAL '2 hours',3)`);
    const store=aStore();
    await t.test('no matching human grant blocks sending',async()=>{
      await assert.rejects(store.enqueue(input('NO-GRANT','UNKNOWN-TASK')),e=>e.code==='FORBIDDEN');
      const n=await pool.query("SELECT count(*)::int AS n FROM mainbrain_api.events WHERE event_id='NO-GRANT'");
      assert.equal(n.rows[0].n,0);
    });
    await t.test('idempotent enqueue saves real data and catches payload conflict',async()=>{
      const p=input('CI-E1');
      const x=await store.enqueue(p);
      assert.equal(x.grant_id,'CI-G1');
      const y=await store.enqueue(p);
      assert.equal(y.event_id,'CI-E1');
      await assert.rejects(store.enqueue({...p,payload_digest:'b'.repeat(64)}),
        e=>e.code==='IDEMPOTENCY_CONFLICT');
    });
    let leased;
    await t.test('two consumers cannot claim one event concurrently',async()=>{
      const claims=await Promise.all([
        store.lease({destination_endpoint_id:'ci-worker'}),
        store.lease({destination_endpoint_id:'ci-worker'})
      ]);
      assert.equal(claims[0].length+claims[1].length,1);
      leased=(claims[0][0]||claims[1][0]);
      assert.match(leased.current_attempt_id,/^[0-9a-f-]{36}$/);
      const history=await pool.query(
        "SELECT attempt_id,attempt_no FROM mainbrain_api.attempts WHERE event_id='CI-E1'");
      assert.equal(history.rows.length,1);
      assert.equal(history.rows[0].attempt_no,1);
    });
    await t.test('wrong attempt receipt is rejected and good ACK commits audit',async()=>{
      const p={event_id:'CI-E1',attempt_id:leased.current_attempt_id,
        endpoint_id:'ci-worker',payload_digest:input('CI-E1').payload_digest,
        payload_version:'1',receipt_evidence:'ci-synthetic-evidence',channel:'api'};
      await assert.rejects(store.ack({...p,attempt_id:'33333333-3333-4333-8333-333333333333'}),
        e=>e.code==='EVENT_CONFLICT');
      await store.markExecuted({...p,execution_evidence:'ci-synthetic-execution'});
      const good=await store.ack(p);
      assert.equal(good.state,'ack_received');
      const result=await pool.query(
        "SELECT (SELECT count(*)::int FROM mainbrain_api.receipts WHERE event_id='CI-E1') AS receipts,"+
        " (SELECT count(*)::int FROM mainbrain_api.event_logs WHERE event_id='CI-E1') AS logs");
      assert.equal(result.rows[0].receipts,2);
      assert.equal(result.rows[0].logs,4);
      await assert.rejects(store.ack(p),e=>e.code==='EVENT_CONFLICT');
    });
    await t.test('uncertain handler outcome blocks without retry',async()=>{
      await store.enqueue(input('CI-E2'));
      const [task]=await store.lease({destination_endpoint_id:'ci-worker'});
      assert.equal(task.event_id,'CI-E2');
      const failed=await store.fail({event_id:'CI-E2',attempt_id:task.current_attempt_id,
        endpoint_id:'ci-worker',reason:'execution_outcome_unknown'});
      assert.equal(failed.state,'blocked');
      assert.deepEqual(await store.lease({destination_endpoint_id:'ci-worker'}),[]);
      const attempts=await pool.query("SELECT count(*)::int AS n FROM mainbrain_api.attempts WHERE event_id='CI-E2'");
      assert.equal(attempts.rows[0].n,1);
    });
    await t.test('orphaned expired lease is blocked, not executed again',async()=>{
      await store.enqueue(input('CI-E3'));
      const [task]=await store.lease({destination_endpoint_id:'ci-worker'});
      assert.equal(task.event_id,'CI-E3');
      await pool.query("UPDATE mainbrain_api.events SET lease_until=now()-INTERVAL '5 minutes' WHERE event_id='CI-E3'");
      assert.deepEqual(await store.lease({destination_endpoint_id:'ci-worker'}),[]);
      const state=await store.get('CI-E3');
      assert.equal(state.state,'blocked');
      assert.equal(state.attempt_count,1);
    });
    await t.test('executed task with lost ACK becomes blocked after lease expiry',async()=>{
      await store.enqueue(input('CI-E3-EXEC'));
      const [task]=await store.lease({destination_endpoint_id:'ci-worker'});
      assert.equal(task.event_id,'CI-E3-EXEC');
      await store.markExecuted({event_id:task.event_id,
        attempt_id:task.current_attempt_id,endpoint_id:'ci-worker',
        execution_evidence:'ci-completed-but-ack-missing'});
      await pool.query("UPDATE mainbrain_api.events SET lease_until=now()-INTERVAL '5 minutes' WHERE event_id='CI-E3-EXEC'");
      assert.deepEqual(await store.lease({destination_endpoint_id:'ci-worker'}),[]);
      const state=await store.get('CI-E3-EXEC');
      assert.equal(state.state,'blocked');
      assert.equal(state.attempt_count,1);
    });
    await t.test('revoked grant blocks queued event before execution',async()=>{
      await store.enqueue(input('CI-E4'));
      await pool.query("UPDATE mainbrain_api.grants SET revoked_at=now() WHERE grant_id='CI-G1'");
      assert.deepEqual(await store.lease({destination_endpoint_id:'ci-worker'}),[]);
      const state=await store.get('CI-E4');
      assert.equal(state.state,'blocked');
      await assert.rejects(store.enqueue(input('CI-E5')),e=>e.code==='FORBIDDEN');
    });
  } finally {
    await pool.end();
  }
});
