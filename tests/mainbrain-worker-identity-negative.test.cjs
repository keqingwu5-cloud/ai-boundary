'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPollingWorker}=require('../api/polling-worker-candidate.cjs');
const UUID='11111111-1111-4111-8111-111111111111';
const DIGEST='a'.repeat(64);
async function assertRejectedBeforeDispatch(event) {
  const calls=[];
  const client={receive:async()=>event,intent:async()=>calls.push('intent'),authorize:async()=>({authorized:true}),execute:async()=>calls.push('execute'),ack:async()=>calls.push('ack'),fail:async()=>calls.push('fail'),report:async()=>calls.push('report')};
  const worker=createPollingWorker({client,performTask:async()=>{calls.push('provider');return {execution_evidence:'synthetic:execution:ok',receipt_evidence:'synthetic:receipt:ok'};}});
  await assert.rejects(worker.runOnce(),/invalid authoritative attempt\/payload identity/);
  assert.deepEqual(calls,[],'invalid lease must not cause intent or provider side effects');
}
test('GPT2-P35-IDENTITY-001 rejects malformed attempt UUID before intent',async()=>{
  await assertRejectedBeforeDispatch({event_id:'EV1',current_attempt_id:'not-a-uuid',payload_digest:DIGEST});
});
test('GPT2-P35-IDENTITY-002 rejects malformed SHA-256 digest before intent',async()=>{
  await assertRejectedBeforeDispatch({event_id:'EV1',current_attempt_id:UUID,payload_digest:'invalid'});
});

test('batch cleanup timeout remains visible and attempts the remaining lease',async()=>{
 const reports=[];
 const leases=[1,2].map(i=>({event_id:'EV'+i,current_attempt_id:'11111111-1111-4111-8111-'+String(i).padStart(12,'0'),payload_digest:'a'.repeat(64)}));
 const forbidden=async()=>assert.fail('batch must not dispatch or ACK');
 const client={receive:async()=>leases,intent:forbidden,authorize:forbidden,execute:forbidden,ack:forbidden,fail:forbidden,
  report:async p=>{reports.push(p);if(reports.length===1)return new Promise(()=>{});}};
 const worker=createPollingWorker({client,cleanupTimeoutMs:100,performTask:forbidden});
 await assert.rejects(worker.runOnce(),/batch lease reconciliation incomplete: EV1:report_rejected/);
 assert.deepEqual(reports.map(p=>p.event_id),['EV1','EV2']);
});
