'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const target=process.env.LIFECYCLE_TARGET||path.resolve(__dirname,'../testenv/loop/server.cjs');
async function run(t,mode,signal){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brain-lifecycle-'));
 const child=fork(path.join(__dirname,'fixtures/worker-lifecycle.cjs'),[],{
  env:{...process.env,LIFECYCLE_TARGET:target,LIFECYCLE_DATA:dir,LIFECYCLE_MODE:mode},silent:true});
 let stderr='',port,timedOut=false;
 child.stderr.on('data',s=>stderr+=s);
 t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');fs.rmSync(dir,{recursive:true,force:true});});
 const result=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},2500);
  child.on('message',m=>{if(m.port)port=m.port;if(m.worker&&signal)setTimeout(()=>child.kill(signal),40);});
  child.on('error',reject);
  child.on('exit',(code,sig)=>{clearTimeout(timer);resolve({code,sig});});
 });
 assert.equal(timedOut,false,'worker stopped but process/HTTP remained alive: '+stderr);
 assert.equal(result.sig,null);
 assert.equal(result.code,signal&&mode!=='late-error'?0:1,stderr);
 assert.equal(fs.existsSync(path.join(dir,'runtime.json')),false,'stale running marker');
 assert.ok(port,'real HTTP listener was started');
 await new Promise((resolve,reject)=>{
  const socket=net.connect({host:'127.0.0.1',port});
  socket.once('connect',()=>{socket.destroy();reject(Error('listener still alive'));});
  socket.once('error',e=>e.code==='ECONNREFUSED'?resolve():reject(e));
 });
}
for(const mode of ['reject','resolve','abort-error','throw'])test('worker '+mode+' closes HTTP and exits nonzero',t=>run(t,mode));
for(const signal of ['SIGTERM','SIGINT'])test(signal+' stops normally and removes runtime',t=>run(t,'wait',signal));
test('failure during shutdown preserves nonzero exit',t=>run(t,'late-error','SIGTERM'));
