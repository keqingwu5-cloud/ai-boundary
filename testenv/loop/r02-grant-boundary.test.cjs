'use strict';
// Focused FileStore checks for #166 R02. No provider, DB or network requests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createFileStore}=require('./file-store.cjs');
const {buildMockResult}=require('./mock-executor.cjs');
const storePath=require.resolve('./file-store.cjs');
const digest=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r02-boundary-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return {dir,store:createFileStore({dataDir:dir})};
}
const grant=id=>({grant_id:id,task_id:'task',source_endpoint_id:'origin',destination_endpoint_id:'worker'});
async function leased(store,id) {
 const payload={instruction:id};
 await store.enqueue({event_id:id,task_id:'task',source_endpoint_id:'origin',destination_endpoint_id:'worker',idempotency_key:id,payload_version:'1',payload_digest:digest(payload),payload});
 const [e]=await store.lease({destination_endpoint_id:'worker'});
 assert.equal(e.event_id,id);
 return {e,payload,op:{event_id:id,attempt_id:e.current_attempt_id,endpoint_id:'worker'}};
}
for(const action of ['stopGrant','revokeGrant']) {
 test(action+': old lease stays forbidden after new grant and store reopen',async t=>{
  const {dir,store}=fixture(t);store.createGrant(grant('old'));
  const {e,payload,op}=await leased(store,'old-event');
  store.stageResult({...op,result:buildMockResult(payload)});
  store[action]({grant_id:'old',reason:'synthetic-check'});
  const tombstone=store.snapshot().grants.old;
  store.createGrant(grant('new'));
  const reopened=createFileStore({dataDir:dir});
  await assert.rejects(reopened.markExecuted({...op,execution_evidence:'result_kind=MOCK'}),{code:'FORBIDDEN'});
  await assert.rejects(reopened.ack({...op,channel:'api',payload_digest:digest(payload),payload_version:'1',receipt_evidence:'synthetic'}),{code:'FORBIDDEN'});
  await assert.rejects(reopened.fail({...op,reason:'stale-worker'}),{code:'FORBIDDEN'});
  const unchanged=await reopened.get(e.event_id);
  assert.equal(unchanged.grant_id,'old');assert.equal(unchanged.state,'leased');
  assert.equal(unchanged.attempt_count,1);
  assert.deepEqual(reopened.snapshot().grants.old,tombstone);
  const next=await leased(reopened,'new-event');
  assert.equal(next.e.grant_id,'new');
  reopened.stageResult({...next.op,result:buildMockResult(next.payload)});
  await reopened.markExecuted({...next.op,execution_evidence:'result_kind=MOCK'});
  await reopened.ack({...next.op,channel:'api',payload_digest:digest(next.payload),payload_version:'1',receipt_evidence:'synthetic'});
  assert.equal((await reopened.get('new-event')).state,'ack_received');
 });
}
test('expired execution cannot ACK with a newer valid grant',async t=>{
 const {dir}=fixture(t);let time=Date.parse('2026-11-13T00:00:00Z');
 const store=createFileStore({dataDir:dir,clock:()=>new Date(time).toISOString()});
 store.createGrant({...grant('old'),expires_at:'2026-11-13T00:00:01Z'});
 const {payload,op}=await leased(store,'expired-event');
 store.stageResult({...op,result:buildMockResult(payload)});
 await store.markExecuted({...op,execution_evidence:'result_kind=MOCK'});
 time+=2000;
 store.createGrant({...grant('new'),expires_at:'2026-11-14T00:00:00Z'});
 await assert.rejects(store.ack({...op,channel:'api',payload_digest:digest(payload),payload_version:'1',receipt_evidence:'synthetic'}),{code:'FORBIDDEN'});
 assert.equal((await store.get('expired-event')).state,'executed');
 assert.equal(store.snapshot().receipts.filter(r=>r.kind==='ack').length,0);
});
function competingCreate(dir,index) {
 const code=`const {createFileStore}=require(process.argv[1]);const s=createFileStore({dataDir:process.argv[2]});try{const r=s.createGrant({grant_id:'same-id',task_id:process.argv[3],source_endpoint_id:'origin',destination_endpoint_id:'worker'});console.log(JSON.stringify({created:true,task:r.task_id}));}catch(e){if(e.code!=='EVENT_CONFLICT')throw e;console.log(JSON.stringify({created:false,code:e.code}));}`;
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['-e',code,storePath,dir,'task-'+index],{env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
  let out='',err='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('child timeout'));},10000);
  child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('close',status=>{clearTimeout(timer);if(status!==0)return reject(Error(err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});
 });
}
test('eight processes cannot overwrite the same grant ID',async t=>{
 const {dir,store}=fixture(t);
 const results=await Promise.all(Array.from({length:8},(_,i)=>competingCreate(dir,i)));
 const winners=results.filter(r=>r.created);assert.equal(winners.length,1);
 assert.equal(results.filter(r=>r.code==='EVENT_CONFLICT').length,7);
 assert.equal(Object.keys(store.snapshot().grants).length,1);
 assert.equal(store.snapshot().grants['same-id'].task_id,winners[0].task);
 store.stopGrant({grant_id:'same-id',reason:'preserve-tombstone'});
 const before=store.snapshot().grants['same-id'];
 const retry=await Promise.all(Array.from({length:8},(_,i)=>competingCreate(dir,i)));
 assert.ok(retry.every(r=>!r.created&&r.code==='EVENT_CONFLICT'));
 assert.deepEqual(createFileStore({dataDir:dir}).snapshot().grants['same-id'],before);
});
