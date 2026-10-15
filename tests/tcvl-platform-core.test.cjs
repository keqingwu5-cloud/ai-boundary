"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const c=require("../tcvl-platform-core.js");
const m=require("../memory-workflow-core.js");
const t="2026-10-15T10:30:00.000Z";
let i=0;const id=()=>("id-"+(++i));
const start=()=>{
 let w=c.createWorkspace();
 w=c.addProject(w,{id:"P1",title:"TCVL 工作專案",goal:"驗證架構並保留每次修正",at:t});
 return w;
};
const addTask=w=>c.addTask(w,{id:"T1",projectId:"P1",title:"研究回溯",owner:"GPT①",reason:"驗證修正品質",at:t});
test("new workspace is well-formed and empty",()=>{const w=c.createWorkspace();assert.deepEqual(c.validate(w),[]);assert.equal(w.projects.length,0)});
test("projects retain goal and version on update",()=>{const w=start();assert.equal(w.projects[0].goal,"驗證架構並保留每次修正");assert.equal(w.revision,1)});
test("a new project conversation links to the correct project",()=>{const w=c.addThread(start(),{id:"TH1",projectId:"P1",title:"第一輪",at:t});assert.equal(w.threads[0].projectId,"P1")});
test("conversation can continue after one task is paused",()=>{
 let w=addTask(start());w=c.addThread(w,{id:"TH1",projectId:"P1",title:"討論方向",at:t});
 w=c.setProgress(w,{taskId:"T1",progress:"已完成第一輪資料審核"});
 w=c.pauseTask(w,{taskId:"T1",seq:id(),at:t});
 assert.equal(w.tasks[0].status,"paused");assert.equal(w.tasks[0].progress,"已完成第一輪資料審核");
 const next=c.addMessage(w,{id:"M1",threadId:"TH1",author:"使用者",text:"我們可以繼續設計第二版",at:t});
 assert.equal(next.threads[0].messages.length,1);assert.equal(next.tasks[0].status,"paused");
});
test("pausing one task does not pause another",()=>{
 let w=addTask(start());w=c.addTask(w,{id:"T2",projectId:"P1",title:"另一項工作",owner:"使用者",reason:"維護資料",at:t});
 w=c.pauseTask(w,{taskId:"T1",seq:id(),at:t});
 assert.equal(w.tasks.find(x=>x.id==="T2").status,"queued");
});
test("resume requires previously paused task",()=>{
 let w=addTask(start());
 assert.throws(()=>c.resumeTask(w,{taskId:"T1",seq:id(),at:t}),/只有已暫停/);
 w=c.pauseTask(w,{taskId:"T1",seq:id(),at:t});
 w=c.resumeTask(w,{taskId:"T1",seq:id(),at:t});
 assert.equal(w.tasks[0].status,"in_progress");
});
test("pause preserves original work history",()=>{
 const w=c.pauseTask(addTask(start()),{taskId:"T1",seq:id(),at:t});
 assert.deepEqual(w.tasks[0].history.map(x=>x.status),["queued","paused"]);
 assert.ok(w.events.some(x=>x.kind==="task.paused"));
});
test("refusal requires impact and recovery plan",()=>{
 const w=addTask(start());
 assert.throws(()=>c.transition(w,{taskId:"T1",status:"refused",reason:"缺來源",at:t,seq:id()}),/原因、影響與下一步/);
});
test("refusal immediately records reason impact and next step",()=>{
 let w=addTask(start());
 w=c.transition(w,{taskId:"T1",status:"refused",reason:"研究資料來源不明",impact:"所有引用該資料的結論待查",next:"退回 GPT① 補證",at:t,seq:id()});
 assert.equal(w.tasks[0].status,"refused");
 assert.equal(w.alerts[0].reason,"研究資料來源不明");
 assert.equal(w.alerts[0].impact,"所有引用該資料的結論待查");
 assert.equal(w.alerts[0].next,"退回 GPT① 補證");
});
test("blocked tasks notify without treating a rejection as completion",()=>{
 const w=c.transition(addTask(start()),{taskId:"T1",status:"blocked",reason:"工具故障",impact:"測試尚未完成",next:"恢復工具再測",at:t,seq:id()});
 assert.equal(w.tasks[0].status,"blocked");assert.equal(w.alerts[0].category,"blocked");
});
test("alert acknowledgement doesn't remove original evidence",()=>{
 let w=c.transition(addTask(start()),{taskId:"T1",status:"blocked",reason:"資料缺少",impact:"不能驗收",next:"補資料",at:t,seq:id()});
 const alertId=w.alerts[0].id;
 w=c.dismissAlert(w,{alertId});
 assert.equal(w.alerts[0].seen,true);assert.ok(w.events.some(e=>e.kind==="task.blocked"));
});
test("custom statuses map to a known canonical base",()=>{
 const custom=c.addCustomStatus([],{id:"custom_wait",label:"等待審核人員",base:"review",note:"自訂標籤"});
 const a=c.statusOf("custom_wait",custom);assert.equal(a.base,"review");assert.equal(a.builtIn,false);
});
test("custom statuses cannot rebrand themselves as an unsupported live connection",()=>{
 assert.throws(()=>c.addCustomStatus([],{id:"live",label:"連線成功",base:"connected",note:"fake"}),/不合法/);
});
test("custom status names and IDs cannot duplicate",()=>{
 const x=c.addCustomStatus([],{id:"custom_one",label:"外部審核",base:"review",note:""});
 assert.throws(()=>c.addCustomStatus(x,{id:"custom_two",label:"外部審核",base:"review",note:""}),/重複/);
});
test("display label can change but underlying status stays canonical",()=>{
 let w=addTask(start());
 w=c.transition(w,{taskId:"T1",status:"review",reason:"待外部核對",at:t,seq:id()});
 w=c.setTaskDisplay(w,{taskId:"T1",label:"等待外部驗證"});
 assert.equal(w.tasks[0].status,"review");assert.equal(w.tasks[0].displayStatus,"等待外部驗證");
});
test("a new conversation preserves project decisions and todo lists",()=>{
 let w=start();w=c.projectMemo(w,{id:"D1",projectId:"P1",kind:"decision",text:"先建候選，後集中驗證",at:t});
 w=c.projectMemo(w,{id:"TD1",projectId:"P1",kind:"todo",text:"整理模組入口",at:t});
 w=c.addThread(w,{id:"TH2",projectId:"P1",title:"新方向",at:t});
 assert.equal(w.projects[0].decisions.length,1);assert.equal(w.projects[0].todos.length,1);
});
test("future module begins candidate and never connected",()=>{
 const w=c.addProposal(start(),{id:"NEW1",projectId:"P1",title:"新接口",purpose:"預先設計跨 AI 治理",fromNode:"launcher",at:t});
 assert.equal(w.proposals[0].stage,"candidate");
});
test("approving a proposal does not mark an interface live",()=>{
 let w=c.addProposal(start(),{id:"NEW1",projectId:"P1",title:"新接口",purpose:"設計",fromNode:"launcher",at:t});
 w=c.proposalDecision(w,{proposalId:"NEW1",decision:"approved_plan",reason:"方案可行，尚未接線",at:t,seq:id()});
 assert.equal(w.proposals[0].stage,"approved_plan");
 assert.equal(w.proposals[0].connected,undefined);
});
test("rejecting a proposed module records immediate alert with next step",()=>{
 let w=c.addProposal(start(),{id:"NEW1",projectId:"P1",title:"新接口",purpose:"設計",fromNode:"launcher",at:t});
 w=c.proposalDecision(w,{proposalId:"NEW1",decision:"rejected",reason:"來源不能驗證",impact:"阻塞擴充路徑",next:"補充來源",at:t,seq:id()});
 assert.equal(w.alerts[0].category,"proposal_rejected");assert.equal(w.proposals[0].stage,"rejected");
});
test("append branch and dependency links without replacing existing links",()=>{
 let w=start();
 w=c.addLink(w,{id:"L1",from:"launcher",to:"vault",kind:"handoff",at:t});
 w=c.addLink(w,{id:"L2",from:"vault",to:"traceback",kind:"branch",at:t});
 assert.deepEqual(w.links.map(x=>x.id),["L1","L2"]);
});
test("same dependency link cannot be duplicated",()=>{
 let w=c.addLink(start(),{id:"L1",from:"A",to:"B",kind:"depends_on",at:t});
 assert.throws(()=>c.addLink(w,{id:"L2",from:"A",to:"B",kind:"depends_on",at:t}),/相同關聯/);
});
test("cyclic depends_on relation refused but handoff may return backwards",()=>{
 let w=c.addLink(start(),{id:"L1",from:"A",to:"B",kind:"depends_on",at:t});
 assert.throws(()=>c.addLink(w,{id:"L2",from:"B",to:"A",kind:"depends_on",at:t}),/不能形成循環/);
 w=c.addLink(w,{id:"L3",from:"B",to:"A",kind:"handoff",at:t});
 assert.equal(w.links.length,2);
});
test("future map preserves candidates and planned route in transfer packet",()=>{
 let w=c.addProposal(start(),{id:"NEW1",projectId:"P1",title:"新接口",purpose:"支援稽核",fromNode:"governance",at:t});
 w=c.addLink(w,{id:"L1",from:"governance",to:"NEW1",kind:"branch",at:t});
 const packet=c.transferCandidateMap(w,"P1");
 assert.equal(packet.schema,"tcvl.candidate-map-transfer.v0.1");
 assert.equal(packet.nodes[0].stage,"candidate");assert.equal(packet.links[0].stage,"planned");
});
test("export workspace and restore without wiping past work",()=>{
 let w=addTask(start());w=c.addThread(w,{id:"TH1",projectId:"P1",title:"討論",at:t});
 w=c.addMessage(w,{id:"M1",threadId:"TH1",author:"使用者",text:"保留上下文",at:t});
 w=c.pauseTask(w,{taskId:"T1",seq:id(),at:t});
 const recovered=c.safeImport(JSON.parse(JSON.stringify(w)));
 assert.deepEqual(recovered,w);
});
test("malformed imported workspace is rejected",()=>assert.throws(()=>c.safeImport({schema:c.SCHEMA,projects:"bad"}),/工作空間格式錯誤|不是|invalid/));
test("short project snapshot converts to existing memory candidate schema",()=>{
 const packet=c.packet(start(),"ID1");
 assert.equal(m.validatePack(packet).length,1);
 assert.equal(packet.items[0].eventType,"new_question");
});
test("an oversized workspace is not silently truncated in memory pack",()=>{
 let w=start();w.projects[0].goal="超大資料".repeat(5000);
 assert.throws(()=>c.packet(w,"ID2"),/過長|不合法/);
});
test("original structures don't change when update returns new version",()=>{
 const before=start();const same=JSON.stringify(before);
 c.addThread(before,{id:"T",projectId:"P1",title:"新對話",at:t});
 assert.equal(JSON.stringify(before),same);
});
