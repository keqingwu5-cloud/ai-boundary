/* TCVL manual relay node: three independent role dispatches, no I/O or AI network calls. */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.TcvlRelayCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const SCHEMA="tcvl.manual-relay-batch.v0.1";
const TRANSFER_SCHEMA="tcvl.relay-transfer.v0.1";
const ROLES=[
 {id:"GPT1",label:"GPT①",duty:"定義問題、研究計畫與整合",instruction:"請整理目的、明確假設、需要的證據和驗收條件，並指出仍未知的部分。不要替其他 AI 宣稱驗證成功。"},
 {id:"GPT2",label:"GPT②",duty:"獨立反證與替代解釋",instruction:"請先獨立提出替代假設、反例及證據缺口；對 GPT① 的結論不預設成立。區分事實、假設、推測與無法判定。"},
 {id:"BOT3",label:"BOT③",duty:"條件測試、邊界與可重現性",instruction:"請設計條件變化、反例、重現與無法重現的測試。沒有可執行權限或測試資料時只提供測試方案，不要宣稱已執行。"}
];
const STATES=["prepared","manual_handoff","reported_unverified","rejected","paused"];
const str=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.length<=max;
const idOk=x=>str(x,100)&&/^[A-Za-z0-9_.:-]+$/.test(x);
const copy=x=>JSON.parse(JSON.stringify(x));
const atOk=x=>str(x,35)&&!Number.isNaN(Date.parse(x))&&/Z$/.test(x);
const roleBy=id=>ROLES.find(x=>x.id===id);
function assertBatch(batch){
 if(!batch||batch.schema!==SCHEMA||!idOk(batch.id)||!idOk(batch.projectId)||!str(batch.projectTitle,140)||!str(batch.objective,2500)||!str(batch.completion,1200)||!str(batch.stop,1200)||!atOk(batch.createdAt)||!Array.isArray(batch.roles)||batch.roles.length!==ROLES.length||!Array.isArray(batch.events)||batch.events.length>200)throw Error("交接批次格式錯誤");
 const unique=new Set();
 for(const r of batch.roles){
  if(!r||!roleBy(r.id)||unique.has(r.id)||!STATES.includes(r.state)||!r.command||r.command.schema!=="ai-boundary.command.v0.1"||r.command.recipient!==roleBy(r.id).label||r.command.command_id!==batch.id+":"+r.id||r.command.delivery_status!=="待交接（非自動傳送）"||r.command.source_template!=="tcvl_relay_v1"||typeof r.command.instructions!=="string"||!str(r.command.instructions,7000)||!Array.isArray(r.responses)||r.responses.length>20)throw Error("交接角色或命令已被修改");
  unique.add(r.id);
  for(const response of r.responses){
   if(!response||!idOk(response.id)||response.role!==r.id||response.commandId!==r.command.command_id||!str(response.text,8000)||!str(response.source,150)||!atOk(response.at)||response.identityVerified!==false)throw Error("回報來源或指令關聯無效");
  }
  if(r.state==="reported_unverified"&&!r.responses.length)throw Error("沒有回報的角色不可標記收到回報");
 }
 for(const e of batch.events){
  if(!e||!atOk(e.at)||!roleBy(e.role)||!str(e.kind,60)||!str(e.detail,1500))throw Error("事件無效");
 }
 return batch;
}
function createBatch(data){
 if(!data||!idOk(data.id)||!idOk(data.projectId)||!str(data.projectTitle,140)||!str(data.objective,2500)||!str(data.completion,1200)||!str(data.stop,1200)||!atOk(data.createdAt))throw Error("請填完整專案 ID、任務、完成條件及停止條件");
 const context=str(data.context||"無其他資料，請先說明未知。",2800)?(data.context||"無其他資料，請先說明未知。"):"無其他資料，請先說明未知。";
 const roles=ROLES.map(role=>({
  id:role.id,state:"prepared",responses:[],
  command:{schema:"ai-boundary.command.v0.1",command_id:data.id+":"+role.id,created_at:data.createdAt,
   source:"TCVL 中樞交接節點（人工交接）",delivery_status:"待交接（非自動傳送）",
   task_ref:data.projectId,recipient:role.label,
   title:data.projectTitle+"｜"+role.duty,
   instructions:"【專案 "+data.projectId+"】\n共同目標："+data.objective+"\n背景資料（使用者提供、未自動驗證）："+context+"\n角色責任："+role.duty+"\n"+role.instruction,
   completion_criteria:data.completion,stop_and_escalation:data.stop,
   response_requirements:"請附原指令識別碼、來源、未經驗證事項、證據與反證、失敗／拒絕理由及下一步。不得聲稱已更新中央記憶或已連線其他 AI。",
   source_template:"tcvl_relay_v1"}
 }));
 return assertBatch({schema:SCHEMA,id:data.id,projectId:data.projectId,projectTitle:data.projectTitle,objective:data.objective,completion:data.completion,stop:data.stop,createdAt:data.createdAt,roles,events:[]});
}
function amend(batch,roleId,event){
 assertBatch(batch);if(!roleBy(roleId))throw Error("未知 AI 角色");
 const b=copy(batch),r=b.roles.find(x=>x.id===roleId);event(r,b);
 assertBatch(b);return b;
}
function recordHandoff(batch,{roleId,at}){
 if(!atOk(at))throw Error("操作時間錯誤");
 return amend(batch,roleId,(r,b)=>{
  if(!["prepared","manual_handoff"].includes(r.state))throw Error("目前狀態不可再發射");
  r.state="manual_handoff";
  b.events.push({at,role:roleId,kind:"manual_handoff",detail:"已準備分享／複製指令；未確認其他 AI 實際收到"});
 });
}
function pause(batch,{roleId,at,reason}){
 if(!atOk(at)||!str(reason,500))throw Error("請填寫停止原因");
 return amend(batch,roleId,(r,b)=>{if(r.state==="paused")throw Error("工作已暫停");r.previousState=r.state;r.state="paused";b.events.push({at,role:roleId,kind:"local_pause",detail:"本機暫停追蹤；不會撤銷已發出的 AI 請求："+reason})});
}
function resume(batch,{roleId,at}){
 if(!atOk(at))throw Error("操作時間無效");
 return amend(batch,roleId,(r,b)=>{if(r.state!=="paused")throw Error("僅已停止的角色可恢復");r.state=r.previousState||"prepared";delete r.previousState;b.events.push({at,role:roleId,kind:"local_resume",detail:"恢復本機交接追蹤；沒有啟動任何遠端 AI"})});
}
function reject(batch,{roleId,at,reason,impact,next}){
 if(!atOk(at)||!str(reason,1200)||!str(impact,1200)||!str(next,1200))throw Error("拒絕必須有原因、影響和下一步");
 return amend(batch,roleId,(r,b)=>{if(r.state==="paused")throw Error("已停止的工作需先恢復再處理拒絕");r.state="rejected";r.rejection={at,reason,impact,next};b.events.push({at,role:roleId,kind:"rejected",detail:"原因："+reason+"；影響："+impact+"；下一步："+next})});
}
function addResponse(batch,{roleId,commandId,at,text,source,id}){
 if(!atOk(at)||!str(text,8000)||!str(source,150)||!idOk(id))throw Error("回報內容、來源或識別碼不足");
 return amend(batch,roleId,(r,b)=>{
  if(r.state==="paused")throw Error("本機停止追蹤中，先恢復才能匯入回報");
  if(r.state==="rejected")throw Error("拒絕的角色需先建立新的修正工作，不可覆蓋拒絕");
  if(commandId!==r.command.command_id)throw Error("原指令識別碼不符合；拒絕錯誤通路的回報");
  if(r.responses.some(x=>x.id===id)||b.roles.some(x=>x.responses.some(y=>y.id===id)))throw Error("重複回報 ID");
  r.responses.push({id,role:roleId,commandId,text,source,at,identityVerified:false});
  r.state="reported_unverified";
  b.events.push({at,role:roleId,kind:"manual_report",detail:"使用者貼上來源聲稱為 "+source+" 的回報；未證實發言者身分及內容真實性"});
 });
}
function ingestLauncherResponse(batch,packet,{roleId,at,id}){
 if(!packet||packet.schema!=="ai-boundary.response.v0.1"||!packet.source_command||!str(packet.response_text,8000))throw Error("不相容的發射器回報格式");
 const r=assertBatch(batch).roles.find(x=>x.id===roleId);
 if(!r||packet.source_command.command_id!==r.command.command_id||packet.source_command.recipient!==r.command.recipient)throw Error("發射器回報的原指令或接收角色不匹配");
 return addResponse(batch,{roleId,commandId:r.command.command_id,at,text:packet.response_text,source:"Launcher 手動匯入（原聲稱："+String(packet.reported_by||"未知").slice(0,50)+"）",id});
}
function summary(batch){
 assertBatch(batch);
 const count=Object.fromEntries(STATES.map(state=>[state,batch.roles.filter(r=>r.state===state).length]));
 const decision=count.rejected?"需要先處理拒絕／修正":count.paused?"有角色已在本機暫停":count.reported_unverified===3?"三份回報已手動記錄，等待身分與內容驗證":"仍有待交接或待回報角色";
 return {count,decision,canAutoApprove:false,confirmedAiDelivery:0,confirmedAiIdentity:0};
}
function transfer(batch){
 assertBatch(batch);
 return {schema:TRANSFER_SCHEMA,id:batch.id,projectId:batch.projectId,projectTitle:batch.projectTitle,createdAt:batch.createdAt,
  roles:batch.roles.map(r=>({id:r.id,state:r.state,commandId:r.command.command_id,
   responseCount:r.responses.length,responses:r.responses.map(x=>({id:x.id,text:x.text,source:x.source,at:x.at,identityVerified:false})),
   rejection:r.rejection?copy(r.rejection):null})),
  note:"人工交接資料／未驗證 AI 身分／不代表送達或正式核准",result:summary(batch).decision};
}
function checkTransfer(data){
 if(!data||data.schema!==TRANSFER_SCHEMA||!idOk(data.id)||!idOk(data.projectId)||!str(data.projectTitle,140)||!Array.isArray(data.roles)||data.roles.length!==3||!data.note?.includes("未驗證"))throw Error("不是 TCVL 中樞交接回報");
 const ids=new Set();
 for(const r of data.roles){
  if(!r||!roleBy(r.id)||ids.has(r.id)||!STATES.includes(r.state)||r.commandId!==data.id+":"+r.id||!Array.isArray(r.responses)||r.responses.length>20||r.responseCount!==r.responses.length)throw Error("交接角色不完整或被修改");
  ids.add(r.id);
  for(const v of r.responses)if(!v||!idOk(v.id)||!str(v.text,8000)||!str(v.source,150)||v.identityVerified!==false||!atOk(v.at))throw Error("交接回報格式或來源聲稱無效");
  if(r.rejection&&(!str(r.rejection.reason,1200)||!str(r.rejection.impact,1200)||!str(r.rejection.next,1200)))throw Error("缺少拒絕原因或修正措施");
 }
 return data;
}
return {SCHEMA,TRANSFER_SCHEMA,ROLES,STATES,createBatch,assertBatch,recordHandoff,pause,resume,reject,addResponse,ingestLauncherResponse,summary,transfer,checkTransfer};
});