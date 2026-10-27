"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {FIELDS}=require("../tcvl-r19-review-envelope.cjs");
const {createIsolatedSignedReviewPort}=require("../tcvl-r21-synthetic-signed-review.cjs");
const fixture=crypto.generateKeyPairSync("ed25519");
const now="2026-10-27T09:02:00.000Z";
const claims=()=>({schema:"tcvl.review-receipt/v2-candidate",purpose:"reserve_for_independent_review",claim_status:"review_requested",project_id:"p1",task_id:"t1",node_id:"n1",origin_command_id:"c1",direction_version:"v2",request_id:"r1",audience:"isolated-review",permissions_scope:["read"],evidence_digest:"a".repeat(64),approver_id:"fixture1",key_id:"key1",receipt_id:"receipt1",nonce:"nonce1",issued_at:"2026-10-27T09:00:00.000Z",expires_at:"2026-10-27T09:05:00.000Z"});
const expected=(e)=>Object.fromEntries(["project_id","task_id","node_id","origin_command_id","direction_version","request_id","audience","permissions_scope","evidence_digest"].map(k=>[k,e[k]]));
const port=()=>createIsolatedSignedReviewPort({syntheticAuthorities:[{key_id:"key1",approver_id:"fixture1",public_key_pem:fixture.publicKey.export({type:"spki",format:"pem"}),status:"active"}],syntheticClock:()=>now});
const signed=(e)=>({envelope:e,signature:crypto.sign(null,Buffer.from("TCVL-R21-SYNTHETIC-REVIEW-V2\0"+JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,e[k]]))),"utf8"),fixture.privateKey).toString("base64url")});
const call=(p,e=claims())=>p.reserveSignedReview({signed:signed(e),expected:expected(e)});
test("R21 valid fixture signature is review-only, never authorization",()=>{
 const x=call(port()); assert.equal(x.status,"SYNTHETIC_SIGNATURE_REVIEW_RESERVED_ONLY");
 assert.equal(x.synthetic_signature_valid,true);assert.equal(x.execution_allowed,false);
 assert.equal(x.verified_owner_approval,false);assert.equal(x.trusted_signer_verified,false);
});
test("R21 changing signed claims after signing is rejected",()=>{
 const e=claims(),s=signed(e); e.node_id="n2";
 const x=port().reserveSignedReview({signed:s,expected:expected(e)});
 assert.equal(x.status,"BLOCKED_SIGNATURE_MISMATCH");assert.equal(x.execution_allowed,false);
});
test("R21 replay and reuse of nonce are rejected in same fixture",()=>{
 const p=port();assert.equal(call(p).status,"SYNTHETIC_SIGNATURE_REVIEW_RESERVED_ONLY");
 assert.equal(call(p).status,"BLOCKED_REPLAY_RECEIPT_OR_NONCE");
 assert.equal(call(p,{...claims(),receipt_id:"receipt2"}).status,"BLOCKED_REPLAY_RECEIPT_OR_NONCE");
});
test("R21 fixture revocation blocks a review receipt",()=>{
 const p=port();p.revokeForTest({kind:"key",id:"key1"});
 const x=call(p);assert.equal(x.status,"BLOCKED_SYNTHETIC_REVOKED");
 assert.equal(x.execution_allowed,false);
});
test("R21 separate ledgers lack cross-process replay protection",()=>{
 const s=signed(claims()),e=expected(claims());
 const a=port().reserveSignedReview({signed:s,expected:e});
 const b=port().reserveSignedReview({signed:s,expected:e});
 assert.equal(a.status,"SYNTHETIC_SIGNATURE_REVIEW_RESERVED_ONLY");
 assert.equal(b.status,"SYNTHETIC_SIGNATURE_REVIEW_RESERVED_ONLY");
 assert.equal(a.cross_process_replay_protection,false);
});
test("R21 missing signature or injected approval flag fails closed",()=>{
 const p=port();
 for(const s of [{envelope:claims(),signature:"invalid"},{...signed(claims()),execution_allowed:true}]){
  const x=p.reserveSignedReview({signed:s,expected:expected(claims())});
  assert.equal(x.status,"BLOCKED_INVALID_SIGNED_INPUT");
 }
});
