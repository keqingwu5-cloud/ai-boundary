"use strict";
/* Pre-split read-only impact preview for the independent encrypted memory vault.
 * It neither persists data nor approves, archives, deletes, dispatches or infers semantics. */
(function(root,factory){
 const api=factory();
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.MemoryImpactCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 const allowed=new Set(["new_question","revise_answer","revise_question","pitfall"]);
 const directions=new Set(["unassessed","aligned","divergent_keep"]);
 const str=x=>typeof x==="string";
 const same=(a,b)=>a===b;
 function preview(state,candidate,options={}){
   if(!state||!Array.isArray(state.memories)||!Array.isArray(state.candidates)||
      !candidate||!allowed.has(candidate.eventType))throw Error("impact_input_invalid");
   const blocks=[],warnings=[],impacted=[],affectedCandidates=[];
   const controls=state.memoryControls;
   const directionVersion=controls?.direction?.version??0;
   const thresholdVersion=controls?.threshold?.version??0;
   if(controls!==undefined&&(!controls||!controls.direction||!controls.threshold))blocks.push("CONTROLS_INVALID");
   if(!Number.isSafeInteger(directionVersion)||!Number.isSafeInteger(thresholdVersion)||
      directionVersion<0||thresholdVersion<0)blocks.push("CONTROLS_INVALID");
   const relation=options.directionRelation||"unassessed";
   if(!directions.has(relation))throw Error("impact_relation_invalid");
   if(options.expectedVaultRevision!==undefined&&options.expectedVaultRevision!==state.revision)
     blocks.push("STALE_VAULT_REVISION");
   if(options.expectedDirectionVersion!==undefined&&options.expectedDirectionVersion!==directionVersion)
     blocks.push("STALE_DIRECTION_VERSION");
   if(options.expectedThresholdVersion!==undefined&&options.expectedThresholdVersion!==thresholdVersion)
     blocks.push("STALE_THRESHOLD_VERSION");
   if(!str(candidate.question)||!candidate.question.trim()||!str(candidate.content)||!candidate.content.trim())
     blocks.push("EMPTY_PROPOSAL");
   const parentId=candidate.parentId||null;
   const parent=parentId?state.memories.find(x=>x&&x.id===parentId):null;
   if(parentId&&!parent)blocks.push("PARENT_MISSING");
   if(["revise_answer","revise_question"].includes(candidate.eventType)&&!parent)
     blocks.push("REVISION_REQUIRES_PARENT");
   if(parent)impacted.push(parent.id);
   if(candidate.eventType==="revise_question")warnings.push("NEW_BRANCH_PRESERVE_PARENT");
   if(candidate.eventType==="revise_answer"&&parent&&
      (candidate.question!==parent.question||candidate.purpose!==parent.purpose))
     blocks.push("ANSWER_CANNOT_REWRITE_QUESTION");
   const originId=candidate.originId;
   if(originId!==undefined&&(!str(originId)||!originId.trim()))blocks.push("INVALID_ORIGIN_ID");
   if(originId){
     const prior=state.candidates.find(x=>x&&x.originId===originId);
     if(prior){
       if(same(prior.question,candidate.question)&&same(prior.content,candidate.content))
         warnings.push("EXACT_ORIGIN_DUPLICATE");
       else blocks.push("SOURCE_ID_CONTENT_CONFLICT");
       affectedCandidates.push(prior.id);
     }
   } else warnings.push("SOURCE_ID_UNVERIFIED");
   if(relation==="unassessed")warnings.push("DIRECTION_NOT_ASSESSED");
   if(relation==="divergent_keep")warnings.push("DIVERGENT_BUT_PRESERVED");
   const sameQuestion=state.memories.filter(x=>x&&x.question===candidate.question);
   for(const m of sameQuestion){
     if(!impacted.includes(m.id))impacted.push(m.id);
     if(m.id!==parentId)warnings.push("SIMILAR_EXISTING_TOPIC_REVIEW");
   }
   const blocked=blocks.length>0;
   return {
     schema:"ai-boundary.memory-impact-preview.v1",kind:"candidate",
     outcome:blocked?"blocked":warnings.length?"manual_review":"candidate_only",
     canSaveCandidate:!blocked,canApprove:false,canDispatch:false,
     vaultId:str(state.vaultId)?state.vaultId:null,
     vaultRevision:Number.isSafeInteger(state.revision)?state.revision:null,
     directionVersion,thresholdVersion,directionRelation:relation,
     parentId,originId:originId||null,
     affectedMemoryIds:impacted,affectedCandidateIds:affectedCandidates,
     blocks:[...new Set(blocks)],warnings:[...new Set(warnings)]
   };
 }
 return {preview};
});
