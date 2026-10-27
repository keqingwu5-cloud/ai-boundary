"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {assessUnifiedReviewEnvelope}=require("../tcvl-r19-review-envelope.cjs");
const {SCHEMA:LEGACY_A,FIELDS:LEGACY_A_FIELDS}=require("../tcvl-approval-receipt-core.cjs");
const schemaB="tcvl.diffusion.approval-receipt.v1"; // PR #70 pinned at ce865da...
const fieldsB=["action","approver_id","audience","decision","direction_version","expires_at",
 "issued_at","node_id","nonce","origin_command_id","project_id","receipt_id",
 "request_id","schema","task_id"];
const full=()=>({
 schema:"tcvl.review-receipt/v2-candidate",
 purpose:"reserve_for_independent_review",
 claim_status:"review_requested",
 project_id:"p1",task_id:"t1",node_id:"n1",
 origin_command_id:"cmd1",direction_version:"v2",request_id:"r1",
 audience:"isolated-review",permissions_scope:["read"],
 evidence_digest:"a".repeat(64),approver_id:"synthetic-claimed",key_id:"synthetic-key",
 receipt_id:"receipt-r19",nonce:"once-r19",
 issued_at:"2026-10-27T08:50:00.000Z",expires_at:"2026-10-27T08:55:00.000Z"
});
const expect=()=>({
 project_id:"p1",task_id:"t1",node_id:"n1",origin_command_id:"cmd1",
 direction_version:"v2",request_id:"r1",audience:"isolated-review",
 permissions_scope:["read"],evidence_digest:"a".repeat(64)
});
const assess=(envelope=full(),expected=expect())=>assessUnifiedReviewEnvelope({envelope,expected});
const denied=r=>{
 assert.equal(r.execution_allowed,false);
 assert.equal(r.verified_owner_approval,false);
 assert.equal(r.verified_gpt2_ack,false);
 assert.equal(r.trusted_source_verified,false);
 assert.equal(r.atomic_replay_verified,false);
 assert.equal(r.requires_independent_g2,true);
};
test("R19 two R11 v1 schemas and canonical field sets are materially different",()=>{
 assert.equal(LEGACY_A,"tcvl-approval-receipt/v1");
 assert.notEqual(LEGACY_A,schemaB);
 assert.equal(LEGACY_A_FIELDS.includes("permissions_scope"),true);
 assert.equal(LEGACY_A_FIELDS.includes("evidence_digest"),true);
 assert.equal(LEGACY_A_FIELDS.includes("task_id"),false);
 assert.equal(fieldsB.includes("task_id"),true);
 assert.equal(fieldsB.includes("nonce"),true);
 assert.equal(fieldsB.includes("permissions_scope"),false);
 assert.equal(fieldsB.includes("evidence_digest"),false);
 assert.equal(fieldsB.includes("key_id"),false);
});
test("R19 syntactically complete synthetic v2 envelope is only ready for human contract review",()=>{
 const x=assess();
 assert.equal(x.status,"READY_FOR_CONTRACT_REVIEW_NOT_AUTHORIZED");
 denied(x);
 assert.equal(x.approved_for_migration,false);
 assert.equal(x.verified_signature,false);
});
test("R19 both legacy v1 schemas reject direct adoption to v2",()=>{
 for(const v of [LEGACY_A,schemaB]){
  const x=assess({...full(),schema:v});
  assert.equal(x.status,"BLOCKED_LEGACY_SCHEMA_REQUIRES_MIGRATION");
  denied(x);
 }
});
test("R19 no source can forge verified approvals or executable flags into envelope",()=>{
 for(const k of ["execution_allowed","verified_owner_approval","cryptographic_integrity","signature","signer_id"]){
  const x=assess({...full(),[k]:k==="signature"?"fake":true});
  assert.equal(x.status,"BLOCKED_INVALID_ENVELOPE",k);
  denied(x);
 }
});
test("R19 signed source claim is distinct from recognized authenticated trust root",()=>{
 const x=assess({...full(),approver_id:"owner-certified"});
 assert.equal(x.status,"READY_FOR_CONTRACT_REVIEW_NOT_AUTHORIZED");
 denied(x);
});
test("R19 every task identity, scope and source evidence must match independent expected contract",()=>{
 for(const k of ["project_id","task_id","node_id","origin_command_id","direction_version",
  "request_id","audience","evidence_digest"]){
  const p=full();
  p[k]=k==="evidence_digest"?"b".repeat(64):"different";
  const x=assess(p);
  assert.equal(x.status,"BLOCKED_TASK_OR_EVIDENCE_MISMATCH",k);
  denied(x);
 }
 const p=full();p.permissions_scope=["write"];
 const x=assess(p);assert.equal(x.status,"BLOCKED_TASK_OR_EVIDENCE_MISMATCH");denied(x);
});
test("R19 duplicate permissions, unsorted privileges and noncanonical digest are rejected",()=>{
 const bad=[{permissions_scope:["read","read"]},
  {permissions_scope:["write","read"]},
  {evidence_digest:"A".repeat(64)},
  {permissions_scope:["*"]}];
 for(const a of bad){
  const x=assess({...full(),...a});
  assert.equal(x.status,"BLOCKED_INVALID_ENVELOPE");
  denied(x);
 }
});
test("R19 stale or impossible dates cannot be encoded as future unconditional approval",()=>{
 for(const change of [{expires_at:"2026-10-27T08:40:00.000Z"},
 {issued_at:"today"},{expires_at:"2026-10-28T08:55:00.000Z"}]){
  const r=assess({...full(),...change});
  assert.equal(r.status,"BLOCKED_INVALID_ENVELOPE");denied(r);
 }
});
test("R19 malformed objects, missing exact signed fields or unexpected metadata fail closed",()=>{
 for(const value of [null,[],{},({...full(),extra:true}),(()=>{const p=full();delete p.nonce;return p;})()]){
  const x=assess(value);
  assert.equal(x.status,"BLOCKED_INVALID_ENVELOPE");denied(x);
 }
});
test("R19 missing verified expected task data never counts as an authoritative match",()=>{
 for(const value of [null,{},({...expect(),execution_allowed:true})]){
  const r=assess(full(),value);
  assert.equal(r.status,"BLOCKED_EXPECTED_CONTRACT_MISSING");denied(r);
 }
});
test("R19 old PostgreSQL review table lacks enough identity fields for authority binding",()=>{
 const sql=fs.readFileSync("sql/r13_candidate_review_reservation.sql","utf8");
 const table=sql.split("CREATE TABLE IF NOT EXISTS tcvl_r13_candidate.review_reservations")[1].split(");")[0];
 for(const name of ["receipt_id","project_id","key_id","direction_version","evidence_digest"])
  assert.match(table,new RegExp("\\b"+name+"\\b"));
 for(const name of ["task_id","node_id","origin_command_id","request_id","audience",
  "permissions_scope","approver_id","nonce"])
  assert.doesNotMatch(table,new RegExp("\\b"+name+"\\b"),name+" is not persisted as a validated identity");
});
test("R19 envelope preview returns no signature, private key, raw source or authority decision",()=>{
 const x=assess();
 const output=JSON.stringify(x);
 assert.equal(output.includes("synthetic-claimed"),false);
 assert.equal(output.includes(full().evidence_digest),false);
 assert.equal(output.includes("BEGIN PUBLIC KEY"),false);
 denied(x);
});
