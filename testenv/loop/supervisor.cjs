'use strict';
// Foreground, bounded, local MOCK runner. No installation, scheduling or cloud calls.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
function precheck(dataDir){
 if(fs.existsSync(path.join(dataDir,'store.lock')))throw Error('STORE_LOCK_PRESENT');
 const file=path.join(dataDir,'store.json');
 if(fs.existsSync(file)){
  const db=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!db || db.version!==1 || !db.events || Array.isArray(db.events) || typeof db.events!=='object' || !db.grants || typeof db.grants!=='object' || !Array.isArray(db.attempts))throw Error('STORE_INVALID');
  const states=new Set(['queued','leased','executed','ack_received','failed','blocked']);
  for(const [id,e] of Object.entries(db.events)){
   if(!e || e.event_id!==id || !states.has(e.state))throw Error('EVENT_INVALID');
   if(['leased','executed'].includes(e.state) && (!e.current_attempt_id || !Number.isFinite(Date.parse(e.lease_until))))throw Error('LEASE_INVALID');
  }
 }
 const runtime=path.join(dataDir,'runtime.json');
 if(fs.existsSync(runtime)){
  const r=JSON.parse(fs.readFileSync(runtime,'utf8'));
  if(!Number.isInteger(r.pid)||r.pid<=0)throw Error('RUNTIME_INVALID');
  try{process.kill(r.pid,0);}catch(e){if(e.code==='ESRCH')return;throw e;}
  throw Error('RUNTIME_STILL_ALIVE');
 }
}
async function runSupervisor({dataDir,signal,maxRestarts=3,backoffMs=1000,maxBackoffMs=30000,stopTimeoutMs=2000,childFile=path.join(__dirname,'server.cjs'),env=process.env,onEvent=()=>{}}={}){
 if(!dataDir)throw TypeError('dataDir required');
 for(const [k,v,min,max] of [['maxRestarts',maxRestarts,0,10],['backoffMs',backoffMs,10,30000],['maxBackoffMs',maxBackoffMs,10,60000],['stopTimeoutMs',stopTimeoutMs,50,10000]])if(!Number.isInteger(v)||v<min||v>max)throw TypeError('invalid '+k);
 if(maxBackoffMs<backoffMs)throw TypeError('maxBackoffMs below backoffMs');
 if((env.TESTENV_EXECUTOR_MODE||'MOCK')!=='MOCK')throw Error('ONLY_MOCK_AUTHORIZED');
 if(signal?.aborted)return {state:'stopped',exitCode:0,starts:0};
 fs.mkdirSync(dataDir,{recursive:true});
 const lock=path.join(dataDir,'supervisor.lock');
 const lockFd=fs.openSync(lock,'wx');
 let child=null,starts=0;
 try{
  fs.writeFileSync(lockFd,String(process.pid));
  while(!signal?.aborted){
   try{precheck(dataDir);}catch(e){onEvent({action:'precheck_blocked',code:e.code||e.message});return {state:'blocked',exitCode:2,starts};}
   const result=await new Promise((resolve,reject)=>{
    let timer=null,settled=false,eventError=null;
    const finish=(result,err)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);child=null;(err||eventError)?reject(err||eventError):resolve(result);};
    const stop=()=>{
     if(!child)return;
     child.kill('SIGTERM');
     if(!timer)timer=setTimeout(()=>child?.kill('SIGKILL'),stopTimeoutMs);
    };
    const logFd=fs.openSync(path.join(dataDir,'supervisor-child.log'),'a');
    try{child=spawn(process.execPath,[childFile],{env:{...env,TESTENV_EXECUTOR_MODE:'MOCK',TESTENV_DATA_DIR:dataDir},stdio:['ignore',logFd,logFd]});}finally{fs.closeSync(logFd);}
    starts++;
    child.once('error',e=>finish(null,e));
    child.once('exit',(code,exitSignal)=>finish({code,signal:exitSignal}));
    signal?.addEventListener('abort',stop,{once:true});
    if(signal?.aborted)stop();
    try{onEvent({action:'child_started',pid:child.pid,starts});}catch(e){eventError=e;child.kill('SIGKILL');/* exit listener reaps child */}
   });
   onEvent({action:'child_exited',...result,starts});
   if(signal?.aborted)return {state:'stopped',exitCode:0,starts};
   if(starts>maxRestarts)return {state:'restart_limit',exitCode:1,starts};
   const waitMs=Math.min(maxBackoffMs,backoffMs*2**(starts-1));
   onEvent({action:'restart_wait',waitMs,starts});
   try{await delay(waitMs,undefined,{signal});}catch(e){if(!signal?.aborted)throw e;}
  }
  return {state:'stopped',exitCode:0,starts};
 }finally{
  child?.kill('SIGKILL');fs.closeSync(lockFd);fs.unlinkSync(lock);
 }
}
if(require.main===module){
 const cfg=require('./config.cjs');const ac=new AbortController();
 process.once('SIGINT',()=>ac.abort());process.once('SIGTERM',()=>ac.abort());
 runSupervisor({dataDir:cfg.DATA,signal:ac.signal,onEvent:e=>process.stderr.write(JSON.stringify({ts:new Date().toISOString(),...e})+'\n')})
 .then(result=>{console.log(JSON.stringify(result));process.exitCode=result.exitCode;})
 .catch(e=>{console.error(JSON.stringify({state:'blocked',code:e.code||e.message}));process.exitCode=2;});
}
module.exports={runSupervisor,precheck};
