'use strict';
// No ChatGPT conversation wake-up support. This worker polls an explicitly
// configured, authenticated task client when a service operator starts it.
const {setTimeout: sleep}=require('node:timers/promises');
function createPollingWorker({client,performTask,intervalMs=1000,logger=()=>{}}={}) {
  if(!client || !['receive','execute','ack','fail'].every(k=>typeof client[k]==='function'))
    throw new TypeError('authenticated task client with receive/execute/ack/fail is required');
  if(typeof performTask!=='function')throw new TypeError('performTask handler required');
  if(!Number.isInteger(intervalMs)||intervalMs<100||intervalMs>3600000)
    throw new TypeError('invalid polling interval');
  let running=false;
  async function runOnce() {
    const received=await client.receive();
    const tasks=Array.isArray(received)?received:received?[received]:[];
    if(tasks.length===0)return {state:'idle'};
    // A single event per iteration to avoid unbounded concurrent task starts.
    const event=tasks[0],eventId=event.event_id,attemptId=event.current_attempt_id;
    if(!eventId||!attemptId)throw Error('leased event missing authoritative attempt identity');
    try {
      const r=await performTask(Object.freeze({
        event_id:eventId,task_id:event.task_id,
        attempt_id:attemptId,payload:event.payload,payload_version:event.payload_version
      }));
      if(!r||typeof r.execution_evidence!=='string'||!r.execution_evidence.trim()||
         typeof r.receipt_evidence!=='string'||!r.receipt_evidence.trim())
        throw Error('task result requires execution and receipt evidence');
      await client.execute({event_id:eventId,attempt_id:attemptId,execution_evidence:r.execution_evidence});
      await client.ack({event_id:eventId,attempt_id:attemptId,
        payload_digest:event.payload_digest,payload_version:event.payload_version,
        receipt_evidence:r.receipt_evidence});
      logger({action:'processed',event_id:eventId,attempt_id:attemptId});
      return {state:'processed',event_id:eventId,attempt_id:attemptId};
    }catch(e) {
      // An external effect or ACK may have committed before its reply was lost.
      // Never automatically requeue an uncertain outcome.
      try {
        await client.fail({event_id:eventId,attempt_id:attemptId,reason:'execution_outcome_unknown'});
      }catch(failure){
        logger({action:'fail_receipt_error',event_id:eventId,code:failure.code||'ERROR'});
        throw failure; // fail closed; do not swallow missing failure receipt.
      }
      logger({action:'reconciliation_requested',event_id:eventId,code:e.code||'WORKER_STEP_ERROR'});
      return {state:'needs_reconciliation',event_id:eventId,attempt_id:attemptId};
    }
  }
  async function runUntilStopped({signal}={}) {
    if(running)throw Error('worker is already running');
    running=true;
    try {
      while(!signal?.aborted) {
        await runOnce();
        try {await sleep(intervalMs,undefined,{signal});}
        catch(e){if(e.name==='AbortError' && signal?.aborted)break;throw e;}
      }
    }finally{running=false;}
  }
  return {runOnce,runUntilStopped};
}
module.exports={createPollingWorker};
