'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {fork}=require('node:child_process');const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {mintToken}=require('../testenv/loop/token.cjs');
test('real server + new worker completes MOCK over HTTP and restart does not redispatch', {timeout:10000}, async t=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'brain-http-'));let child;
 t.after(()=>{child?.kill('SIGKILL');fs.rmSync(data,{recursive:true,force:true});});
 const secret='isolated-test-origin-'.repeat(3);
 async function start(){
  child=fork(path.join(__dirname,'fixtures/testenv-wired-server.cjs'),[],{silent:true,env:{...process.env,TESTENV_DATA_DIR:data,TESTENV_PORT:'0',TESTENV_HOST:'127.0.0.1',TESTENV_EXECUTOR_MODE:'MOCK',TESTENV_ORIGIN_ID:'origin-local',TESTENV_WORKER_ID:'worker-mock',TESTENV_ORIGIN_SECRET:secret,TESTENV_WORKER_SECRET:'isolated-worker-'.repeat(3)}});
  let stderr='';child.stderr.on('data',s=>stderr+=s);
  return new Promise((resolve,reject)=>{
   child.once('message',m=>resolve('http://127.0.0.1:'+m.port));
   child.once('exit',code=>reject(Error('early exit '+code+' '+stderr)));
  });
 }
 const token=scopes=>mintToken({secret,endpoint_id:'origin-local',scopes});
 async function request(url,method,scopes,body){const r=await fetch(url,{method,headers:{authorization:'Bearer '+token(scopes),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(2000)});assert.equal(r.status,200,await r.clone().text());return (await r.json()).data;}
 let root=await start();
 await request(root+'/v1/tasks/send','POST',['tasks:send'],{event_id:'HTTP1',task_id:'TASK-LOCAL-E2E',destination_endpoint_id:'worker-mock',idempotency_key:'http-key',payload_version:'v1',payload:{instruction:'wire test'}});
 let e;for(let i=0;i<30;i++){e=await request(root+'/v1/tasks/HTTP1','GET',['tasks:status']);if(e.state==='ack_received')break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(e.state,'ack_received');assert.equal(e.result_kind,'MOCK');assert.equal(e.result_integrity,'ok');
 let exited=once(child,'exit');child.kill('SIGTERM');assert.deepEqual(await exited,[0,null]);assert.equal(fs.existsSync(path.join(data,'runtime.json')),false);
 root=await start();e=await request(root+'/v1/tasks/HTTP1','GET',['tasks:status']);assert.equal(e.state,'ack_received');
 const db=JSON.parse(fs.readFileSync(path.join(data,'store.json')));assert.equal(db.attempts.length,1);assert.equal(db.cost_ledger.length,1);assert.equal(db.meta.total_cost_usd,0);
 exited=once(child,'exit');child.kill('SIGTERM');assert.deepEqual(await exited,[0,null]);
});
