'use strict';
// AUTO-REVIEW test-first, synthetic and read-only. No provider, DB, memory or live credentials.
const test=require('node:test');
const assert=require('node:assert/strict');
const {scanEntry,scanBatch,reviewTransition}=require('../api/auto-review-router.cjs');
const graph=()=>({version:2,brains:[{id:'main',parentBrainId:null,rootNodeId:null,position:[0,0,0]}],
  nodes:[{id:'n1',brainId:'main',parentId:null,pos:[0,0,0],title:'A'}],links:[],history:[]});
const source=(g=graph(),revision='r1',purpose='purpose-1')=>({source_id:'source-1',source_revision:revision,purpose_id:purpose,raw:JSON.stringify(g)});
const baseFrom=(entry,result)=>({source_id:entry.source_id,source_revision:entry.source_revision,
  purpose_id:entry.purpose_id,content_digest:result.content_digest,history_digest:result.history_digest});
async function baseline(){const entry=source();const first=await scanEntry(entry);return baseFrom(entry,first);}
test('REVIEW-00 absent baseline remains pending, never silently persisted',async()=>{
  const o=await scanEntry(source());
  assert.equal(o.state,'WAIT_BASELINE');assert.equal(o.action,'NO_EXTERNAL_EFFECT');
  assert.match(o.content_digest,/^[a-f0-9]{64}$/);assert.match(o.history_digest,/^[a-f0-9]{64}$/);
  assert.equal(o.review_required,true);assert.equal(o.approved,false);
});
test('REVIEW-01 same graph with different key insertion order is unchanged',async()=>{
  const b=await baseline();const g=graph();
  const e=source({history:[],links:[],nodes:[{title:'A',pos:[0,0,0],parentId:null,brainId:'main',id:'n1'}],
    brains:[{position:[0,0,0],rootNodeId:null,parentBrainId:null,id:'main'}],version:2});
  assert.equal((await scanEntry(e,b)).state,'NO_CHANGE');
});
test('REVIEW-02 new revision and changed node content becomes review-only candidate',async()=>{
  const b=await baseline();const g=graph();g.nodes[0].title='B';
  const o=await scanEntry(source(g,'r2'),b);
  assert.equal(o.state,'REVIEW_CANDIDATE');assert.equal(o.action,'NO_EXTERNAL_EFFECT');
  assert.equal(o.review_required,true);assert.equal(o.approved,false);
});
test('REVIEW-03 history-only change is separated from content change',async()=>{
  const b=await baseline(),g=graph();g.history.push({ts:1,action:'note',payload:{note:'audit'}});
  const o=await scanEntry(source(g,'r2'),b);
  assert.equal(o.state,'REVIEW_HISTORY');
  assert.equal(o.content_digest,b.content_digest);
  assert.notEqual(o.history_digest,b.history_digest);
});
test('REVIEW-04 same source revision with changed content is conflict',async()=>{
  const b=await baseline(),g=graph();g.nodes[0].title='B';
  const o=await scanEntry(source(g,'r1'),b);
  assert.equal(o.state,'NEED_COUNTEREVIDENCE');assert.equal(o.reason,'SAME_REVISION_DIFFERENT_CONTENT');
});
test('REVIEW-05 changed original purpose must not be auto-promoted',async()=>{
  const b=await baseline(),g=graph();g.nodes[0].title='B';
  const o=await scanEntry(source(g,'r2','purpose-2'),b);
  assert.equal(o.state,'NEED_COUNTEREVIDENCE');assert.equal(o.reason,'PURPOSE_MISMATCH');
});
test('REVIEW-06 source absent is not interpreted as deletion permission',async()=>{
  const o=await scanEntry({source_id:'source-1',raw:null});
  assert.equal(o.state,'SOURCE_ABSENT');assert.equal(o.action,'NO_EXTERNAL_EFFECT');
});
test('REVIEW-07 invalid JSON is quarantined without raw content leakage',async()=>{
  const o=await scanEntry({source_id:'source-1',raw:'{broken private token'});
  assert.equal(o.state,'QUARANTINED');assert.equal(o.reason,'INVALID_JSON');
  assert.doesNotMatch(JSON.stringify(o),/private token/);
});
test('REVIEW-08 valid JSON with dangling link is quarantined',async()=>{
  const g=graph();g.links.push({id:'x',kind:'cross',from:'n1',to:'not-found'});
  const o=await scanEntry(source(g));
  assert.equal(o.state,'QUARANTINED');assert.equal(o.reason,'GRAPH_INVALID');
});
test('REVIEW-09 malformed baseline hash is quarantined rather than ignored',async()=>{
  const b=await baseline();b.content_digest='x';
  assert.equal((await scanEntry(source(),b)).reason,'INVALID_BASELINE');
});
test('REVIEW-10 unrelated baseline cannot override source origin',async()=>{
  const b=await baseline();b.source_id='source-2';
  assert.equal((await scanEntry(source(),b)).reason,'BASELINE_SOURCE_MISMATCH');
});
test('REVIEW-11 duplicate source IDs in batch are quarantined',async()=>{
  const e=source(),v=await scanBatch([e,{...e}]);
  assert.equal(v[0].state,'WAIT_BASELINE');assert.equal(v[1].state,'QUARANTINED');
  assert.equal(v[1].reason,'DUPLICATE_SOURCE_ID');
});
test('REVIEW-12 bounded batch prevents uncontrolled fan-out',async()=>{
  await assert.rejects(scanBatch(Array.from({length:101},()=>source())),/limit/);
});
test('REVIEW-13 unsafe identifiers are rejected',async()=>{
  const o=await scanEntry({...source(),source_id:'../secrets'});
  assert.equal(o.state,'QUARANTINED');assert.equal(o.reason,'INVALID_SOURCE_ID');
});
test('REVIEW-14 unverified origin purpose blocks candidate',async()=>{
  const b=await baseline(),g=graph();g.nodes[0].title='B';
  const o=await scanEntry(source(g,'r2',undefined),b);
  // undefined passed as source helper argument invokes default; supply explicit missing purpose.
  const x=await scanEntry({...source(g,'r2'),purpose_id:null},b);
  assert.equal(o.state,'REVIEW_CANDIDATE');assert.equal(x.state,'NEED_COUNTEREVIDENCE');
});
test('REVIEW-15 results never contain private graph raw text',async()=>{
  const g=graph();g.nodes[0].title='SECRET_PRIVATE_FIXTURE';
  const o=await scanEntry(source(g));
  assert.doesNotMatch(JSON.stringify(o),/SECRET_PRIVATE_FIXTURE/);
});
test('REVIEW-16 forbidden auto approval is rejected by state machine',()=>{
  const r={state:'REVIEW_CANDIDATE',source_id:'source-1'};
  assert.throws(()=>reviewTransition(r,{type:'APPROVE',actor_id:'bot',evidence_ref:'x'}),/forbidden|invalid/i);
  assert.throws(()=>reviewTransition(r,{type:'DISPATCH',actor_id:'bot',evidence_ref:'x'}),/forbidden|invalid/i);
});
test('REVIEW-17 request for independent counterevidence cannot update official memory',()=>{
  const before=Object.freeze({state:'REVIEW_CANDIDATE',source_id:'source-1',approved:false});
  const out=reviewTransition(before,{type:'REQUEST_COUNTEREVIDENCE',actor_id:'reviewer',evidence_ref:'case-1'});
  assert.equal(out.state,'NEED_COUNTEREVIDENCE');assert.equal(out.action,'NO_EXTERNAL_EFFECT');
  assert.equal(out.approved,false);assert.equal(before.state,'REVIEW_CANDIDATE');
});
test('REVIEW-18 reject and recheck are local workflow states only',()=>{
  const pending={state:'REVIEW_HISTORY',source_id:'source-1',approved:false};
  assert.equal(reviewTransition(pending,{type:'REQUEST_RECHECK',actor_id:'reviewer',evidence_ref:'case-2'}).state,'NEEDS_RECHECK');
  assert.equal(reviewTransition(pending,{type:'REJECT',actor_id:'reviewer',evidence_ref:'case-3'}).state,'REJECTED');
});
test('REVIEW-19 review action must have claimed actor and evidence reference',()=>{
  assert.throws(()=>reviewTransition({state:'REVIEW_CANDIDATE',source_id:'x'},{type:'REJECT',actor_id:'',evidence_ref:''}),/identity|evidence/i);
});
test('REVIEW-20 array reordering counts as physical content change, not semantic proof',async()=>{
  const g=graph();g.nodes.push({id:'n2',brainId:'main',parentId:null,pos:[1,0,0],title:'B'});
  const e=source(g),b=baseFrom(e,await scanEntry(e));
  g.nodes.reverse();const o=await scanEntry(source(g,'r2'),b);
  assert.equal(o.state,'REVIEW_CANDIDATE');
});
test('REVIEW-21 no valid baseline update or input mutation occurs',async()=>{
  const e=source();const b=await baseline();
  const original=JSON.stringify(b);const e0=JSON.stringify(e);
  await scanEntry(e,b);
  assert.equal(JSON.stringify(b),original);assert.equal(JSON.stringify(e),e0);
});
test('REVIEW-22 history-only same revision stays unresolved conflict',async()=>{
  const b=await baseline(),g=graph();g.history.push({action:'audit',ts:1});
  const o=await scanEntry(source(g,'r1'),b);
  assert.equal(o.state,'NEED_COUNTEREVIDENCE');
});
