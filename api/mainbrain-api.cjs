'use strict';
/* Candidate API core. Storage/auth are mandatory injected server-side adapters. */
const crypto=require('node:crypto');
const STATES=new Set(['queued','leased','executed','ack_received','failed','blocked']);
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function err(code,message){const e=new Error(message);e.code=code;return e;}
function identity(principal,scope){if(!principal||principal.verified!==true||!principal.endpoint_id||!Array.isArray(principal.scopes)||!principal.scopes.includes(scope))throw err('UNAUTHORIZED','Verified endpoint with required scope is required');return principal.endpoint_id;}
function createApi({store,authenticate,clock=()=>new Date().toISOString()}){
 if(!store||!authenticate)throw Error('Persistent store and trusted authentication adapter required');
 const auth=async(req,scope)=>identity(await authenticate(req),scope);
 return {
 async send(req){const actor=await auth(req,'tasks:send'),p=req.body||{};for(const k of ['event_id','task_id','destination_endpoint_id','idempotency_key','payload_version'])if(typeof p[k]!=='string'||!p[k])throw err('BAD_REQUEST',k+' required');if(!p.payload||typeof p.payload!=='object'||Array.isArray(p.payload))throw err('BAD_REQUEST','payload object required');if(p.destination_endpoint_id===actor)throw err('BAD_REQUEST','source and destination must differ');const digest=sha(p.payload);return store.enqueue({event_id:p.event_id,task_id:p.task_id,source_endpoint_id:actor,destination_endpoint_id:p.destination_endpoint_id,idempotency_key:p.idempotency_key,payload_version:p.payload_version,payload_digest:digest,payload:p.payload,state:'queued',created_at:clock()});},
 async receive(req){const actor=await auth(req,'tasks:receive');return store.lease({destination_endpoint_id:actor,now:clock()});},
 async execute(req){const actor=await auth(req,'tasks:execute');const p=req.body||{};if(!p.event_id||!p.attempt_id||!p.execution_evidence)throw err('BAD_REQUEST','event_id, attempt_id and execution_evidence required');return store.markExecuted({event_id:p.event_id,attempt_id:p.attempt_id,endpoint_id:actor,execution_evidence:p.execution_evidence,now:clock()});},
 async ack(req){const actor=await auth(req,'tasks:ack');const p=req.body||{};for(const k of ['event_id','attempt_id','payload_digest','payload_version','receipt_evidence'])if(typeof p[k]!=='string'||!p[k])throw err('BAD_REQUEST',k+' required');return store.ack({event_id:p.event_id,attempt_id:p.attempt_id,payload_digest:p.payload_digest,payload_version:p.payload_version,endpoint_id:actor,receipt_evidence:p.receipt_evidence,now:clock(),channel:'api'});},
 async status(req){const actor=await auth(req,'tasks:status');if(!req.params?.event_id)throw err('BAD_REQUEST','event_id required');const record=await store.get(req.params.event_id);if(!record)throw err('NOT_FOUND','event not found');if(![record.source_endpoint_id,record.destination_endpoint_id].includes(actor))throw err('FORBIDDEN','event not accessible');return record;},
 async fail(req){const actor=await auth(req,'tasks:execute');const p=req.body||{};if(!p.event_id||!p.attempt_id||!p.reason)throw err('BAD_REQUEST','event_id, attempt_id and reason required');return store.fail({event_id:p.event_id,attempt_id:p.attempt_id,endpoint_id:actor,reason:p.reason,now:clock()});}
 };
}
module.exports={createApi,identity,sha,STATES};
