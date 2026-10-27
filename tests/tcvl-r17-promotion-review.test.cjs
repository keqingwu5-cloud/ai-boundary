"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assessPromotionReview}=require("../tcvl-promotion-review-gate.cjs");
const base=()=>({
 schema:"tcvl-promotion-review/v1",
 current_primary_id:"db-a",candidate_standby_id:"db-b",
 primary_state:"stopped",standby_state:"recovery",
 observed_fencing:{node_id:"db-a",power_off_claim:true},
 target_commit_lsn:"0/200",standby_replay_lsn:"0/200",
 observed_receipt_id:"receipt-r17",receipt_present_on_standby:true,
 observed_revoked_key_id:"key-revoked-r17",revocation_present_on_standby:true,
 observed_epoch:2
});
const call=v=>assessPromotionReview(v);
const denied=(v,status)=>{const r=call(v);assert.equal(r.status,status);assert.equal(r.promotion_allowed,false);assert.equal(r.execution_allowed,false);assert.equal(r.trusted_fencing_verified,false);assert.equal(r.requires_independent_g2,true);};
test("R17 all synthetic prerequisites are advisory only: never permission to promote",()=>{
 const r=call(base());
 assert.equal(r.status,"READY_FOR_INDEPENDENT_REVIEW_NOT_AUTHORIZED");
 assert.equal(r.promotion_allowed,false);
 assert.equal(r.execution_allowed,false);
 assert.equal(r.trusted_fencing_verified,false);
 assert.equal(r.requires_independent_g2,true);
});
test("R17 two active writers / dual primary is a hard split-brain block",()=>{
 const a=base();a.primary_state="active";a.standby_state="active";
 denied(a,"BLOCKED_SPLIT_BRAIN_OR_NOT_FENCED");
});
test("R17 old primary merely reported stopped without matching fencing cannot pass",()=>{
 const a=base();a.observed_fencing.node_id="db-c";
 denied(a,"BLOCKED_SPLIT_BRAIN_OR_NOT_FENCED");
 const b=base();b.observed_fencing.power_off_claim=false;
 denied(b,"BLOCKED_SPLIT_BRAIN_OR_NOT_FENCED");
});
test("R17 asynchronous standby behind recorded primary commit position is blocked",()=>{
 const a=base();a.standby_replay_lsn="0/1FF";
 denied(a,"BLOCKED_STANDBY_LAG_OR_UNCERTAIN_COMMIT");
});
test("R17 matching receipt is required independently of an optimistic LSN value",()=>{
 const a=base();a.receipt_present_on_standby=false;
 denied(a,"BLOCKED_UNRECONCILED_RECEIPT_OR_REVOKE");
});
test("R17 stale revocation on standby is a hard block, even with caught-up LSN",()=>{
 const a=base();a.revocation_present_on_standby=false;
 denied(a,"BLOCKED_UNRECONCILED_RECEIPT_OR_REVOKE");
});
test("R17 malformed, forged or missing source metadata fails closed",()=>{
 denied(null,"BLOCKED_INVALID_EVIDENCE");
 const a=base();a.schema="tcvl-promotion-review/v99";denied(a,"BLOCKED_INVALID_EVIDENCE");
 const b=base();b.claimed_execution_allowed=true;denied(b,"BLOCKED_INVALID_EVIDENCE");
 const c=base();delete c.observed_fencing;denied(c,"BLOCKED_INVALID_EVIDENCE");
 const d=base();d.target_commit_lsn="not-a-lsn";denied(d,"BLOCKED_INVALID_EVIDENCE");
});
test("R17 unknown or failed isolation cannot be promoted",()=>{
 const a=base();a.primary_state="unknown";denied(a,"BLOCKED_SPLIT_BRAIN_OR_NOT_FENCED");
 const b=base();b.standby_state="active";denied(b,"BLOCKED_SPLIT_BRAIN_OR_NOT_FENCED");
});
test("R17 non-monotonic or missing epoch is unverified",()=>{
 const a=base();a.observed_epoch=-1;denied(a,"BLOCKED_INVALID_EVIDENCE");
 const b=base();b.observed_epoch=0;denied(b,"BLOCKED_INVALID_EVIDENCE");
});
test("R17 same node cannot claim to be both current primary and standby",()=>{
 const a=base();a.candidate_standby_id="db-a";
 denied(a,"BLOCKED_INVALID_EVIDENCE");
});
test("R17 no response may convey a verified owner or G2 acknowledgement",()=>{
 for(const arg of [base(),null]){
  const r=call(arg);
  assert.equal(r.verified_owner_approval,false);
  assert.equal(r.verified_gpt2_ack,false);
  assert.equal(r.promotion_allowed,false);
  assert.equal(r.execution_allowed,false);
 }
});
