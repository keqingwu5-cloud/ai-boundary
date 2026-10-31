"use strict";
/* Local first-brain memory initiative. Read-only suggestions on unlock/change.
 * No network, model execution, external posting, approval or persistence. */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.MemoryAutoDriveCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const valid=x=>typeof x==="string"&&x.trim().length>0;
 const trunc=(x,n=240)=>String(x??"").slice(0,n);
 function plan(state,opts={}){
  if(!state||!Array.isArray(state.memories)||!Array.isArray(state.candidates)||!Array.isArray(state.audit))
   throw Error("memory_drive_state_invalid");
  const direction=state.memoryControls===undefined?{text:"",version:0}:state.memoryControls?.direction;
  if(!direction||typeof direction.text!=="string"||!Number.isSafeInteger(direction.version)||direction.version<0)
   throw Error("memory_drive_direction_invalid");
  const out={mode:"LOCAL_IDEA_DRAFT_ONLY",sideEffects:false,alignment:"not_verified",
   direction:{available:valid(direction.text),version:direction.version,ref:"memoryControls.direction",
    summary:trunc(direction.text,500)},proposals:[]};
  if(!out.direction.available)return {...out,reason:"direction_not_set"};
  const seen=new Set(),rows=[],limit=Number.isInteger(opts.limit)?Math.max(1,Math.min(5,opts.limit)):4;
  const add=c=>{if(!seen.has(c.id)){seen.add(c.id);rows.push(c);}};
  // First matching workflow event is the newest one (audit stores newest first).
  const processed=new Set();
  for(const x of state.audit){
   if(!x||x.kind!=="workflow.recorded"||!valid(x.ref)||processed.has(x.ref))continue;
   processed.add(x.ref);
   if(!["blocked","refused"].includes(x.status))continue;
   add({id:"workflow:"+x.ref,ref:x.ref,type:"blocked_research",status:"idea_draft",
    title:trunc(x.taskTitle||"未解工作"),reason:trunc(x.reason||"需要原始證據"),
    next:trunc(x.nextAction||"回查方向與失敗證據"),source:"audit.workflow.recorded"});
  }
  for(const c of state.candidates){
   if(!c||c.status!=="rejected"||c.resolvedBy||!valid(c.id))continue;
   add({id:"rejected:"+c.id,ref:c.id,type:"challenge_rejection",status:"idea_draft",
    title:trunc(c.question||"被拒候選"),reason:trunc(c.review?.reason||"需回看拒絕理由"),
    next:"比較最新方向與原反證，提出可被推翻的修正草稿",source:"candidates.rejected"});
  }
  for(const c of state.candidates){
   if(!c||c.status!=="pending"||!valid(c.id))continue;
   add({id:"pending:"+c.id,ref:c.id,type:"compare_pending",status:"idea_draft",
    title:trunc(c.question||"待審方向"),reason:"候選不等於已生效的記憶",
    next:"回查原意、相關性與競爭解釋，不自動核准",source:"candidates.pending"});
  }
  if(rows.length===0)add({id:"direction:"+direction.version,
   ref:"memoryControls.direction",type:"new_question",status:"idea_draft",
   title:"從現行記憶方向探索一個可反證問題",
   reason:"目前未發現可回接的未解工作、拒絕或待審項",
   next:"保留原目標，提出至少一個競爭解釋與可測反例",
   source:"memoryControls.direction"});
  return {...out,reason:"direction_read",proposals:rows.slice(0,limit)};
 }
 return {plan};
});
