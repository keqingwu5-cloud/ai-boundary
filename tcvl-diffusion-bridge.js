/* Candidate-only bridge from diffusion decisions to existing TCVL platform.
   No transport, real worker, permissions grant or ACK. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./tcvl-platform-core.js'):root.TcvlPlatformCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.TcvlDiffusionBridge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(platform){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function applyCandidate(workspace,decision,{projectId,at}){
 if(!workspace||!Array.isArray(workspace.projects)||!workspace.projects.some(p=>p.id===projectId))throw Error('project missing');
 if(!decision||!['candidate','reuse','stop'].includes(decision.action))throw Error('invalid diffusion decision');
 if(decision.action==='stop')return {workspace:clone(workspace),result:'stopped'};
 if(decision.action==='reuse')return {workspace:clone(workspace),result:'reuse_requires_review',node_id:decision.node_id,verified_approval:false};
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
 if(workspace.tasks.some(t=>t.id===id))return {workspace:clone(workspace),result:'already_queued',task_id:id};
 const w=platform.addTask(workspace,{id,projectId,title,owner,reason,at});
 return {workspace:w,result:'queued_for_review',task_id:id};
}
return Object.freeze({applyCandidate,planChildTask});
});