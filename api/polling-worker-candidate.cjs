'use strict';
// Candidate worker: no ChatGPT session wake-up and no implicit provider retry.
// All uncertain external outcomes are quarantined; only an independently
// verified preflight failure may take the ordinary retry path.
const {setTimeout: sleep}=require('node:timers/promises');
const {createHash}=require('node:crypto');
function createPollingWorker({client,performTask,prepareTask=async()=>{},intervalMs=1000,logger=()=>{}}={}) {
  if(!client || !['receive','intent','authorize','execute','ack','fail','report'].every(k=>typeof client[k]==='function'))
    throw new TypeError('authenticated client with receive/intent/authorize/execute/ack/fail/report is required');
  if(typeof performTask!=='function'||typeof prepareTask!=='function')
    throw new TypeError('performTask and prepareTask must be functions');
  if(!Number.isInteger(intervalMs)||intervalMs<100||intervalMs>3600000)
    throw new TypeError('invalid polling interval');
  let running=false;
  async function runOnce() {
    const received=await client.receive();
    const tasks=Array.isArray(received)?received:received?[received]:[];
    if(tasks.length===0)return {state:'idle'};
    // A single-lease API must never silently drop additional leased events.
    // Fail closed: preserve each valid attempt via evidence-only reporting.
    if(tasks.length>1){
      const failures=[];
      for(const e of tasks){
        if(!e||typeof e.event_id!=='string'||!e.event_id||
           typeof e.current_attempt_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.current_attempt_id)||
           typeof e.payload_digest!=='string'||!/^[0-9a-f]{64}$/i.test(e.payload_digest)){
          failures.push('missing_or_invalid_identity');
          continue;
        }
        try{
          await client.report({event_id:e.event_id,attempt_id:e.current_attempt_id,
            payload_digest:e.payload_digest,report_id:'batch-'+e.current_attempt_id,
            reason:'dispatch_authorization_unconfirmed'});
        }catch(error){
          failures.push(e.event_id+':report_rejected');
        }
      }
      if(failures.length)throw Error('batch lease reconciliation incomplete: '+failures.join(';'));
      return {state:'reconciliation_required',reason:'unexpected_multiple_leases',count:tasks.length};
    }
    const event=tasks[0],eventId=event.event_id,attemptId=event.current_attempt_id;
    if(typeof eventId!=='string'||!eventId ||
       typeof attemptId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId) ||
       typeof event.payload_digest!=='string'||!/^[0-9a-f]{64}$/i.test(event.payload_digest))
      throw Error('leased event missing or invalid authoritative attempt/payload identity');
    const executionKey=createHash('sha256').update(eventId+':'+event.payload_digest).digest('hex');
    const task=Object.freeze({event_id:eventId,task_id:event.task_id,
      attempt_id:attemptId,payload:event.payload,payload_version:event.payload_version,
      payload_digest:event.payload_digest,execution_idempotency_key:executionKey});
    let phase='preflight';
    // R03 draft: preserve only bounded synthetic test references in the
    // fallback report. This is not a provider-origin authenticity guarantee.
    let outcomeReference=null;
    async function checkCommittedAck() {
      if(typeof client.status!=='function')return false;
      try {
        const s=await client.status({event_id:eventId});
        return s?.state==='ack_received' && s.current_attempt_id===attemptId &&
          s.payload_digest===event.payload_digest && s.payload_version===event.payload_version;
      }catch(e) {
        logger({action:'status_readback_failed',event_id:eventId,attempt_id:attemptId,code:e.code||'ERROR'});
        return false;
      }
    }
    try {
      // Local validation ONLY; this callback must not call an external provider.
      await prepareTask(task);
      // This is the point beyond which an external side effect is possible.
      // No automatic restart is safe after this line without receiver reconciliation.
      phase='intent';
      await client.intent({event_id:eventId,attempt_id:attemptId});
      // Final best-effort grant check; not a provider-enforced revocation fence.
      phase='authorization';
      const permit=await client.authorize({event_id:eventId,attempt_id:attemptId});
      if(permit?.authorized!==true)
        throw Error('dispatch authorization not confirmed');
      phase='external';
      const r=await performTask(task);
      if(!r||typeof r.execution_evidence!=='string'||!r.execution_evidence.trim()||
         typeof r.receipt_evidence!=='string'||!r.receipt_evidence.trim())
        throw Error('task result requires execution and receipt evidence');
      // Only capture an evidence reference after both execution and receipt
      // evidence exist; never forward arbitrary raw provider output.
      if(/^synthetic:receipt:[A-Za-z0-9_-]{1,80}$/.test(r.receipt_evidence))
        outcomeReference=r.receipt_evidence;
      phase='execute';
      await client.execute({event_id:eventId,attempt_id:attemptId,execution_evidence:r.execution_evidence});
      phase='ack';
      await client.ack({event_id:eventId,attempt_id:attemptId,
        payload_digest:event.payload_digest,payload_version:event.payload_version,
        receipt_evidence:r.receipt_evidence});
      logger({action:'processed_api_only',event_id:eventId,attempt_id:attemptId});
      return {state:'processed',event_id:eventId,attempt_id:attemptId};
    }catch(e) {
      if(phase==='authorization'){
        // No provider call was made by this worker after this failed check.
        // Evidence can be saved even when the original execute grant was revoked.
        try {
          await client.report({event_id:eventId,attempt_id:attemptId,
            payload_digest:event.payload_digest,report_id:'auth-'+attemptId,
            reason:'dispatch_authorization_unconfirmed'});
        }catch(failure){
          logger({action:'p0_failure_receipt_unconfirmed',event_id:eventId,
            attempt_id:attemptId,reason:'dispatch_authorization_unconfirmed',
            code:failure.code||'ERROR'});
          throw failure;
        }
        logger({action:'dispatch_authorization_unconfirmed',event_id:eventId,
          attempt_id:attemptId,code:e.code||'ERROR'});
        return {state:'reconciliation_required',event_id:eventId,attempt_id:attemptId};
      }
      if(phase!=='preflight' && await checkCommittedAck()){
        logger({action:'api_ack_readback_confirmed',event_id:eventId,attempt_id:attemptId});
        return {state:'processed_readback',event_id:eventId,attempt_id:attemptId};
      }
      const reason=phase==='preflight'?'worker_step_failed':'reconciliation_required';
      try {
        await client.fail({event_id:eventId,attempt_id:attemptId,reason});
      }catch(failure){
        // ACK may have committed just before fail() hit a state conflict.
        if(phase!=='preflight' && await checkCommittedAck()){
          logger({action:'api_ack_readback_confirmed',event_id:eventId,attempt_id:attemptId});
          return {state:'processed_readback',event_id:eventId,attempt_id:attemptId};
        }
        if(phase!=='preflight'){
          // fail() may be denied after the business grant is revoked. The
          // distinct tasks:report path can preserve bounded evidence only.
          try {
            await client.report({event_id:eventId,attempt_id:attemptId,
              payload_digest:event.payload_digest,report_id:'outcome-'+attemptId,
              reason:'execution_outcome_unknown',
              ...(outcomeReference ? {evidence_reference:outcomeReference} : {})});
            logger({action:'reconciliation_required_evidence_only',event_id:eventId,
              attempt_id:attemptId});
            return {state:'reconciliation_required',event_id:eventId,attempt_id:attemptId};
          }catch(reportFailure){
            logger({action:'p0_failure_receipt_unconfirmed',event_id:eventId,attempt_id:attemptId,
              reason,code:reportFailure.code||'ERROR'});
            throw reportFailure;
          }
        }
        logger({action:'p0_failure_receipt_unconfirmed',event_id:eventId,attempt_id:attemptId,
          reason,code:failure.code||'ERROR'});
        throw failure; // Never claim that a remote quarantine succeeded.
      }
      const state=phase==='preflight'?'failed_attempt':'reconciliation_required';
      logger({action:state,event_id:eventId,attempt_id:attemptId,reason,code:e.code||'WORKER_STEP_ERROR'});
      return {state,event_id:eventId,attempt_id:attemptId};
    }
  }
  async function runUntilStopped({signal}={}) {
    if(running)throw Error('worker is already running');
    running=true;
    try {
      while(!signal?.aborted){
        await runOnce();
        try {await sleep(intervalMs,undefined,{signal});}
        catch(e){if(e.name==='AbortError' && signal?.aborted)break;throw e;}
      }
    }finally{running=false;}
  }
  return {runOnce,runUntilStopped};
}
module.exports={createPollingWorker};
