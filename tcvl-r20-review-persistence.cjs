"use strict";
/*
 * R20 G1: STRICTLY UNTRUSTED metadata candidate boundary.
 * Only validates a v2 DRAFT envelope against a caller-provided expected
 * record. Does NOT verify signatures, owner authorization, G2, trust roots,
 * revocation, atomicity, DB origin, ledger transactions, or worker access.
 */
const crypto=require("node:crypto");
const {FIELDS,assessUnifiedReviewEnvelope}=
 require("./tcvl-r19-review-envelope.cjs");
const TIME=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
function outcome(status,digest=null,receipt=null,nonce=null){
 const base={status,persist_for_review:false,
  verified_signature:false,trusted_root_verified:false,
  verified_owner_approval:false,verified_gpt2_ack:false,
  atomic_consume_verified:false,execution_allowed:false,
  requires_independent_g2:true,
  evidence_source:"CALLER_SUPPLIED_UNTRUSTED_CANDIDATE_ONLY"};
 if(status==="UNTRUSTED_REVIEW_RECORD_PROPOSAL_ONLY"){
  base.persist_for_review=true; // Only permits candidate-only metadata submission.
  base.envelope_digest=digest;
  base.receipt_id=receipt;
  base.nonce=nonce;
 }
 return Object.freeze(base);
}
function strictTime(x){
 if(typeof x!=="string"||!TIME.test(x))return NaN;
 const parsed=Date.parse(x);
 return Number.isFinite(parsed)&&new Date(parsed).toISOString()===x?parsed:NaN;
}
function inspectForReviewPersistence({envelope,expected,now}={}){
 try{
  const shape=assessUnifiedReviewEnvelope({envelope,expected});
  if(shape.status!=="READY_FOR_CONTRACT_REVIEW_NOT_AUTHORIZED")
   return outcome("BLOCKED_INVALID_REVIEW_BINDING");
  const ts=strictTime(now);
  if(!Number.isFinite(ts)||ts<strictTime(envelope.issued_at)||
     ts>=strictTime(envelope.expires_at))
   return outcome("BLOCKED_UNTRUSTED_TIME_WINDOW");
  // This digest is an untrusted content-identity comparison, NOT a signed
  // attestation or proof that the caller's "expected" task is authoritative.
  const canonical=Object.fromEntries(FIELDS.map(k=>[k,envelope[k]]));
  const digest=crypto.createHash("sha256")
    .update("TCVL-REVIEW-METADATA-DRAFT-R20\0"+JSON.stringify(canonical),"utf8")
    .digest("hex");
  return outcome("UNTRUSTED_REVIEW_RECORD_PROPOSAL_ONLY",
    digest,envelope.receipt_id,envelope.nonce);
 }catch(_){return outcome("BLOCKED_INVALID_REVIEW_BINDING");}
}
module.exports=Object.freeze({inspectForReviewPersistence});
