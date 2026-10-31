"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {plan}=require("../memory-auto-drive-core.js");
const state=()=>({memoryControls:{direction:{text:"以記憶方向追溯原意與反證",version:2},
 threshold:{text:"手動核准",version:1},history:[]},memories:[],candidates:[],audit:[]});
test("no owner direction means no inferred commands",()=>{
 const s=state();delete s.memoryControls;
 const p=plan(s);assert.equal(p.direction.available,false);assert.deepEqual(p.proposals,[]);
});
test("automatic draft generation does not mutate memory",()=>{
 const s=state(),before=JSON.stringify(s),p=plan(s);
 assert.equal(p.proposals[0].status,"idea_draft");
 assert.equal(p.direction.version,2);assert.equal(p.sideEffects,false);
 assert.equal(JSON.stringify(s),before);
});
test("latest blocked event wins, old done remains untouched",()=>{
 const s=state();s.audit=[
  {kind:"workflow.recorded",ref:"w1",status:"blocked",taskTitle:"追溯",reason:"原方向缺口",nextAction:"核對來源"},
  {kind:"workflow.recorded",ref:"w1",status:"done",taskTitle:"追溯"},
  {kind:"workflow.recorded",ref:"w2",status:"done",taskTitle:"已完成"}];
 const p=plan(s);assert.deepEqual(p.proposals.map(x=>x.ref),["w1"]);
 assert.equal(p.proposals[0].next,"核對來源");assert.equal(s.audit.length,3);
});
test("rejected and pending remain non-authoritative ideas",()=>{
 const s=state();s.candidates=[
  {id:"x",status:"rejected",question:"舊方向",review:{reason:"證據不足"}},
  {id:"y",status:"pending",question:"新方向"},{id:"z",status:"rejected",resolvedBy:"repair"}];
 const p=plan(s);assert.deepEqual(p.proposals.map(x=>x.ref),["x","y"]);
 assert.ok(p.proposals.every(x=>x.status==="idea_draft"));assert.equal(s.memories.length,0);
});
test("corrupt direction or state fails closed",()=>{
 const s=state();s.memoryControls.direction.version=-1;
 assert.throws(()=>plan(s),/direction_invalid/);
 assert.throws(()=>plan({...s,memories:null}),/state_invalid/);
});
test("bounded repeatable drafts have no artificial approval or ACK",()=>{
 const s=state();s.candidates=Array.from({length:10},(_,i)=>({id:"c"+i,status:"pending"}));
 const a=plan(s,{limit:3}),b=plan(s,{limit:3});
 assert.equal(a.proposals.length,3);assert.deepEqual(a,b);
 assert.equal(a.alignment,"not_verified");
 assert.equal(a.mode,"LOCAL_IDEA_DRAFT_ONLY");
});
