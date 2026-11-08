'use strict';
// Isolated comparative audit. No real source records, persistence or AI dispatch.
const test=require('node:test');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {scanEntry}=require('../api/auto-review-router.cjs');
const {createHash}=require('node:crypto');
let graphCheck;
async function graphValidator(){
  if(!graphCheck)graphCheck=import('../brain-graph-integrity.mjs').then(m=>m.validateBrainGraph);
  return graphCheck;
}
const graph=()=>({version:2,
  brains:[{id:'main',parentBrainId:null,rootNodeId:null,position:[0,0,0]}],
  nodes:[{id:'n1',brainId:'main',parentId:null,pos:[0,0,0],title:'one'}],
  links:[],history:[]});
const envelope=(raw=JSON.stringify(graph()),rev='r1',purpose='goal-1')=>
  ({source_id:'case-1',source_revision:rev,purpose_id:purpose,raw});
async function baseline(){
  const entry=envelope();
  const result=await scanEntry(entry);
  assert.equal(result.state,'WAIT_BASELINE');
  return {source_id:entry.source_id,source_revision:entry.source_revision,purpose_id:entry.purpose_id,
    content_digest:result.content_digest,history_digest:result.history_digest,
    raw_source_digest:result.raw_source_digest};
}
test('EFFICACY-00 valid graph accepted in both versions (no functionality regression)',async()=>{
  assert.equal((await graphValidator())(graph()),true);
  assert.equal((await scanEntry(envelope())).state,'WAIT_BASELINE');
});
test('EFFICACY-01 same data no change detected instead of reprocessing',async()=>{
  assert.equal((await scanEntry(envelope(),await baseline())).state,'NO_CHANGE');
});
test('EFFICACY-02 genuine content change with new revision queues review',async()=>{
  const g=graph();g.nodes[0].title='two';
  assert.equal((await scanEntry(envelope(JSON.stringify(g),'r2'),await baseline())).state,'REVIEW_CANDIDATE');
});
test('EFFICACY-03 invalid link blocks differential comparison',async()=>{
  const g=graph();g.links.push({id:'bad',from:'n1',to:'not-found'});
  const result=await scanEntry(envelope(JSON.stringify(g)),await baseline());
  assert.equal((await graphValidator())(g),false);assert.equal(result.state,'QUARANTINED');
});
test('EFFICACY-04 source revision missing: same content cannot be deemed NO_CHANGE',async()=>{
  const result=await scanEntry({...envelope(),source_revision:null},await baseline());
  assert.equal(result.state,'NEED_COUNTEREVIDENCE');
  assert.equal(result.reason,'REVISION_CONTEXT_UNVERIFIED');
});
test('EFFICACY-05 old baseline missing revision cannot prove no-change',async()=>{
  const b=await baseline();delete b.source_revision;
  const result=await scanEntry(envelope(),b);
  assert.equal(result.state,'NEED_COUNTEREVIDENCE');
  assert.equal(result.reason,'REVISION_CONTEXT_UNVERIFIED');
});
test('EFFICACY-06 raw source fingerprint differs if JSON byte representation changes',async()=>{
  const a=await scanEntry(envelope());
  const reordered={history:[],nodes:[{title:'one',pos:[0,0,0],parentId:null,brainId:'main',id:'n1'}],
    links:[],brains:[{rootNodeId:null,position:[0,0,0],parentBrainId:null,id:'main'}],version:2};
  const raw=JSON.stringify(reordered);
  const b=await scanEntry(envelope(raw));
  assert.equal(a.content_digest,b.content_digest,'semantic-ish canonical content is stable');
  assert.match(a.raw_source_digest,/^[0-9a-f]{64}$/);
  assert.notEqual(a.raw_source_digest,b.raw_source_digest,'original source representation should remain auditable');
  assert.equal(a.raw_source_digest,createHash('sha256').update(envelope().raw).digest('hex'));
});
test('EFFICACY-07 same revision but different original JSON bytes is reviewable, not silently identical',async()=>{
  const b=await baseline();
  const reordered={history:[],links:[],nodes:[{title:'one',pos:[0,0,0],parentId:null,brainId:'main',id:'n1'}],
    brains:[{rootNodeId:null,parentBrainId:null,position:[0,0,0],id:'main'}],version:2};
  const result=await scanEntry(envelope(JSON.stringify(reordered)),b);
  assert.equal(result.state,'REVIEW_METADATA');
  assert.equal(result.reason,'SOURCE_BYTES_CHANGED_SAME_REVISION');
});
test('EFFICACY-08 corrupted claimed raw fingerprint in baseline is rejected',async()=>{
  const b=await baseline();b.raw_source_digest='fake';
  const result=await scanEntry(envelope(),b);
  assert.equal(result.state,'QUARANTINED');
  assert.equal(result.reason,'INVALID_BASELINE');
});
test('EFFICACY-09 timing of graph check vs full read-only scan (informational)',async(t)=>{
  // Same synthetic 200-node graph on a shared runner. Timing is NOT a release gate.
  const g={version:2,brains:[{id:'main',parentBrainId:null,rootNodeId:null,position:[0,0,0]}],nodes:[],links:[],history:[]};
  for(let i=0;i<200;i++){
    const id='node-'+i,prev=i?('node-'+(i-1)):null;
    g.nodes.push({id,brainId:'main',parentId:prev,pos:[i*0.001,0,0],title:'n'+i});
    if(i)g.links.push({id:'link-'+i,kind:'derived',from:prev,to:id});
  }
  const v=await graphValidator();
  const entry=envelope(JSON.stringify(g));
  const original=await scanEntry(entry);
  const b={source_id:entry.source_id,source_revision:entry.source_revision,purpose_id:entry.purpose_id,
    content_digest:original.content_digest,history_digest:original.history_digest,
    raw_source_digest:original.raw_source_digest};
  for(let i=0;i<10;i++){v(g);await scanEntry(entry,b);}
  const N=80,timing={graph:[],router:[]};
  for(let i=0;i<N;i++){
    let started=performance.now();const pass=v(g);timing.graph.push(performance.now()-started);
    assert.equal(pass,true);
    started=performance.now();const route=await scanEntry(entry,b);timing.router.push(performance.now()-started);
    assert.equal(route.state,'NO_CHANGE');
  }
  const mid=values=>{const s=values.slice().sort((a,b)=>a-b);return s[Math.floor(s.length/2)]};
  const graphMedian=mid(timing.graph),routerMedian=mid(timing.router);
  t.diagnostic('BENCH_SYNTHETIC_200_NODES_NO_IO median_graph_ms='+graphMedian.toFixed(4)
    +' median_router_ms='+routerMedian.toFixed(4)
    +' ratio='+((routerMedian/graphMedian)||0).toFixed(2)
    +' N='+N+' runner_shared=true');
});
