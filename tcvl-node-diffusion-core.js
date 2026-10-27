/* Pure candidate-only node diffusion planner. No I/O, mutation, worker creation or permissions grant. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TcvlNodeDiffusionCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,120}$/.test(x);
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const safe=x=>JSON.parse(JSON.stringify(x));
function decide({parent,request,nodes=[],tasks=[],limits={}}){
 if(!parent||!id(parent.id)||!id(parent.origin_command_id)||!id(parent.direction_version))throw Error('parent provenance missing');
 if(!request||!id(request.id)||!nonempty(request.reason)||!Array.isArray(request.capabilities)||!request.capabilities.length||request.capabilities.some(x=>!id(x)))throw Error('invalid request');
 if(!Array.isArray(nodes)||!Array.isArray(tasks))throw Error('invalid registry');
 if(request.permissions_scope!==undefined&&(!Array.isArray(request.permissions_scope)||
     request.permissions_scope.some(x=>!id(x))))throw Error('invalid request permission scope');
 const depth=Number.isInteger(parent.depth)?parent.depth:0;
 const maxDepth=Number.isInteger(limits.maxDepth)?limits.maxDepth:3;
 const maxChildren=Number.isInteger(limits.maxChildren)?limits.maxChildren:5;
 if(depth>=maxDepth)return {action:'stop',reason:'depth_limit',parent_id:parent.id};
 if(tasks.some(t=>t.diffusion_request_id===request.id)||nodes.some(n=>n.diffusion_request_id===request.id))return {action:'stop',reason:'duplicate_request',parent_id:parent.id};
 if(request.target_parent_id&&request.target_parent_id!==parent.id)return {action:'stop',reason:'parent_mismatch',parent_id:parent.id};
 if(request.permissions_scope&&request.permissions_scope.some(x=>!Array.isArray(parent.permissions_scope)||!parent.permissions_scope.includes(x)))return {action:'stop',reason:'permission_escalation',parent_id:parent.id};
 const seen=new Set([parent.id]);let cursor=parent;while(cursor&&cursor.parent_node_id){if(seen.has(cursor.parent_node_id))return {action:'stop',reason:'cycle',parent_id:parent.id};seen.add(cursor.parent_node_id);cursor=nodes.find(n=>n.id===cursor.parent_node_id);}
 // Reuse remains an advisory decision requiring independent review. Never
 // interpret matching capabilities as authority or an approval receipt.
 // Fail closed for missing origin direction, approval evidence or permissions.
 const needed=request.permissions_scope||[];
 const compatible=nodes.find(n=>n.id!==parent.id&&
   n.status==='active'&&n.approval_status==='approved'&&
   n.origin_command_id===parent.origin_command_id&&
   n.direction_version===parent.direction_version&&
   n.approval_direction_version===parent.direction_version&&
   n.approval_revoked!==true&&
   n.approval_revoked_at==null&&n.revoked_at==null&&
   Array.isArray(n.approval_evidence_refs)&&n.approval_evidence_refs.length>0&&
   n.approval_evidence_refs.every(x=>typeof x==='string'&&x.trim().length>0)&&
   Array.isArray(n.capabilities)&&request.capabilities.every(c=>n.capabilities.includes(c))&&
   Array.isArray(n.permissions_scope)&&needed.every(p=>n.permissions_scope.includes(p))&&
   n.permissions_scope.every(p=>Array.isArray(parent.permissions_scope)&&parent.permissions_scope.includes(p)));
 // This only proposes reuse. All approval fields come from an untrusted
 // candidate registry: actual authorization must be checked by a separately
 // approved trusted endpoint before ANY worker starts or permissions change.
 if(compatible)return {action:'reuse_proposal',node_id:compatible.id,parent_id:parent.id,
   request_id:request.id,requires_review:true,verified_approval:false,
   execution_allowed:false,approval_claim_status:'CLAIM_ONLY_NOT_VERIFIED'};
 const childCount=nodes.filter(n=>n.parent_node_id===parent.id&&n.status!=='stopped').length;
 if(childCount>=maxChildren)return {action:'stop',reason:'child_limit',parent_id:parent.id};
 return {action:'candidate',node:{id:parent.id+'.'+request.id,parent_node_id:parent.id,diffusion_request_id:request.id,origin_command_id:parent.origin_command_id,direction_version:parent.direction_version,depth:depth+1,capabilities:safe(request.capabilities),permissions_scope:[],status:'candidate',reason:request.reason,evidence_refs:safe(request.evidence_refs||[])},requires_review:true};
}
return Object.freeze({decide});
});