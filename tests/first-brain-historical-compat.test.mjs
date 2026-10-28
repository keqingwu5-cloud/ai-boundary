import test from "node:test";
import assert from "node:assert/strict";
import {validateBrainImport} from "../brain-import-guard.mjs";
import {inspectLegacy3D,MAIN_KEY,UNDO_KEY} from "../first-brain-idb-adapter.mjs";

const clone=x=>JSON.parse(JSON.stringify(x));
function legacy(version=1){
 const graph={
  brains:[{id:"main",parentBrainId:null,rootNodeId:"q",position:[0,0,0]},
   {id:"sub",parentBrainId:"main",rootNodeId:"child",position:[0.1,0.2,0.3]}],
  nodes:[
   {id:"q",brainId:"main",parentId:null,pos:[0.1,0.1,0.1],title:"來源問題"},
   {id:"child",brainId:"sub",parentId:"q",pos:[0.2,0.2,0.2],title:"跨子腦來源"},
   {id:"dir",brainId:"main",parentId:"q",pos:[0.3,0.2,0.1],title:"衍生方向",kind:"direction"}],
  links:[{id:"l1",from:"q",to:"child",kind:"derived"},
   {id:"l2",from:"q",to:"dir",kind:"derived"}],
  history:[{ts:1,action:"seed",payload:{source:"synthetic"}},
   {ts:2,action:"split",payload:{nodeId:"q",children:["child","dir"]}}],
  historicalNote:"保留原始來源・R16"
 };
 if(version!==null)graph.version=version;
 return graph;
}
function storage(raw,undo="[]"){
 const m=new Map([[MAIN_KEY,raw],[UNDO_KEY,undo]]);
 const writes=[];
 return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{writes.push([k,v]);m.set(k,v);},
 removeItem:k=>{writes.push([k,null]);m.delete(k);},writes};
}
const variants=[
 ["v1 standard",g=>g],
 ["unversioned",g=>{delete g.version;return g;}],
 ["v2 unchanged",g=>{g.version=2;return g;}],
 ["missing legacy node concepts",g=>{g.nodes.forEach(n=>delete n.concepts);return g;}],
 ["missing legacy node media",g=>{g.nodes.forEach(n=>delete n.media);return g;}],
 ["unknown historical fields",g=>{g.nodes[0].oldExternalReference={page:"R16",value:"literal"};return g;}],
 ["cross-brain parent ancestry",g=>g],
 ["empty event payload",g=>{g.history.push({ts:3,action:"legacy"});return g;}],
 ["extra history metadata",g=>{g.history[0].metadata={actor:"anonymous"};return g;}],
 ["unicode titles and notes",g=>{g.nodes[0].title="修復・測試 🧠";return g;}],
 ["custom source and counter-evidence",g=>{g.nodes[0].source={who:"匿名檔案",url:"https://example.com"};g.nodes[0].counterEvidence=[{text:"反證"}];return g;}],
 ["undo points to original graph",g=>g]
];
test("R16 historical valid-format matrix preserves exact raw graph and undo bytes",()=>{
 for(const [label,modify] of variants){
  const graph=modify(legacy());const raw="  "+JSON.stringify(graph,null,2)+"\n";
  const prior=JSON.stringify(legacy(null));
  const undo=JSON.stringify([prior]);
  const memory=storage(raw,undo);
  const result=inspectLegacy3D(memory);
  assert.equal(result.ok,true,label+": "+result.reason);
  assert.equal(result.mainRaw,raw,label+" graph bytes");
  assert.equal(result.undoRaw,undo,label+" undo bytes");
  assert.deepEqual(result.graph,graph,label+" graph content");
  assert.equal(result.graph.nodes[1].parentId,"q",label+" cross-brain ancestry");
  assert.equal(result.graph.links[0].to,"child",label+" link lineage");
  assert.equal(result.undo[0],prior,label+" undo snapshot raw content");
  assert.deepEqual(memory.writes,[],label+" inspection may not mutate storage");
 }
});
const invalid=[
 ["future graph version",g=>{g.version=999;return g;},"graph_unsupported_graph_version"],
 ["duplicate node ID",g=>{g.nodes.push(clone(g.nodes[0]));return g;},"graph_node_id_invalid_or_duplicate"],
 ["missing node parent",g=>{g.nodes[1].parentId="does-not-exist";return g;},"graph_node_parent_missing_or_self"],
 ["node ancestry cycle",g=>{g.nodes[0].parentId="child";return g;},"graph_node_parent_cycle"],
 ["brain ancestry cycle",g=>{g.brains[0].parentBrainId="sub";return g;},"graph_brain_parent_cycle"],
 ["broken link endpoint",g=>{g.links[0].to="unknown";return g;},"graph_link_endpoint_missing_or_self"],
 ["invalid vector",g=>{g.nodes[0].pos=[0,0];return g;},"graph_node_shape_invalid"],
 ["missing main brain",g=>{g.brains[0].id="renamed";g.nodes[0].brainId="renamed";return g;},"graph_main_brain_missing"]
];
test("R16 bad historical graph is classified and rejected without a write",()=>{
 for(const [label,edit,reason] of invalid){
  const g=edit(legacy()),raw=JSON.stringify(g),memory=storage(raw);
  const res=inspectLegacy3D(memory);
  assert.equal(res.ok,false,label);
  assert.equal(res.reason,reason,label);
  assert.equal(memory.getItem(MAIN_KEY),raw,label+" still exact");
  assert.deepEqual(memory.writes,[],label+" must remain read-only");
 }
});
test("R16 bad historical Undo is rejected; no silent truncated or repaired history",()=>{
 const main=JSON.stringify(legacy());
 const cases=[
  ["bad JSON","{broken","undo_undo_json_invalid"],
  ["wrong Undo type",'{"unexpected":1}',"undo_undo_shape_invalid"],
  ["bad snapshot",JSON.stringify(["{bad"]),"undo_undo_graph_json_invalid"],
  ["unsupported future snapshot",JSON.stringify([JSON.stringify(legacy(500))]),"undo_undo_graph_unsupported_graph_version"],
  ["13 exceeds limit",JSON.stringify(Array(13).fill(main)),"undo_undo_shape_invalid"]
 ];
 for(const [label,raw,reason] of cases){
  const s=storage(main,raw),res=inspectLegacy3D(s);
  assert.equal(res.ok,false,label);
  assert.equal(res.reason,reason,label);
  assert.equal(s.getItem(MAIN_KEY),main);
  assert.equal(s.getItem(UNDO_KEY),raw);
  assert.deepEqual(s.writes,[]);
 }
});
test("R16 explicitly future versions remain rejected while valid historical fields are optional",()=>{
 assert.equal(validateBrainImport(legacy(null)).ok,true);
 assert.equal(validateBrainImport(legacy(1)).ok,true);
 assert.equal(validateBrainImport(legacy(2)).ok,true);
 assert.equal(validateBrainImport(legacy(3)).reason,"unsupported_graph_version");
});
