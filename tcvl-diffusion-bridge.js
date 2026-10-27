/* Candidate-only bridge from diffusion decisions to existing TCVL platform.
   No transport, real worker, permissions grant or ACK. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./tcvl-platform-core.js'):root.TcvlPlatformCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.TcvlDiffusionBridge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(platform){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function applyCandidate(workspace,decision,{projectId,at}){
 if(!workspace||!Array.isArray(workspace.projects)||!workspace.projects.some(p=>p.id===projectId))throw Error('project missing');
 if(!decision||!['candidate','reuse','reuse_proposal','stop'].includes(decision.action))throw Error('invalid diffusion decision');
 if(decision.action==='stop')return {workspace:clone(workspace),result:'stopped'};
 // Legacy 'reuse' had ambiguous semantics. Reject rather than silently
 // presenting it as approval, even when the caller claims verified_approval.
 if(decision.action==='reuse')return {workspace:clone(workspace),
   result:'blocked_unverified_legacy_reuse',verified_approval:false,execution_allowed:false};
 if(decision.action==='reuse_proposal'){
   if(!decision.node_id||!decision.requires_review)throw Error('reuse proposal provenance missing');
   return {workspace:clone(workspace),result:'reuse_requires_review',node_id:decision.node_id,
     verified_approval:false,execution_allowed:false,approval_claim_status:'CLAIM_ONLY_NOT_VERIFIED'};
 }
 const n=decision.node;
 if(!n||n.status!=='candidate'||(n.permissions_scope||[]).length||!n.origin_command_id||!n.direction_version)throw Error('candidate provenance or permissions invalid');
 if(!/^[A-Za-z0-9_.:-]+$/.test(n.id))throw Error('invalid candidate ID');
 const proposalId='diffusion:'+n.id;
 const previous=workspace.proposals.find(p=>p.id===proposalId);
 if(previous){
   if(previous.projectId!==projectId)throw Error('proposal_project_mismatch');
   if(previous.stage==='rejected')return {workspace:clone(workspace),result:'blocked_rejected_proposal',proposal_id:proposalId};
   return {workspace:clone(workspace),result:'already_proposed',proposal_id:proposalId};
 }
 let w=platform.addProposal(workspace,{id:proposalId,projectId,title:'Node candidate '+n.id,purpose:n.reason,fromNode:n.parent_node_id,at});
 w=platform.addLink(w,{id:'link:'+proposalId,from:n.parent_node_id,to:n.id,kind:'branch',at});
 return {workspace:w,result:'proposed',proposal_id:proposalId,link_id:'link:'+proposalId};
}
function planChildTask(workspace,{projectId,nodeId,requestId,title,reason,owner,at}){
 if(!workspace||!Array.isArray(workspace.proposals)||!Array.isArray(workspace.tasks)||
   !Array.isArray(workspace.projects))throw Error('workspace contract missing');
 if(!workspace.projects.some(p=>p.id===projectId))throw Error('project missing');
 const proposal=workspace.proposals.find(p=>p.id==='diffusion:'+nodeId);
 if(!proposal)throw Error('candidate node missing');
 // Presence alone is never authorization. Rejections and unknown/revoked
 // stages must be blocked BEFORE idempotent queue checks.
 if(proposal.projectId!==projectId)throw Error('proposal_project_mismatch');
 if(!['candidate','review','approved_plan'].includes(proposal.stage))
   throw Error('proposal state not approved for review queue: '+String(proposal.stage));
 const id='task:diffusion:'+requestId;
 const priorTask=workspace.tasks.find(t=>t.id===id);
 if(priorTask){
   // Idempotency is scoped to the original project. A global request ID
   // collision cannot be misreported as this project's completed queue step.
   if(priorTask.projectId!==projectId)throw Error('task_identity_conflict_cross_project');
   // Existing workspace tasks do not preserve the original node ID, so an
   // exact per-node idempotency claim cannot yet be independently established.
   return {workspace:clone(workspace),result:'already_queued_requires_origin_review',
     task_id:id,verified_same_node:false,execution_allowed:false};
 }
 const w=platform.addTask(workspace,{id,projectId,title,owner,reason,at});
 return {workspace:w,result:'queued_for_review',task_id:id};
}
return Object.freeze({applyCandidate,planChildTask});
});