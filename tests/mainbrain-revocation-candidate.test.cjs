'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPostgresStore}=require('../api/pg-store-candidate.cjs');
const {createPollingWorker}=require('../api/polling-worker-candidate.cjs');
const UUID='11111111-1111-4111-8111-111111111111',NOW='2026-10-20T06:00:00.000Z';
const validGrant={grant_id:'G1',task_id:'T1',source_endpoint_id:'source',destination_endpoint_id:'target',
 allowed_actions:['send','receive','execute','ack'],expires_at:'2026-10-21T00:00:00Z',revoked_at:null,stopped:false,max_attempts:3};
const row={event_id:'EV1',task_id:'T1',source_endpoint_id:'source',destination_endpoint_id:'target',
 payload_digest:'a'.repeat(64),payload_version:'1',payload:{x:'test'},
 state:'leased',grant_id:'G1',current_attempt_id:UUID,
 lease_until:'2026-10-20T06:01:00.000Z',external_intent_at:NOW,attempt_count:1};
function harness(handle){
 const calls=[];
 const c={query:async(sql,params=[])=>{calls.push({sql,params});if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rows:[]};return handle(sql,params)||{rows:[]};},release:()=>{}};
 const pool={connect:async()=>c,query:async(sql,params)=>c.query(sql,params)};
 return {store:createPostgresStore({pool,clock:()=>NOW}),calls};
}
test('P0-A dispatch authorization refuses revoked grant after committed intent',async()=>{
 const revoked={...validGrant,revoked_at:'2026-10-20T05:59:59.000Z'};
 const {store,calls}=harness(sql=>{
   if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
   if(sql.includes('FROM mainbrain_api.grants'))return {rows:[revoked]};
   return {rows:[]};
 });
 await assert.rejects(store.authorizeDispatch({event_id:'EV1',attempt_id:UUID,endpoint_id:'target'}),/grant revoked/);
 assert(calls.some(x=>x.sql==='ROLLBACK'));
 assert(!calls.some(x=>x.sql.includes('SET state=')||x.sql.includes('INSERT INTO mainbrain_api.receipts')));
});
test('P0-A worker never calls provider if last pre-dispatch authorization fails',async()=>{
 const calls=[],forbidden=Object.assign(Error('revoked'),{code:'FORBIDDEN'});
 const client={
  receive:async()=>[{...row}],intent:async()=>{calls.push('intent');},
  authorize:async()=>{calls.push('authorize');throw forbidden;},
  execute:async()=>{calls.push('execute');},ack:async()=>{calls.push('ack');},
  fail:async()=>{calls.push('fail');throw forbidden;},
  report:async p=>{calls.push('report:'+p.reason);return {state:'blocked'};},
  status:async()=>({state:'leased',current_attempt_id:UUID})
 };
 const w=createPollingWorker({client,performTask:async()=>{calls.push('provider');throw Error('should not run');}});
 const result=await w.runOnce();
 assert.equal(result.state,'reconciliation_required');
 assert.deepEqual(calls,['intent','authorize','report:dispatch_authorization_unconfirmed']);
});
test('P0-C reporting after grant revocation records bounded evidence without granting execution',async()=>{
 const revoked={...validGrant,revoked_at:'2026-10-20T05:59:59.000Z'};
 const report={event_id:'EV1',attempt_id:UUID,endpoint_id:'target',
  payload_digest:row.payload_digest,report_id:'outcome-'+UUID,
  reason:'execution_outcome_unknown',evidence_reference:'receipt:synthetic'};
 const saved={...report};
 const {store,calls}=harness((sql)=>{
  if(sql.includes('SELECT * FROM mainbrain_api.events'))return {rows:[row]};
  if(sql.includes('FROM mainbrain_api.grants'))return {rows:[revoked]};
  if(sql.includes('INSERT INTO mainbrain_api.outcome_reports'))return {rows:[saved]};
  if(sql.includes("SET state='blocked'"))return {rows:[{...row,state:'blocked'}]};
  return {rows:[]};
 });
 const result=await store.recordOutcome(report);
 assert.equal(result.state,'blocked');
 assert.equal(result.recorded,true);
 assert(calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.outcome_reports')));
 assert(calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.event_logs')));
 assert(!calls.some(x=>x.sql.includes('FROM mainbrain_api.grants')));
 assert(!calls.some(x=>x.sql.includes("SET state='queued'")||x.sql.includes('INSERT INTO mainbrain_api.attempts')));
});
test('P0-C forged or stale destination cannot append evidence',async()=>{
 const {store,calls}=harness(sql=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
  return {rows:[]};
 });
 const data={event_id:'EV1',attempt_id:UUID,endpoint_id:'fake',
  payload_digest:row.payload_digest,report_id:'outcome-'+UUID,reason:'execution_outcome_unknown'};
 await assert.rejects(store.recordOutcome(data),/attempt|endpoint/);
 await assert.rejects(store.recordOutcome({...data,endpoint_id:'target',attempt_id:'22222222-2222-4222-8222-222222222222'}),/attempt|endpoint/);
 assert(!calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.outcome_reports')));
});
test('P0-C report idempotency returns original record but rejects changed replay',async()=>{
 const original={event_id:'EV1',attempt_id:UUID,endpoint_id:'target',payload_digest:row.payload_digest,
  report_id:'outcome-'+UUID,reason:'execution_outcome_unknown',evidence_reference:'receipt:1'};
 const {store,calls}=harness(sql=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[{...row,state:'blocked'}]};
  if(sql.includes('INSERT INTO mainbrain_api.outcome_reports'))return {rows:[]};
  if(sql.includes('FROM mainbrain_api.outcome_reports'))return {rows:[original]};
  return {rows:[]};
 });
 const result=await store.recordOutcome(original);
 assert.equal(result.recorded,true);
 await assert.rejects(store.recordOutcome({...original,evidence_reference:'receipt:tampered'}),/CONFLICT|conflict|changed/i);
 assert(!calls.some(x=>x.sql.includes('INSERT INTO mainbrain_api.event_logs')));
});
test('P0-C outcome reporting cannot accept arbitrary reasons, oversized evidence or missing digest',async()=>{
 const {store,calls}=harness(()=>({rows:[]}));
 for(const p of [
 {reason:'grant_admin_write'},
 {reason:'execution_outcome_unknown',evidence_reference:'X'.repeat(513)},
 {reason:'execution_outcome_unknown',payload_digest:''}
 ]){
  await assert.rejects(store.recordOutcome({event_id:'EV1',attempt_id:UUID,
   endpoint_id:'target',report_id:'outcome-'+UUID,payload_digest:row.payload_digest,...p}),/reason|evidence|digest|request/i);
 }
 assert.equal(calls.length,0);
});

test('R03 Worker preserves bounded synthetic evidence after ACK timeout and revoked fail',async()=>{
 const reports=[],calls=[];
 const client={
  receive:async()=>[row],intent:async()=>{calls.push('intent');},
  authorize:async()=>({authorized:true}),execute:async()=>{calls.push('execute');},
  ack:async()=>{calls.push('ack');throw Error('synthetic timeout');},
  status:async()=>({...row,state:'executed'}),
  fail:async()=>{calls.push('fail');throw Error('synthetic revoked');},
  report:async p=>{reports.push(p);return {state:'blocked'};}
 };
 const worker=createPollingWorker({client,performTask:async()=>{
  calls.push('provider');
  return {execution_evidence:'synthetic:execution:123',receipt_evidence:'synthetic:receipt:456'};
 }});
 const out=await worker.runOnce();
 assert.equal(out.state,'reconciliation_required');
 assert.equal(calls.filter(x=>x==='provider').length,1);
 assert.equal(reports.length,1);
 assert.equal(reports[0].reason,'execution_outcome_unknown');
 assert.equal(reports[0].evidence_reference,'synthetic:receipt:456');
});
test('R03 Worker does not invent a reference when provider fails before receipt',async()=>{
 const reports=[];
 const client={receive:async()=>[row],intent:async()=>{},
  authorize:async()=>({authorized:true}),
  execute:async()=>{throw Error('must not execute');},
  ack:async()=>{throw Error('must not ACK');},
  status:async()=>({...row,state:'leased'}),
  fail:async()=>{throw Error('revoked');},
  report:async p=>{reports.push(p);return {state:'blocked'};}};
 const worker=createPollingWorker({client,performTask:async()=>{throw Error('provider result unknown');}});
 assert.equal((await worker.runOnce()).state,'reconciliation_required');
 assert.equal(reports.length,1);
 assert.equal(Object.hasOwn(reports[0],'evidence_reference'),false);
});
test('R03 Store.get exposes only bounded current-attempt outcome pointers',async()=>{
 const sample={attempt_id:UUID,report_id:'outcome-'+UUID,reason:'execution_outcome_unknown',
   evidence_reference:'synthetic:receipt:456',received_at:NOW,
   endpoint_id:'MUST_NOT_BE_EXPOSED',payload_digest:'MUST_NOT_BE_EXPOSED'};
 const {store,calls}=harness((sql)=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[{...row,state:'blocked'}]};
  if(sql.includes('FROM mainbrain_api.outcome_reports'))return {rows:[sample]};
  return {rows:[]};
 });
 const result=await store.get('EV1');
 assert.equal(result.state,'blocked');
 assert.equal(result.outcome_reports.length,1);
 assert.equal(result.outcome_reports[0].evidence_reference,'synthetic:receipt:456');
 assert.equal(Object.hasOwn(result.outcome_reports[0],'endpoint_id'),false);
 assert.equal(Object.hasOwn(result.outcome_reports[0],'payload_digest'),false);
 const q=calls.find(x=>x.sql.includes('FROM mainbrain_api.outcome_reports'));
 assert(q,'missing outcome report query');
 assert.match(q.sql,/event_id=\$1 AND attempt_id=\$2/);
 assert.deepEqual(q.params,['EV1',UUID]);
 assert.match(q.sql,/LIMIT 50/);
});
test('R03 Store.get does not query old outcomes if event has no current attempt',async()=>{
 const {store,calls}=harness(sql=>
  sql.includes('FROM mainbrain_api.events')?{rows:[{...row,state:'queued',current_attempt_id:null}]}:{rows:[]}
 );
 const result=await store.get('EV1');
 assert.deepEqual(result.outcome_reports,[]);
 assert(!calls.some(x=>x.sql.includes('FROM mainbrain_api.outcome_reports')));
});
test('R03 strong mutation kills Worker evidence assertion and Store readback assertion',async()=>{
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
 function mutated(relative,oldValue,newValue){
  const filename=require.resolve(relative);
  const source=fs.readFileSync(filename,'utf8');
  assert.equal(source.split(oldValue).length-1,1,'mutation source marker changed');
  const m=new Module(filename,module);
  m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
  m._compile(source.replace(oldValue,newValue),filename);
  return m.exports;
 }
 const mutatedWorker=mutated('../api/polling-worker-candidate.cjs',
  '...(outcomeReference ? {evidence_reference:outcomeReference} : {})',
  '...(false ? {evidence_reference:outcomeReference} : {})').createPollingWorker;
 const reports=[];
 const client={receive:async()=>[row],intent:async()=>{},authorize:async()=>({authorized:true}),
  execute:async()=>{},ack:async()=>{throw Error('timeout');},
  status:async()=>({...row,state:'executed'}),
  fail:async()=>{throw Error('revoked');},
  report:async p=>{reports.push(p);return {state:'blocked'};}};
 const worker=mutatedWorker({client,performTask:async()=>
  ({execution_evidence:'synthetic:execution:123',receipt_evidence:'synthetic:receipt:456'})});
 assert.equal((await worker.runOnce()).state,'reconciliation_required');
 assert.equal(reports.length,1);
 // The original strict positive contract MUST fail on the mutant.
 assert.throws(()=>assert.equal(reports[0].evidence_reference,'synthetic:receipt:456'),
  {code:'ERR_ASSERTION'});
 const mutatedStore=mutated('../api/pg-store-candidate.cjs',
  'evidence_reference:r.evidence_reference','evidence_reference:null').createPostgresStore;
 const sample={attempt_id:UUID,report_id:'outcome-'+UUID,reason:'execution_outcome_unknown',
  evidence_reference:'synthetic:receipt:456',received_at:NOW};
 const query=async sql=>({
  rows:sql.includes('FROM mainbrain_api.events')?[{...row,state:'blocked'}]:
   sql.includes('FROM mainbrain_api.outcome_reports')?[sample]:[]
 });
 const store=mutatedStore({pool:{connect:async()=>({query,release:()=>{}}),query},clock:()=>NOW});
 const record=await store.get('EV1');
 assert.equal(record.outcome_reports.length,1);
 assert.throws(()=>assert.equal(record.outcome_reports[0].evidence_reference,'synthetic:receipt:456'),
  {code:'ERR_ASSERTION'});
});

// GPT2-P37: explicit CI-covered identity negative cases; keep legacy fixtures unchanged.
async function assertLeaseIdentityRejectedBeforeIntent(event) {
  const calls=[];
  const client={receive:async()=>event,intent:async()=>calls.push('intent'),authorize:async()=>({authorized:true}),execute:async()=>calls.push('execute'),ack:async()=>calls.push('ack'),fail:async()=>calls.push('fail'),report:async()=>calls.push('report')};
  const worker=createPollingWorker({client,performTask:async()=>{calls.push('provider');return {execution_evidence:'synthetic:execution:ok',receipt_evidence:'synthetic:receipt:ok'};}});
  await assert.rejects(worker.runOnce(),/invalid authoritative attempt\/payload identity/);
  assert.deepEqual(calls,[],'invalid lease must not reach intent or provider');
}
test('GPT2-P37-IDENTITY-001 rejects malformed attempt UUID before intent',async()=>{
  await assertLeaseIdentityRejectedBeforeIntent({event_id:'EV1',current_attempt_id:'not-a-uuid',payload_digest:'a'.repeat(64)});
});
test('GPT2-P37-IDENTITY-002 rejects malformed SHA-256 before intent',async()=>{
  await assertLeaseIdentityRejectedBeforeIntent({event_id:'EV1',current_attempt_id:'11111111-1111-4111-8111-111111111111',payload_digest:'invalid'});
});
