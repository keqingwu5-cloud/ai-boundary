/* TCVL candidate interview / knowledge chain gate v0.1
   Browser-local only. Does NOT approve regulations, memory or remotely dispatch tasks. */
(function(root,factory){
 "use strict";const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;
 root.TcvlCandidateCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const SCHEMA="tcvl.candidate.interview.v1", MAX=100;
 const KINDS=Object.freeze(["knowledge","rule","memory","research","task","correction"]);
 const STATUS=Object.freeze(["missing","linked","not_applicable"]);
 const clean=(x,n=1500)=>typeof x==="string"?x.trim().slice(0,n):"";
 const copy=x=>JSON.parse(JSON.stringify(x));
 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 const list=x=>Array.isArray(x)?x.map(s=>clean(s,160)).filter(Boolean).slice(0,12):[];
 function candidate(raw={}){
  const links=raw.links&&typeof raw.links==="object"?raw.links:{};
  const link=(key)=>({
   state:STATUS.includes(links[key]?.state)?links[key].state:"missing",
   refs:list(links[key]?.refs),
   reason:clean(links[key]?.reason,250)
  });
  return {
   id:clean(raw.id,80),version:1,kind:KINDS.includes(raw.kind)?raw.kind:"knowledge",
   title:clean(raw.title,160),summary:clean(raw.summary,1200),
   highlight:clean(raw.highlight,500),comparison:clean(raw.comparison,500),
   context:clean(raw.context,500),uncertainties:clean(raw.uncertainties,500),
   sources:list(raw.sources),evidence_refs:list(raw.evidence_refs),
   links:{context:link("context"),memory:link("memory"),causal:link("causal")},
   origin_status:clean(raw.origin_status,70)||"candidate_unverified",
   submitted_as:"manual_unverified",stage:"candidate",
   entered_at:clean(raw.entered_at,40)||""
  };
 }
 function blank(){return {schema:SCHEMA,revision:0,items:[],events:[]};}
 function check(ledger){
  if(!ledger||ledger.schema!==SCHEMA||!Number.isSafeInteger(ledger.revision)||ledger.revision<0||
   !Array.isArray(ledger.items)||!Array.isArray(ledger.events)||ledger.items.length>MAX||
   ledger.events.length>MAX*3)return ["invalid_ledger"];
  const errors=[],ids=new Set(),events=new Set();
  for(const raw of ledger.items){
   if(!raw||typeof raw!=="object"||!own(raw,"id")||!clean(raw.id,81)||raw.id.length>80||ids.has(raw.id)){errors.push("invalid_or_duplicate_id");continue}
   ids.add(raw.id);
   const fields=["title","summary","highlight","comparison","context","uncertainties","origin_status","entered_at"];
   if(!KINDS.includes(raw.kind)||raw.version!==1||raw.stage!=="candidate"||raw.submitted_as!=="manual_unverified"||
    fields.some(k=>typeof raw[k]!=="string")||fields.some(k=>raw[k].length>1500)||
    !Array.isArray(raw.sources)||raw.sources.length>12||!Array.isArray(raw.evidence_refs)||raw.evidence_refs.length>12)errors.push("invalid_item");
   if(!raw.links||["context","memory","causal"].some(k=>{
    const q=raw.links?.[k];return !q||!STATUS.includes(q.state)||!Array.isArray(q.refs)||q.refs.length>12||typeof q.reason!=="string"||q.reason.length>250;
   }))errors.push("invalid_links");
  }
  for(const e of ledger.events){
   if(!e||typeof e.id!=="string"||events.has(e.id)||!clean(e.id,100)||
    !["submitted","screened","revision_requested"].includes(e.type)||!ids.has(e.subject_id)||
    e.actor!=="user_manual"||typeof e.at!=="string"||typeof e.note!=="string"||e.note.length>600){errors.push("invalid_event");continue}
   events.add(e.id);
  }
  if(ledger.revision<ledger.events.length)errors.push("revision_too_low");
  return errors;
 }
 const normalize=s=>clean(s,1200).toLocaleLowerCase().replace(/[\s，。；;、,.!?！？：:\-_=（）()【】[\]]+/g,"");
 function sameAs(item,others){
  return (others||[]).filter(x=>x&&x.id!==item.id&&(
   normalize(x.title)===normalize(item.title)||
   (normalize(x.summary).length>15&&normalize(x.summary)===normalize(item.summary))
  )).map(x=>x.id).slice(0,20);
 }
 function chainGate(key,chain,{required=false}={}){
  if(!chain||chain.state==="missing")return {ok:!required,status:"missing",reason:key+" 尚未有可查的引用"};
  if(chain.state==="not_applicable"){
   const ok=!!clean(chain.reason,250);
   return {ok:ok&&!required,status:"not_applicable",reason:ok?"不適用："+chain.reason:key+" 不適用需提供理由"};
  }
  const ok=chain.state==="linked"&&chain.refs.length>0;
  return {ok,status:ok?"linked":"missing",reason:ok?"已有引用 ID（仍待授權與證據驗證）":key+" 標記已連結卻缺引用 ID"};
 }
 function evaluate(item,others=[]){
  const reasons=[],weak=[],checks=[];
  function req(id,ok,reason){checks.push({id,pass:!!ok,reason});if(!ok)reasons.push(reason);}
  req("origin",item.sources.length>0,"缺少來源索引");
  req("summary",!!item.title&&!!item.summary,"缺少標題或內容摘要");
  req("highlight",!!item.highlight,"缺少候選資料的亮點／新增價值");
  req("context",!!item.context,"缺少用途或適用上下文");
  req("comparison",!!item.comparison,"缺少與既有資料的比較說明");
  if(!item.uncertainties)weak.push("尚未寫出不確定點／反證方向");
  if(!item.evidence_refs.length)weak.push("只有來源，尚無獨立驗證證據");
  const ctx=chainGate("上下文鏈",item.links.context,{required:true});
  const mem=chainGate("記憶管理鏈",item.links.memory);
  const cau=chainGate("因果鏈",item.links.causal);
  checks.push({id:"context_link",pass:ctx.ok,reason:ctx.reason});
  checks.push({id:"memory_link",pass:mem.ok,reason:mem.reason});
  checks.push({id:"causal_link",pass:cau.ok,reason:cau.reason});
  if(!ctx.ok)reasons.push(ctx.reason);
  if(!mem.ok)reasons.push(mem.reason);
  if(!cau.ok)reasons.push(cau.reason);
  const duplicates=sameAs(item,others);
  if(duplicates.length)weak.push("與既有候選可能重複："+duplicates.join("、")+"；先人工比對，勿將相同內容視為獨立證據");
  let route="hold";
  if(!reasons.length){
   route=duplicates.length?"compare_duplicates":
    item.kind==="research"||item.uncertainties?"research_review":"database_review";
  }
  // Every "ready" state is review readiness only, never a promotion or approval.
  return {route,checks,reasons,warnings:weak,possible_duplicates:duplicates,
   core_memory:"human_approval_required",formal_rule:"not_approved",remote_ack:"not_connected"};
 }
 function add(ledger,raw,{id,at,note=""}={}){
  if(check(ledger).length)throw Error("既有候選檔案格式不合法");
  if(ledger.items.length>=MAX)throw Error("候選資料上限已到，請先匯出");
  const item=candidate(raw);
  if(!item.id||ledger.items.some(x=>x.id===item.id))throw Error("候選 ID 缺失或已重複");
  if(!item.entered_at||Number.isNaN(Date.parse(item.entered_at)))throw Error("時間無效");
  const next=copy(ledger);next.items.push(item);
  next.events.push({id,subject_id:item.id,type:"submitted",actor:"user_manual",at,note:clean(note,600)});
  next.revision++;
  const issues=check(next);if(issues.length)throw Error("候選資料不合法："+issues.join(","));
  return next;
 }
 /* A private rule index may be manually loaded. Only permitted public-facing metadata is kept;
    title can still be sensitive, so never upload such JSON to a public repo. */
 function addRuleIndex(ledger,rows,{idPrefix="rule-index",at}={}){
  if(check(ledger).length)throw Error("既有候選資料格式不合法");
  if(!Array.isArray(rows)||rows.length<1||rows.length>MAX)throw Error("規章索引應為 1～100 筆");
  let next=ledger;
  const ids=new Set();
  for(let i=0;i<rows.length;i++){
   const row=rows[i];if(!row||typeof row!=="object"||Array.isArray(row))throw Error("規章索引格式錯誤");
   // Whitelist only; don't accidentally pull the JSON rule body or private source documents.
   const ruleId=clean(row.regulation_id,80),version=Number(row.version);
   if(!ruleId||!Number.isInteger(version)||version<1||version>9999||
     ids.has(ruleId+":"+version))throw Error("缺規章 ID、版本或重複");
   ids.add(ruleId+":"+version);
   const itemId="rule:"+ruleId+":v"+version;
   const ref="regulation_room.rule_versions/"+ruleId+"/v"+version;
   next=add(next,{
    id:itemId,kind:"rule",title:clean(row.title,160)||ruleId,
    summary:"私人規章候選索引；未讀取原文，需補齊證據及適用上下文後才可送審。",
    sources:[ref],origin_status:"candidate_unverified",entered_at:at
   },{id:idPrefix+":"+i+":"+ruleId,at,note:"人工匯入唯讀規章索引；非核准、非 DB 同步"});
  }
  return next;
 }
 function screen(ledger,itemId,{id,at,note=""}={}){
  if(check(ledger).length)throw Error("既有候選資料格式不合法");
  const item=ledger.items.find(x=>x.id===itemId);if(!item)throw Error("找不到候選資料");
  if(!clean(note,600))throw Error("請說明篩選理由，不能自動核准");
  const result=evaluate(item,ledger.items);
  const next=copy(ledger);next.events.push({id,subject_id:item.id,type:"screened",actor:"user_manual",at,note:clean(note,600)+"｜評估："+result.route});next.revision++;
  const errors=check(next);if(errors.length)throw Error(errors.join(","));
  return {ledger:next,result};
 }
 return Object.freeze({SCHEMA,KINDS,STATUS,blank,candidate,check,add,addRuleIndex,evaluate,sameAs,screen});
});