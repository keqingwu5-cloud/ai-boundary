"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const c=require("../tcvl-candidate-core.js");
const when="2026-10-17T12:00:00Z";
const link=(state,refs=[],reason="")=>({state,refs,reason});
function entry(id="C1",overrides={}){
 return {id,kind:"knowledge",title:"假設與資料的區分",summary:"這是可比較的原始資訊摘要。",
 highlight:"提出新的分析角度",comparison:"指出與既有資料的差異",context:"特定研究情境",
 sources:["src-1"],evidence_refs:["ev-1"],uncertainties:"",
 links:{context:link("linked",["ctx-1"]),memory:link("not_applicable",[],"目前沒有授權記憶索引"),
 causal:link("not_applicable",[],"只是資料摘要沒有因果主張")},entered_at:when,...overrides};
}
function add(ledger=c.blank(),raw=entry(),id="log-1"){
 return c.add(ledger,raw,{id,at:when,note:"manual test"});
}
test("an empty workbook is not falsely treated as synced private regulation DB",()=>{
 const x=c.blank();assert.deepEqual(c.check(x),[]);assert.equal(x.items.length,0);
});
test("candidate with context and justified N/A links is ready for DATABASE review only",()=>{
 const x=add();const g=c.evaluate(x.items[0],x.items);
 assert.equal(g.route,"database_review");assert.equal(g.formal_rule,"not_approved");
 assert.equal(g.core_memory,"human_approval_required");assert.equal(g.remote_ack,"not_connected");
});
test("missing source/context/novelty/comparison/chain blocks promotion",()=>{
 const x=add(c.blank(),entry("C2",{sources:[],highlight:"",context:"",comparison:"",
 links:{context:link("missing"),memory:link("missing"),causal:link("missing")}}));
 const g=c.evaluate(x.items[0],x.items);assert.equal(g.route,"hold");
 assert.ok(g.reasons.length>=5);
});
test("a minority research hypothesis can be reviewed without being accepted as fact",()=>{
 const x=add(c.blank(),entry("R1",{kind:"research",uncertainties:"可能存在反例 X",
 links:{context:link("linked",["ctx"]),memory:link("not_applicable",[],"未使用記憶"),
 causal:link("linked",["hypothesis-1"])}}));
 const g=c.evaluate(x.items[0],x.items);
 assert.equal(g.route,"research_review");assert.equal(g.formal_rule,"not_approved");
});
test("repeated content goes to comparison, not core promotion or mistaken independent evidence",()=>{
 const a=add();const b=add(a,entry("C2",{sources:["src-2"]}),"log-2");
 const g=c.evaluate(b.items[1],b.items);assert.equal(g.route,"compare_duplicates");
 assert.deepEqual(g.possible_duplicates,["C1"]);
 assert.equal(g.core_memory,"human_approval_required");
});
test("a linked memory/causal chain must cite IDs; N/A must have a reason",()=>{
 let x=add(c.blank(),entry("M1",{links:{
  context:link("linked",["ctx"]),memory:link("linked"),causal:link("not_applicable")
 }}));
 assert.equal(c.evaluate(x.items[0],x.items).route,"hold");
});
test("invalid/reused candidate ids cannot overwrite previously stored data",()=>{
 const x=add(),old=JSON.stringify(x);
 assert.throws(()=>add(x,entry(),"log-2"),/重複/);
 assert.equal(JSON.stringify(x),old);
});
test("a screen event records why, but never mutates approval and original record",()=>{
 const x=add(),copy=JSON.stringify(x.items);
 assert.throws(()=>c.screen(x,"C1",{id:"s1",at:when,note:""}),/理由/);
 const out=c.screen(x,"C1",{id:"s1",at:when,note:"只供人工判讀"});
 assert.equal(out.result.route,"database_review");
 assert.equal(JSON.stringify(x.items),copy);
 assert.equal(out.ledger.items[0].stage,"candidate");
 assert.equal(out.ledger.events[1].type,"screened");
});
test("manually imported private rule metadata remains pending; no original rule text imported",()=>{
 const x=c.addRuleIndex(c.blank(),[
  {regulation_id:"API-02",version:1,title:"身分界線",approval_status:"approved",content:{private:"do not copy"}},
  {regulation_id:"COLLAB-C07",version:2,title:"重複資料",content:{secret:"do not copy"}}
 ],{idPrefix:"test",at:when});
 assert.equal(x.items.length,2);
 assert.equal(x.items[0].kind,"rule");
 assert.equal(x.items[0].origin_status,"candidate_unverified");
 assert.ok(!JSON.stringify(x).includes("do not copy"));
 assert.ok(!JSON.stringify(x).includes("secret"));
 assert.equal(c.evaluate(x.items[0],x.items).route,"hold");
});
test("all 23 rule metadata records can be indexed with no official approval",()=>{
 const list=Array.from({length:23},(_,i)=>({regulation_id:"REG-"+(i+1),version:1,title:"候選 "+(i+1)}));
 const x=c.addRuleIndex(c.blank(),list,{idPrefix:"bulk",at:when});
 assert.equal(x.items.length,23);assert.equal(x.events.length,23);
 assert.ok(x.items.every(item=>item.stage==="candidate"));
 assert.ok(x.items.every(item=>c.evaluate(item,x.items).route==="hold"));
});
test("the candidate workbook rejects forged approved status and duplicate event IDs",()=>{
 const x=add(),a=JSON.parse(JSON.stringify(x));a.items[0].stage="approved";
 assert.ok(c.check(a).includes("invalid_item"));
 const b=JSON.parse(JSON.stringify(x));b.events.push({...b.events[0]});b.revision++;
 assert.ok(c.check(b).includes("invalid_event"));
});
test("unknown/invalid rule versions and duplicate rule index rows are rejected",()=>{
 assert.throws(()=>c.addRuleIndex(c.blank(),[{regulation_id:"r",version:0}],{idPrefix:"a",at:when}),/版本/);
 assert.throws(()=>c.addRuleIndex(c.blank(),[{regulation_id:"r",version:1},{regulation_id:"r",version:1}],{idPrefix:"a",at:when}),/重複/);
});
