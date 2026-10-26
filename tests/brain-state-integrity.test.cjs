"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const guard=import("../brain-import-guard.mjs");
const copy=x=>JSON.parse(JSON.stringify(x));
function sample(name="old"){return {version:2,brains:[{id:"main",name:"Main",parentBrainId:null,position:[0,0,0],scale:1,rootNodeId:null}],nodes:[{id:"n1",brainId:"main",parentId:null,title:name,pos:[0,0,0]}],links:[],history:[]};}
function store(){const data=new Map(),writes=[];let fail="";return {data,writes,getItem(k){return data.has(k)?data.get(k):null},setItem(k,v){writes.push(k);if(k===fail)throw Error("QuotaExceededError");data.set(k,String(v))},removeItem(k){data.delete(k)},failOn(k){fail=k},clear(){fail=""}};}
async function harness(opts={}){
 const {commitBrainImport,validateBrainImport}=await guard;
 const src=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8");
 const i=src.indexOf("let state = migrate(load() || seedState());"),j=src.indexOf("const N = id =>",i);
 const k=src.indexOf("function undo(){"),l=src.indexOf("function exportJSON(){",k);
 assert.ok(i>0&&j>i&&k>j&&l>k,"actual save/mutate/undo/reset code");
 const pieces=src.slice(i,j)+"\n"+src.slice(k,l);
 const storage=store(),ui=[];
 storage.data.set("aiBrain.v1",JSON.stringify(sample()));
 storage.data.set("aiBrain.v1.undo",JSON.stringify(opts.undo||[]));
 const env={commitBrainImport,validateBrainImport,localStorage:storage,KEY:"aiBrain.v1",UKEY:"aiBrain.v1.undo",
 migrate:s=>{s.concepts ||= {};s.patterns ||= {};return s;},load:()=>copy(sample()),seedState:()=>sample("seed"),clearTimeout(){},flashSaved(){ui.push("saved")},
 toast:s=>ui.push(s),sync(){},renderHistory(){},renderCrumbs(){},closePanel(){},focusBrain(){}};
 const prefix="let blockedStoredState=false,expectedMainRaw=env.localStorage.getItem('aiBrain.v1'); const {commitBrainImport,validateBrainImport,localStorage,KEY,UKEY,migrate,load,seedState,clearTimeout,flashSaved,toast,sync,renderHistory,renderCrumbs,closePanel,focusBrain}=env; const focusId='main'; const B=id=>state.brains.find(x=>x.id===id);";
 const suffix="return {get:()=>state,undoStack:()=>undoStack,mutate,undo,resetAll,save,events:listeners};";
 return {...new Function("env",prefix+"\n"+pieces+"\n"+suffix)(env),storage,ui};
}
test("01 init and save",async()=>{const h=await harness();assert.equal(h.save(true),true);assert.equal(JSON.parse(h.storage.getItem("aiBrain.v1")).nodes[0].title,"old")});
test("02 mutation persists immediately",async()=>{const h=await harness();assert.equal(h.mutate("edit",{},()=>h.get().nodes[0].title="new"),true);assert.equal(JSON.parse(h.storage.getItem("aiBrain.v1")).nodes[0].title,"new")});
test("03 valid derived link persists",async()=>{const h=await harness();assert.equal(h.mutate("branch",{},()=>{h.get().nodes.push({id:"n2",brainId:"main",parentId:"n1",title:"child",pos:[0,0,0]});h.get().links.push({id:"l",from:"n1",to:"n2"})}),true);assert.equal(JSON.parse(h.storage.getItem("aiBrain.v1")).links.length,1)});
test("04 main failure restores state and undo",async()=>{const h=await harness(),old=h.storage.getItem("aiBrain.v1");h.storage.failOn("aiBrain.v1");assert.equal(h.mutate("edit",{},()=>h.get().nodes[0].title="new"),false);assert.equal(h.get().nodes[0].title,"old");assert.equal(h.storage.getItem("aiBrain.v1"),old);assert.equal(h.undoStack().length,0)});
test("05 undo key failure blocks mutation",async()=>{const h=await harness(),old=h.storage.getItem("aiBrain.v1");h.storage.failOn("aiBrain.v1.undo");assert.equal(h.mutate("edit",{},()=>h.get().nodes[0].title="new"),false);assert.equal(h.storage.getItem("aiBrain.v1"),old)});
test("06 duplicate node rejected",async()=>{const h=await harness();assert.equal(h.mutate("bad",{},()=>h.get().nodes.push(copy(h.get().nodes[0]))),false);assert.equal(h.get().nodes.length,1)});
test("07 thrown callback restores previous state",async()=>{const h=await harness();assert.equal(h.mutate("throw",{},()=>{h.get().nodes[0].title="new";throw Error("injected")}),false);assert.equal(h.get().nodes[0].title,"old")});
test("08 failed mutation emits no change",async()=>{const h=await harness();let seen=0;h.events.change=[()=>seen++];h.storage.failOn("aiBrain.v1");assert.equal(h.mutate("bad",{},()=>h.get().nodes[0].title="new"),false);assert.equal(seen,0)});
test("09 undo restores saved previous",async()=>{const h=await harness();h.mutate("edit",{},()=>h.get().nodes[0].title="new");assert.equal(h.undo(),true);assert.equal(h.get().nodes[0].title,"old");assert.equal(JSON.parse(h.storage.getItem("aiBrain.v1")).nodes[0].title,"old")});
test("10 failed undo leaves state and history",async()=>{const h=await harness();h.mutate("edit",{},()=>h.get().nodes[0].title="new");const old=h.storage.getItem("aiBrain.v1");h.storage.failOn("aiBrain.v1.undo");assert.equal(h.undo(),false);assert.equal(h.get().nodes[0].title,"new");assert.equal(h.storage.getItem("aiBrain.v1"),old);assert.equal(h.undoStack().length,1)});
test("11 invalid undo JSON safe",async()=>{const h=await harness({undo:["not json"]});assert.equal(h.undo(),false);assert.equal(h.undoStack().length,1)});
test("12 reset then undo",async()=>{const h=await harness();h.mutate("edit",{},()=>h.get().nodes[0].title="new");assert.equal(h.resetAll(),true);assert.equal(h.get().nodes[0].title,"seed");assert.equal(h.undo(),true);assert.equal(h.get().nodes[0].title,"new")});
test("13 reset fails without losing data",async()=>{const h=await harness();h.mutate("edit",{},()=>h.get().nodes[0].title="new");const old=h.storage.getItem("aiBrain.v1"),undo=copy(h.undoStack());h.storage.failOn("aiBrain.v1");assert.equal(h.resetAll(),false);assert.equal(h.get().nodes[0].title,"new");assert.equal(h.storage.getItem("aiBrain.v1"),old);assert.deepEqual(h.undoStack(),undo)});
test("14 save failure not claimed as saved",async()=>{const h=await harness();h.ui.length=0;h.storage.failOn("aiBrain.v1");assert.equal(h.save(true),false);assert.equal(h.ui.includes("saved"),false)});
test("15 invalid undo graph rejected",async()=>{const h=await harness({undo:[JSON.stringify({...sample(),nodes:[null]})]});assert.equal(h.undo(),false);assert.equal(h.get().nodes[0].title,"old")});
test("16 reset migrates missing concept and pattern dictionaries before rendering",async()=>{const h=await harness();assert.equal(h.resetAll(),true);assert.equal(typeof h.get().concepts,"object");assert.equal(typeof h.get().patterns,"object")});
test("17 stale revision prevents mutate and preserves external persisted value",async()=>{
 const h=await harness(),newer=JSON.stringify(sample("external"));
 h.storage.data.set("aiBrain.v1",newer);
 assert.equal(h.mutate("edit",{},()=>{h.get().nodes[0].title="stale"}),false);
 assert.equal(h.storage.getItem("aiBrain.v1"),newer);
 assert.equal(h.get().nodes[0].title,"old");
});
