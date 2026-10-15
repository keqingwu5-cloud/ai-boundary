/* TCVL platform project-governance helpers. Pure, isolated, no storage/network/AI access. */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.TcvlPlatformCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const SCHEMA="tcvl.project-workspace.v0.1";
const STATUS_SCHEMA="tcvl.status-registry.v0.1";
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
 for(const e of w.events)if(!val(e.kind,100)||!val(e.message,1000)||!val(e.at,40))errs.push("event_invalid");
 for(const a of w.alerts)if(!val(a.reason,1000)||!val(a.impact,1000)||!val(a.next,1000)||!val(a.at,40)||!val(a.category,60))errs.push("alert_invalid");
 return [...new Set(errs)];
}
function assertWorkspace(w){const errors=validate(w);if(errors.length)throw Error("工作空間內容不合法："+errors.join(", "));}
function update(w,fn){
 assertWorkspace(w);const next=copy(w);fn(next);next.revision++;
 const errs=validate(next);if(errs.length)throw Error("無法更新工作空間："+errs.join(", "));return next;
}
function unique(w,key,id){if(!idOk(id)||w[key].some(x=>x.id===id))throw Error("ID 不合法或已存在："+id)}
function makeEvent(w,e){unique(w,"events",e.id);w.events.unshift(e)}
function alert(w,{id,at,category,reason,impact,next,ref}){
 unique(w,"alerts",id);w.alerts.unshift({id,at,category,reason,impact,next,ref:ref||"",seen:false});
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
  if(requiresAttention)alert(n,{id:"alert:"+seq,at,category:status,reason,impact,next,ref:taskId});
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
 if(decision==="rejected")alert(n,{id:"alert:"+seq,at,category:"proposal_rejected",reason,impact,next,ref:proposalId});
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
 createWorkspace,validate,safeImport,addProject,addThread,addMessage,projectMemo,
 addTask,transition,pauseTask,resumeTask,setProgress,setTaskDisplay,addProposal,proposalDecision,addLink,dismissAlert,transferCandidateMap,packet};
});