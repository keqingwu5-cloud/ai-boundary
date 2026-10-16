/* TCVL: three-role responsibility + private-original registry (metadata only).
   No file bytes, API calls, localStorage, or implied remote AI validation. */
(function (root,factory) {
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.TcvlDataRoomCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const SCHEMA="tcvl.data-room-index.v0.1";
const ROLES=["GPT1","GPT2","BOT3"];
const ROLE_NAMES={GPT1:"GPT① 統籌／整合",GPT2:"GPT② 反證／審查",BOT3:"BOT③ 測試／實驗"};
const STATES=["pending","under_review","rejected","revision_requested","approved_for_archive"];
const TAG="【資料室治理】";
const valid=(x,n=700)=>typeof x==="string"&&x.trim().length>0&&x.length<=n;
const idOk=x=>valid(x,120)&&/^[A-Za-z0-9_.:-]+$/.test(x);
const timeOk=x=>valid(x,40)&&!Number.isNaN(Date.parse(x))&&/Z$/.test(x);
const copy=x=>JSON.parse(JSON.stringify(x));
function createRoom({projectId,batchId,title,at}){
 if(!idOk(projectId)||!idOk(batchId)||!valid(title,140)||!timeOk(at))throw Error("專案、批次名稱或時間不完整");
 return {schema:SCHEMA,projectId,batchId,title,revision:0,createdAt:at,
  originals:[],assignments:[],submissions:[],events:[]};
}
function validate(room){
 const errors=[];
 if(!room||room.schema!==SCHEMA||!idOk(room.projectId)||!idOk(room.batchId)||
  !valid(room.title,140)||!timeOk(room.createdAt)||!Number.isInteger(room.revision)||room.revision<0)
  return ["room_invalid"];
 for(const [key,limit] of Object.entries({originals:80,assignments:3,submissions:150,events:300})){
  if(!Array.isArray(room[key])||room[key].length>limit)return [key+"_invalid"];
 }
 const originals=new Set(),submissions=new Set(),assignments=new Set(),eventIds=new Set();
 for(const item of room.originals){
  if(!item||!idOk(item.id)||originals.has(item.id)||!valid(item.title,200)||!valid(item.locator,350)||
   !valid(item.custodian,120)||!valid(item.version,90)||!timeOk(item.at)||
   item.storageStatus!=="reference_only_unverified"||
   (item.sha256!=null&&!/^[a-f0-9]{64}$/.test(item.sha256)))errors.push("original_invalid");
  if(item?.id)originals.add(item.id);
 }
 for(const row of room.assignments){
  if(!row||!ROLES.includes(row.roleId)||assignments.has(row.roleId)||!valid(row.owner,120)||
   !valid(row.duty,450)||!valid(row.reviewer,120)||!timeOk(row.at))errors.push("assignment_invalid");
  if(row?.roleId)assignments.add(row.roleId);
 }
 for(const s of room.submissions){
  if(!s||!idOk(s.id)||submissions.has(s.id)||!ROLES.includes(s.roleId)||!valid(s.owner,120)||
   !valid(s.source,220)||!valid(s.summary,4000)||!valid(s.evidence,2000)||
   !valid(s.gaps,1500)||!valid(s.next,1500)||!timeOk(s.at)||!Array.isArray(s.originalIds)||
   s.originalIds.length<1||s.originalIds.length>15||
   s.originalIds.some(id=>!originals.has(id))||
   !STATES.includes(s.reviewState)||s.identityVerified!==false||
   !Array.isArray(s.reviews)||s.reviews.length>30)errors.push("submission_invalid");
  if(s?.id)submissions.add(s.id);
  for(const rv of s?.reviews||[]){
   if(!rv||!STATES.includes(rv.decision)||!valid(rv.reviewer,120)||
    !valid(rv.reason,1500)||!valid(rv.impact,1500)||!valid(rv.next,1500)||!timeOk(rv.at))
     errors.push("review_invalid");
  }
  if(s?.reviews?.length&&s.reviewState!==s.reviews.at(-1).decision)errors.push("review_state_mismatch");
 }
 for(const e of room.events){
  if(!e||!idOk(e.id)||eventIds.has(e.id)||!valid(e.kind,60)||
   !valid(e.message,700)||!timeOk(e.at))errors.push("event_invalid");
  if(e?.id)eventIds.add(e.id);
 }
 return [...new Set(errors)];
}
function assertRoom(room){const x=validate(room);if(x.length)throw Error("資料室索引無效："+x.join(","));return room}
function update(room,make){assertRoom(room);const next=copy(room);make(next);next.revision++;
 assertRoom(next);return next;}
function event(room,{id,at,kind,message}){
 if(room.events.some(e=>e.id===id))throw Error("事件 ID 重複");
 room.events.push({id,at,kind,message});
}
function registerOriginal(room,{id,title,locator,custodian,version,sha256,at,eventId}){
 if(!idOk(id)||!valid(title,200)||!valid(locator,350)||!valid(custodian,120)||
 !valid(version,90)||!timeOk(at)||!idOk(eventId)||(sha256!=null&&!/^[a-f0-9]{64}$/.test(sha256)))
 throw Error("原檔索引欄位不完整或雜湊格式有誤");
 if(room.originals.some(x=>x.id===id))throw Error("原檔 ID 已存在。更新需建立新版本紀錄，不覆蓋原始索引");
 return update(room,w=>{
  w.originals.push({id,title,locator,custodian,version,at,sha256:sha256||null,storageStatus:"reference_only_unverified"});
  event(w,{id:eventId,at,kind:"original.referenced",message:"新增原檔索引 "+id+"；僅保存引用及版本，不儲存檔案內容"});
 });
}
function assign(room,{roleId,owner,duty,reviewer,at,eventId}){
 if(!ROLES.includes(roleId)||!valid(owner,120)||!valid(duty,450)||!valid(reviewer,120)||!timeOk(at)||!idOk(eventId))
 throw Error("AI 角色責任、人員或審核者資料不完整");
 return update(room,w=>{
  const index=w.assignments.findIndex(x=>x.roleId===roleId);
  const previous=index<0?null:w.assignments[index];
  if(index<0)w.assignments.push({roleId,owner,duty,reviewer,at});
  else w.assignments[index]={roleId,owner,duty,reviewer,at};
  event(w,{id:eventId,at,kind:"personnel.assigned",
   message:roleId+" 負責人代號："+(previous?.owner||"未指派")+" → "+owner+
    "；審核者代號："+(previous?.reviewer||"未指派")+" → "+reviewer+
    "；整理職責："+(previous?.duty||"未指派")+" → "+duty+"；全為人工聲稱，非身分認證"});
 });
}
function submit(room,{id,roleId,originalIds,source,summary,evidence,gaps,next,at,eventId}){
 if(!idOk(id)||!ROLES.includes(roleId)||!Array.isArray(originalIds)||originalIds.length<1||
  originalIds.length>15||!valid(source,220)||!valid(summary,4000)||!valid(evidence,2000)||
  !valid(gaps,1500)||!valid(next,1500)||!timeOk(at)||!idOk(eventId))
  throw Error("上交資料、原檔 ID、證據或待辦不完整");
 const assignment=room.assignments.find(x=>x.roleId===roleId);
 if(!assignment)throw Error("該 AI 尚未指派責任人及人工審核者");
 if(originalIds.some(x=>!room.originals.some(r=>r.id===x)))throw Error("原始檔 ID 未登記於資料室");
 if(room.submissions.some(x=>x.id===id))throw Error("上交 ID 已存在；請新增版本");
 return update(room,w=>{
  w.submissions.push({id,roleId,owner:assignment.owner,source,summary,evidence,gaps,next,originalIds:[...new Set(originalIds)],
    at,reviewState:"pending",identityVerified:false,reviews:[]});
  event(w,{id:eventId,at,kind:"role.submitted",message:roleId+" 已由使用者人工登記整理結果，待 "+assignment.reviewer+" 審核；AI 作者未驗證"});
 });
}
function review(room,{submissionId,decision,reviewer,reason,impact,next,at,eventId}){
 if(!idOk(submissionId)||!STATES.includes(decision)||decision==="pending"||
 !valid(reviewer,120)||!valid(reason,1500)||!valid(impact,1500)||!valid(next,1500)||
 !timeOk(at)||!idOk(eventId))throw Error("審核結果、原因、影響、下一步不可缺少");
 return update(room,w=>{
  const s=w.submissions.find(x=>x.id===submissionId);
  if(!s)throw Error("上交紀錄不存在");
  s.reviewState=decision;
  s.reviews.push({decision,reviewer,reason,impact,next,at});
  event(w,{id:eventId,at,kind:"submission.reviewed",message:"上交 "+submissionId+" 人工處置："+decision+"；保留原提交與歷次審核"});
 });
}
function buildCandidate(room,submissionId,uid){
 assertRoom(room);
 const s=room.submissions.find(x=>x.id===submissionId);
 if(!s)throw Error("找不到上交紀錄");
 if(!idOk(uid))throw Error("候選 ID 不合法");
 const role=ROLE_NAMES[s.roleId];
 const sources=s.originalIds.map(id=>room.originals.find(x=>x.id===id));
 const content=[
  "【三方 AI 原檔治理與上交｜人工候選】",
  "專案："+room.projectId+"｜批次："+room.batchId,
  "角色："+role,"對應負責人："+s.owner,
  "人工來源聲稱："+s.source,"身分驗證：未驗證",
  "整理摘要："+s.summary,
  "證據與方法："+s.evidence,
  "拒絕／問題／未知："+s.gaps,
  "下一步："+s.next,
  "原檔索引："+sources.map(x=>x.id+"（"+x.title+"／版本 "+x.version+"／保管人 "+x.custodian+"；未上傳檔案）").join("、"),
  "人工審核狀態："+s.reviewState,
  ...s.reviews.map(x=>"審核："+x.decision+"｜"+x.reviewer+"｜原因："+x.reason+"｜影響："+x.impact+"｜下一步："+x.next)
 ].join("\n");
 if(content.length>12000)throw Error("候選內容超出單筆限額，請分拆；不會默默截斷");
 return {schema:"ai-boundary.memory-pack.v1",items:[{
  id:"DR-"+uid,question:TAG+room.projectId+"｜"+role+"｜"+s.id,
  purpose:"保留原檔索引與三方責任歸屬，提交人工治理及加密記憶候選審核。原檔本體未存入此記憶包。",
  content,
  reason:"人工整理與上交；資料、作者及原始檔保管需分別查證。",
  evidence:"來源 ID："+s.originalIds.join(",")+"；資料室僅記錄原檔保管聲稱，未存檔案原文。",
  eventType:"new_question",evidenceLevel:"hypothesis"
 }]};
}
function statusSummary(room){
 assertRoom(room);
 return ROLES.map(roleId=>({
   roleId,label:ROLE_NAMES[roleId],assignment:room.assignments.find(a=>a.roleId===roleId)||null,
   submissions:room.submissions.filter(x=>x.roleId===roleId),
   references:room.originals.length,
   verifiedAI:0,
   originalBytesStored:0
 }));
}
return {SCHEMA,ROLES,ROLE_NAMES,STATES,createRoom,validate,assertRoom,registerOriginal,assign,submit,review,buildCandidate,statusSummary};
});