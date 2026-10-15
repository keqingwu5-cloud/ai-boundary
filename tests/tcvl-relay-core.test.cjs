"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const relay=require("../tcvl-relay-core.js"),board=require("../tcvl-platform-core.js"),memory=require("../memory-workflow-core.js");
const at="2026-10-15T12:00:00.000Z";
const config={id:"BATCH1",projectId:"P1",projectTitle:"主腦交接通路測試",objective:"驗證三條 AI 交接路徑",context:"演練資料，不包含私人資訊",completion:"每方交出證據及限制",stop:"無法重現、無權限時停止",createdAt:at};
const base=()=>relay.createBatch(config);
const project=()=>{
 let w=board.createWorkspace();
 w=board.addProject(w,{id:"P1",title:config.projectTitle,goal:config.objective,at});
 w=board.addThread(w,{id:"TH1",projectId:"P1",title:"驗收紀錄",at});
 return w;
};
test("three independent distinct role messages created with shared project",()=>{
 const b=base();assert.equal(b.roles.length,3);assert.deepEqual(b.roles.map(r=>r.id),["GPT1","GPT2","BOT3"]);
 assert.equal(new Set(b.roles.map(r=>r.command.command_id)).size,3);
 assert.ok(b.roles.every(r=>r.command.task_ref==="P1"&&r.command.delivery_status.includes("非自動傳送")));
});
test("every command declares the role responsibility and no auto-approval",()=>{
 const b=base();assert.ok(b.roles[0].command.instructions.includes("整理目的"));
 assert.ok(b.roles[1].command.instructions.includes("獨立提出"));
 assert.ok(b.roles[2].command.instructions.includes("可重現"));
 assert.equal(relay.summary(b).canAutoApprove,false);
});
test("prepared to copy is not a confirmed AI receipt",()=>{
 const b=relay.recordHandoff(base(),{roleId:"GPT1",at});
 assert.equal(b.roles[0].state,"manual_handoff");
 assert.equal(relay.summary(b).confirmedAiDelivery,0);
 assert.ok(b.events[0].detail.includes("未確認"));
});
test("manual copy does not mark the other two roles delivered",()=>{
 const b=relay.recordHandoff(base(),{roleId:"GPT1",at});
 assert.equal(b.roles[1].state,"prepared");assert.equal(b.roles[2].state,"prepared");
});
test("reply must match the right source command identifier",()=>{
 assert.throws(()=>relay.addResponse(base(),{roleId:"GPT2",commandId:"BATCH1:GPT1",text:"A",source:"手動",id:"R1",at}),/識別碼/);
});
test("manual GPT1 reply remains unverified",()=>{
 const b=relay.addResponse(base(),{roleId:"GPT1",commandId:"BATCH1:GPT1",text:"模型研究概要",source:"人工貼回 GPT①",id:"R1",at});
 assert.equal(b.roles[0].state,"reported_unverified");assert.equal(b.roles[0].responses[0].identityVerified,false);
 assert.equal(relay.summary(b).confirmedAiIdentity,0);
});
test("complete three unverified replies still demand manual verification",()=>{
 let b=base();
 for(const [roleId,text,id]of [["GPT1","規劃","R1"],["GPT2","反證","R2"],["BOT3","測試方案","R3"]])
  b=relay.addResponse(b,{roleId,commandId:"BATCH1:"+roleId,text,source:"人工貼回",id,at});
 const summary=relay.summary(b);assert.equal(summary.count.reported_unverified,3);assert.match(summary.decision,/等待身分與內容驗證/);assert.equal(summary.canAutoApprove,false);
});
test("duplicate manual reply identifier blocked and no mutation",()=>{
 let b=relay.addResponse(base(),{roleId:"GPT1",commandId:"BATCH1:GPT1",text:"A",source:"人工",id:"R1",at});
 const before=JSON.stringify(b);
 assert.throws(()=>relay.addResponse(b,{roleId:"GPT1",commandId:"BATCH1:GPT1",text:"B",source:"人工",id:"R1",at}),/重複/);
 assert.equal(JSON.stringify(b),before);
});
test("pause a role preserves other AI channels and conversations",()=>{
 let b=relay.pause(base(),{roleId:"GPT2",at,reason:"先檢討證據"});
 assert.equal(b.roles[1].state,"paused");assert.equal(b.roles[0].state,"prepared");assert.equal(b.roles[2].state,"prepared");
 assert.throws(()=>relay.addResponse(b,{roleId:"GPT2",commandId:"BATCH1:GPT2",text:"結果",source:"人工",id:"R1",at}),/先恢復/);
});
test("resume returns to previous manual state without claiming remote execution",()=>{
 let b=relay.recordHandoff(base(),{roleId:"BOT3",at});b=relay.pause(b,{roleId:"BOT3",at,reason:"暫停"});
 b=relay.resume(b,{roleId:"BOT3",at});assert.equal(b.roles[2].state,"manual_handoff");assert.ok(b.events.at(-1).detail.includes("沒有啟動任何遠端"));
});
test("reject requires cause impact and next actions",()=>{
 assert.throws(()=>relay.reject(base(),{roleId:"BOT3",at,reason:"證據不足",impact:"下游有疑慮",next:""}),/原因、影響和下一步/);
});
test("rejected role retains the original event and never overwrites prior reply",()=>{
 let b=relay.addResponse(base(),{roleId:"GPT1",commandId:"BATCH1:GPT1",text:"初版結論",source:"人工",id:"R1",at});
 b=relay.reject(b,{roleId:"GPT1",at,reason:"資料來源無法核對",impact:"影響 M1",next:"請 GPT① 補證"});
 assert.equal(b.roles[0].responses.length,1);assert.equal(b.roles[0].state,"rejected");
 assert.throws(()=>relay.addResponse(b,{roleId:"GPT1",commandId:"BATCH1:GPT1",text:"覆蓋",source:"人工",id:"R2",at}),/不可覆蓋/);
});
test("reject one role does not falsely mark other channels failed",()=>{
 const b=relay.reject(base(),{roleId:"GPT2",at,reason:"反證欠缺",impact:"需要重審",next:"補來源"});
 assert.equal(b.roles[0].state,"prepared");assert.equal(b.roles[2].state,"prepared");
});
test("compatibility: valid launcher response only accepts matching relay-origin ID",()=>{
 const b=base(),packet={schema:"ai-boundary.response.v0.1",source_command:b.roles[2].command,response_text:"核對測試條件",reported_by:"BOT③"};
 const next=relay.ingestLauncherResponse(b,packet,{roleId:"BOT3",at,id:"R3"});
 assert.equal(next.roles[2].responses[0].source.startsWith("Launcher"),true);
 assert.throws(()=>relay.ingestLauncherResponse(b,packet,{roleId:"GPT1",at,id:"R4"}),/不匹配/);
});
test("transfer preserves role history and source identity remains unverified",()=>{
 const b=relay.addResponse(base(),{roleId:"BOT3",commandId:"BATCH1:BOT3",text:"測試中",source:"人工",id:"R3",at});
 const t=relay.transfer(b);assert.equal(t.schema,relay.TRANSFER_SCHEMA);
 assert.equal(relay.checkTransfer(t),t);assert.equal(t.roles[2].responses[0].identityVerified,false);
});
test("tampered transfer rejection reason or mismatched command rejected",()=>{
 const t=relay.transfer(base());t.roles[1].commandId="BATCH1:GPT1";
 assert.throws(()=>relay.checkTransfer(t),/角色不完整/);
});
test("project governance rejects unknown target project ID",()=>{
 const transfer=relay.transfer(base());
 assert.throws(()=>board.acceptRelayTransfer(project(),transfer,{projectId:"OTHER",threadId:"TH1",at,seq:"S1"}),/ID 不符合/);
});
test("end-to-end manual relay into project conversation records three role reports",()=>{
 let b=base();
 for(const id of ["GPT1","GPT2","BOT3"])b=relay.addResponse(b,{roleId:id,commandId:"BATCH1:"+id,text:"這是 "+id+" 的獨立意見",source:"人工交接",id:"R-"+id,at});
 const w=board.acceptRelayTransfer(project(),relay.transfer(b),{projectId:"P1",threadId:"TH1",at,seq:"S1"});
 assert.ok(w.threads[0].messages.some(m=>m.text.includes("GPT①")));
 assert.ok(w.threads[0].messages.some(m=>m.text.includes("GPT②")));
 assert.ok(w.threads[0].messages.some(m=>m.text.includes("BOT③")));
 assert.ok(w.events.some(e=>e.kind==="relay.transfer"&&e.ref==="BATCH1"));
 assert.ok(w.threads[0].messages.every(m=>m.author.includes("未驗證")));
});
test("rejected relay imports produce immediate actionable notifications",()=>{
 const b=relay.reject(base(),{roleId:"GPT2",at,reason:"原資料不可信",impact:"依賴 C1 的判斷需重審",next:"重新查核來源"});
 const w=board.acceptRelayTransfer(project(),relay.transfer(b),{projectId:"P1",threadId:"TH1",at,seq:"S2"});
 assert.equal(w.alerts[0].reason,"原資料不可信");assert.equal(w.alerts[0].impact,"依賴 C1 的判斷需重審");assert.equal(w.alerts[0].next,"重新查核來源");
});
test("same relay transfer cannot be imported twice",()=>{
 const packet=relay.transfer(base());
 const w=board.acceptRelayTransfer(project(),packet,{projectId:"P1",threadId:"TH1",at,seq:"S1"});
 assert.throws(()=>board.acceptRelayTransfer(w,packet,{projectId:"P1",threadId:"TH1",at,seq:"S2"}),/已匯入/);
});
test("relay import keeps its source workspace immutable",()=>{
 const workspace=project(),before=JSON.stringify(workspace);
 board.acceptRelayTransfer(workspace,relay.transfer(base()),{projectId:"P1",threadId:"TH1",at,seq:"S1"});
 assert.equal(JSON.stringify(workspace),before);
});
test("long reports import complete, in bounded segments without silent truncation",()=>{
 let b=relay.addResponse(base(),{roleId:"GPT1",commandId:"BATCH1:GPT1",text:"X".repeat(7600),source:"人工",id:"R1",at});
 const w=board.acceptRelayTransfer(project(),relay.transfer(b),{projectId:"P1",threadId:"TH1",at,seq:"S3"});
 const pieces=w.threads[0].messages.filter(m=>m.text.includes("區段："));
 const total=pieces.reduce((sum,p)=>sum+(p.text.match(/X+/g)||[]).join("").length,0);
 assert.equal(total,7600);
});
test("completely invalid role identifiers do not reach the project thread",()=>{
 const packet=relay.transfer(base());packet.roles[0].id="UNAUTH";
 const w=project();
 assert.throws(()=>board.acceptRelayTransfer(w,packet,{projectId:"P1",threadId:"TH1",at,seq:"S1"}),/角色/);
 assert.equal(w.threads[0].messages.length,0);
});
test("project conversation still continues after relay refusal",()=>{
 const b=relay.reject(base(),{roleId:"GPT1",at,reason:"缺證據",impact:"研究暫停",next:"補證"});
 let w=board.acceptRelayTransfer(project(),relay.transfer(b),{projectId:"P1",threadId:"TH1",at,seq:"S1"});
 w=board.addMessage(w,{id:"M1",threadId:"TH1",author:"使用者",text:"即使拒絕，對話繼續",at});
 assert.ok(w.threads[0].messages.at(-1).text.includes("對話繼續"));
});
test("relay report to memory candidate remains manual and validates against official schema",()=>{
 const b=base(),content=JSON.stringify(relay.transfer(b));
 const packet={schema:"ai-boundary.memory-pack.v1",items:[{id:"RELAY1",question:"【主腦交接】測試",purpose:"記錄人工交接",content,reason:"未核准",evidence:"人工",evidenceLevel:"hypothesis",eventType:"new_question"}]};
 assert.equal(memory.validatePack(packet).length,1);
});
