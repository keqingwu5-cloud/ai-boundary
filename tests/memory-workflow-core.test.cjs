"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const c=require("../memory-workflow-core.js");
const item={id:"G1-001",question:"主腦分工",purpose:"責任",content:"GPT①發號、GPT②反證、BOT③驗證",reason:"整理",evidence:"來源",evidenceLevel:"hypothesis"};
const pack={schema:c.PACK_SCHEMA,items:[item]};
const empty={candidates:[],memories:[],audit:[]};
test("new pack imports as candidate proposal",()=>assert.equal(c.planImport(pack,empty).accepted.length,1));
test("exact duplicate origin ID is skipped",()=>assert.equal(c.planImport(pack,{...empty,candidates:[{originId:"G1-001",question:"主腦分工",content:item.content}]}).duplicated.length,1));
test("reused origin ID and different content requires review",()=>assert.throws(()=>c.planImport(pack,{...empty,candidates:[{originId:"G1-001",question:"主腦分工",content:"old"}]}),/來源版本衝突/));
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

test("same ID with punctuation-only changed payload still blocks silent duplicate skip",()=>{
 const first={originId:"G1-001",question:"主腦分工",content:item.content};
 const newer={...item,content:item.content+"。"};
 assert.throws(()=>c.planImport({...pack,items:[newer]},{...empty,candidates:[first]}),/來源版本衝突/);
});
