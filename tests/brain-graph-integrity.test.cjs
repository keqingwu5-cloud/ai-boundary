'use strict';
// Graph integrity and pre-write negative cases. Isolated fixtures, no user data.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
let modules;
async function check(s) {
  modules ||= import(pathToFileURL(path.resolve(__dirname,'../brain-graph-integrity.mjs')));
  const m=await modules;
  return m.validateBrainGraph(s);
}
const graph=()=>({
  version:2,
  brains:[{id:'main',parentBrainId:null,rootNodeId:null},
    {id:'b1',parentBrainId:'main',rootNodeId:'n2'}],
  nodes:[{id:'n1',brainId:'main',parentId:null,pos:[0,0,0]},
    {id:'n2',brainId:'b1',parentId:'n1',pos:[0,0,0]}],
  links:[{id:'l1',from:'n1',to:'n2',kind:'derived'}],
  history:[]
});
test('GRAPH-00 valid cross-brain parent and derived edge accepted',async()=>assert.equal(await check(graph()),true));
test('GRAPH-01 duplicated node id rejected',async()=>{const g=graph();g.nodes.push({...g.nodes[0]});assert.equal(await check(g),false);});
test('GRAPH-02 duplicated brain id rejected',async()=>{const g=graph();g.brains.push({...g.brains[1]});assert.equal(await check(g),false);});
test('GRAPH-03 dangling node brain rejected',async()=>{const g=graph();g.nodes[0].brainId='missing';assert.equal(await check(g),false);});
test('GRAPH-04 missing parent rejected',async()=>{const g=graph();g.nodes[1].parentId='missing';assert.equal(await check(g),false);});
test('GRAPH-05 parent cycle rejected',async()=>{const g=graph();g.nodes[0].parentId='n2';assert.equal(await check(g),false);});
test('GRAPH-06 brain parent cycle rejected',async()=>{const g=graph();g.brains[0].parentBrainId='b1';assert.equal(await check(g),false);});
test('GRAPH-07 dangling link endpoint rejected',async()=>{const g=graph();g.links[0].to='gone';assert.equal(await check(g),false);});
test('GRAPH-08 duplicate link id rejected',async()=>{const g=graph();g.links.push({...g.links[0]});assert.equal(await check(g),false);});
test('GRAPH-09 brain root must exist and belong to brain',async()=>{const g=graph();g.brains[1].rootNodeId='n1';assert.equal(await check(g),false);});
test('GRAPH-10 inherited legacy root with no extra brain accepted',async()=>{const g={version:1,brains:[{id:'main',parentBrainId:null,rootNodeId:null}],nodes:[],links:[],history:[]};assert.equal(await check(g),true);});
test('GRAPH-11 derived link must match child parent relationship',async()=>{const g=graph();g.links[0].from='n2';g.links[0].to='n1';assert.equal(await check(g),false);});
test('GRAPH-12 invalid coordinate rejects malformed graph before 3D rendering',async()=>{const g=graph();g.nodes[0].pos=[0,NaN,0];assert.equal(await check(g),false);});
test('GRAPH-13 undefined or nonobject record is rejected',async()=>assert.equal(await check(null),false));
