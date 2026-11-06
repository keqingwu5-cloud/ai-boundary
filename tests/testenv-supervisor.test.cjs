'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runSupervisor,precheck}=require('../testenv/loop/supervisor.cjs');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brain-supervisor-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
const childFile=path.join(__dirname,'fixtures/supervisor-child.cjs');
test('crash restarts are finite and use exponential capped backoff', {timeout:5000}, async t=>{
 const dir=setup(t),events=[];
 const result=await runSupervisor({dataDir:dir,childFile,maxRestarts:3,backoffMs:10,maxBackoffMs:20,env:{CHILD_MODE:'fail'},onEvent:e=>events.push(e)});
 assert.deepEqual(result,{state:'restart_limit',exitCode:1,starts:4});
 assert.deepEqual(events.filter(e=>e.action==='restart_wait').map(e=>e.waitMs),[10,20,20]);
 assert.equal(fs.readFileSync(path.join(dir,'starts.txt'),'utf8').trim().split('\n').length,4);
 assert.equal(fs.existsSync(path.join(dir,'supervisor.lock')),false);
});
test('stop during backoff prevents further spawn',async t=>{
 const dir=setup(t),ac=new AbortController();
 const r=await runSupervisor({dataDir:dir,childFile,backoffMs:10,env:{CHILD_MODE:'fail'},signal:ac.signal,onEvent:e=>{if(e.action==='restart_wait')ac.abort();}});
 assert.deepEqual(r,{state:'stopped',exitCode:0,starts:1});
});
test('stop terminates active child, escalates when TERM ignored and never restarts', {timeout:5000}, async t=>{
 const dir=setup(t),ac=new AbortController(),events=[];let timer;
 t.after(()=>clearInterval(timer));
 const r=await runSupervisor({dataDir:dir,childFile,signal:ac.signal,stopTimeoutMs:80,env:{CHILD_MODE:'ignore-term'},onEvent:e=>{
  events.push(e);if(e.action==='child_started')timer=setInterval(()=>{
   if(fs.existsSync(path.join(dir,'starts.txt'))){clearInterval(timer);ac.abort();}
  },20);
 }});
 assert.equal(r.starts,1);assert.equal(r.state,'stopped');
 assert.equal(events.find(e=>e.action==='child_exited').signal,'SIGKILL');
});
test('lock or corrupt store blocks startup without deleting evidence',async t=>{
 const dir=setup(t);fs.writeFileSync(path.join(dir,'store.lock'),'stale-or-live');
 assert.equal((await runSupervisor({dataDir:dir,childFile})).starts,0);
 assert.equal(fs.readFileSync(path.join(dir,'store.lock'),'utf8'),'stale-or-live');
 fs.unlinkSync(path.join(dir,'store.lock'));fs.writeFileSync(path.join(dir,'store.json'),'{broken');
 assert.equal((await runSupervisor({dataDir:dir,childFile})).state,'blocked');
 assert.equal(fs.readFileSync(path.join(dir,'store.json'),'utf8'),'{broken');
});
test('existing supervisor or live runtime is not taken over',async t=>{
 const dir=setup(t);fs.writeFileSync(path.join(dir,'supervisor.lock'),'existing');
 await assert.rejects(runSupervisor({dataDir:dir,childFile}),{code:'EEXIST'});
 fs.unlinkSync(path.join(dir,'supervisor.lock'));fs.writeFileSync(path.join(dir,'runtime.json'),JSON.stringify({pid:process.pid}));
 assert.equal((await runSupervisor({dataDir:dir,childFile})).state,'blocked');
});
test('precheck preserves blocked and expired attempts without granting retry',t=>{
 const dir=setup(t);const db={version:1,grants:{},attempts:[],events:{E:{event_id:'E',state:'blocked'},F:{event_id:'F',state:'leased',current_attempt_id:'attempt',lease_until:'2020-01-01T00:00:00Z'}}};
 const raw=JSON.stringify(db);fs.writeFileSync(path.join(dir,'store.json'),raw);precheck(dir);
 assert.equal(fs.readFileSync(path.join(dir,'store.json'),'utf8'),raw);
});
test('REAL executor and unbounded configuration are rejected before spawn',async t=>{
 const dir=setup(t);await assert.rejects(runSupervisor({dataDir:dir,childFile,env:{TESTENV_EXECUTOR_MODE:'REAL'}}),/ONLY_MOCK/);
 await assert.rejects(runSupervisor({dataDir:dir,childFile,maxRestarts:Infinity}),/invalid maxRestarts/);
 assert.equal(fs.existsSync(path.join(dir,'starts.txt')),false);
});
test('real server crash restarts under supervisor while uncertain lease stays blocked', {timeout:8000}, async t=>{
 const {createFileStore}=require('../testenv/loop/file-store.cjs');
 const dir=setup(t),ac=new AbortController();let now=Date.now()-20000;
 const store=createFileStore({dataDir:dir,clock:()=>new Date(now).toISOString(),leaseSeconds:10});
 store.createGrant({grant_id:'g',task_id:'TASK-LOCAL-E2E',source_endpoint_id:'origin-local',destination_endpoint_id:'worker-mock',expires_at:new Date(Date.now()+60000).toISOString()});
 await store.enqueue({event_id:'UNCERTAIN',task_id:'TASK-LOCAL-E2E',source_endpoint_id:'origin-local',destination_endpoint_id:'worker-mock',idempotency_key:'uncertain',payload_version:'v1',payload_digest:'a'.repeat(64),payload:{instruction:'must not repeat'}});
 const [lease]=await store.lease({destination_endpoint_id:'worker-mock'});
 await store.markExternalIntent({event_id:'UNCERTAIN',attempt_id:lease.current_attempt_id,endpoint_id:'worker-mock'});
 let currentPid,starts=0,killed=false,verified=false,pollError;const events=[];
 const timer=setInterval(()=>{
  try{
   const runtime=path.join(dir,'runtime.json');if(!fs.existsSync(runtime))return;
   const r=JSON.parse(fs.readFileSync(runtime));if(r.pid!==currentPid)return;
   const db=JSON.parse(fs.readFileSync(path.join(dir,'store.json')));
   if(db.events.UNCERTAIN.state!=='blocked')return;
   if(!killed){killed=true;process.kill(currentPid,'SIGKILL');return;}
   if(starts===2){assert.equal(db.events.UNCERTAIN.attempt_count,1);assert.equal(db.attempts.length,1);assert.equal(db.cost_ledger.length,0);assert.deepEqual(db.side_effects,{});verified=true;ac.abort();}
  }catch(e){pollError=e;ac.abort();}
 },20);
 t.after(()=>{clearInterval(timer);ac.abort();});
 const r=await runSupervisor({dataDir:dir,signal:ac.signal,maxRestarts:1,backoffMs:10,env:{TESTENV_PORT:'0',TESTENV_HOST:'127.0.0.1',TESTENV_EXECUTOR_MODE:'MOCK'},onEvent:e=>{
  events.push(e);if(e.action==='child_started'){currentPid=e.pid;starts=e.starts;}
 }});
 clearInterval(timer);if(pollError)throw pollError;
 assert.equal(verified,true);assert.equal(r.state,'stopped');assert.equal(r.starts,2);
 assert.equal(events.filter(e=>e.action==='child_exited')[0].signal,'SIGKILL');
 assert.equal(fs.existsSync(path.join(dir,'runtime.json')),false);
});
