"use strict";
/* Local first-brain memory initiative. Read-only suggestions on unlock/change.
 * No network, model execution, external posting, approval or persistence.
 * Text overlap is a SEARCH HINT, never proof of direction fit or causality. */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.MemoryAutoDriveCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const valid=x=>typeof x==="string"&&x.trim().length>0;
 const trunc=(x,n=240)=>String(x??"").slice(0,n);
 const clean=x=>String(x??"").normalize("NFKC").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu,"");
 function overlap(a,b){
  const x=clean(a),y=clean(b);
  if(x.length<2||y.length<2)return 0;
  const grams=new Set();
  for(let i=0;i<x.length-1;i++)grams.add(x.slice(i,i+2));
  let hit=0;
  const seen=new Set();
  for(let i=0;i<y.length-1;i++){
   const g=y.slice(i,i+2);
   if(grams.has(g)&&!seen.has(g)){seen.add(g);hit++;}
  }
  return hit;
 }
 function directionOrigin(raw,current){
  const events=raw?.history;
  if(!Array.isArray(events))return {status:"unknown",ref:null};
  const changes=events.filter(e=>e?.kind==="direction").slice().sort((a,b)=>a.version-b.version);
  if(!changes.length)return {status:"not_recorded",ref:null};
  const first=changes[0],last=changes.at(-1);
  const validChain=changes.every((e,i)=>Number.isSafeInteger(e.version)&&e.version===i+1&&
   typeof e.before==="string"&&typeof e.after==="string"&&valid(e.id)&&
   (i===0?e.before==="":e.before===changes[i-1].after));
  if(!validChain||last.version!==current.version||last.after!==current.text)
   return {status:"unverified",ref:null};
  return {status:"history_consistent_local",ref:"memoryControls.history:"+first.id,
   originalExcerpt:trunc(first.after,200),currentVersion:last.version};
 }
 function relatedMemories(state,description){
  const matched=[];
  for(const m of state.memories){
   if(!m||!valid(m.id)||!Array.isArray(m.versions)||!m.versions.length)continue;
   const latest=m.versions.at(-1);
   if(!latest)continue;
   // Use ONLY the last APPROVED version for current context. Old versions remain
   // available in the vault for further reading; none is silently promoted.
   const text=[m.question,m.purpose,latest.content].join(" ");
   const hit=overlap(text,description);
   if(hit<2)continue;
   matched.push({ref:"memory:"+m.id,id:m.id,question:trunc(m.question,100),
    version:latest.number??m.versions.length,
    relation:"lexical_candidate",overlapHints:hit});
  }
  return matched.sort((a,b)=>b.overlapHints-a.overlapHints).slice(0,2);
 }
 function plan(state,opts={}){
  if(!state||!Array.isArray(state.memories)||!Array.isArray(state.candidates)||!Array.isArray(state.audit))
   throw Error("memory_drive_state_invalid");
  const direction=state.memoryControls===undefined?{text:"",version:0}:state.memoryControls?.direction;
  if(!direction||typeof direction.text!=="string"||!Number.isSafeInteger(direction.version)||direction.version<0)
   throw Error("memory_drive_direction_invalid");
  const origin=directionOrigin(state.memoryControls,direction);
  const out={mode:"LOCAL_IDEA_DRAFT_ONLY",sideEffects:false,alignment:"not_verified",
   direction:{available:valid(direction.text),version:direction.version,ref:"memoryControls.direction",
    summary:trunc(direction.text,500),origin},proposals:[]};
  if(!out.direction.available)return {...out,reason:"direction_not_set"};
  const seen=new Set(),rows=[],limit=Number.isInteger(opts.limit)?Math.max(1,Math.min(5,opts.limit)):4;
  const add=c=>{if(!seen.has(c.id)){seen.add(c.id);rows.push(c);}};
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
  if(!rows.length)add({id:"direction:"+direction.version,
   ref:"memoryControls.direction",type:"new_question",status:"idea_draft",
   title:"從現行記憶方向探索一個可反證問題",
   reason:"目前未發現可回接的未解工作、拒絕或待審項",
   next:"保留原目標，提出至少一個競爭解釋與可測反例",
   source:"memoryControls.direction"});
  const enriched=rows.map((row,i)=>{
   const desc=[row.title,row.reason,row.next].join(" ");
   const hit=overlap(direction.text,desc);
   return {...row,directionRef:out.direction.ref,directionVersion:direction.version,
    originalGoalRef:origin.ref,fitHint:row.type==="new_question"?"DIRECTION_ANCHORED":
    hit>=2?"LEXICAL_CANDIDATE":"NEEDS_DIRECTION_REVIEW",
    matchedBigrams:hit,relatedApproved:relatedMemories(state,desc),_index:i};
  });
  // Rank direction-linked suggestions first. Do not discard the divergent ones.
  enriched.sort((a,b)=>
   Number(b.fitHint!=="NEEDS_DIRECTION_REVIEW")-Number(a.fitHint!=="NEEDS_DIRECTION_REVIEW")||
   a._index-b._index);
  // If every open item lacks even a lexical link, retain one divergent example
  // and a direction-anchored exploratory question instead of getting stuck.
  if(enriched.every(x=>x.fitHint==="NEEDS_DIRECTION_REVIEW")){
   enriched.unshift({id:"direction:"+direction.version,ref:out.direction.ref,
    type:"new_question",status:"idea_draft",title:"由原方向提出新反證問題",
    reason:"未解清單與原方向缺乏明確文字關聯，先研究方向本身",
    next:"查原始方向與歷史版本後，自由提出競爭機制或反例",
    source:"memoryControls.direction",directionRef:out.direction.ref,directionVersion:direction.version,
    originalGoalRef:origin.ref,fitHint:"DIRECTION_ANCHORED",matchedBigrams:0,
    relatedApproved:[]});
  }
  const focus=valid(opts.taskTitle)?trunc(opts.taskTitle,200):"";
  const focusHits=focus?overlap(direction.text,focus):0;
  const preflight=focus?{taskTitle:focus,directionRef:out.direction.ref,
   directionVersion:direction.version,originalGoalRef:origin.ref,
   fitHint:focusHits>=2?"LEXICAL_CANDIDATE":"NEEDS_DIRECTION_REVIEW",
   matchedBigrams:focusHits,
   relatedApproved:relatedMemories(state,focus),
   verdict:"not_verified_no_auto_execution"}:null;
  return {...out,reason:"direction_read",preflight,
   proposals:enriched.slice(0,limit).map(({_index,...r})=>r)};
 }
 return {plan};
});
