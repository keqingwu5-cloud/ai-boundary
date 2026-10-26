"use strict";
// Run: node --test tests/brain-import-integrity.test.cjs
// Synthetic records only. Does not access private memory or any remote AI.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const guardPromise=import("../brain-import-guard.mjs");
function sample(title="old"){
 return {version:1,brains:[{id:"main",parentBrainId:null,rootNodeId:null,position:[0,0,0]}],
 nodes:[{id:"n1",brainId:"main",parentId:null,pos:[0,0,0],title}],links:[],history:[]};
}
const duplicate=x=>JSON.parse(JSON.stringify(x));
function memoryStorage(failOn=null){
 const data=new Map(),log=[];
 return {data,log,
 getItem(k){return data.has(k)?data.get(k):null},
 setItem(k,v){log.push("set:"+k);if(failOn===k)throw Error("QuotaExceededError");data.set(k,String(v));},
 removeItem(k){log.push("delete:"+k);data.delete(k);}};
}
async function harness(failKey=null){
 const {validateBrainImport,commitBrainImport}=await guardPromise;
 const source=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8");
 assert.match(source,/from '.\/brain-import-guard\.mjs'/);
 const start=source.indexOf("function importJSON(obj)");
 const end=source.indexOf("/* ================= three.js scene",start);
 assert.ok(start>=0&&end>start,"actual importJSON function must remain testable");
 const imp=source.slice(start,end);
 const storage=memoryStorage(failKey),notices=[],initial=sample(),expected=JSON.stringify(initial);
 storage.data.set("aiBrain.v1",expected);
 storage.data.set("aiBrain.v1.undo","[]");
 const env={validateBrainImport,commitBrainImport,localStorage:storage,KEY:"aiBrain.v1",UKEY:"aiBrain.v1.undo",
 initial,migrate:x=>{x.version=2;x.history.push({ts:1,action:"migrate",payload:{}});return x;},
 clearTimeout(){},sync(){},renderHistory(){},renderCrumbs(){},closePanel(){},focusBrain(){},
 toast:s=>notices.push(s)};
 const runner=new Function("env","const {validateBrainImport,commitBrainImport,localStorage,KEY,UKEY,migrate,clearTimeout,sync,renderHistory,renderCrumbs,closePanel,focusBrain,toast}=env;let blockedStoredState=false,state=env.initial,undoStack=[],saveT=0;"+imp+";return {importJSON,state:()=>state,undo:()=>undoStack};");
 return {...runner(env),storage,notices,expected};
}
test("01 original valid legacy-format snapshot",async()=>{const g=await guardPromise;assert.equal(g.validateBrainImport(sample()).ok,true);});
test("02 valid import write and reload",async()=>{
 const h=await harness(),s=sample("new");
 assert.equal(h.importJSON(s),true);
 assert.equal(JSON.parse(h.storage.getItem("aiBrain.v1")).nodes[0].title,"new");
});
test("03 invalid top-level rejected and disk untouched",async()=>{
 const h=await harness();
 assert.equal(h.importJSON({brains:[],nodes:[],links:[],history:[]}),false);
 assert.equal(h.storage.getItem("aiBrain.v1"),h.expected);
});
test("04 missing parent rejected",async()=>{
 const h=await harness(),s=sample();s.nodes.push({...s.nodes[0],id:"n2",parentId:"none"});
 assert.equal(h.importJSON(s),false);assert.equal(h.storage.getItem("aiBrain.v1"),h.expected);
});
test("05 missing link endpoint rejected",async()=>{
 const h=await harness(),s=sample();s.links.push({id:"l",from:"n1",to:"none"});
 assert.equal(h.importJSON(s),false);
});
test("06 duplicate node ID rejected",async()=>{
 const h=await harness(),s=sample();s.nodes.push(duplicate(s.nodes[0]));
 assert.equal(h.importJSON(s),false);
});
test("07 primary storage failure preserves current state, no false success",async()=>{
 const h=await harness("aiBrain.v1");
 assert.equal(h.importJSON(sample("new")),false);
 assert.equal(h.state().nodes[0].title,"old");
 assert.equal(h.storage.getItem("aiBrain.v1"),h.expected);
 assert.ok(!h.notices.some(x=>x.includes("已匯入")));
});
test("08 undo storage failure blocks main write",async()=>{
 const h=await harness("aiBrain.v1.undo");
 assert.equal(h.importJSON(sample("new")),false);
 assert.equal(h.storage.getItem("aiBrain.v1"),h.expected);
 assert.ok(!h.storage.log.includes("set:aiBrain.v1"));
});
test("09 null node rejected before migration",async()=>{
 const h=await harness(),s=sample();s.nodes.push(null);
 assert.equal(h.importJSON(s),false);
});
test("10 parent ancestry cycles rejected",async()=>{
 const h=await harness(),s=sample();s.nodes[0].parentId="n2";
 s.nodes.push({...s.nodes[0],id:"n2",parentId:"n1"});
 assert.equal(h.importJSON(s),false);
});
test("11 rejected input never mutated",async()=>{
 const h=await harness(),s=sample("new"),before=JSON.stringify(s);
 assert.equal(h.importJSON(s),true);assert.equal(JSON.stringify(s),before);
});
test("12 successful import saves previous state in undo stack",async()=>{
 const h=await harness();assert.equal(h.importJSON(sample("new")),true);
 const stack=JSON.parse(h.storage.getItem("aiBrain.v1.undo"));
 assert.equal(stack.length,1);assert.equal(JSON.parse(stack[0]).nodes[0].title,"old");
});
test("13 valid derived graph and custom history retained",async()=>{
 const h=await harness(),s=sample();s.notes="history remains";
 s.nodes.push({...s.nodes[0],id:"n2",parentId:"n1"});
 s.links.push({id:"l",from:"n1",to:"n2",kind:"derived"});
 assert.equal(h.importJSON(s),true);
 const saved=JSON.parse(h.storage.getItem("aiBrain.v1"));
 assert.equal(saved.links[0].kind,"derived");assert.equal(saved.notes,"history remains");
});
test("14 duplicate link and brain IDs rejected",async()=>{
 const g=await guardPromise,s=sample();s.brains.push(duplicate(s.brains[0]));
 assert.equal(g.validateBrainImport(s).ok,false);
 const x=sample();x.nodes.push({...x.nodes[0],id:"n2"});
 x.links.push({id:"l",from:"n1",to:"n2"},{id:"l",from:"n1",to:"n2"});
 assert.equal(g.validateBrainImport(x).ok,false);
});
test("15 cross-brain link is allowed without assuming causal ancestry",async()=>{
 const g=await guardPromise,s=sample();s.brains.push({id:"sub",parentBrainId:"main",rootNodeId:"n2"});
 s.nodes.push({...s.nodes[0],id:"n2",brainId:"sub"});
 s.links.push({id:"x",from:"n1",to:"n2",kind:"cross"});
 assert.equal(g.validateBrainImport(s).ok,true);
});
test("16 interrupted write to primary restores old auxiliary data",async()=>{
 const g=await guardPromise,store=memoryStorage("main");
 store.data.set("main","previous");store.data.set("undo","[]");
 const r=g.commitBrainImport(store,"main","undo",sample(),["new"]);
 assert.equal(r.ok,false);assert.equal(r.rollbackOk,true);
 assert.equal(store.getItem("main"),"previous");assert.equal(store.getItem("undo"),"[]");
});
test("17 corrupted nested metadata/position rejected",async()=>{
 const g=await guardPromise,s=sample();s.nodes[0].pos=[0,NaN,0];
 assert.equal(g.validateBrainImport(s).ok,false);
});
test("18 no false success after readback mismatch",async()=>{
 const h=await harness();const originalGet=h.storage.getItem;let reads=0;
 h.storage.getItem=k=>{reads++;return reads>2&&k==="aiBrain.v1"?"mismatch":originalGet(k);};
 assert.equal(h.importJSON(sample("new")),false);
 assert.ok(!h.notices.some(x=>x.includes("已匯入")));
});
test("19 nonexistent rootNodeId rejected",async()=>{
 const g=await guardPromise,s=sample();s.brains[0].rootNodeId="unavailable";
 assert.equal(g.validateBrainImport(s).ok,false);
});
