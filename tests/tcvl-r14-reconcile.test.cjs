"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {reconcileReviewReadback}=require("../tcvl-review-reconcile.cjs");
const sha="b".repeat(64);
const request=()=>({
 receipt_id:"unknown-response-r14",project_id:"demo-project",
 key_id:"key-r14",direction_version:"v1",
 evidence_digest:sha
});
const row=()=>({...request(),stage:"review_reserved"});
const check=(observed,req=request())=>reconcileReviewReadback({requested:req,observed});
function neverPromote(result){
 assert.equal(result.execution_allowed,false);
 assert.equal(result.automatic_retry_allowed,false);
 assert.equal(result.verified_owner_approval,false);
 assert.equal(result.verified_gpt2_ack,false);
}
test("R14 unknown outcome plus exact durable metadata match is only a review observation",()=>{
 const x=check(row());
 assert.equal(x.status,"REVIEW_COMMITTED_OBSERVED_AUTHORITY_UNVERIFIED");
 neverPromote(x);
 assert.equal(JSON.stringify(x).includes(sha),false);
});
test("R14 no readback does not mean previous transaction failed or automatic retry safe",()=>{
 const x=check(null);
 assert.equal(x.status,"REVIEW_UNKNOWN_MANUAL_RECHECK");
 neverPromote(x);
});
test("R14 same receipt key but conflicting project or direction is a hard conflict",()=>{
 for(const k of ["project_id","direction_version","key_id","evidence_digest"]){
  const r=row();r[k]=k==="evidence_digest"?"c".repeat(64):"other";
  const x=check(r);
  assert.equal(x.status,"BLOCKED_CONFLICTING_REVIEW_EVIDENCE",k);
  neverPromote(x);
 }
});
test("R14 explicit role or state called approved must never be accepted as review record",()=>{
 const x=check({...row(),stage:"approved"});
 assert.equal(x.status,"BLOCKED_INVALID_REVIEW_READBACK");
 neverPromote(x);
});
test("R14 forged execution flags do not grant authorization",()=>{
 const x=check({...row(),execution_allowed:true,verified_owner_approval:true});
 assert.equal(x.status,"BLOCKED_INVALID_REVIEW_READBACK");
 neverPromote(x);
});
test("R14 malformed receipt ID, untrusted source and changed evidence fields fail closed",()=>{
 const bad=request();bad.receipt_id="../escape";
 const x=check(row(),bad);
 assert.equal(x.status,"BLOCKED_INVALID_REVIEW_REQUEST");
 neverPromote(x);
 const y=check({...row(),receipt_id:"different-id"});
 assert.equal(y.status,"BLOCKED_CONFLICTING_REVIEW_EVIDENCE");
 neverPromote(y);
});
test("R14 extra fields or missing digest cannot be silently normalized",()=>{
 const a=check({...row(),payload:"hidden"});
 assert.equal(a.status,"BLOCKED_INVALID_REVIEW_READBACK");
 const b=row();delete b.evidence_digest;
 assert.equal(check(b).status,"BLOCKED_INVALID_REVIEW_READBACK");
 neverPromote(a);
});
test("R14 durable readback contract does not pretend independent DB trust attestation",()=>{
 const r=check(row());
 assert.equal(r.authoritative_source_verified,false);
 assert.equal(r.cross_cluster_durability_verified,false);
 assert.equal(r.requires_independent_g2,true);
 neverPromote(r);
});
