'use strict';
// B4 real-PG E2E (isolated self-test, NOT acceptance).
// Node pg Pool -> createPostgresStore -> createHttpServer (HMAC auth, loopback)
// -> createHttpTaskClient -> createPollingWorker.
// Requires DATABASE_URL to an authorised ISOLATED database; skipped otherwise.
// Never TRUNCATEs: every row uses a unique run prefix and only those rows are deleted.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const URL_ENV=process.env.DATABASE_URL;
const skip=!URL_ENV&&'DATABASE_URL not set (real-PG E2E only runs in the scoped B4 workflow)';
const RUN='b4e2e_'+Date.now().toString(36)+'_'+crypto.randomBytes(3).toString('hex');
const KEYS={},SECRET=()=>crypto.randomBytes(32).toString('hex');
let pool,server,base,store;
const created={events:new Set(),grants:new Set()};
function token(endpoint,scopes){const now=Math.floor(Date.now()/1000);const enc=Buffer.from(JSON.stringify({endpoint_id:endpoint,aud:'mainbrain-api',iat:now,exp:now+120,scopes})).toString('base64url');return enc+'.'+crypto.createHmac('sha256',KEYS[endpoint]).update(enc).digest('base64url');}
async function fixture(name,{actions=['send','receive','execute','ack']}={}){
 const src=RUN+'_'+name+'_src',dst=RUN+'_'+name+'_dst',task=RUN+'_'+name+'_task',grant=RUN+'_'+name+'_grant',ev=RUN+'_'+name+'_ev';
 KEYS[src]=SECRET();KEYS[dst]=SECRET();
 await pool.query("INSERT INTO mainbrain_api.grants (grant_id,task_id,source_endpoint_id,destination_endpoint_id,allowed_actions,expires_at,max_attempts) VALUES ($1,$2,$3,$4,$5,now()+interval '1 hour',3)",[grant,task,src,dst,actions]);
 created.grants.add(grant);
 const r=await fetch(base+'/v1/tasks/send',{method:'POST',headers:{authorization:'Bearer '+token(src,['tasks:send']),'content-type':'application/json'},body:JSON.stringify({event_id:ev,task_id:task,destination_endpoint_id:dst,idempotency_key:ev+'_idem',payload_version:'v1',payload:{b4:name}})});
 created.events.add(ev);
 assert.equal(r.status,200,'send via HTTP must succeed');
 const {createHttpTaskClient}=require('../api/http-task-client-candidate.cjs');
 const client=createHttpTaskClient({baseUrl:base+'/',tokenProvider:async a=>token(dst,['tasks:receive','tasks:execute','tasks:ack','tasks:report','tasks:status'])});
 return {src,dst,task,grant,ev,client};
}
const row=async ev=>(await pool.query('SELECT * FROM mainbrain_api.events WHERE event_id=$1',[ev])).rows[0];
const reports=async ev=>(await pool.query('SELECT * FROM mainbrain_api.outcome_reports WHERE event_id=$1',[ev])).rows;
const worker=(client,performTask,extra={})=>require('../api/polling-worker-candidate.cjs').createPollingWorker({client,performTask,...extra});

test.describe('B4 real-PG E2E',{skip},()=>{
 test.before(async()=>{
  const {Pool}=require('pg');
  pool=new Pool({connectionString:URL_ENV,ssl:{rejectUnauthorized:false},max:4});
  const who=(await pool.query("select current_user u,current_setting('server_version') v,current_database() d")).rows[0];
  console.log('B4_CONNECTED',JSON.stringify({server_version:who.v,database:who.d,role_is_temp:/^b4_tmp_/.test(who.u)}));
  const {createPostgresStore}=require('../api/pg-store-candidate.cjs');
  const {createHttpServer}=require('../api/http-server.cjs');
  const {createHmacAuth}=require('../api/auth-adapter.cjs');
  store=createPostgresStore({pool});
  server=createHttpServer({store,authenticate:createHmacAuth({keys:KEYS})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  base='http://127.0.0.1:'+server.address().port;
 });
 test.after(async()=>{
  try{
   const ev=[...created.events],gr=[...created.grants];
   for(const t of ['outcome_reports','receipts','alerts','event_logs','attempts'])
    await pool.query('DELETE FROM mainbrain_api.'+t+' WHERE event_id = ANY($1)',[ev]);
   await pool.query('DELETE FROM mainbrain_api.events WHERE event_id = ANY($1)',[ev]);
   await pool.query('DELETE FROM mainbrain_api.grants WHERE grant_id = ANY($1)',[gr]);
   const left=(await pool.query("SELECT (SELECT count(*) FROM mainbrain_api.events WHERE event_id LIKE $1)+(SELECT count(*) FROM mainbrain_api.grants WHERE grant_id LIKE $1) n",[RUN+'%'])).rows[0].n;
   console.log('B4_CLEANUP_REMAINING',left);
  }finally{server&&server.close();pool&&await pool.end();}
 });

 test('B4-E2E-00 happy path: processed and ack_received persisted',async()=>{
  const f=await fixture('ok');let n=0;
  const out=await worker(f.client,async()=>{n++;return {execution_evidence:'synthetic:execution:ok',receipt_evidence:'synthetic:receipt:ok'};}).runOnce();
  assert.equal(out.state,'processed');assert.equal(n,1);
  assert.equal((await row(f.ev)).state,'ack_received');
 });

 test('B4-E2E-01 revocation before lease: blocked, provider never called',async()=>{
  const f=await fixture('revoke1');let n=0;
  await pool.query('UPDATE mainbrain_api.grants SET revoked_at=now() WHERE grant_id=$1',[f.grant]);
  const out=await worker(f.client,async()=>{n++;return {};}).runOnce();
  assert.equal(out.state,'idle');assert.equal(n,0);
  const r=await row(f.ev);assert.equal(r.state,'blocked');assert.equal(r.external_intent_at,null);
 });

 test('B4-E2E-02 revocation after intent: authorize rejected, provider never called, no redispatch',async()=>{
  const f=await fixture('revoke2');let n=0;
  const client={...f.client,authorize:async p=>{await pool.query('UPDATE mainbrain_api.grants SET revoked_at=now() WHERE grant_id=$1',[f.grant]);return f.client.authorize(p);}};
  const out=await worker(client,async()=>{n++;return {execution_evidence:'synthetic:execution:x',receipt_evidence:'synthetic:receipt:x'};}).runOnce();
  assert.equal(n,0,'provider must not run after revocation');
  assert.equal(out.state,'reconciliation_required');
  const r=await row(f.ev);assert.equal(r.state,'blocked');assert.notEqual(r.external_intent_at,null);
  assert.equal((await reports(f.ev)).length,1,'dispatch_authorization_unconfirmed must be persisted');
  assert.equal((await worker(f.client,async()=>{n++;return {};}).runOnce()).state,'idle');assert.equal(n,0);
 });

 test('B4-E2E-03 uncertain ACK (B1): fail resolves blocked AND bounded evidence persists in PG',async()=>{
  const f=await fixture('b1');let n=0;
  const client={...f.client,ack:async()=>{const e=Error('synthetic ack transport timeout');throw e;}};
  const out=await worker(client,async()=>{n++;return {execution_evidence:'synthetic:execution:b1',receipt_evidence:'synthetic:receipt:b1'};}).runOnce();
  assert.equal(out.state,'reconciliation_required');assert.equal(n,1);
  const r=await row(f.ev);assert.equal(r.state,'blocked');
  const rep=await reports(f.ev);assert.equal(rep.length,1);
  assert.equal(rep[0].reason,'execution_outcome_unknown');assert.equal(rep[0].evidence_reference,'synthetic:receipt:b1');
  assert.equal(rep[0].report_id,'outcome-'+r.current_attempt_id);
 });

 test('B4-E2E-04 ACK committed but response lost: readback avoids false failure',async()=>{
  const f=await fixture('ackrb');let n=0;
  const client={...f.client,ack:async p=>{await f.client.ack(p);throw Error('synthetic response lost after commit');}};
  const out=await worker(client,async()=>{n++;return {execution_evidence:'synthetic:execution:rb',receipt_evidence:'synthetic:receipt:rb'};}).runOnce();
  assert.equal(out.state,'processed_readback');assert.equal(n,1);
  assert.equal((await row(f.ev)).state,'ack_received');assert.equal((await reports(f.ev)).length,0);
 });

 test('B4-E2E-05 persist readback over HTTP status (B2): consistent, bounded, explicit truncation flags',async()=>{
  const f=await fixture('b2');
  await worker({...f.client,ack:async()=>{throw Error('timeout');}},async()=>({execution_evidence:'synthetic:execution:b2',receipt_evidence:'synthetic:receipt:b2'})).runOnce();
  const s=await f.client.status({event_id:f.ev});
  assert.equal(s.state,'blocked');assert.equal(s.outcome_reports.length,1);
  assert.equal(s.outcome_reports[0].evidence_reference,'synthetic:receipt:b2');
  assert.equal(s.outcome_reports_truncated,false);assert.equal(s.outcome_reports_has_more,false);assert.equal(s.outcome_reports_next_cursor,null);
  assert.ok(s.alerts.some(a=>a.alert_code==='EXTERNAL_OUTCOME_UNKNOWN'));
  const r=await fetch(base+'/v1/tasks/'+f.ev+'?outcome_limit=99',{headers:{authorization:'Bearer '+token(f.dst,['tasks:status'])}});
  assert.equal(r.status,400,'out-of-bound limit rejected');
 });

 test('B4-E2E-06 unknown result is never redispatched (blocked + expired lease sweep)',async()=>{
  const f=await fixture('unk');let n=0;
  await worker({...f.client,ack:async()=>{throw Error('timeout');}},async()=>{n++;return {execution_evidence:'synthetic:execution:u',receipt_evidence:'synthetic:receipt:u'};}).runOnce();
  assert.equal(n,1);
  for(let i=0;i<2;i++)assert.equal((await worker(f.client,async()=>{n++;return {};}).runOnce()).state,'idle');
  assert.equal(n,1,'provider must not be re-invoked');
  const r=await row(f.ev);assert.equal(r.state,'blocked');assert.equal(r.attempt_count,1);
  // leased-but-crashed attempt: expire lease, sweep must quarantine not requeue
  const g=await fixture('unk2');
  const leased=await g.client.receive();assert.equal(leased.length,1);
  await g.client.intent({event_id:g.ev,attempt_id:leased[0].current_attempt_id});
  await pool.query("UPDATE mainbrain_api.events SET lease_until=now()-interval '1 second' WHERE event_id=$1",[g.ev]);
  assert.equal(await store.sweepExpired({destination_endpoint_id:g.dst}),1);
  assert.equal((await row(g.ev)).state,'blocked');
  assert.equal((await worker(g.client,async()=>{n++;return {};}).runOnce()).state,'idle');assert.equal(n,1);
 });

 test('B4-E2E-07 B3 abort before dispatch: no intent, no provider; stop not claimed remote',async()=>{
  const f=await fixture('b3');let n=0;const ac=new AbortController();ac.abort();
  const out=await worker(f.client,async()=>{n++;return {};}).runOnce({signal:ac.signal});
  assert.equal(out.state,'aborted_before_dispatch');assert.equal(out.remote_stop_confirmed,false);assert.equal(n,0);
  const r=await row(f.ev);assert.equal(r.external_intent_at,null);assert.equal(r.state,'leased');
 });
});
