"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const c=require("../tcvl-reporting-core.js");
const [planner,screen,db,research,memory,dispatch]=c.ROLES;
const at="2026-10-17T10:00:00.000Z";
const first=(ledger=c.createLedger())=>c.record(ledger,{
 id:"event-1",from:research,to:db,action:"反證",subject:"資料的因果解釋",
 reason:"提出可驗證的不同解釋",evidence:"public-ref-1",reply_to:"",at
});
test("empty manual ledger contains no invented AI activity",()=>{
 const x=c.createLedger();
 assert.deepEqual(c.summary(x),{events:0,awaiting:0,manualReplies:0,disputes:0});
 assert.deepEqual(c.validateLedger(x),[]);
});
test("a challenge must preserve source and remains unverified",()=>{
 const x=first();
 assert.equal(x.events[0].author_status,"manual_unverified");
 assert.equal(x.events[0].from,research);
 assert.equal(x.events[0].to,db);
 assert.equal(c.summary(x).awaiting,1);
 assert.equal(c.summary(x).disputes,1);
});
test("a reverse reply links to original ID without overwriting the challenge",()=>{
 const x=first(),old=JSON.stringify(x);
 const y=c.record(x,{id:"event-2",from:db,to:research,action:"回覆／確認",
  subject:"資料的因果解釋",reason:"已人工記錄不同意見，尚待測試",evidence:"",
  reply_to:"event-1",at});
 assert.equal(JSON.stringify(x),old);
 assert.equal(y.events.length,2);
 assert.equal(y.events[1].reply_to,"event-1");
 assert.equal(c.summary(y).manualReplies,1);
 assert.equal(c.summary(y).awaiting,1);
});
test("incorrect direction and unknown parent cannot masquerade as two-way reply",()=>{
 const x=first();
 for(const replyTo of ["missing","event-1"]){
  assert.throws(()=>c.record(x,{id:"event-2",from:planner,to:db,action:"回覆／確認",
    subject:"不合法回覆",reason:"身份方向錯誤",evidence:"",reply_to:replyTo,at}),/不符合/);
 }
});
test("duplicate event identifiers are rejected, original ledger remains unchanged",()=>{
 const x=first();const old=JSON.stringify(x);
 assert.throws(()=>first(x),/不符合/);
 assert.equal(JSON.stringify(x),old);
});
test("manual events cannot be forged into remotely verified receipts",()=>{
 const x=first();
 const forged=JSON.parse(JSON.stringify(x));
 forged.events[0].author_status="independent_actor_ack";
 assert.ok(c.validateLedger(forged).includes("unverified_event_falsely_verified"));
});
test("unknown actors, same endpoints or unsupported actions cannot be recorded",()=>{
 for(const [from,to,action] of [[db,db,"反證"],["假 AI",db,"反證"],[planner,db,"approved"]]){
  assert.throws(()=>c.record(c.createLedger(),{id:"event-a",from,to,action,subject:"測試",reason:"應拒絕",reply_to:"",evidence:"",at}),/不符合/);
 }
});
test("all meaningful manager actions can be represented without automatic acceptance",()=>{
 let x=c.createLedger(),i=0;
 for(const action of c.ACTIONS){
  x=c.record(x,{id:"event-"+(++i),from:screen,to:db,action,subject:"候選審核",reason:"僅做本機登記",evidence:"",reply_to:"",at});
 }
 assert.equal(x.events.length,c.ACTIONS.length);
 assert.equal(c.summary(x).awaiting,c.ACTIONS.length);
});
