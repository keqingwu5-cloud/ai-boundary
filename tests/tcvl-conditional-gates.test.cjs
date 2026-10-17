"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const c=require("../tcvl-platform-core.js");
const memory=require("../memory-workflow-core.js");
const now="2026-10-16T00:20:00.000Z";
function base(){return c.addProject(c.createWorkspace(),{id:"P1",title:"治理專案",goal:"記錄每個門檻的修改原因、影響及後續",at:now})}
function gate(w,{id="g1",action="task.create",projectId="P1",expectedRevision=w.revision,source="user_manual"}={},change=()=>w){
 return c.runGatedChange(w,{id,action,projectId,at:now,expectedRevision,source},change);
}
test("all workspaces remain backward-compatible with optional audit events",()=>{
 const w=base();assert.deepEqual(c.validate(w),[]);
});
test("normal change records both BEFORE and AFTER gates",()=>{
 const w=base(),x=gate(w,{},()=>c.addTask(w,{id:"T1",projectId:"P1",title:"測試",owner:"使用者",reason:"研究測試",at:now}));
 assert.equal(x.applied,true);assert.equal(x.decision,"pass");assert.equal(x.workspace.tasks.length,1);
 assert.equal(c.gateHistory(x.workspace).length,2);
 assert.deepEqual(c.gateHistory(x.workspace).map(e=>e.gate.phase),["after","before"]);
 assert.equal(c.gateHistory(x.workspace)[0].gate.revisionAfter,x.workspace.revision);
 assert.ok(c.gateHistory(x.workspace).every(e=>e.gate.conditions.every(x=>typeof x.passed==="boolean")));
});
test("revision conflict rejects update and retains original tasks with failure audit and alert",()=>{
 const w=base(),before=JSON.parse(JSON.stringify(w));
 const x=gate(w,{id:"conflict",expectedRevision:w.revision-1},()=>c.addTask(w,{id:"T1",projectId:"P1",title:"測試",owner:"使用者",reason:"研究",at:now}));
 assert.equal(x.applied,false);assert.equal(x.decision,"reject");
 assert.equal(x.workspace.tasks.length,0);assert.deepEqual(w,before);
 assert.equal(c.gateHistory(x.workspace)[0].gate.phase,"failure");
 assert.equal(x.workspace.alerts.length,1);
 assert.match(x.workspace.alerts[0].next,/檢查阻塞/);
});
test("unknown action outside agreed scope is rejected and recorded",()=>{
 const w=base(),x=gate(w,{id:"outside",action:"ai.remote_autopilot"},()=>w);
 assert.equal(x.applied,false);assert.equal(x.decision,"reject");assert.equal(x.workspace.projects.length,1);
});
test("project-scoped action cannot write without matching project",()=>{
 const w=base(),x=gate(w,{id:"missing",projectId:"other"},()=>w);
 assert.equal(x.applied,false);assert.equal(x.decision,"hold");
 assert.equal(x.workspace.tasks.length,0);
});
test("source not authorized cannot claim verified AI receipt",()=>{
 const w=base(),x=gate(w,{id:"fake",source:"verified_AI"},()=>w);
 assert.equal(x.applied,false);assert.equal(x.workspace.alerts.length,1);
});
test("failure in an operation records gate and keeps original project unchanged",()=>{
 const w=base(),x=gate(w,{id:"bad"},()=>{throw Error("資料缺欄位")});
 assert.equal(x.applied,false);assert.deepEqual(w.tasks,[]);
 assert.match(x.workspace.events[0].gate.reason,/資料缺欄位/);
});
test("post change cannot silently remove a previous record even if candidate schema valid",()=>{
 let w=base();w=c.addTask(w,{id:"T1",projectId:"P1",title:"舊任務",owner:"使用者",reason:"追蹤",at:now});
 const x=gate(w,{id:"destroy",action:"workspace.manual"},()=>{
   const altered=JSON.parse(JSON.stringify(w));altered.revision++;altered.tasks=[];return altered;
 });
 assert.equal(x.applied,false);assert.equal(x.workspace.tasks.length,1);
 assert.match(x.workspace.events[0].gate.reason,/覆蓋/);
});
test("in-place mutation is blocked without losing original project state",()=>{
 const w=base(),x=gate(w,{id:"mutate",action:"workspace.manual"},()=>{
   w.projects[0].goal="被惡意改寫";return w;
 });
 assert.equal(x.applied,false);assert.match(x.workspace.events[0].gate.reason,/直接修改/);
});
test("stopping a task preserves progress and does not block human conversation",()=>{
 let w=base();w=c.addTask(w,{id:"T1",projectId:"P1",title:"暫停測試",owner:"GPT①",reason:"等待補證",at:now});
 w=c.addThread(w,{id:"TH1",projectId:"P1",title:"其他對話",at:now});
 const x=gate(w,{id:"stop",action:"task.pause"},()=>{
   let next=c.setProgress(w,{taskId:"T1",progress:"完成三項檢查，剩餘外部證據"});
   return c.pauseTask(next,{taskId:"T1",at:now,seq:"stop1"});
 });
 assert.equal(x.applied,true);assert.equal(x.workspace.tasks[0].status,"paused");
 assert.match(x.workspace.tasks[0].progress,/完成三項/);
 const continued=c.addMessage(x.workspace,{id:"MSG1",threadId:"TH1",author:"使用者",text:"繼續討論下一版架構",at:now});
 assert.equal(continued.threads[0].messages.length,1);
 assert.equal(continued.tasks[0].status,"paused");
});
test("post threshold snapshot enters the project continuation card but never changes GPT memory",()=>{
 let w=base();const x=gate(w,{id:"task-g",action:"task.create"},()=>c.addTask(w,{id:"T1",projectId:"P1",title:"回溯",owner:"使用者",reason:"核對",at:now}));
 const snapshot=c.continuationSnapshot(x.workspace,{projectId:"P1"});
 assert.ok(snapshot.gateChecks.length>0);assert.match(c.continuationText(snapshot),/條件式門檻紀錄/);
});
test("invalid imported gate events are rejected by workspace validation",()=>{
 const w=base();w.events.unshift({id:"BAD",kind:"gate.before",message:"虛構通過",at:now,gate:{id:"A",phase:"before",decision:"pass"}});
 assert.ok(c.validate(w).includes("gate_event_invalid"));
});
test("gate history can filter phase and project",()=>{
 let w=base();const x=gate(w,{id:"f1"},()=>c.addTask(w,{id:"T1",projectId:"P1",title:"任務",owner:"使用者",reason:"條件",at:now}));
 assert.equal(c.gateHistory(x.workspace,{projectId:"P1",phase:"after"}).length,1);
 assert.equal(c.gateHistory(x.workspace,{projectId:"other"}).length,0);
});

test("conditional GPT handoff candidate is not produced without a recorded change gate",()=>{
 const w=base();
 assert.throws(()=>c.conditionMemoryCandidate(w,{projectId:"P1",uid:"candidate-1",at:now}),/尚無/);
});
test("condition-based memory packet preserves gate outcomes and stays unapproved",()=>{
 const w=base(),g=gate(w,{id:"gate_memory"},()=>c.addTask(w,{id:"T1",projectId:"P1",title:"保留歷史",owner:"使用者",reason:"研究",at:now}));
 const packet=c.conditionMemoryCandidate(g.workspace,{projectId:"P1",uid:"candidate-2",at:now});
 assert.equal(memory.validatePack(packet).length,1);
 assert.equal(packet.items[0].evidenceLevel,"hypothesis");
 assert.match(packet.items[0].content,/最近門檻與拒絕結果/);
 assert.match(packet.items[0].content,/新版本|條件式|門檻/);
 assert.match(packet.items[0].content,/不得自動寫入 GPT 長期記憶/);
});
