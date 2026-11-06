'use strict';
/**
 * B2 Store consistent readback + truncation
 * handoff_id: FB-PR50-BOT3-B0-B4-20261105-V01
 * Case mapping (stable custom IDs; formal case table still absent):
 *   CASE_B2_RR_SNAPSHOT          ↔ get uses one connect() + REPEATABLE READ READ ONLY; rollback/release on error
 *   CASE_B2_TRUNCATE_FLAG        ↔ >50 outcome reports → explicit truncated/has_more (+ cursor)
 *   CASE_B2_PAGE_READ            ↔ keyset page / report_id targeted re-read
 *   CASE_B2_NON_PARTICIPANT_DENY ↔ status refuses non-participant (participant check kept)
 */
const test=require('node:test'),assert=require('node:assert/strict');
const {createPostgresStore}=require('../api/pg-store-candidate.cjs');
const {createApi}=require('../api/mainbrain-api.cjs');
const UUID='11111111-1111-4111-8111-111111111111',NOW='2026-10-20T06:00:00.000Z';
const row={event_id:'EV1',task_id:'T1',source_endpoint_id:'source',destination_endpoint_id:'target',
 payload_digest:'a'.repeat(64),payload_version:'1',payload:{x:'test'},
 state:'blocked',grant_id:'G1',current_attempt_id:UUID,
 lease_until:null,external_intent_at:NOW,attempt_count:1};

function harness(handle,{onRelease}={}){
 const calls=[];
 let released=0;
 const c={
  query:async(sql,params=[])=>{
   calls.push({sql,params});
   if(sql==='BEGIN'||sql.startsWith('BEGIN ')||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
   return handle(sql,params)||{rows:[]};
  },
  release:()=>{released+=1;if(onRelease)onRelease();}
 };
 const pool={connect:async()=>c,query:async(sql,params)=>c.query(sql,params)};
 return {store:createPostgresStore({pool,clock:()=>NOW}),calls,released:()=>released};
}

function makeReports(n){
 return Array.from({length:n},(_,i)=>{
  const seq=String(i+1).padStart(3,'0');
  return {
   attempt_id:UUID,
   report_id:'outcome-'+seq+'-xxxxxxxx',
   reason:'execution_outcome_unknown',
   evidence_reference:'synthetic:receipt:'+seq,
   received_at:new Date(Date.parse(NOW)-i*1000).toISOString()
  };
 });
}

test('CASE_B2_RR_SNAPSHOT: get opens REPEATABLE READ READ ONLY on one client and releases',async()=>{
 let released=0;
 const reports=makeReports(2);
 const {store,calls}=harness(sql=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
  if(sql.includes('FROM mainbrain_api.alerts'))return {rows:[]};
  if(sql.includes('FROM mainbrain_api.outcome_reports'))return {rows:reports};
  return {rows:[]};
 },{onRelease:()=>{released+=1;}});
 const result=await store.get('EV1');
 assert.equal(result.outcome_reports.length,2);
 const begin=calls.find(x=>x.sql.startsWith('BEGIN'));
 assert(begin,'missing BEGIN');
 assert.match(begin.sql,/REPEATABLE\s+READ/i);
 assert.match(begin.sql,/READ\s+ONLY/i);
 assert(calls.some(x=>x.sql==='COMMIT'));
 assert.equal(released,1,'client must be released');
 const beginIdx=calls.findIndex(x=>x.sql.startsWith('BEGIN'));
 const after=calls.slice(beginIdx+1);
 assert(after.some(x=>x.sql.includes('FROM mainbrain_api.events')),'event read must be inside snapshot');
 assert(after.some(x=>x.sql.includes('FROM mainbrain_api.outcome_reports')),'outcomes inside snapshot');
 // Must not pretend consistency via scattered pool.query without a transaction
 assert(!calls.some(x=>x.sql==='BEGIN'&&!x.sql.includes('REPEATABLE')),
  'plain BEGIN without isolation is insufficient for B2');
});

test('CASE_B2_RR_SNAPSHOT: get rolls back and releases when a snapshot query throws',async()=>{
 let released=0;
 const {store,calls}=harness(sql=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
  if(sql.includes('FROM mainbrain_api.alerts'))return {rows:[]};
  if(sql.includes('FROM mainbrain_api.outcome_reports'))throw Object.assign(Error('boom'),{code:'XX000'});
  return {rows:[]};
 },{onRelease:()=>{released+=1;}});
 await assert.rejects(store.get('EV1'),/boom/);
 assert(calls.some(x=>x.sql==='ROLLBACK'),'must ROLLBACK on error');
 assert.equal(released,1,'must release after error');
});

test('CASE_B2_TRUNCATE_FLAG: more than 50 reports sets explicit truncated/has_more and cursor',async()=>{
 const all=makeReports(55);
 const {store,calls}=harness((sql,params)=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
  if(sql.includes('FROM mainbrain_api.alerts'))return {rows:[]};
  if(sql.includes('FROM mainbrain_api.outcome_reports')){
   let lim=51;
   const m=sql.match(/LIMIT\s+\$(\d+)/i);
   if(m&&params)lim=Number(params[Number(m[1])-1]);
   else {
    const lit=sql.match(/LIMIT\s+(\d+)/i);
    if(lit)lim=Number(lit[1]);
   }
   return {rows:all.slice(0,lim)};
  }
  return {rows:[]};
 });
 const result=await store.get('EV1');
 assert.equal(result.outcome_reports.length,50,'page capped at 50');
 assert.equal(result.outcome_reports_truncated,true);
 assert.equal(result.outcome_reports_has_more,true);
 assert.ok(result.outcome_reports_next_cursor);
 assert.equal(result.outcome_reports_next_cursor.report_id,result.outcome_reports[49].report_id);
 assert.equal(result.outcome_reports_next_cursor.received_at,result.outcome_reports[49].received_at);
 // Peek uses limit+1 inside the same snapshot transaction
 const oq=calls.find(x=>x.sql.includes('FROM mainbrain_api.outcome_reports'));
 assert(oq,'missing outcome query');
 assert.match(oq.sql,/LIMIT/i);
});

test('CASE_B2_TRUNCATE_FLAG: <=50 reports is not truncated',async()=>{
 const all=makeReports(3);
 const {store}=harness(sql=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
  if(sql.includes('FROM mainbrain_api.alerts'))return {rows:[]};
  if(sql.includes('FROM mainbrain_api.outcome_reports'))return {rows:all};
  return {rows:[]};
 });
 const result=await store.get('EV1');
 assert.equal(result.outcome_reports.length,3);
 assert.equal(result.outcome_reports_truncated,false);
 assert.equal(result.outcome_reports_has_more,false);
 assert.equal(result.outcome_reports_next_cursor,null);
});

test('CASE_B2_PAGE_READ: keyset before-cursor returns the next older page',async()=>{
 const all=makeReports(55);
 const {store}=harness((sql,params)=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
  if(sql.includes('FROM mainbrain_api.alerts'))return {rows:[]};
  if(sql.includes('FROM mainbrain_api.outcome_reports')){
   // Detect keyset filter (received_at < $n OR … report_id > $n)
   if(/received_at\s*<\s*\$/.test(sql) && /report_id\s*>\s*\$/.test(sql)){
    const beforeAt=params[2],beforeId=params[3];
    const lim=Number(params[params.length-1]);
    const filtered=all.filter(r=>
     r.received_at<beforeAt||(r.received_at===beforeAt&&r.report_id>beforeId)
    );
    return {rows:filtered.slice(0,lim)};
   }
   let lim=51;
   const m=sql.match(/LIMIT\s+\$(\d+)/i);
   if(m&&params)lim=Number(params[Number(m[1])-1]);
   return {rows:all.slice(0,lim)};
  }
  return {rows:[]};
 });
 const first=await store.get('EV1');
 assert.equal(first.outcome_reports_has_more,true);
 const page2=await store.get('EV1',{before:first.outcome_reports_next_cursor});
 assert.equal(page2.outcome_reports.length,5);
 assert.equal(page2.outcome_reports_truncated,false);
 assert.equal(page2.outcome_reports_has_more,false);
 assert.equal(page2.outcome_reports[0].report_id,all[50].report_id);
});

test('CASE_B2_PAGE_READ: report_id targeted re-read returns that bounded pointer only',async()=>{
 const all=makeReports(5);
 const target=all[3];
 const {store,calls}=harness((sql,params)=>{
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
  if(sql.includes('FROM mainbrain_api.alerts'))return {rows:[]};
  if(sql.includes('FROM mainbrain_api.outcome_reports')){
   if(params&&params.includes(target.report_id))
    return {rows:[all.find(r=>r.report_id===target.report_id)]};
   return {rows:all};
  }
  return {rows:[]};
 });
 const result=await store.get('EV1',{report_id:target.report_id});
 assert.equal(result.outcome_reports.length,1);
 assert.equal(result.outcome_reports[0].report_id,target.report_id);
 assert.equal(result.outcome_reports[0].evidence_reference,target.evidence_reference);
 assert.equal(Object.hasOwn(result.outcome_reports[0],'endpoint_id'),false);
 assert.equal(result.outcome_reports_truncated,false);
 const oq=calls.filter(x=>x.sql.includes('FROM mainbrain_api.outcome_reports')).pop();
 assert(oq.params.includes(target.report_id),'report_id must be bound in query');
});

test('CASE_B2_NON_PARTICIPANT_DENY: status refuses stranger; participant still allowed',async()=>{
 const record={...row,alerts:[],outcome_reports:[],
  outcome_reports_truncated:false,outcome_reports_has_more:false,outcome_reports_next_cursor:null};
 const seen=[];
 const store={
  get:async(id,opts)=>{seen.push({id,opts});return record;}
 };
 const api=createApi({store,authenticate:async req=>req.principal});
 const principal=(endpoint_id,scopes)=>({verified:true,endpoint_id,scopes});
 await assert.rejects(
  api.status({principal:principal('stranger',['tasks:status']),params:{event_id:'EV1'}}),
  /event not accessible/
 );
 const ok=await api.status({principal:principal('source',['tasks:status']),params:{event_id:'EV1',report_id:'outcome-001-xxxxxxxx'}});
 assert.equal(ok.event_id,'EV1');
 // status still loads via store.get then enforces participant; stranger was rejected above
 assert.equal(seen.at(-1).id,'EV1');
 assert.equal(seen.at(-1).opts.report_id,'outcome-001-xxxxxxxx');
});

test('CASE_B2 strong mutation: dropping truncated flag must fail positive assert',async()=>{
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
 const filename=require.resolve('../api/pg-store-candidate.cjs');
 const source=fs.readFileSync(filename,'utf8');
 // Mutant: force truncated/has_more always false after computation
 const marker='outcome_reports_truncated:truncated';
 assert.equal(source.split(marker).length-1,1,'mutation marker missing — implement B2 first');
 const m=new Module(filename,module);
 m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
 m._compile(source.replace(marker,'outcome_reports_truncated:false'),filename);
 const mutatedStore=m.exports.createPostgresStore;
 const all=makeReports(55);
 const query=async(sql,params=[])=>{
  if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
  if(sql.includes('FROM mainbrain_api.events'))return {rows:[row]};
  if(sql.includes('FROM mainbrain_api.alerts'))return {rows:[]};
  if(sql.includes('FROM mainbrain_api.outcome_reports')){
   let lim=51;const mm=sql.match(/LIMIT\s+\$(\d+)/i);
   if(mm)lim=Number(params[Number(mm[1])-1]);
   return {rows:all.slice(0,lim)};
  }
  return {rows:[]};
 };
 const store=mutatedStore({pool:{connect:async()=>({query,release:()=>{}}),query},clock:()=>NOW});
 const result=await store.get('EV1');
 assert.equal(result.outcome_reports.length,50);
 assert.throws(()=>assert.equal(result.outcome_reports_truncated,true),{code:'ERR_ASSERTION'});
});

