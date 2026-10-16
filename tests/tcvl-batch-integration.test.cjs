"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const p=require("../tcvl-platform-core.js");
const a=require("../tcvl-architecture-core.js");
const m=require("../memory-workflow-core.js");
const now="2026-10-16T04:12:00.000Z";

/* One coordinated acceptance path covering the requested batch. It is deliberately
   separate from unit tests, and does not claim external AI delivery. */
test("TCVL batch: project -> pause -> new chat -> rejection alert -> candidate map -> memory handoff",()=>{
  let w=p.createWorkspace();let n=0;
  function apply(action,projectId,changer){
    const id="batch"+(++n);
    const result=p.runGatedChange(w,{
      id,at:now,action,projectId,source:"user_manual",expectedRevision:w.revision
    },()=>changer(w));
    assert.equal(result.applied,true,"change must pass before/after checks: "+action+" "+result.reason);
    w=result.workspace;
  }
  apply("project.create","",x=>p.addProject(x,{id:"PROJ",title:"主腦治理",goal:"長期驗證分工、退回與工作續接",at:now}));
  apply("thread.create","PROJ",x=>p.addThread(x,{id:"CHAT1",projectId:"PROJ",title:"原對話",at:now}));
  apply("task.create","PROJ",x=>p.addTask(x,{id:"WORK1",projectId:"PROJ",title:"研究接口",owner:"GPT①",reason:"目前資料尚待核對",at:now}));
  apply("task.pause","PROJ",x=>p.pauseTask(p.setProgress(x,{taskId:"WORK1",progress:"第一階段已整理，等待下一步"}),{taskId:"WORK1",at:now,seq:"pause1"}));
  assert.equal(w.tasks[0].status,"paused");
  assert.equal(w.tasks[0].progress,"第一階段已整理，等待下一步");

  apply("proposal.create","PROJ",x=>p.addProposal(x,{id:"FUTURE1",projectId:"PROJ",title:"未來新 AI 接口",purpose:"保留新的分支，未經接線驗證",fromNode:"launcher",at:now}));
  apply("link.plan","PROJ",x=>p.addLink(x,{id:"EDGE1",from:"launcher",to:"FUTURE1",kind:"branch",at:now}));
  apply("proposal.review","PROJ",x=>p.proposalDecision(x,{proposalId:"FUTURE1",decision:"rejected",
    reason:"尚無真正的身分與收件回執",impact:"此分支不可作為已連線接口",next:"補身份驗證與接口測試",at:now,seq:"reject1"}));
  assert.equal(w.alerts.length,1);
  assert.deepEqual([w.alerts[0].reason,w.alerts[0].impact,w.alerts[0].next],
    ["尚無真正的身分與收件回執","此分支不可作為已連線接口","補身份驗證與接口測試"]);

  apply("thread.continue","PROJ",x=>p.startContinuation(x,{id:"CHAT2",projectId:"PROJ",fromThreadId:"CHAT1",title:"新對話：繼續規劃",at:now,seq:"cont1"}));
  apply("thread.message","PROJ",x=>p.addMessage(x,{id:"MSG1",threadId:"CHAT2",author:"使用者",text:"延續規劃，不中斷原任務",at:now}));
  assert.equal(w.threads.length,2);
  assert.equal(w.threads[1].parentThreadId,"CHAT1");
  assert.equal(w.tasks[0].status,"paused","new conversation cannot auto-resume a paused task");
  assert.equal(w.tasks[0].progress,"第一階段已整理，等待下一步");
  assert.ok(p.continuationText(p.continuationSnapshot(w,{projectId:"PROJ",threadId:"CHAT1"})).includes("補身份驗證與接口測試"));

  const custom=p.addCustomStatus([],{id:"custom_waiting",label:"等待補證",base:"review",note:"人工自訂"});
  assert.equal(p.statusOf("custom_waiting",custom).base,"review");
  const map=p.transferCandidateMap(w,"PROJ");
  assert.equal(map.nodes.length,1);
  const graph=a.normalizeCandidateTransfer(map,["launcher","governance","vault"]);
  assert.equal(graph.nodes[0].status,"候選規劃／未接線");
  assert.ok(graph.edges.every(e=>e.status==="planned"));
  const route=a.routePlan("launcher","FUTURE1",graph.edges);
  assert.equal(route.automatic,false);
  assert.equal(route.hasUnbuilt,true);
  const packet=p.conditionMemoryCandidate(w,{projectId:"PROJ",uid:"BATCH1",at:now});
  assert.equal(m.validatePack(packet).length,1);
  assert.ok(packet.items[0].content.includes("尚無真正的身分與收件回執"));
  assert.ok(w.events.some(x=>x.kind==="gate.before"));
  assert.ok(w.events.some(x=>x.kind==="gate.after"));
  assert.deepEqual(p.validate(w),[]);

  const exported=JSON.parse(JSON.stringify(w));
  const restored=p.safeImport(exported);
  assert.deepEqual(restored,w);
  assert.equal(restored.tasks[0].status,"paused");
});
test("TCVL batch: failed governance check gives reason, impact and remedy without deleting previous work",()=>{
 let w=p.addProject(p.createWorkspace(),{id:"P",title:"紀錄核對",goal:"保持已存在資料",at:now});
 w=p.addThread(w,{id:"T",projectId:"P",title:"保存原始對話",at:now});
 const before=JSON.parse(JSON.stringify(w));
 const rejected=p.runGatedChange(w,{
   id:"CHECK-FAIL",at:now,action:"thread.message",projectId:"P",
   expectedRevision:w.revision-1,source:"user_manual"
 },()=>p.addMessage(w,{id:"M1",threadId:"T",author:"使用者",text:"不該被直接寫入",at:now}));
 assert.equal(rejected.applied,false);
 assert.equal(rejected.decision,"reject");
 assert.ok(rejected.workspace.alerts[0].reason);
 assert.ok(rejected.workspace.alerts[0].impact);
 assert.ok(rejected.workspace.alerts[0].next);
 assert.deepEqual(rejected.workspace.threads,before.threads);
 assert.ok(rejected.workspace.events.some(x=>x.kind==="gate.failure"));
});