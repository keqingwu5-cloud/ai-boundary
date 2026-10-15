/* TCVL platform project-governance helpers. Pure, isolated, no storage/network/AI access. */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.TcvlPlatformCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const SCHEMA="tcvl.project-workspace.v0.1";
const STATUS_SCHEMA="tcvl.status-registry.v0.1";
const GATE_PHASES=new Set(["before","after","failure"]);
const GATE_DECISIONS=new Set(["pass","hold","reject"]);
const LABELS={
 queued:{label:"待交接",group:"pending"},
 received:{label:"已確認接收",group:"active"},
 in_progress:{label:"進行中",group:"active"},
 paused:{label:"已暫停",group:"paused"},
 blocked:{label:"阻塞／需協助",group:"attention"},
 refused:{label:"已拒絕",group:"attention"},
 review:{label:"待審查",group:"pending"},
 done:{label:"已完成（人工記錄）",group:"done"}
};
const DEFAULT_STATUSES=Object.freeze(Object.entries(LABELS).map(([id,x])=>Object.freeze({id,label:x.label,base:id,group:x.group,builtIn:true})));
const val=(x,max=300)=>typeof x==="string"&&!!x.trim()&&x.length<=max;
const idOk=x=>val(x,120)&&/^[a-z0-9_.:-]+$/i.test(x);
const copy=x=>JSON.parse(JSON.stringify(x));
function registry(extra=[]){
 if(!Array.isArray(extra)||extra.length>20)throw Error("狀態選項數量過多");
 const seen=new Set(DEFAULT_STATUSES.map(s=>s.id)),labels=new Set(DEFAULT_STATUSES.map(s=>s.label)),all=DEFAULT_STATUSES.map(x=>({...x}));
 for(const s of extra){
  if(!s||!idOk(s.id)||seen.has(s.id)||labels.has(s.label.trim())||!val(s.label,48)||!LABELS[s.base]||typeof s.note!=="string"||s.note.length>200)throw Error("自訂狀態不合法或名稱重複");
  seen.add(s.id);labels.add(s.label.trim());all.push({id:s.id,label:s.label,base:s.base,group:LABELS[s.base].group,builtIn:false,note:s.note});
 }
 return all;
}
function statusOf(id,extra=[]){return registry(extra).find(s=>s.id===id)||null}
function addCustomStatus(existing,item){
 const next=[...existing,{id:item.id,label:item.label,base:item.base,note:item.note||""}];registry(next);return next;
}
function createWorkspace(){
 return {schema:SCHEMA,revision:0,projects:[],threads:[],tasks:[],proposals:[],links:[],events:[],alerts:[]};
}
function validate(w){
 const errs=[];
 if(!w||w.schema!==SCHEMA||!Number.isInteger(w.revision)||w.revision<0)return ["workspace_invalid"];
 const defs={projects:25,threads:100,tasks:250,proposals:150,links:500,events:2000,alerts:500};
 for(const [key,limit]of Object.entries(defs))if(!Array.isArray(w[key])||w[key].length>limit)errs.push(key+"_invalid");
 if(errs.length)return errs;
 for(const key of ["projects","threads","tasks","proposals","links","events","alerts"]){
  const seen=new Set();
  for(const item of w[key]){
   if(!item||!idOk(item.id)||seen.has(item.id)){errs.push(key+"_identifier_invalid");break;}
   seen.add(item.id);
  }
 }
 const projectIds=new Set(w.projects.map(x=>x.id)),threadIds=new Set(w.threads.map(x=>x.id)),taskIds=new Set(w.tasks.map(x=>x.id));
 for(const p of w.projects)if(!val(p.title,140)||!val(p.goal,1000)||!Array.isArray(p.decisions)||!Array.isArray(p.todos))errs.push("project_content_invalid");
 for(const t of w.threads)if(!projectIds.has(t.projectId)||!val(t.title,160)||!Array.isArray(t.messages)||t.messages.length>500)errs.push("thread_invalid");
 for(const t of w.tasks)if(!projectIds.has(t.projectId)||!val(t.title,160)||!val(t.reason,1000)||!Object.prototype.hasOwnProperty.call(LABELS,t.status)||!val(t.owner,80))errs.push("task_invalid");
 for(const n of w.proposals)if(!projectIds.has(n.projectId)||!val(n.title,140)||!val(n.purpose,1000)||!val(n.fromNode,120)||!["candidate","review","rejected","approved_plan"].includes(n.stage))errs.push("proposal_invalid");
 for(const l of w.links)if(!val(l.from,120)||!val(l.to,120)||!["handoff","depends_on","branch"].includes(l.kind)||!["candidate","planned"].includes(l.stage))errs.push("link_invalid");
 for(const e of w.events){
  if(!val(e.kind,100)||!val(e.message,1000)||!val(e.at,40))errs.push("event_invalid");
  if(e.kind?.startsWith("gate.")){
   const g=e.gate;
   if(!g||!idOk(g.id)||!GATE_PHASES.has(g.phase)||!GATE_DECISIONS.has(g.decision)||
      !Array.isArray(g.conditions)||g.conditions.length>16||
      !val(g.action,80)||!val(g.reason,1000)||!val(g.impact,1000)||!val(g.next,1000)||
      !val(g.source,60)||!Number.isInteger(g.revisionBefore)||!Number.isInteger(g.revisionAfter)||
      g.conditions.some(x=>!idOk(x.id)||typeof x.required!=="boolean"||typeof x.passed!=="boolean"||
        typeof x.actual!=="boolean"||typeof x.expected!=="boolean"||
        x.passed!==(x.actual===x.expected)||!val(x.description,200)))errs.push("gate_event_invalid");
  }
 }
 for(const a of w.alerts)if(!val(a.reason,1000)||!val(a.impact,1000)||!val(a.next,1000)||!val(a.at,40)||!val(a.category,60)||(a.projectId!=null&&!projectIds.has(a.projectId)))errs.push("alert_invalid");
 return [...new Set(errs)];
}
function assertWorkspace(w){const errors=validate(w);if(errors.length)throw Error("工作空間內容不合法："+errors.join(", "));}
function update(w,fn){
 assertWorkspace(w);const next=copy(w);fn(next);next.revision++;
 const errs=validate(next);if(errs.length)throw Error("無法更新工作空間："+errs.join(", "));return next;
}
function unique(w,key,id){if(!idOk(id)||w[key].some(x=>x.id===id))throw Error("ID 不合法或已存在："+id)}
function makeEvent(w,e){unique(w,"events",e.id);w.events.unshift(e)}
function alert(w,{id,at,category,reason,impact,next,ref,projectId}){
 unique(w,"alerts",id);w.alerts.unshift({id,at,category,reason,impact,next,ref:ref||"",projectId:projectId||null,seen:false});
}
/* Conditional governance gate. A gate checks the permission to record a change,
   not whether a model's answer is true or whether an API was really reached. */
const GATE_ACTIONS=new Set(["project.create","thread.create","thread.message","thread.continue",
 "project.memo","task.create","task.transition","task.pause","task.resume",
 "proposal.create","proposal.review","link.plan","alert.acknowledge","relay.import",
 "project.workspace","workspace.manual"]);
function gateConditions(w,{action,projectId,expectedRevision,source}={}){
 const projectNeeded=!["project.create","workspace.manual"].includes(action);
 return [
  {id:"scope_authorized",description:"動作屬本批已核准的治理、專案、狀態、提醒或候選架構功能",
   expected:true,actual:GATE_ACTIONS.has(action),required:true},
  {id:"version_fresh",description:"操作時的記憶／工作空間版次等於當前版次",
   expected:true,actual:Number.isInteger(expectedRevision)&&expectedRevision===w.revision,required:true},
  {id:"project_exists",description:"需要專案的操作必須連到真實存在的專案 ID",
   expected:true,actual:!projectNeeded||w.projects.some(p=>p.id===projectId),required:true},
  {id:"source_declared",description:"保留操作來源，不將人工輸入偽裝為遠端 AI 已驗證訊息",
   expected:true,actual:source==="user_manual"||source==="import_unverified",required:true}
 ];
}
function gateDecision(checks){
 const missed=checks.filter(c=>c.required&&c.actual!==c.expected);
 return missed.length?{decision:missed.some(c=>c.id==="scope_authorized"||c.id==="version_fresh")?"reject":"hold",
   reason:missed.map(c=>c.description).join("；"),
   impact:"本次工作空間更新暫不生效；既有專案、歷史與暫停狀態保持不變。",
   next:"核對專案、來源與版次，補齊門檻後重新執行。"}:
   {decision:"pass",reason:"本階段必要條件均已符合，可進入下一環節；不代表證據真實或 AI 已送達。",
    impact:"本次條件式檢查未發現阻塞；實際內容仍須人工審核。",
    next:"繼續下個階段並記錄變更後的資料、版本與問題。"};
}
function retained(oldArr,newArr,comparator){
 if(!Array.isArray(oldArr)||!Array.isArray(newArr)||newArr.length<oldArr.length)return false;
 const newer=new Map(newArr.map(x=>[x.id,x]));
 return oldArr.every(item=>newer.has(item.id)&&(!comparator||comparator(item,newer.get(item.id))));
}
function retainedSequence(oldArr,newArr){
 return Array.isArray(oldArr)&&Array.isArray(newArr)&&newArr.length>=oldArr.length&&
  oldArr.every((x,i)=>JSON.stringify(x)===JSON.stringify(newArr[i]));
}
function retainedHistory(oldW,newW){
 return retained(oldW.projects,newW.projects,(a,b)=>retained(a.decisions,b.decisions,(x,y)=>JSON.stringify(x)===JSON.stringify(y))
     &&retained(a.todos,b.todos,(x,y)=>JSON.stringify(x)===JSON.stringify(y)))
   &&retained(oldW.threads,newW.threads,(a,b)=>retained(a.messages,b.messages,(x,y)=>JSON.stringify(x)===JSON.stringify(y)))
   &&retained(oldW.tasks,newW.tasks,(a,b)=>retainedSequence(a.history,b.history))
   &&retained(oldW.proposals,newW.proposals)
   &&retained(oldW.links,newW.links,(a,b)=>JSON.stringify(a)===JSON.stringify(b))
   &&retained(oldW.events,newW.events,(a,b)=>JSON.stringify(a)===JSON.stringify(b))
   &&retained(oldW.alerts,newW.alerts);
}
function gateEvent({id,at,action,projectId,phase,decision,checks,reason,impact,next,source,revisionBefore,revisionAfter}){
 return {id:"gate:"+phase+":"+id,kind:"gate."+phase,
  message:("門檻 "+(decision==="pass"?"通過":decision==="hold"?"保留待補證":"拒絕")+"｜"+action+"｜"+reason).slice(0,1000),
  at,ref:projectId||"workspace",gate:{id,action,projectId:projectId||null,at,phase,decision,
   conditions:checks.map(c=>({...c,passed:c.actual===c.expected})),
   reason,impact,next,source,revisionBefore,revisionAfter}};
}
function runGatedChange(w,{id,at,action,projectId="",expectedRevision,source="user_manual"}={},changer){
 assertWorkspace(w);
 if(!idOk(id)||!val(at,40)||typeof changer!=="function")throw Error("門檻序號、時間或更新處理缺失");
 const pristine=copy(w);
 const conditions=gateConditions(w,{action,projectId,expectedRevision,source});
 const before=gateDecision(conditions);
 function failure(reason,decision="reject",additional=[]){
  const checks=[...conditions,...additional];
  const failureDecision={...before,decision,reason,impact:"這次操作沒有生效；原本工作、版本和對話保留。",
   next:"檢查阻塞原因及上一版紀錄後，再提交修正。"};
  const workspace=update(pristine,n=>{
   makeEvent(n,gateEvent({id,at,action,projectId,phase:"failure",...failureDecision,checks,source,
     revisionBefore:w.revision,revisionAfter:w.revision+1}));
   const validProject=n.projects.some(x=>x.id===projectId)?projectId:null;
   alert(n,{id:"alert:gate:"+id,at,category:"gate_rejected",reason,impact:failureDecision.impact,
     next:failureDecision.next,ref:id,projectId:validProject});
  });
  return {workspace,applied:false,...failureDecision,checks};
 }
 if(before.decision!=="pass")return failure(before.reason,before.decision);
 const beforeCopy=JSON.stringify(w);
 let candidate;
 try{
  candidate=changer();
  if(JSON.stringify(w)!==beforeCopy)throw Error("原始工作空間被直接修改；禁止無版本覆寫");
  const errors=validate(candidate);
  if(errors.length)throw Error("更新後資料格式不符合門檻："+errors.join(", "));
  if(candidate.revision<=w.revision)throw Error("更新未增加版次");
  if(!retainedHistory(w,candidate))throw Error("發現舊對話、歷史、事件、關聯或版本被覆蓋");
 }catch(e){
  return failure(("執行／變更後門檻未通過："+String(e?.message||e)).slice(0,980));
 }
 const afterChecks=[
  {id:"schema_valid",description:"更新後整個工作空間資料格式有效",expected:true,actual:true,required:true},
  {id:"preserve_lineage",description:"舊任務、決策、對話、否決及依賴仍可追溯",expected:true,actual:true,required:true},
  {id:"revision_advanced",description:"狀態更新有新版本而非原地覆寫",expected:true,actual:true,required:true}
 ];
 const success=gateDecision(afterChecks);
 const workspace=update(candidate,n=>{
  makeEvent(n,gateEvent({id,at,action,projectId,phase:"before",decision:before.decision,checks:conditions,
    reason:before.reason,impact:before.impact,next:before.next,source,
    revisionBefore:w.revision,revisionAfter:candidate.revision}));
  makeEvent(n,gateEvent({id,at,action,projectId,phase:"after",decision:success.decision,checks:afterChecks,
    reason:success.reason,impact:success.impact,next:success.next,source,
    revisionBefore:w.revision,revisionAfter:candidate.revision+1}));
 });
 return {workspace,applied:true,decision:"pass",reason:success.reason,impact:success.impact,
   next:success.next,checks:[...conditions,...afterChecks]};
}
function gateHistory(w,{projectId="",decision="",phase=""}={}){
 assertWorkspace(w);
 return w.events.filter(e=>e.gate&&(!projectId||e.gate.projectId===projectId)&&
  (!decision||e.gate.decision===decision)&&(!phase||e.gate.phase===phase));
}

function addProject(w,{id,title,goal,at}){
 if(!val(title,140)||!val(goal,1000)||!val(at,40))throw Error("專案需要名稱、目的與時間");
 return update(w,n=>{unique(n,"projects",id);n.projects.push({id,title,goal,decisions:[],todos:[],createdAt:at});
 makeEvent(n,{id:"event:"+id,kind:"project.created",message:"建立專案："+title,at,ref:id});});
}
function addThread(w,{id,projectId,title,at}){
 if(!val(title,160)||!val(at,40))throw Error("對話需要標題與時間");
 return update(w,n=>{unique(n,"threads",id);if(!n.projects.some(p=>p.id===projectId))throw Error("專案不存在");
 n.threads.push({id,projectId,title,messages:[],createdAt:at});
 makeEvent(n,{id:"event:"+id,kind:"thread.created",message:"新對話已關聯專案："+title,at,ref:projectId});});
}
function addMessage(w,{id,threadId,author,text,at}){
 if(!idOk(id)||!val(author,70)||!val(text,2400)||!val(at,40))throw Error("對話欄位缺失");
 return update(w,n=>{const t=n.threads.find(x=>x.id===threadId);if(!t)throw Error("對話不存在");if(t.messages.some(x=>x.id===id))throw Error("訊息重複");
 t.messages.push({id,author,text,at});});
}
function projectMemo(w,{id,projectId,kind,text,at}){
 if(!["decision","todo"].includes(kind)||!val(text,1000)||!val(at,40))throw Error("請填有效的決策或待辦");
 return update(w,n=>{const p=n.projects.find(x=>x.id===projectId);if(!p)throw Error("專案不存在");
 const target=kind==="decision"?p.decisions:p.todos;if(target.some(x=>x.id===id))throw Error("ID 重複");
 target.push({id,text,at});makeEvent(n,{id:"event:"+id,kind:"project."+kind,message:(kind==="decision"?"決策：":"待辦：")+text,at,ref:projectId});});
}
function addTask(w,{id,projectId,title,owner,reason,at}){
 if(!val(title,160)||!val(owner,80)||!val(reason,1000)||!val(at,40))throw Error("任務缺少必要說明");
 return update(w,n=>{unique(n,"tasks",id);if(!n.projects.some(p=>p.id===projectId))throw Error("專案不存在");
 n.tasks.push({id,projectId,title,owner,reason,status:"queued",progress:"未開始",history:[{at,status:"queued",reason}]});
 makeEvent(n,{id:"event:"+id,kind:"task.created",message:"建立任務："+title,at,ref:id});});
}
function transition(w,{taskId,status,reason,impact,next,at,seq}){
 if(!LABELS[status]||!val(reason,1000)||!val(at,40)||!idOk(seq))throw Error("狀態、原因或事件編號不合法");
 const requiresAttention=["blocked","refused"].includes(status);
 if(requiresAttention&&(!val(impact,1000)||!val(next,1000)))throw Error("拒絕或阻塞必須有原因、影響與下一步");
 return update(w,n=>{
  const t=n.tasks.find(x=>x.id===taskId);if(!t)throw Error("找不到指定任務");
  if(t.status==="done"&&status!=="review")throw Error("已結案任務須重新審查，不能直接改寫完成狀態");
  if(t.status==="paused"&&status==="done")throw Error("已暫停的任務不能直接跳到完成");
  const old=t.status;t.status=status;t.reason=reason;delete t.displayStatus;t.history.push({at,status,reason,previous:old});
  makeEvent(n,{id:"event:"+seq,kind:"task."+status,message:t.title+"："+reason,at,ref:taskId});
  if(requiresAttention)alert(n,{id:"alert:"+seq,at,category:status,reason,impact,next,ref:taskId,projectId:t.projectId});
 });
}
function pauseTask(w,args){
 const t=w.tasks.find(x=>x.id===args.taskId);
 if(!t)throw Error("找不到指定工作");
 if(t.status==="paused")throw Error("已經暫停");
 return transition(w,{...args,status:"paused",reason:args.reason||"使用者要求暫停，保留既有進度"});
}
function resumeTask(w,args){
 const t=w.tasks.find(x=>x.id===args.taskId);if(!t||t.status!=="paused")throw Error("只有已暫停任務可以繼續");
 return transition(w,{...args,status:"in_progress",reason:args.reason||"使用者恢復工作"});
}
function setProgress(w,{taskId,progress}){
 if(!val(progress,1000))throw Error("進度描述不可為空");
 return update(w,n=>{const t=n.tasks.find(x=>x.id===taskId);if(!t)throw Error("任務不存在");t.progress=progress});
}
function setTaskDisplay(w,{taskId,label}){
 if(!val(label,48))throw Error("自訂狀態顯示名稱無效");
 return update(w,n=>{const t=n.tasks.find(x=>x.id===taskId);if(!t)throw Error("任務不存在");t.displayStatus=label;});
}
function addProposal(w,{id,projectId,title,purpose,fromNode,at}){
 if(!val(title,140)||!val(purpose,1000)||!val(fromNode,120)||!val(at,40))throw Error("候選版塊缺少用途與來源");
 return update(w,n=>{unique(n,"proposals",id);if(!n.projects.some(x=>x.id===projectId))throw Error("專案不存在");
 n.proposals.push({id,projectId,title,purpose,fromNode,stage:"candidate",createdAt:at});
 makeEvent(n,{id:"event:"+id,kind:"proposal.created",message:"建立未啟用候選版塊："+title,at,ref:id});});
}
function proposalDecision(w,{proposalId,decision,reason,impact,next,at,seq}){
 if(!["review","rejected","approved_plan"].includes(decision)||!val(reason,1000)||!val(at,40)||!idOk(seq))throw Error("版塊審查資料不合法");
 if(decision==="rejected"&&(!val(impact,1000)||!val(next,1000)))throw Error("拒絕須說明影響與下一步");
 return update(w,n=>{const p=n.proposals.find(x=>x.id===proposalId);if(!p)throw Error("候選版塊不存在");
 p.stage=decision;p.review={reason,at};makeEvent(n,{id:"event:"+seq,kind:"proposal."+decision,message:p.title+"："+reason,at,ref:proposalId});
 if(decision==="rejected")alert(n,{id:"alert:"+seq,at,category:"proposal_rejected",reason,impact,next,ref:proposalId,projectId:p.projectId});
 });
}
function addLink(w,{id,from,to,kind,at}){
 if(!["handoff","branch","depends_on"].includes(kind)||!val(at,40))throw Error("路徑關係或時間不合法");
 return update(w,n=>{unique(n,"links",id);
 if(!val(from,120)||!val(to,120)||from===to)throw Error("不可建立空白或自身依賴");
 if(n.links.some(x=>x.from===from&&x.to===to&&x.kind===kind))throw Error("已有相同關聯，不重複新增");
 if(kind==="depends_on"){
  const seen=new Set(),queue=[to];
  while(queue.length){const value=queue.shift();if(value===from)throw Error("依賴關係不能形成循環；請改成分支或交接規劃");if(seen.has(value))continue;seen.add(value);
   for(const e of n.links.filter(x=>x.kind==="depends_on"&&x.from===value))queue.push(e.to);
  }
 }
 n.links.push({id,from,to,kind,stage:"candidate",createdAt:at});
 makeEvent(n,{id:"event:"+id,kind:"link.candidate",message:from+" → "+to+"｜"+kind+"；規劃候選，尚未接線",at,ref:id});});
}
function dismissAlert(w,{alertId}){
 return update(w,n=>{const a=n.alerts.find(x=>x.id===alertId);if(!a)throw Error("提醒不存在");a.seen=true});
}
function safeImport(source){
 if(!source||JSON.stringify(source).length>1000000)throw Error("檔案內容超過 1MB");
 const w=copy(source),errors=validate(w);if(errors.length)throw Error("工作空間格式錯誤："+errors.join(", "));
 return w;
}
function transferCandidateMap(workspace,projectId){
 assertWorkspace(workspace);
 const p=workspace.projects.find(x=>x.id===projectId);if(!p)throw Error("選定專案不存在");
 const proposals=workspace.proposals.filter(x=>x.projectId===projectId);
 if(proposals.length>30)throw Error("候選版塊過多，請分批匯出");
 const nodes=proposals.map(x=>({id:x.id,title:x.title,purpose:x.purpose,fromNode:x.fromNode,stage:x.stage}));
 const proposalIds=new Set(nodes.map(x=>x.id));
 const links=workspace.links.filter(x=>proposalIds.has(x.from)||proposalIds.has(x.to)).map(x=>({id:x.id,from:x.from,to:x.to,kind:x.kind,stage:"planned"}));
 return {schema:"tcvl.candidate-map-transfer.v0.1",project:{id:p.id,title:p.title,goal:p.goal},nodes,links,
  note:"候選版塊／規劃交接；均未啟用接口。須人工審核後才可能納入正式架構。"};
}
/* Import an unverified relay report into one existing project thread, without changing approved memory. */
function acceptRelayTransfer(workspace,transfer,{projectId,threadId,at,seq}){
 assertWorkspace(workspace);
 if(!transfer||transfer.schema!=="tcvl.relay-transfer.v0.1"||!idOk(transfer.id)||!idOk(transfer.projectId)||transfer.projectId!==projectId
    ||!val(transfer.projectTitle,140)||!Array.isArray(transfer.roles)||transfer.roles.length!==3||!val(transfer.note,300)||!transfer.note.includes("未驗證")||!val(at,40)||!idOk(seq))
    throw Error("交接封包不完整或專案 ID 不符合；請在相同專案匯入");
 if(!workspace.projects.some(p=>p.id===projectId))throw Error("此專案不存在");
 const thread=workspace.threads.find(t=>t.id===threadId&&t.projectId===projectId);
 if(!thread)throw Error("所選對話不屬於這個專案");
 if(workspace.events.some(e=>e.kind==="relay.transfer"&&e.ref===transfer.id))throw Error("這份交接封包已匯入過，不重複新增");
 const ordered=["GPT1","GPT2","BOT3"],seen=new Set();
 const pieces=[{role:"summary",text:"【TCVL 中樞交接回報｜人工匯入，非 AI 身分驗證】\n批次："+transfer.id+"\n原專案："+transfer.projectTitle+"\n結果："+String(transfer.result||"待查核").slice(0,200)+"\n提醒：下列內容只證明使用者匯入了 JSON，不能證明三個 AI 已接收或回覆。"}];
 let rejected=[];
 for(const r of transfer.roles){
  if(!r||!ordered.includes(r.id)||seen.has(r.id)||!["prepared","manual_handoff","reported_unverified","rejected","paused"].includes(r.state)||r.commandId!==transfer.id+":"+r.id||!Array.isArray(r.responses)||r.responses.length>20||r.responseCount!==r.responses.length)throw Error("三方角色、回報數量或指令關聯錯誤");
  seen.add(r.id);
  const label={GPT1:"GPT①",GPT2:"GPT②",BOT3:"BOT③"}[r.id];
  pieces.push({role:r.id,text:label+"｜狀態："+r.state+"｜指令："+r.commandId+"｜回報數："+r.responses.length+"\n身分驗證：未驗證"});
  for(const response of r.responses){
   if(!response||!idOk(response.id)||!val(response.text,8000)||!val(response.source,150)||response.identityVerified!==false)throw Error("來源／身分／回報內容不可信或不完整");
   const head="【"+label+" 手動回報｜身分未驗證｜"+response.id+"】\n來源聲稱："+response.source+"\n";
   const chars=1900;let offset=0,part=1;
   while(offset<response.text.length){
    pieces.push({role:r.id,text:head+"區段："+part+"\n"+response.text.slice(offset,offset+chars)});
    offset+=chars;part++;
   }
  }
  if(r.rejection){
   const x=r.rejection;
   if(!val(x.reason,1200)||!val(x.impact,1200)||!val(x.next,1200))throw Error("拒絕紀錄缺少原因、影響或下一步");
   rejected.push({role:r.id,reason:x.reason,impact:x.impact,next:x.next});
  }
 }
 if(seen.size!==3||pieces.length>100||JSON.stringify(transfer).length>120000)throw Error("交接過大或三方資料不完整，請先封存完整 JSON，分批人工處理");
 if(rejected.length>3)throw Error("拒絕通知過多");
 return update(workspace,n=>{
  const t=n.threads.find(x=>x.id===threadId);
  if(t.messages.length+pieces.length>500)throw Error("本對話接近容量上限，請先另建新對話");
  for(const [i,piece] of pieces.entries()){
   if(!val(piece.text,2400))throw Error("回報內容超出單段限制");
   t.messages.push({id:"relay:"+seq+":"+i,author:"中樞人工匯入／未驗證",text:piece.text,at});
  }
  makeEvent(n,{id:"event:relay:"+seq,kind:"relay.transfer",message:"三方人工交接回報："+transfer.id+"；等待後續驗證",at,ref:transfer.id});
  for(const rej of rejected){
   alert(n,{id:"alert:relay:"+seq+":"+rej.role,at,category:"relay_rejected",reason:rej.reason,impact:rej.impact,next:rej.next,ref:transfer.id+":"+rej.role,projectId});
  }
 });
}

/* A continuation is an explicitly generated index; never automatic remote context sync. */
function projectAlerts(w,projectId,{unreadOnly=false}={}){
 assertWorkspace(w);
 if(!w.projects.some(p=>p.id===projectId))throw Error("專案不存在");
 const refs=new Set([...w.tasks.filter(t=>t.projectId===projectId).map(t=>t.id),
                      ...w.proposals.filter(p=>p.projectId===projectId).map(p=>p.id)]);
 return w.alerts.filter(a=>{
   if(a.projectId)return a.projectId===projectId && (!unreadOnly||!a.seen);
   const ref=typeof a.ref==="string"?a.ref:"";
   const isLegacy=refs.has(ref)||[...refs].some(id=>ref.startsWith(id+":"));
   return isLegacy && (!unreadOnly||!a.seen);
 });
}
function continuationSnapshot(w,{projectId,threadId=""}){
 assertWorkspace(w);
 const project=w.projects.find(p=>p.id===projectId);
 if(!project)throw Error("專案不存在");
 const source=threadId?w.threads.find(t=>t.id===threadId&&t.projectId===projectId):null;
 if(threadId&&!source)throw Error("來源對話不屬於這個專案");
 const tasks=w.tasks.filter(t=>t.projectId===projectId);
 const proposals=w.proposals.filter(p=>p.projectId===projectId);
 const alerts=projectAlerts(w,projectId,{unreadOnly:true});
 return {
   schema:"tcvl.project-continuation.v0.1",
   projectId,title:project.title,goal:project.goal,fromThreadId:source?.id||"",
   sourceThreadTitle:source?.title||"",
   revision:w.revision,
   totals:{tasks:tasks.length,unresolved:tasks.filter(t=>t.status!=="done").length,
     decisions:project.decisions.length,todos:project.todos.length,
     unreadAlerts:alerts.length,proposalNodes:proposals.length},
   decisions:project.decisions.slice(-6).map(x=>({id:x.id,text:x.text})),
   todos:project.todos.slice(-8).map(x=>({id:x.id,text:x.text})),
   tasks:tasks.filter(t=>t.status!=="done").slice(-8).map(t=>({
     id:t.id,title:t.title,status:t.status,progress:t.progress,owner:t.owner,reason:t.reason})),
   alerts:alerts.slice(0,8).map(a=>({id:a.id,reason:a.reason,impact:a.impact,next:a.next,ref:a.ref})),
   gateChecks:gateHistory(w,{projectId}).filter(x=>x.gate.phase!=="before").slice(0,8).map(x=>({
     id:x.gate.id,phase:x.gate.phase,decision:x.gate.decision,action:x.gate.action,
     reason:x.gate.reason,impact:x.gate.impact,next:x.gate.next,revisionAfter:x.gate.revisionAfter})),
   candidateNodes:proposals.slice(-6).map(p=>({id:p.id,title:p.title,stage:p.stage})),
   note:"人工生成的續接索引（僅包含各類最近部分紀錄）。完整歷史仍在原工作空間 JSON，不等於遠端 AI 已收到或新對話自動取得完整記憶。"
 };
}
function continuationText(snapshot){
 if(!snapshot||snapshot.schema!=="tcvl.project-continuation.v0.1")throw Error("續接快照格式錯誤");
 const sections=[
   "【主腦專案續接卡｜人工匯出／來源未經 AI 身分驗證】",
   "專案："+snapshot.title+"（"+snapshot.projectId+"）",
   "目標："+snapshot.goal,
   "前一對話："+(snapshot.sourceThreadTitle||"未指定")+"（"+(snapshot.fromThreadId||"—")+"）",
   "版次："+snapshot.revision+"；任務 "+snapshot.totals.tasks+"，未結 "+snapshot.totals.unresolved+
     "，待處理提醒 "+snapshot.totals.unreadAlerts,
   "【近期決策】",...snapshot.decisions.map(x=>"- "+x.text),
   "【近期待辦】",...snapshot.todos.map(x=>"- "+x.text),
   "【待完成／暫停任務】",...snapshot.tasks.map(x=>"- "+x.title+"｜"+(LABELS[x.status]?.label||x.status)+"｜進度："+x.progress),
   "【尚未處理的拒絕／阻塞】",...snapshot.alerts.map(x=>"- 原因："+x.reason+"；影響："+x.impact+"；下一步："+x.next),
   "【條件式門檻紀錄】",...(snapshot.gateChecks||[]).map(x=>"- "+x.action+"｜"+x.phase+"｜"+x.decision+"｜"+x.reason+"｜下一步："+x.next),
   "【候選版圖】",...snapshot.candidateNodes.map(x=>"- "+x.title+"｜"+x.stage),
   "注意：以上僅是人類可讀的近期索引，尚未同步給其他 AI，請勿視為任務已執行。"
 ];
 return sections.join("\n");
}
function startContinuation(w,{id,projectId,fromThreadId,title,at,seq}){
 if(!idOk(id)||!idOk(seq)||!val(title,160)||!val(at,40))throw Error("新對話資訊缺失");
 const snap=continuationSnapshot(w,{projectId,threadId:fromThreadId||""});
 return update(w,n=>{
   unique(n,"threads",id);
   const index=[
     "【人工建立的續接對話索引】",
     "專案："+snap.title+"｜專案 ID："+projectId,
     "原對話："+(snap.sourceThreadTitle||"未指定")+"｜來源 ID："+(snap.fromThreadId||"無"),
     "當前未結任務："+snap.totals.unresolved+"；未讀拒絕／阻塞："+snap.totals.unreadAlerts,
     "決策："+snap.totals.decisions+"；待辦："+snap.totals.todos+"；候選模組："+snap.totals.proposalNodes,
     "本對話仍屬同一專案，請查看右側專案上下文／任務／提醒以讀取完整紀錄。",
     "這不是 AI 回覆，也不會啟動或繼續任何已暫停任務。"
   ].join("\n");
   n.threads.push({id,projectId,title,parentThreadId:snap.fromThreadId||null,
     messages:[{id:"continue:"+seq,author:"系統索引（人工發起）",text:index,at}],createdAt:at});
   makeEvent(n,{id:"event:"+seq,kind:"thread.continuation",
      message:"建立專案續接對話："+title+"，不影響已暫停工作",at,ref:projectId});
 });
}

function packet(workspace,uid){
 assertWorkspace(workspace);
 const content=JSON.stringify(workspace,null,2);
 if(content.length>12000)throw Error("專案資料過長，請使用工作空間 JSON 封存；不要強制截斷");
 return {schema:"ai-boundary.memory-pack.v1",items:[{id:"PROJECT-"+uid,
   question:"【主腦專案】工作空間方案及交接記錄",purpose:"保存專案目標、決策、待辦、工作停止及規劃候選；不等同真實 AI 通訊或核准。",
   content,reason:"使用者從治理平台匯出，待人工核對，不可自動核准。",
   evidence:"來源：瀏覽器治理工作區人工建立；尚未驗證任何外部 AI 身分。",eventType:"new_question",evidenceLevel:"hypothesis"}]};
}
return {SCHEMA,STATUS_SCHEMA,DEFAULT_STATUSES,registry,statusOf,addCustomStatus,
 gateConditions,gateDecision,runGatedChange,gateHistory,
 createWorkspace,validate,safeImport,addProject,addThread,addMessage,projectMemo,
 addTask,transition,pauseTask,resumeTask,setProgress,setTaskDisplay,addProposal,proposalDecision,addLink,dismissAlert,transferCandidateMap,acceptRelayTransfer,
 projectAlerts,continuationSnapshot,continuationText,startContinuation,packet};
});