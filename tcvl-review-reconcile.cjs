"use strict";
/*
 * R14: reconciliation of a CALLER-SUPPLIED observation after lost DB reply.
 * Not a trusted DB adapter, not a durable audit proof, not an authorization.
 * No network/IO, no automated retry, never launch or dispatch anything.
 */
const ID=/^[A-Za-z0-9_.:-]{1,120}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const KEYS=Object.freeze(["receipt_id","project_id","key_id","direction_version","evidence_digest"]);
const ROW_KEYS=Object.freeze([...KEYS,"stage"]);
const record=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&
 keys.every(k=>Object.hasOwn(x,k));
function result(status){
 return {
  status,
  automatic_retry_allowed:false,
  verified_owner_approval:false,
  verified_gpt2_ack:false,
  execution_allowed:false,
  authoritative_source_verified:false,
  cross_cluster_durability_verified:false,
  requires_independent_g2:true,
  outcome_evidence:"UNTRUSTED_CALLER_READBACK_REVIEW_ONLY"
 };
}
function validIdentities(x,keys){
 return keys.every(k=>k==="evidence_digest"?
  typeof x[k]==="string"&&DIGEST.test(x[k]):
  typeof x[k]==="string"&&ID.test(x[k]));
}
function reconcileReviewReadback({requested,observed}={}){
 if(!exact(requested,KEYS)||!validIdentities(requested,KEYS))
  return result("BLOCKED_INVALID_REVIEW_REQUEST");
 if(observed===null || observed===undefined)
  return result("REVIEW_UNKNOWN_MANUAL_RECHECK");
 if(!exact(observed,ROW_KEYS)||!validIdentities(observed,KEYS)||
    observed.stage!=="review_reserved")
  return result("BLOCKED_INVALID_REVIEW_READBACK");
 if(KEYS.some(k=>requested[k]!==observed[k]))
  return result("BLOCKED_CONFLICTING_REVIEW_EVIDENCE");
 // This describes matching caller-supplied metadata; not independent DB
 // authenticity, delivery, stable HA persistence, or owner acceptance.
 return result("REVIEW_COMMITTED_OBSERVED_AUTHORITY_UNVERIFIED");
}
module.exports={reconcileReviewReadback};
