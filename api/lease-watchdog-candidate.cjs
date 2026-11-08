'use strict';
// Isolated, opt-in monitor; must run under a separate, authorised operator.
// It does not fetch tasks, call AI providers, send messages, or restart attempts.
// A real scheduler and delivered notifications are NOT included in this candidate.
const {setTimeout: sleep}=require('node:timers/promises');
function createLeaseWatchdog({store,destinationEndpointId,intervalMs=60_000,sweepTimeoutMs=30_000,logger=()=>{}}={}){
  if(!store||typeof store.sweepExpired!=='function')
    throw new TypeError('a store with sweepExpired is required');
  if(typeof destinationEndpointId!=='string'||!destinationEndpointId.trim())
    throw new TypeError('destinationEndpointId required');
  if(!Number.isInteger(intervalMs)||intervalMs<1_000||intervalMs>3_600_000)
    throw new TypeError('watchdog interval must be 1s to 1h');
  if(!Number.isInteger(sweepTimeoutMs)||sweepTimeoutMs<100||sweepTimeoutMs>3_600_000)
    throw new TypeError('watchdog sweep timeout must be 100ms to 1h');
  let running=false;
  async function runOnce(){
    // Timeout only bounds local waiting. The DB may still commit a sweep
    // after this deadline, so do not claim remote cancellation/success.
    let sweepTimer;
    let quarantined;
    try{
      quarantined=await Promise.race([
        Promise.resolve().then(()=>store.sweepExpired({destination_endpoint_id:destinationEndpointId})),
        new Promise((_,reject)=>{
          sweepTimer=setTimeout(()=>{
            const error=Error('sweep_timeout');
            error.code='SWEEP_TIMEOUT';
            reject(error);
          },sweepTimeoutMs);
        })
      ]);
    }finally{if(sweepTimer)clearTimeout(sweepTimer);}
    if(!Number.isSafeInteger(quarantined)||quarantined<0)
      throw new Error('invalid sweep result; no success should be claimed');
    logger({action:'lease_sweep_completed',quarantined,destination_endpoint_id:destinationEndpointId,
      delivery:'inbox_only_not_pushed'});
    return {state:'checked',quarantined,delivery:'inbox_only_not_pushed'};
  }
  async function runUntilStopped({signal}={}){
    if(running)throw new Error('watchdog already running');
    running=true;
    try{
      while(!signal?.aborted){
        try {await runOnce();}
        catch(error){
          // Sweep may have committed before its response failed. Never claim
          // a successful scan or notification; independent monitoring required.
          try {logger({action:'watchdog_loop_unhealthy',
            destination_endpoint_id:destinationEndpointId,
            code:typeof error?.code==='string'&&error.code?error.code:'SWEEP_ERROR',
            sweep_completion_unknown:true,supervisor_required:true,
            delivery:'not_delivered'});}
          catch(_) { /* Keep original failure even if the logger fails. */ }
          throw error;
        }
        try {await sleep(intervalMs,undefined,{signal});}
        catch(e){if(e.name==='AbortError'&&signal?.aborted)break;throw e;}
      }
    }finally{running=false;}
  }
  return {runOnce,runUntilStopped};
}
module.exports={createLeaseWatchdog};
