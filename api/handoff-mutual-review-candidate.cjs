'use strict';
// Isolated handoff self-review candidate; no remote ACK is fabricated.
const crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function prepare({event_id,correlation_id,source,destination,payload_version,payload,source_evidence}){
  const errors=[];
  for(const [k,v] of Object.entries({event_id,correlation_id,source,destination,payload_version,source_evidence}))if(typeof v!=='string'||!v.trim())errors.push('missing_'+k);
  if(!payload||typeof payload!=='object'||Array.isArray(payload))errors.push('invalid_payload');
  if(source===destination)errors.push('same_endpoint');
  if(errors.length)return {state:'blocked',errors};
  const envelope={event_id,correlation_id,source,destination,payload_version,payload,source_evidence};
  return {state:'queued',envelope,digest:hash(envelope),self_review:{role:source,checks:['required_fields','source_evidence','destination','digest'],passed:true}};
}
function review({prepared,received,receiver,receiver_evidence}){
  const contradictions=[];
  if(prepared?.state!=='queued'||!prepared.envelope)contradictions.push('sender_not_ready');
  if(!received||typeof received!=='object')contradictions.push('missing_received_payload');
  if(!receiver||receiver!==prepared?.envelope?.destination)contradictions.push('wrong_receiver');
  if(!receiver_evidence||typeof receiver_evidence!=='string')contradictions.push('missing_receiver_evidence');
  if(prepared?.envelope&&received&&hash(received)!==prepared.digest)contradictions.push('payload_mismatch');
  return {state:contradictions.length?'blocked':'reviewed_candidate',contradictions,receiver_review:{role:receiver||null,evidence:receiver_evidence||null},actual_ack:false};
}
function verifyAck({prepared,reviewed,ack}){
  const errors=[];
  if(prepared?.state!=='queued'||reviewed?.state!=='reviewed_candidate')errors.push('review_not_complete');
  if(!ack||ack.event_id!==prepared?.envelope?.event_id||ack.correlation_id!==prepared?.envelope?.correlation_id)errors.push('ack_identity_mismatch');
  if(!ack||ack.digest!==prepared?.digest)errors.push('ack_digest_mismatch');
  if(!ack||ack.source!==prepared?.envelope?.destination||ack.destination!==prepared?.envelope?.source)errors.push('ack_direction_mismatch');
  if(!ack||!ack.independent_receipt_ref||!ack.verified_identity)errors.push('unverified_receiver_ack');
  return {state:errors.length?'blocked':'ack_candidate_requires_external_verification',errors,actual_ack:false};
}
// Direction-neutral wrappers: either peer may originate an event and must review the return path.
function exchange({sender,receiver,forward,reverse}){
  const errors=[];
  if(!sender||!receiver||sender===receiver)errors.push('invalid_peers');
  const inspect=(event,from,to,label)=>{
    if(!event)return {state:'blocked',errors:['missing_'+label]};
    const prepared=prepare(event);
    if(prepared.state!=='queued')return prepared;
    if(prepared.envelope.source!==from||prepared.envelope.destination!==to)return {state:'blocked',errors:['direction_mismatch']};
    return prepared;
  };
  const outbound=inspect(forward,sender,receiver,'forward');
  const inbound=inspect(reverse,receiver,sender,'reverse');
  if(outbound.state!=='queued')errors.push('forward_not_ready');
  if(inbound.state!=='queued')errors.push('reverse_not_ready');
  if(outbound.digest&&inbound.digest&&outbound.envelope.event_id===inbound.envelope.event_id)errors.push('event_id_reused_across_directions');
  return {state:errors.length?'blocked':'bidirectional_queued_candidate',errors,forward:outbound,reverse:inbound,actual_ack:false};
}
module.exports={prepare,review,verifyAck,exchange};
