/* Local, manual, evidence-labelled bidirectional reporting. No AI API or private vault access. */
(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 root.TcvlReportingCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const SCHEMA="tcvl.bidirectional-ledger.v0.1";
 const ROLES=Object.freeze(["規劃者／主腦","候選區篩選員","資料庫管理員","第一大腦研發中心","記憶體核心管理員","任務傳輸管理員"]);
 const ACTIONS=Object.freeze(["資料提案","資料請求","分類／去重","反證","拒絕","修正","新發現","任務下發","停止請求","結果回報","回覆／確認"]);
 const valid=(x,n)=>typeof x==="string"&&x.trim().length>0&&x.length<=n;
 const clone=x=>JSON.parse(JSON.stringify(x));
 function createLedger(){return {schema:SCHEMA,revision:0,events:[]};}
 function validateLedger(v){
  const errors=[];
  if(!v||v.schema!==SCHEMA||!Number.isSafeInteger(v.revision)||v.revision<0||!Array.isArray(v.events)||v.events.length>500){return ["ledger_schema_invalid"];}
  const ids=new Map();
  for(const e of v.events){
   if(!e||!valid(e.id,90)||ids.has(e.id)) {errors.push("event_id_invalid_or_duplicate");continue;}
   if(!ROLES.includes(e.from)||!ROLES.includes(e.to)||e.from===e.to||!ACTIONS.includes(e.action))errors.push("event_route_invalid");
   if(!valid(e.subject,160)||!valid(e.reason,1600)||typeof e.evidence!=="string"||e.evidence.length>1200)errors.push("event_fields_invalid");
   if(!valid(e.at,40)||Number.isNaN(Date.parse(e.at)))errors.push("event_time_invalid");
   if(e.author_status!=="manual_unverified")errors.push("unverified_event_falsely_verified");
   if(e.reply_to){
    const prior=ids.get(e.reply_to);
    if(!prior||prior.from!==e.to||prior.to!==e.from)errors.push("reply_must_reverse_a_prior_route");
   }else if(e.reply_to!=="")errors.push("reply_reference_invalid");
   ids.set(e.id,e);
  }
  if(v.revision<v.events.length)errors.push("revision_before_event_count");
  return errors;
 }
 function record(ledger,{id,from,to,action,subject,reason,evidence="",reply_to="",at}){
  if(validateLedger(ledger).length)throw Error("原始事件簿格式不合法");
  if(ledger.events.length>=500)throw Error("事件上限 500 筆，請匯出後建立另一份");
  const next=clone(ledger);
  next.events.push({id,from,to,action,subject:subject.trim(),reason:reason.trim(),evidence:evidence.trim(),reply_to,at,author_status:"manual_unverified"});
  next.revision++;
  const issues=validateLedger(next);
  if(issues.length)throw Error("回報資料不符合雙向關聯規則："+issues.join(","));
  return next;
 }
 function summary(ledger){
  if(validateLedger(ledger).length)throw Error("事件簿格式不合法");
  const replied=new Set(ledger.events.filter(x=>x.reply_to).map(x=>x.reply_to));
  const disputes=ledger.events.filter(x=>x.action==="反證"||x.action==="拒絕").length;
  return {events:ledger.events.length,awaiting:ledger.events.filter(x=>!replied.has(x.id)).length,manualReplies:ledger.events.filter(x=>x.reply_to).length,disputes};
 }
 return Object.freeze({SCHEMA,ROLES,ACTIONS,createLedger,validateLedger,record,summary});
});