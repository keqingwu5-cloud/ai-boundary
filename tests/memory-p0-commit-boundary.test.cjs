"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

// Load and execute the actual queueChange function from memory.js, not a
// reimplementation. All persistence and UI effects are synthetic test doubles.
const code=fs.readFileSync(path.join(__dirname,"../memory.js"),"utf8");
const start=code.indexOf("function queueChange(");
const end=code.indexOf("\nconst node=",start);
assert.ok(start>=0&&end>start,"expected exact production queueChange function");
const productionQueue=code.slice(start,end);
function harness({rejectWrite=false,failRender=false}={}){
 const events=[],messages=[];
 let durable=null,locked=false,renderFault=failRender,writeRejected=rejectWrite;
 const env={
  state:{audit:[],revision:3},
  writeChain:Promise.resolve(),
  persist:async()=>{
   if(writeRejected)throw Error("SYNTHETIC_WRITE_DENIED");
   durable=JSON.stringify(env.state);
  },
  feedback:x=>messages.push(String(x)),
  renderAll:()=>{
   events.push("render");
   if(renderFault){renderFault=false;throw Error("SYNTHETIC_UI_FAULT");}
  },
  showLocked:()=>{locked=true;env.state=null;events.push("locked");},
 };
 vm.runInNewContext(productionQueue+"\nthis.queueChange=queueChange;",env);
 return {
  env,events,messages,
  get durable(){return durable;},
  get locked(){return locked;},
  setRejectWrite:v=>{writeRejected=v;},
  setRenderFault:v=>{renderFault=v;},
  enqueue:(action,afterCommit)=>env.queueChange(action,afterCommit),
  done:async()=>{await env.writeChain;}
 };
}
test("P0 successful commit is rendered and confirmed",async()=>{
 const s=harness();
 s.enqueue(()=>{s.env.state.audit.push({id:"A"});return "Saved";});
 await s.done();
 assert.equal(JSON.parse(s.durable).audit[0].id,"A");
 assert.deepEqual(s.events,["render"]);
 assert.ok(s.messages.includes("Saved"));
 assert.equal(s.locked,false);
});
test("P0 rejected write rolls back state and derived UI",async()=>{
 const s=harness({rejectWrite:true});
 s.enqueue(()=>{s.env.state.audit.push({id:"GHOST"});return "Saved";});
 await s.done();
 assert.equal(s.durable,null);
 assert.equal(s.env.state.audit.length,0);
 assert.deepEqual(s.events,["render"]);
 assert.match(s.messages.at(-1),/操作未儲存/);
});
test("P0 postcommit render exception retains durable record and locks state",async()=>{
 const s=harness({failRender:true});
 s.enqueue(()=>{s.env.state.audit.push({id:"COMMITTED"});return "Saved";});
 await s.done();
 assert.equal(JSON.parse(s.durable).audit[0].id,"COMMITTED");
 assert.equal(s.locked,true);
 assert.equal(s.env.state,null);
 assert.match(s.messages.at(-1),/已加密保存.*畫面更新失敗/);
 assert.ok(!s.messages.some(x=>x.includes("操作未儲存")));
});
test("P0 afterCommit failure cannot pretend the durable record was rolled back",async()=>{
 const s=harness();
 s.enqueue(()=>{s.env.state.audit.push({id:"DONE"});return "Saved";},()=>{
  throw Error("SYNTHETIC_POSTCOMMIT_CALLBACK_FAILURE");
 });
 await s.done();
 assert.equal(JSON.parse(s.durable).audit[0].id,"DONE");
 assert.equal(s.locked,true);
 assert.match(s.messages.at(-1),/已加密保存.*畫面更新失敗/);
});
test("P0 precommit failure never runs postcommit UI callback",async()=>{
 const s=harness({rejectWrite:true});
 let ran=false;
 s.enqueue(()=>{s.env.state.audit.push({id:"NOT-SAVED"});return "Saved";},()=>{ran=true;});
 await s.done();
 assert.equal(ran,false);
 assert.equal(s.env.state.audit.length,0);
});
test("P0 a UI failure after commit blocks queued stale mutations",async()=>{
 const s=harness({failRender:true});
 s.enqueue(()=>{s.env.state.audit.push({id:"FIRST"});return "Saved";});
 s.enqueue(()=>{s.env.state.audit.push({id:"STALE"});return "Saved";});
 await s.done();
 assert.deepEqual(JSON.parse(s.durable).audit.map(x=>x.id),["FIRST"]);
 assert.equal(s.locked,true);
});
test("P0 failed write plus failed recovery redraw locks rather than exposing stale UI",async()=>{
 const s=harness({rejectWrite:true,failRender:true});
 s.enqueue(()=>{s.env.state.audit.push({id:"GHOST"});return "Saved";});
 await s.done();
 assert.equal(s.durable,null);
 assert.equal(s.locked,true);
 assert.match(s.messages.at(-1),/操作未儲存.*畫面無法同步/);
});
