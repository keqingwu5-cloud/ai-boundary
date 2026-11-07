'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {evaluateSourceSnapshot:e}=require('../api/task-source-summary.cjs');
const good=()=>({complete:true,read:[41],errors:[],unresolved:[],records:[
  {issue:41,kind:'issue',url:'https://github.com/x/y/issues/41',body:'交接 #105',version:'v1'},
  {issue:41,kind:'comment',id:5,url:'https://github.com/x/y/issues/41#issuecomment-5',body:'已發送，不代表 ACK',version:'v1'}
]});
test('first complete snapshot produces baseline, not false remote ACK',()=>{
  const x=e(good());assert.equal(x.state,'BASELINE');assert.equal(x.complete,true);
  assert.equal(x.records,2);assert.equal(x.issues,1);assert.equal(x.actual_remote_ack,'NOT_VERIFIED');
  assert.match(x.source_digest,/^[0-9a-f]{64}$/);
});
test('same snapshot produces NO_UPDATE without extra user attention',()=>{
  const v=e(good());const x=e(good(),{previousDigest:v.source_digest});
  assert.equal(x.state,'NO_UPDATE');assert.equal(x.previous_digest_accepted,true);
  assert.match(x.one_line,/無需重複通知/);
});
test('input order and metadata-only updated_at do not create fake change',()=>{
  const v=e(good());const same=good();same.records.reverse();same.records[0].version='new-time';
  assert.equal(e(same,{previousDigest:v.source_digest}).state,'NO_UPDATE');
});
test('actual text change is reported as CONTENT_CHANGED',()=>{
  const v=e(good());const n=good();n.records[1].body='新審查：已發送，不代表 ACK';
  assert.equal(e(n,{previousDigest:v.source_digest}).state,'CONTENT_CHANGED');
});
test('same issue content repeated across sources is deduplicated',()=>{
  const v=good();v.records.push({...v.records[1]});
  const r=e(v);assert.equal(r.complete,true);assert.equal(r.records,2);assert.equal(r.duplicates,1);
  assert.equal(r.source_digest,e(good()).source_digest);
});
test('same source ID with conflicting content fails closed',()=>{
  const v=good();v.records.push({...v.records[1],body:'不同的紀錄'});
  const r=e(v);assert.equal(r.state,'MONITOR_UNHEALTHY');
  assert.ok(r.anomalies.includes('conflicting_duplicate_source'));assert.equal(r.source_digest,null);
});
test('incomplete search cannot be misreported as NO_UPDATE',()=>{
  const baseline=e(good());const v=good();v.complete=false;v.errors=[{stage:'search',error:'search_incomplete'}];
  const r=e(v,{previousDigest:baseline.source_digest});
  assert.equal(r.state,'MONITOR_UNHEALTHY');assert.equal(r.source_digest,null);
});
test('unresolved sources cannot be misreported as NO_UPDATE',()=>{
  const v=good();v.unresolved=[33];const r=e(v);
  assert.equal(r.state,'MONITOR_UNHEALTHY');assert.ok(r.anomalies.includes('unresolved_sources'));
});
test('missing comment body refuses a new baseline',()=>{
  const v=good();delete v.records[1].body;
  const r=e(v);assert.equal(r.state,'MONITOR_UNHEALTHY');
  assert.ok(r.anomalies.includes('invalid_source_record'));
});
test('invalid previous digest is explicitly rejected',()=>{
  assert.throws(()=>e(good(),{previousDigest:'123'}),/invalid_previous_digest/);
});
test('does not mutate input',()=>{
  const v=good(), before=JSON.stringify(v);e(v);assert.equal(JSON.stringify(v),before);
});
test('change report is compact and does not expose body text',()=>{
  const v=good(), r=e(v);
  const rendered=JSON.stringify(r);assert.ok(!rendered.includes(v.records[0].body));
  assert.ok(!rendered.includes(v.records[1].body));assert.ok(rendered.length<1500);
});
test('healthy no-update and failing read are different even with old digest',()=>{
  const original=e(good());const r=e({complete:false,read:[],records:[],errors:[{stage:'read',error:'HTTP 403'}],unresolved:[]},{previousDigest:original.source_digest});
  assert.equal(r.state,'MONITOR_UNHEALTHY');assert.equal(r.complete,false);assert.equal(r.errors,1);
});

test('healthy empty search means no matching work, not monitoring failure',()=>{
  const empty={complete:true,read:[],records:[],errors:[],unresolved:[]};
  const base=e(empty);assert.equal(base.complete,true);assert.equal(base.state,'BASELINE');
  assert.match(base.one_line,/沒有符合的任務/);
  assert.equal(e(empty,{previousDigest:base.source_digest}).state,'NO_UPDATE');
  assert.equal(e(empty,{previousDigest:e(good()).source_digest}).state,'CONTENT_CHANGED');
});
