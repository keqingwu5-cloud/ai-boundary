/* Isolated, pure adapter: PR28 reviewed metadata -> PR42 candidate contract.
   No transport, storage, authorization grants or ACK creation. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./tcvl-data-room-core.js'):root.TcvlDataRoomCore,typeof module==='object'&&module.exports?require('./handoff-contract.js'):root.HandoffContract);if(typeof module==='object'&&module.exports)module.exports=api;else root.TcvlHandoffAdapter=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Room,Contract){
'use strict';
function required(v,k){if(typeof v!=='string'||!v.trim())throw Error(k+' required');return v.trim();}
function convert(room,submissionId,opts){
 Room.assertRoom(room);
 const s=room.submissions.find(x=>x.id===submissionId);
 if(!s)throw Error('submission not found');
 if(s.reviewState!=='approved_for_archive')throw Error('human review required');
 if(!s.reviews.some(x=>x.decision==='approved_for_archive'))throw Error('review evidence missing');
 const originals=s.originalIds.map(id=>room.originals.find(x=>x.id===id));
 if(originals.some(x=>!x||!x.version||!x.custodian))throw Error('original provenance missing');
 if(opts.permission_verified!==true||opts.policy_verified!==true)throw Error('independent authorization required');
 for(const k of ['task_id','event_id','correlation_id','attempt_id','idempotency_key','source_agent_id','source_endpoint_id','destination_agent_id','destination_endpoint_id','payload_version','payload_digest','user_original_goal'])required(opts[k],k);
 if(!/^[a-f0-9]{64}$/.test(opts.payload_digest))throw Error('digest invalid');
 const resource=Contract.parseResourceUrl(required(opts.resource_url,'resource_url'));
 const event={schema:Contract.SCHEMA,task_id:opts.task_id,event_id:opts.event_id,correlation_id:opts.correlation_id,attempt_id:opts.attempt_id,idempotency_key:opts.idempotency_key,source_agent_id:opts.source_agent_id,source_endpoint_id:opts.source_endpoint_id,destination_agent_id:opts.destination_agent_id,destination_endpoint_id:opts.destination_endpoint_id,payload_version:opts.payload_version,payload_digest:opts.payload_digest,user_original_goal:opts.user_original_goal,resource,state:'candidate'};
 Contract.validateEvent(event);
 const audit={projectId:room.projectId,batchId:room.batchId,submissionId:s.id,originals:originals.map(x=>({id:x.id,version:x.version})),reviewState:s.reviewState,permission_verified:true,policy_verified:true,ack_status:'unverified'};
 return {event,audit};
}
return Object.freeze({convert});
});