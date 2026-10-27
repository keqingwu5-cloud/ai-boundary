"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync,sign,createHash}=require("node:crypto");
const {createIsolatedReviewPort,reserveForIndependentReview}=
 require("../tcvl-protected-review-port.cjs");
const {FIELDS}=require("../tcvl-approval-receipt-core.cjs");
const pair=generateKeyPairSync("ed25519");
const other=generateKeyPairSync("ed25519");
const NOW="2026-10-27T04:30:00.000Z";
const DIGEST=createHash("sha256").update("synthetic-only-r12").digest("hex");
const claimed=()=>({
 schema:"tcvl-approval-receipt/v1",receipt_id:"receipt-r12",
 decision:"approve_reuse_for_review",project_id:"project",node_id:"node",
 origin_command_id:"command",direction_version:"v1",request_id:"request",
 permissions_scope:["read"],evidence_digest:DIGEST,approver_id:"synthetic-owner",
 key_id:"isolated-test-key",issued_at:"2026-10-27T04:29:00.000Z",
 expires_at:"2026-10-27T04:35:00.000Z"
});
const receipt=()=>{
 const c=claimed();
 const signed=Buffer.from("TCVL-REVIEW-RECEIPT-V1\0"+
  JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,c[k]]))));
 return {...c,signature:sign(null,signed,pair.privateKey).toString("base64url")};
};
const expected=()=>({
 project_id:"project",node_id:"node",origin_command_id:"command",
 direction_version:"v1",request_id:"request",permissions_scope:["read"],evidence_digest:DIGEST
});
const keys=(key=pair.publicKey)=>[{
 key_id:"isolated-test-key",approver_id:"synthetic-owner",status:"active",
 public_key_pem:key.export({type:"spki",format:"pem"}).toString()
}];
const port=(opts={})=>createIsolatedReviewPort({
 trustedKeys:opts.trustedKeys||keys(),snapshotAt:Object.hasOwn(opts,"snapshotAt")?
  opts.snapshotAt:"2026-10-27T04:29:50.000Z"
});
const submit=(p,opts={})=>reserveForIndependentReview({
 port:p,receipt:opts.receipt||receipt(),expected:opts.expected||expected(),
 now:opts.now||NOW
});
const noExecution=r=>{
 assert.equal(r.execution_allowed,false);
 assert.equal(r.verified_owner_approval,false);
 assert.equal(r.requires_independent_g2,true);
 assert.equal(r.environment,"ISOLATED_SIMULATION_ONLY");
};
test("R12 no external trusted authority port is configured: deny by default",async()=>{
 const x=await submit(undefined);noExecution(x);
 assert.equal(x.status,"BLOCKED_UNCONFIGURED");
});
test("R12 offline-signed receipt reserves for independent review only, never execution",async()=>{
 const x=await submit(port());
 assert.equal(x.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
 assert.equal(x.crypto_integrity_verified,true);
 noExecution(x);
});
test("R12 same receipt cannot be reserved twice in one sandbox ledger",async()=>{
 const p=port();
 assert.equal((await submit(p)).status,"ISOLATED_REVIEW_RESERVATION_ONLY");
 const r=await submit(p);noExecution(r);
 assert.equal(r.status,"BLOCKED_REPLAY_OR_REVOKED");
});
test("R12 concurrent read-then-reserve requests yield exactly one sandbox winner",async()=>{
 const p=port();
 const x=await Promise.all(Array.from({length:30},()=>submit(p)));
 assert.equal(x.filter(t=>t.status==="ISOLATED_REVIEW_RESERVATION_ONLY").length,1);
 assert.equal(x.filter(t=>t.status==="BLOCKED_REPLAY_OR_REVOKED").length,29);
 x.forEach(noExecution);
});
test("R12 revocation between snapshot and reservation rejects; no stale-write window",async()=>{
 const p=port();
 const pending=submit(p);
 p.revokeReceipt("receipt-r12",NOW);
 const r=await pending;noExecution(r);
 assert.equal(r.status,"BLOCKED_REPLAY_OR_REVOKED");
});
test("R12 revoked signing key before or during use blocks",async()=>{
 const p=port();p.revokeKey("isolated-test-key",NOW);
 const x=await submit(p);noExecution(x);
 assert.notEqual(x.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
 const q=port();const pending=submit(q);q.revokeKey("isolated-test-key",NOW);
 const r=await pending;noExecution(r);assert.notEqual(r.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
});
test("R12 stale or missing external revocation state cannot promote synthetic proof",async()=>{
 const p=port({snapshotAt:"2026-10-27T04:10:00.000Z"});
 const x=await submit(p);noExecution(x);
 assert.notEqual(x.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
});
test("R12 signing with unrelated key is not accepted by selected sandbox source",async()=>{
 const x=await submit(port({trustedKeys:keys(other.publicKey)}));
 noExecution(x);assert.notEqual(x.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
});
test("R12 receipt intended for another task or permission is denied before reservation",async()=>{
 const p=port();const bad=expected();bad.node_id="other-node";
 const x=await submit(p,{expected:bad});noExecution(x);
 assert.notEqual(x.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
 const y=await submit(p);assert.equal(y.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
});
test("R12 untrusted port that throws errors must fail closed",async()=>{
 const bad={kind:"ISOLATED_SIMULATOR",snapshot(){throw Error("backend unavailable")},
   reserve(){throw Error("should not be called")}};
 const x=await submit(bad);noExecution(x);
 assert.notEqual(x.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
});
test("R12 separate per-process stores can BOTH reserve: durability is unproven",async()=>{
 const first=await submit(port()),second=await submit(port());
 assert.equal(first.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
 assert.equal(second.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
 noExecution(first);noExecution(second);
 // This records a LIMITATION, not a pass for global replay prevention.
});
test("R12 caller-supplied fake authority can only generate simulation result",async()=>{
 const forged=port({trustedKeys:keys(other.publicKey)});
 const x=await submit(forged);
 noExecution(x);
 assert.equal(x.status!=="ISOLATED_REVIEW_RESERVATION_ONLY",true);
});
test("R12 result redacts raw key, signature and original task evidence",async()=>{
 const r=receipt();const x=await submit(port(),{receipt:r});
 const result=JSON.stringify(x);
 assert.equal(result.includes(r.signature),false);
 assert.equal(result.includes("BEGIN PUBLIC KEY"),false);
 assert.equal(result.includes(DIGEST),false);
 noExecution(x);
});
test("R12 invalid snapshot type and forged consumption adapter fail closed",async()=>{
 const x=await submit({kind:"ISOLATED_SIMULATOR",snapshot(){return {}},
   reserve(){return {ok:true}}});noExecution(x);
 assert.notEqual(x.status,"ISOLATED_REVIEW_RESERVATION_ONLY");
});
