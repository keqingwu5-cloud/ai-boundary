import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedNodeId,fromWorldModelQuery,worldModelHref,brainHref,feedHref,readNodeContext,exportResearchReference} from '../research-context-bridge.mjs';
const storage=(v)=>({getItem:(key)=>key==='aiBrain.v1'?v:null});
const saved=()=>JSON.stringify({brains:[{id:'main'}],nodes:[{id:'n_q1',title:'研究問題',brainId:'main',status:'open',kind:'question'}],links:[],history:[]});
test('01 node ID is bounded, never a URL or HTML payload',()=>{
 assert.equal(checkedNodeId('n_q1'),'n_q1');
 for(const v of ['','/external','<script>','foo bar','x'.repeat(200),null,'https://evil.example/'])assert.equal(checkedNodeId(v),null);
});
test('02 hrefs carry only a node ID and stay relative',()=>{
 assert.equal(worldModelHref('n_q1'),'./world-model.html?node=n_q1');
 assert.equal(brainHref('n_q1'),'./index.html#node=n_q1');
 assert.equal(feedHref('n_q1'),'./feed.html#node=n_q1');
 assert.equal(worldModelHref('<script>'),'./world-model.html');
});
test('03 parsed node query never assumes association without ID',()=>{
 assert.equal(fromWorldModelQuery('?node=n_q1'),'n_q1');
 assert.equal(fromWorldModelQuery('?node=%3Cscript%3E'),null);
 assert.equal(fromWorldModelQuery('?x=n_q1'),null);
});
test('04 known node resolves read-only reference',()=>{
 const result=readNodeContext(storage(saved()),'n_q1');
 assert.equal(result.status,'linked');
 assert.deepEqual(exportResearchReference(result),{schema:'brain.research-link.v1',source:'aiBrain.v1',node_id:'n_q1',
 brain_id:'main',link_status:'local_read_only_unverified',scope:'reference_only_not_evidence_or_approval'});
});
test('05 unknown node cannot borrow a different node title',()=>{
 assert.equal(readNodeContext(storage(saved()),'n_unknown').status,'missing');
});
test('06 absent storage does not invent a source',()=>{
 assert.equal(readNodeContext(storage(null),'n_q1').status,'not_saved');
});
test('07 malformed or duplicated local snapshot is not trusted',()=>{
 assert.equal(readNodeContext(storage('{broken'),'n_q1').status,'unreadable');
 assert.equal(readNodeContext(storage(JSON.stringify({nodes:[{id:'n_q1',title:'A'},{id:'n_q1',title:'B'}]})),'n_q1').status,'ambiguous');
});
test('08 read-only bridge never writes to the browser store',()=>{
 const spy={writes:0,getItem(){return saved()},setItem(){this.writes++}};
 readNodeContext(spy,'n_q1');assert.equal(spy.writes,0);
});
test('09 unknown node cannot generate a credible reference',()=>{
 assert.equal(exportResearchReference(readNodeContext(storage(saved()),'n_missing')),null);
});
