/* Local knowledge intake → data-manager → first-brain R&D routing.
 * Events are append-only; no true remote ACK, core-memory approval or backend connection.
 * Dependencies: TcvlCandidateCore, TcvlReportingCore (both v0.1). */
(function(root,factory){
 "use strict";
 const api=factory(
  typeof module==="object"&&module.exports?require("./tcvl-candidate-core.js"):root.TcvlCandidateCore,
  typeof module==="object"&&module.exports?require("./tcvl-reporting-core.js"):root.TcvlReportingCore
 );
 if(typeof module==="object"&&module.exports)module.exports=api;
 root.TcvlKnowledgeFlowCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(candidates,reporting){
 "use strict";
 const SCHEMA="tcvl.knowledge-flow.v0.1";
 const ACTORS=reporting.ROLES, ACTIONS=reporting.ACTIONS;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const nonblank=(x,max)=>typeof x==="string"&&x.trim().length>0&&x.length<=max;
 const ROUTES=["hold","compare_duplicates","research_review","database_review"];
 const manager="資料庫管理員",screen="候選區篩選員",research="第一大腦研發中心";
 const CATEGORIES=Object.freeze({rule:"規章治理",memory:"記憶候選",research:"研發假設",task:"任務資訊",correction:"錯誤修正",knowledge:"一般知識"});
 function create(){return {schema:SCHEMA,revision:0,intake:[],ledger:reporting.createLedger()};}
 function verify(flow){
  const err=[];
  if(!flow||flow.schema!==SCHEMA||!Number.isSafeInteger(flow.revision)||flow.revision<0||
   !Array.isArray(flow.intake)||flow.intake.length>100)return ["invalid_flow"];
  const errs=reporting.validateLedger(flow.ledger);if(errs.length)err.push(...errs.map(x=>"report_"+x));
  const ids=new Set();
  for(const v of flow.intake){
   if(!v||!nonblank(v.id,80)||ids.has(v.id)||!nonblank(v.title,160)||!nonblank(v.category,80)||
    !ROUTES.includes(v.gate)||!["manual_unverified"].includes(v.origin)||
    v.approval!=="candidate_only"||v.memory!=="not_approved"||v.remote_delivery!=="not_connected"||
    !Array.isArray(v.sources)||v.sources.length>12||v.sources.some(x=>!nonblank(x,160))||
    !Array.isArray(v.links)||v.links.length!==3||v.links.some(x=>!["context","memory","causal"].includes(x.type)||!["linked","missing","not_applicable"].includes(x.state))||
    !nonblank(v.at,40)||Number.isNaN(Date.parse(v.at)))err.push("invalid_intake");
   if(v?.id)ids.add(v.id);
  }
  if(flow.revision<flow.intake.length)err.push("revision_lag");
  return err;
 }
 function entryFrom(item,gate,at){
  const keys=["context","memory","causal"];
  return {id:item.id,title:item.title,kind:item.kind,category:CATEGORIES[item.kind]||"一般知識",
   gate:gate.route,original_status:item.origin_status,origin:"manual_unverified",
   approval:"candidate_only",memory:"not_approved",remote_delivery:"not_connected",
   sources:clone(item.sources),links:keys.map(k=>({type:k,state:item.links[k].state})),at};
 }
 function accept(flow,item,otherCandidates,{at}={}){
  if(verify(flow).length)throw Error("本機工作簿格式不合法");
  if(!item||!nonblank(item.id,80)||!nonblank(item.title,160))throw Error("候選資訊缺少 ID／名稱");
  if(flow.intake.some(v=>v.id===item.id))throw Error("候選 ID 已存在；不能覆寫");
  if(flow.intake.length>=100)throw Error("候選數量上限 100");
  if(!nonblank(at,40)||Number.isNaN(Date.parse(at)))throw Error("時間無效");
  const gate=candidates.evaluate(item,otherCandidates||[item]);
  const next=clone(flow);next.intake.push(entryFrom(item,gate,at));next.revision++;
  const err=verify(next);if(err.length)throw Error(err.join(","));
  return {flow:next,gate};
 }
 function route(flow,id,{event_id,at,reason,from=screen,to,action="資料提案",evidence=""}={}){
  if(verify(flow).length)throw Error("工作簿格式不合法");
  const item=flow.intake.find(x=>x.id===id);if(!item)throw Error("找不到候選");
  if(!nonblank(reason,800))throw Error("理由必填");
  if(!ACTORS.includes(from)||!ACTORS.includes(to)||from===to||!ACTIONS.includes(action))throw Error("來源或目的角色不合法");
  if([screen,manager,research].indexOf(from)<0)throw Error("非既定流程發起者");
  if(item.gate==="hold"&&from===screen)throw Error("未達候選門檻，不能標記為送審");
  // Action is a manually recorded *request*, not actual network dispatch.
  const newLedger=reporting.record(flow.ledger,{
   id:event_id,from,to,action,subject:id,reason,evidence,reply_to:"",at
  });
  const next=clone(flow);next.ledger=newLedger;next.revision++;
  const error=verify(next);if(error.length)throw Error(error.join(","));
  return next;
 }
 function answer(flow,parentId,{event_id,at,reason,action="回覆／確認",evidence=""}={}){
  if(verify(flow).length)throw Error("工作簿格式不合法");
  const parent=flow.ledger.events.find(x=>x.id===parentId);if(!parent)throw Error("找不到要求回報的原始事件");
  if(!nonblank(reason,1600))throw Error("回覆理由不可空白");
  // Only a reciprocal, manually-entered response. It is never proof of receiver identity.
  const next=clone(flow);
  next.ledger=reporting.record(flow.ledger,{
   id:event_id,from:parent.to,to:parent.from,action,
   subject:parent.subject,reason,evidence,reply_to:parent.id,at
  });
  next.revision++;
  const err=verify(next);if(err.length)throw Error(err.join(","));
  return next;
 }
 function overview(flow){
  if(verify(flow).length)throw Error("工作簿格式不合法");
  const replied=new Set(flow.ledger.events.filter(x=>x.reply_to).map(x=>x.reply_to));
  return {total:flow.intake.length,hold:flow.intake.filter(x=>x.gate==="hold").length,
   duplicates:flow.intake.filter(x=>x.gate==="compare_duplicates").length,
   reviewable:flow.intake.filter(x=>x.gate==="research_review"||x.gate==="database_review").length,
   logged_requests:flow.ledger.events.filter(e=>!e.reply_to).length,
   pending_manual_replies:flow.ledger.events.filter(e=>!e.reply_to&&!replied.has(e.id)).length,
   manually_logged_replies:flow.ledger.events.filter(e=>e.reply_to).length,
   verified_remote_ack:0,active_policy_approvals:0};
 }
 function mergeCandidateLedger(flow,ledger,{at}={}){
  if(candidates.check(ledger).length)throw Error("候選工作簿格式不合法");
  let next=flow,added=0,already=0;
  for(const item of ledger.items){
   if(next.intake.some(x=>x.id===item.id)){already++;continue}
   const out=accept(next,item,ledger.items,{at});next=out.flow;added++;
  }
  return {flow:next,added,already};
 }
 return Object.freeze({SCHEMA,create,verify,accept,route,answer,overview,mergeCandidateLedger});
});