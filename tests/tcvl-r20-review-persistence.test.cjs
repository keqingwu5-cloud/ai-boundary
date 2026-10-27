"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {inspectForReviewPersistence}=require("../tcvl-r20-review-persistence.cjs");
const base=()=>({
 schema:"tcvl.review-receipt/v2-candidate",purpose:"reserve_for_independent_review",
 claim_status:"review_requested",project_id:"proj",task_id:"task",
 node_id:"node",origin_command_id:"origin",direction_version:"v2",
 request_id:"req",audience:"isolated-review",permissions_scope:["read"],
 evidence_digest:"a".repeat(64),approver_id:"synthetic",key_id:"synthetic-key",
 receipt_id:"receipt",nonce:"nonce",issued_at:"2026-10-27T09:00:00.000Z",
 expires_at:"2026-10-27T09:05:00.000Z"
});
const expected=()=>({
 project_id:"proj",task_id:"task",node_id:"node",origin_command_id:"origin",
 direction_version:"v2",request_id:"req",audience:"isolated-review",
 permissions_scope:["read"],evidence_digest:"a".repeat(64)
});
const NOW="2026-10-27T09:02:00.000Z";
const check=(envelope=base(),expectedTask=expected(),now=NOW)=>inspectForReviewPersistence({envelope,expected:expectedTask,now});
const blocked=x=>{assert.equal(x.execution_allowed,false);assert.equal(x.verified_owner_approval,false);
 assert.equal(x.verified_gpt2_ack,false);assert.equal(x.trusted_root_verified,false);
 assert.equal(x.atomic_consume_verified,false);assert.equal(x.requires_independent_g2,true);};
test("R20 valid synthetic v2 only creates an UNTRUSTED review persistence proposal",()=>{
 const r=check();assert.equal(r.status,"UNTRUSTED_REVIEW_RECORD_PROPOSAL_ONLY");
 assert.equal(r.persist_for_review,true);blocked(r);
 assert.match(r.envelope_digest,/^[0-9a-f]{64}$/);
 assert.equal(r.receipt_id,"receipt");assert.equal(r.nonce,"nonce");
 assert.equal(r.verified_signature,false);
});
test("R20 caller-supplied attestation flags cannot elevate or even construct persisted proposal",()=>{
 for(const extra of [{verified_signature:true},{execution_allowed:true},{trusted_root_verified:true},
 {owner_approved:true},{signed_by_owner:true}]){
  const r=check({...base(),...extra});
  assert.equal(r.status,"BLOCKED_INVALID_REVIEW_BINDING");blocked(r);
 }
});
test("R20 no expected task or unverified expected source fails closed",()=>{
 for(const exp of [null,{}, {...expected(),verified:true}]){
  const r=check(base(),exp);assert.equal(r.status,"BLOCKED_INVALID_REVIEW_BINDING");blocked(r);
 }
});
test("R20 stale, not-yet-issued, exactly expired and invalid current clocks reject",()=>{
 for(const n of ["2026-10-27T08:59:59.999Z","2026-10-27T09:05:00.000Z",
   "2026-10-27T10:00:00.000Z","invalid"]){
  const r=check(base(),expected(),n);assert.equal(r.status,"BLOCKED_UNTRUSTED_TIME_WINDOW");blocked(r);
 }
});
test("R20 different task, scope or evidence cannot form same review binding",()=>{
 const names=["task_id","node_id","origin_command_id","permissions_scope","evidence_digest",
 "project_id","direction_version","audience"];
 for(const n of names){
  const e=base();e[n]=n==="permissions_scope"?["write"]:n==="evidence_digest"?"b".repeat(64):"other";
  const x=check(e);assert.equal(x.status,"BLOCKED_INVALID_REVIEW_BINDING",n);blocked(x);
 }
});
test("R20 envelope digest changes when any signed identity changes even with matching expected",()=>{
 const orig=check();
 const mutated=base(),exp=expected();
 mutated.node_id="different";exp.node_id="different";
 const n=check(mutated,exp);
 assert.equal(n.status,"UNTRUSTED_REVIEW_RECORD_PROPOSAL_ONLY");
 assert.notEqual(n.envelope_digest,orig.envelope_digest);
 blocked(n);
});
test("R20 legacy R11 v1 variants cannot be persisted through candidate boundary",()=>{
 for(const schema of ["tcvl-approval-receipt/v1","tcvl.diffusion.approval-receipt.v1"]){
  const x=check({...base(),schema});assert.equal(x.status,"BLOCKED_INVALID_REVIEW_BINDING");blocked(x);
 }
});
test("R20 query result redacts raw source claims, PEM key or evidence metadata",()=>{
 const r=check();
 const s=JSON.stringify(r);
 assert.equal(s.includes("synthetic-key"),false);
 assert.equal(s.includes("synthetic"),false);
 assert.equal(s.includes("BEGIN PUBLIC KEY"),false);
 assert.equal(s.includes("a".repeat(64)),false);
 blocked(r);
});
test("R20 cannot turn missing signature verifier into a supposed valid authorization",()=>{
 const x=check();assert.equal(x.verified_signature,false);blocked(x);
 assert.equal(x.execution_allowed,false);
});
