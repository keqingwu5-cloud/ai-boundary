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
 const p=plan(s);
 assert.deepEqual(p.proposals.filter(x=>x.source!=="memoryControls.direction").map(x=>x.ref),["x","y"]);
 assert.ok(p.proposals.every(x=>x.status==="idea_draft"));
 assert.equal(p.proposals[0].fitHint,"DIRECTION_ANCHORED");
 assert.equal(s.memories.length,0);
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

test("direction history: first original intent preserved through revisions",()=>{
 const s=state();
 s.memoryControls.direction={text:"記憶來源與反證優先",version:2};
 s.memoryControls.history=[
  {id:"v1",kind:"direction",version:1,before:"",after:"記憶來源優先"},
  {id:"v2",kind:"direction",version:2,before:"記憶來源優先",after:"記憶來源與反證優先"}];
 const p=plan(s);
 assert.equal(p.direction.origin.status,"history_consistent_local");
 assert.equal(p.direction.origin.ref,"memoryControls.history:v1");
 assert.equal(p.direction.origin.originalExcerpt,"記憶來源優先");
 assert.equal(s.memoryControls.history[0].after,"記憶來源優先");
});
test("forged or gapped history cannot claim provenance",()=>{
 const s=state();
 s.memoryControls.history=[{id:"fake",kind:"direction",version:2,before:"錯誤",after:"以記憶方向追溯原意與反證"}];
 const p=plan(s);
 assert.equal(p.direction.origin.status,"unverified");
 assert.equal(p.direction.origin.ref,null);
});
test("new task preflight gives direction and related approved memory without approval",()=>{
 const s=state();s.memories=[{id:"m1",question:"記憶來源與反證",purpose:"記憶方向沿革",versions:[
  {number:1,content:"先記錄原來的理解"},
  {number:2,content:"現在記錄記憶來源與反證"}]}];
 const r=plan(s,{taskTitle:"修正記憶方向與來源"});
 assert.equal(r.preflight.directionVersion,2);
 assert.equal(r.preflight.fitHint,"LEXICAL_CANDIDATE");
 assert.deepEqual(r.preflight.relatedApproved.map(x=>x.ref),["memory:m1"]);
 assert.equal(r.preflight.relatedApproved[0].version,2);
 assert.equal(r.preflight.relatedApproved[0].relation,"lexical_candidate");
 assert.equal(r.preflight.verdict,"not_verified_no_auto_execution");
});
test("unrelated tasks are marked for review, not treated as aligned",()=>{
 const s=state();
 const p=plan(s,{taskTitle:"設計海洋魚類辨識遊戲"});
 assert.equal(p.preflight.fitHint,"NEEDS_DIRECTION_REVIEW");
 assert.equal(p.alignment,"not_verified");
});
test("unrelated open ideas survive as drafts with direction anchored exploration",()=>{
 const s=state();
 s.candidates=[{id:"c-remote",status:"pending",question:"海洋魚類辨識"}];
 const p=plan(s);
 assert.equal(p.proposals[0].fitHint,"DIRECTION_ANCHORED");
 const divergent=p.proposals.find(x=>x.ref==="c-remote");
 assert.ok(divergent);
 assert.equal(divergent.fitHint,"NEEDS_DIRECTION_REVIEW");
 assert.equal(divergent.status,"idea_draft");
 assert.equal(s.candidates[0].status,"pending");
});
test("direction-linked open work ranked ahead of unrelated without status promotion",()=>{
 const s=state();
 s.candidates=[{id:"unrelated",status:"pending",question:"星際觀測"},
  {id:"relevant",status:"pending",question:"記憶方向與反證的研究"}];
 const p=plan(s,{limit:2});
 assert.equal(p.proposals[0].ref,"relevant");
 assert.equal(p.proposals[0].fitHint,"LEXICAL_CANDIDATE");
 assert.ok(p.proposals.every(x=>x.status==="idea_draft"));
});
test("plan is deterministic and does not overwrite user direction or memories",()=>{
 const s=state();s.memories=[{id:"m",question:"記憶方向",versions:[{number:1,content:"保存原意"}]}];
 const before=JSON.stringify(s);
 const a=plan(s,{taskTitle:"記憶方向核對"}),b=plan(s,{taskTitle:"記憶方向核對"});
 assert.deepEqual(a,b);assert.equal(JSON.stringify(s),before);
});
