"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const c=require("../memory-workflow-core.js");
const item={id:"G1-001",question:"主腦分工",purpose:"責任",content:"GPT①發號、GPT②反證、BOT③驗證",reason:"整理",evidence:"來源",evidenceLevel:"hypothesis"};
const pack={schema:c.PACK_SCHEMA,items:[item]};
const empty={candidates:[],memories:[],audit:[]};
test("new pack imports as candidate proposal",()=>assert.equal(c.planImport(pack,empty).accepted.length,1));
test("duplicate origin ID is skipped",()=>assert.equal(c.planImport(pack,{...empty,candidates:[{originId:"G1-001",question:"主腦分工",content:"old"}]}).duplicated.length,1));
test("same question different answer remains conflict",()=>assert.equal(c.planImport(pack,{...empty,memories:[{id:"m1",question:"主腦分工",versions:[{content:"different"}]}]}).conflicts.length,1));
test("duplicate item IDs rejected",()=>assert.throws(()=>c.validatePack({...pack,items:[item,item]})));
test("reject overwriting operations in imported packs",()=>assert.throws(()=>c.validatePack({...pack,items:[{...item,eventType:"revise_answer"}]})));
test("approved memory is recalled",()=>assert.equal(c.recall("主腦分工",{...empty,memories:[{id:"m1",question:"主腦分工",purpose:"責任",versions:[{content:"GPT①發號",evidence:"ok"}]}]}).length,1));
test("rejected candidate is recalled with status",()=>assert.equal(c.recall("主腦分工 拒絕",{...empty,candidates:[{id:"c1",question:"主腦分工",purpose:"責任",content:"有缺口",status:"rejected",review:{reason:"證據不足"}}]}).at(0).type,"rejected"));
test("workflow latest status keeps original audit untouched",()=>{
 const events=[{kind:"workflow.recorded",ref:"t1",status:"done"},{kind:"workflow.recorded",ref:"t1",status:"blocked"}];
 assert.equal(c.processLatest(events)[0].status,"done");assert.equal(events.length,2);
});
test("irrelevant recall returns no results",()=>assert.equal(c.recall("完全無關",{...empty,memories:[{id:"m1",question:"主腦分工",purpose:"責任",versions:[{content:"GPT①發號"}]}]}).length,0));

test("two competing directions in the same pack remain distinct and both flagged",()=>{
 const a={...item,id:"D-1",question:"記憶方向",content:"先做實驗"};
 const b={...item,id:"D-2",question:"記憶方向",content:"先做反證"};
 const r=c.planImport({...pack,items:[a,b]},empty);
 assert.equal(r.accepted.length,2);
 assert.deepEqual(r.conflicts,["D-1","D-2"]);
 assert.deepEqual(r.accepted[0].possibleBatchConflictWith,["D-2"]);
 assert.deepEqual(r.accepted[1].possibleBatchConflictWith,["D-1"]);
});
test("rejection status does not recall an unrelated topic",()=>{
 const s={...empty,candidates:[
  {id:"x",status:"rejected",question:"台灣 CPI",review:{reason:"拒絕，來源不足"},content:"舊"},
  {id:"y",status:"rejected",question:"記憶方向",review:{reason:"拒絕，沒有反證"},content:"舊"}]};
 const result=c.recall("記憶方向 拒絕",s);
 assert.deepEqual(result.map(x=>x.id),["y"]);
 assert.deepEqual(c.recall("拒絕",s).map(x=>x.id),["x","y"]);
});

test("processLatest prefers later dated event despite reversed import order",()=>{
 const events=[
  {kind:"workflow.recorded",ref:"w-order",status:"blocked",at:"2026-10-30T00:00:00.000Z"},
  {kind:"workflow.recorded",ref:"w-order",status:"done",at:"2026-10-31T00:00:00.000Z"}
 ];
 assert.equal(c.processLatest(events)[0].status,"done");
 assert.equal(events[0].status,"blocked");
 assert.equal(events.length,2);
});
