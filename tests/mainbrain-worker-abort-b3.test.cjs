'use strict';
/**
 * B3 Stop & cleanup — pre-dispatch abort + bounded cleanup
 * handoff_id: FB-PR50-BOT3-B0-B4-20261105-V01
 * Case mapping (stable custom IDs; formal case table still absent):
 *   CASE_B3_ABORT_BEFORE_DISPATCH  ↔ abort after prepare, before intent/authorize/performTask
 *   CASE_B3_ABORT_IN_FLIGHT        ↔ abort after dispatch started; cleanup without claiming remote stop
 *   CASE_B3_ABORT_DURING_CLEANUP   ↔ fail/report ignore external abort signal; finite timeout + visible fail
 *   CASE_B3_STOP_NOT_REMOTE        ↔ stop request never asserts remote_stop_confirmed
 */
const test=require('node:test'),assert=require('node:assert/strict');
const {createPollingWorker}=require('../api/polling-worker-candidate.cjs');

const UUID='11111111-1111-4111-8111-111111111111';
const row={event_id:'EV1',task_id:'T1',source_endpoint_id:'source',destination_endpoint_id:'target',
 payload_digest:'a'.repeat(64),payload_version:'1',payload:{x:'test'},
 state:'leased',grant_id:'G1',current_attempt_id:UUID,
 lease_until:'2026-10-20T06:01:00.000Z',external_intent_at:null,attempt_count:1};

function baseClient(overrides={}){
 const calls=[];
 const client={
  receive:async()=>[row],
  intent:async()=>{calls.push('intent');},
  authorize:async()=>{calls.push('authorize');return {authorized:true};},
  execute:async()=>{calls.push('execute');},
  ack:async()=>{calls.push('ack');},
  fail:async p=>{calls.push('fail:'+p.reason);return {state:'blocked'};},
  report:async p=>{calls.push('report:'+p.reason);return {state:'blocked',recorded:true};},
  status:async()=>({...row,state:'leased'}),
  ...overrides,
  _calls:calls
 };
 // Keep _calls shared even when overrides replace methods that push.
 Object.defineProperty(client,'_calls',{get:()=>calls});
 return client;
}

test('CASE_B3_ABORT_BEFORE_DISPATCH: aborted signal before intent skips dispatch entirely',async()=>{
 const calls=[],logs=[];
 const ac=new AbortController();
 const client={
  receive:async()=>[row],
  intent:async()=>{calls.push('intent');},
  authorize:async()=>{calls.push('authorize');return {authorized:true};},
  execute:async()=>{calls.push('execute');},
  ack:async()=>{calls.push('ack');},
  fail:async()=>{calls.push('fail');},
  report:async()=>{calls.push('report');},
  status:async()=>({...row,state:'leased'})
 };
 const worker=createPollingWorker({
  client,intervalMs:100,logger:x=>logs.push(x),
  prepareTask:async()=>{ac.abort();},
  performTask:async()=>{calls.push('provider');return {execution_evidence:'e',receipt_evidence:'synthetic:receipt:x'};}
 });
 const out=await worker.runOnce({signal:ac.signal});
 assert.equal(out.state,'aborted_before_dispatch');
 assert.equal(out.remote_stop_confirmed,false);
 assert.deepEqual(calls,[],'must not enter intent/authorize/performTask/fail after pre-dispatch abort');
 assert(logs.some(x=>x.action==='aborted_before_dispatch' && x.remote_stop_confirmed===false));
});

test('CASE_B3_ABORT_BEFORE_DISPATCH: runUntilStopped abort mid-prepare does not dispatch',async()=>{
 const calls=[],logs=[];
 const ac=new AbortController();
 let prepareHits=0;
 const client={
  receive:async()=>[row],
  intent:async()=>{calls.push('intent');},
  authorize:async()=>{calls.push('authorize');return {authorized:true};},
  execute:async()=>{calls.push('execute');},
  ack:async()=>{calls.push('ack');},
  fail:async()=>{calls.push('fail');},
  report:async()=>{calls.push('report');},
  status:async()=>({...row,state:'leased'})
 };
 const worker=createPollingWorker({
  client,intervalMs:100,logger:x=>logs.push(x),
  prepareTask:async()=>{prepareHits+=1;ac.abort();},
  performTask:async()=>{calls.push('provider');throw Error('must not run');}
 });
 await worker.runUntilStopped({signal:ac.signal});
 assert.equal(prepareHits,1);
 assert.deepEqual(calls,[],'loop-boundary-only abort would still dispatch; B3 forbids that');
 assert(logs.some(x=>x.action==='aborted_before_dispatch'));
});

test('CASE_B3_ABORT_IN_FLIGHT: abort after intent still cleans up without claiming remote stop',async()=>{
 const calls=[],logs=[],reports=[];
 const ac=new AbortController();
 const client={
  receive:async()=>[row],
  intent:async()=>{calls.push('intent');ac.abort();},
  authorize:async()=>{calls.push('authorize');return {authorized:true};},
  execute:async()=>{calls.push('execute');},
  ack:async()=>{calls.push('ack');},
  fail:async p=>{calls.push('fail:'+p.reason);return {state:'blocked'};},
  report:async p=>{reports.push(p);calls.push('report:'+p.reason);return {state:'blocked'};},
  status:async()=>({...row,state:'intent_recorded'})
 };
 const worker=createPollingWorker({
  client,intervalMs:100,cleanupTimeoutMs:500,logger:x=>logs.push(x),
  performTask:async()=>{
   calls.push('provider');
   return {execution_evidence:'synthetic:execution:if',receipt_evidence:'synthetic:receipt:if'};
  }
 });
 const out=await worker.runOnce({signal:ac.signal});
 assert.equal(out.state,'aborted_in_flight');
 assert.equal(out.remote_stop_confirmed,false);
 assert.ok(calls.includes('intent'));
 assert.ok(calls.some(x=>x.startsWith('fail:')),'in-flight abort must still attempt fail cleanup');
 assert(!calls.includes('ack'),'must not complete happy-path ack after in-flight abort');
 // No automatic redispatch of unknown side effects
 assert.equal(calls.filter(x=>x==='intent').length,1);
 assert(logs.some(x=>x.action==='aborted_in_flight' && x.remote_stop_confirmed===false));
});

test('CASE_B3_ABORT_DURING_CLEANUP: fail/report ignore external abort; timeout is visible',async()=>{
 const logs=[];
 const ac=new AbortController();
 let failStarted=null;
 const client={
  receive:async()=>[row],
  intent:async()=>{},
  authorize:async()=>({authorized:true}),
  execute:async()=>{},
  ack:async()=>{throw Error('force cleanup path');},
  status:async()=>({...row,state:'executed'}),
  fail:async()=>{
   failStarted=Date.now();
   ac.abort(); // external stop arrives during cleanup
   // Hang longer than cleanupTimeoutMs — must surface CLEANUP_TIMEOUT, not hang forever
   // and must NOT observe the external abort as cancellation of fail itself.
   await new Promise(r=>setTimeout(r,800));
   return {state:'blocked'};
  },
  report:async()=>{throw Error('should not reach if fail hangs past timeout');}
 };
 const worker=createPollingWorker({
  client,intervalMs:100,cleanupTimeoutMs:200,logger:x=>logs.push(x),
  performTask:async()=>({execution_evidence:'synthetic:execution:c',receipt_evidence:'synthetic:receipt:c'})
 });
 await assert.rejects(worker.runOnce({signal:ac.signal}),(err)=>{
  assert.equal(err.code,'CLEANUP_TIMEOUT');
  return true;
 });
 assert.ok(failStarted!==null,'fail must have been entered');
 assert(logs.some(x=>x.action==='p0_failure_receipt_unconfirmed' &&
  (x.reason==='cleanup_timeout'||x.code==='CLEANUP_TIMEOUT'||String(x.reason||'').includes('cleanup'))),
  'cleanup timeout must be explicitly visible');
 // External abort must not be treated as confirmed remote stop
 assert(!logs.some(x=>x.remote_stop_confirmed===true));
});

test('CASE_B3_ABORT_DURING_CLEANUP: fail completes under abort signal (signal not forwarded)',async()=>{
 const calls=[],logs=[];
 const ac=new AbortController();
 const client={
  receive:async()=>[row],
  intent:async()=>{calls.push('intent');},
  authorize:async()=>{calls.push('authorize');return {authorized:true};},
  execute:async()=>{calls.push('execute');},
  ack:async()=>{calls.push('ack');throw Error('force cleanup');},
  status:async()=>({...row,state:'executed'}),
  fail:async p=>{
   calls.push('fail:'+p.reason);
   ac.abort();
   // Completes quickly; must succeed even though signal is aborted
   return {state:'blocked'};
  },
  report:async p=>{calls.push('report:'+(p.evidence_reference||p.reason));return {state:'blocked'};}
 };
 const worker=createPollingWorker({
  client,intervalMs:100,cleanupTimeoutMs:1000,logger:x=>logs.push(x),
  performTask:async()=>{
   calls.push('provider');
   return {execution_evidence:'synthetic:execution:ok',receipt_evidence:'synthetic:receipt:ok'};
  }
 });
 const out=await worker.runOnce({signal:ac.signal});
 // Cleanup succeeded despite abort during fail — either reconciliation or aborted_in_flight
 assert.ok(['reconciliation_required','aborted_in_flight'].includes(out.state),out.state);
 assert.equal(out.remote_stop_confirmed,false);
 assert.ok(calls.some(x=>x.startsWith('fail:')),'fail must complete');
 assert.equal(ac.signal.aborted,true);
});

test('CASE_B3_STOP_NOT_REMOTE: every abort outcome keeps remote_stop_confirmed false',async()=>{
 const ac=new AbortController();
 const client={
  receive:async()=>[row],
  intent:async()=>{},authorize:async()=>({authorized:true}),
  execute:async()=>{},ack:async()=>{},
  fail:async()=>({state:'blocked'}),report:async()=>({state:'blocked'}),
  status:async()=>({...row,state:'leased'})
 };
 const worker=createPollingWorker({
  client,intervalMs:100,
  prepareTask:async()=>{ac.abort();},
  performTask:async()=>{throw Error('no');}
 });
 const out=await worker.runOnce({signal:ac.signal});
 assert.equal(out.remote_stop_confirmed,false);
 assert.notEqual(out.state,'processed');
 // Explicit: stop request is local; never upgrade to remote stop
 assert.notEqual(out.remote_stop_confirmed,true);
});

test('CASE_B3 strong mutation: stripping pre-dispatch abort check must fail positive assert',async()=>{
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
 function mutated(relative,oldValue,newValue){
  const filename=require.resolve(relative);
  const source=fs.readFileSync(filename,'utf8');
  assert.equal(source.split(oldValue).length-1,1,'B3 mutation marker must exist exactly once');
  const m=new Module(filename,module);
  m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
  m._compile(source.replace(oldValue,newValue),filename);
  return m.exports;
 }
 // Drop the pre-dispatch abort gate; in-flight/cleanup paths left intact.
 const mutatedWorker=mutated('../api/polling-worker-candidate.cjs',
  'if(signal?.aborted){\n        logger({action:\'aborted_before_dispatch\'',
  'if(false && signal?.aborted){\n        logger({action:\'aborted_before_dispatch\'').createPollingWorker;
 const calls=[],logs=[];
 const ac=new AbortController();
 const client={
  receive:async()=>[{event_id:'EV1',task_id:'T1',payload_digest:'a'.repeat(64),payload_version:'1',
   payload:{x:1},current_attempt_id:UUID,state:'leased'}],
  intent:async()=>{calls.push('intent');},
  authorize:async()=>{calls.push('authorize');return {authorized:true};},
  execute:async()=>{calls.push('execute');},
  ack:async()=>{calls.push('ack');},
  fail:async()=>{calls.push('fail');},
  report:async()=>{calls.push('report');},
  status:async()=>({state:'leased',current_attempt_id:UUID,payload_digest:'a'.repeat(64),payload_version:'1'})
 };
 const worker=mutatedWorker({
  client,intervalMs:100,logger:x=>logs.push(x),
  prepareTask:async()=>{ac.abort();},
  performTask:async()=>{calls.push('provider');return {execution_evidence:'e',receipt_evidence:'synthetic:receipt:m'};}
 });
 const out=await worker.runOnce({signal:ac.signal});
 // Positive B3 contract MUST fail on the mutant (dispatch still happens).
 assert.throws(()=>{
  assert.equal(out.state,'aborted_before_dispatch');
  assert.deepEqual(calls,[]);
 },{code:'ERR_ASSERTION'});
});

