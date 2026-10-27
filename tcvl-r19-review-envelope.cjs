"use strict";
/*
 * R19 G1 schema convergence DRAFT. This is a shape checker only:
 * no signing, no signature verification, no key registry, no trust root,
 * no PostgreSQL integration and absolutely NO execution or approval path.
 *
 * The two R11 v1 implementations are not wire-compatible. A "valid" v2
 * synthetic shape may only be sent to independent contract review.
 */
const SCHEMA="tcvl.review-receipt/v2-candidate";
const PURPOSE="reserve_for_independent_review";
const CLAIM_STATUS="review_requested";
const FIELDS=Object.freeze([
 "schema","purpose","claim_status","project_id","task_id","node_id",
 "origin_command_id","direction_version","request_id","audience",
 "permissions_scope","evidence_digest","approver_id","key_id","receipt_id",
 "nonce","issued_at","expires_at"
]);
const EXPECTED=Object.freeze([
 "project_id","task_id","node_id","origin_command_id","direction_version",
 "request_id","audience","permissions_scope","evidence_digest"
]);
const LEGACY=Object.freeze([
 "tcvl-approval-receipt/v1",
 "tcvl.diffusion.approval-receipt.v1"
]);
const ID=/^[A-Za-z0-9_.:-]{1,120}$/;
const HEX64=/^[0-9a-f]{64}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
function record(x){return !!x&&typeof x==="object"&&!Array.isArray(x);}
function keysEqual(x,keys){
 return record(x)&&Object.keys(x).length===keys.length&&
  keys.every(k=>Object.hasOwn(x,k));
}
function validScope(s){
 return Array.isArray(s)&&s.length>0&&s.length<=24&&
   s.every(x=>typeof x==="string"&&ID.test(x))&&
   s.every((x,i)=>i===0||s[i-1]<x);
}
function validDate(s){
 if(typeof s!=="string"||!ISO.test(s))return NaN;
 const n=Date.parse(s);
 return Number.isFinite(n)&&new Date(n).toISOString()===s?n:NaN;
}
function response(status){
 return Object.freeze({
  status,
  approved_for_migration:false,
  verified_signature:false,
  trusted_source_verified:false,
  atomic_replay_verified:false,
  verified_owner_approval:false,
  verified_gpt2_ack:false,
  execution_allowed:false,
  requires_independent_g2:true
 });
}
function assessUnifiedReviewEnvelope({envelope,expected}={}){
 try{
  // Even a perfectly-shaped v1 wrapper with a v2-looking body is never
  // accepted as v2 without a separately approved conversion/migration.
  if(record(envelope)&&LEGACY.includes(envelope.schema))
    return response("BLOCKED_LEGACY_SCHEMA_REQUIRES_MIGRATION");
  if(!keysEqual(envelope,FIELDS)||envelope.schema!==SCHEMA||
     envelope.purpose!==PURPOSE||envelope.claim_status!==CLAIM_STATUS)
    return response("BLOCKED_INVALID_ENVELOPE");
  const ids=FIELDS.filter(k=>![
   "schema","purpose","claim_status","permissions_scope","evidence_digest",
   "issued_at","expires_at"].includes(k));
  if(!ids.every(k=>typeof envelope[k]==="string"&&ID.test(envelope[k]))||
     !HEX64.test(envelope.evidence_digest)||!validScope(envelope.permissions_scope))
    return response("BLOCKED_INVALID_ENVELOPE");
  const issued=validDate(envelope.issued_at),expires=validDate(envelope.expires_at);
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||
     expires<=issued||expires-issued>600000)
    return response("BLOCKED_INVALID_ENVELOPE");
  if(!keysEqual(expected,EXPECTED)||
     !EXPECTED.filter(k=>k!=="permissions_scope"&&k!=="evidence_digest")
       .every(k=>typeof expected[k]==="string"&&ID.test(expected[k]))||
     !HEX64.test(expected.evidence_digest)||!validScope(expected.permissions_scope))
    return response("BLOCKED_EXPECTED_CONTRACT_MISSING");
  for(const k of EXPECTED)if(JSON.stringify(envelope[k])!==JSON.stringify(expected[k]))
    return response("BLOCKED_TASK_OR_EVIDENCE_MISMATCH");
  // This returns only a syntactically aligned contract preview. Calling code
  // must not treat status or claim_status as signature/owner authorization.
  return response("READY_FOR_CONTRACT_REVIEW_NOT_AUTHORIZED");
 }catch(_){return response("BLOCKED_INVALID_ENVELOPE");}
}
module.exports=Object.freeze({SCHEMA,PURPOSE,FIELDS,EXPECTED,LEGACY,assessUnifiedReviewEnvelope});
