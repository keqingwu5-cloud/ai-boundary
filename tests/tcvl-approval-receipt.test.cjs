"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {generateKeyPairSync,sign,createHash}=require("node:crypto");
const {verifyReceiptForReview}=require("../tcvl-approval-receipt-core.cjs");
const PAIR=generateKeyPairSync("ed25519"); // ephemeral synthetic key; NEVER a production authority
const ALT=generateKeyPairSync("ed25519");
const NOW="2026-10-27T03:40:00.000Z";
const FIELDS=["schema","receipt_id","decision","project_id","node_id",
 "origin_command_id","direction_version","request_id","permissions_scope",
 "evidence_digest","approver_id","key_id","issued_at","expires_at"];
const evidence=createHash("sha256").update("synthetic-source-evidence-v1").digest("hex");
const claims=()=>({
 schema:"tcvl-approval-receipt/v1",receipt_id:"test-receipt-01",
 decision:"approve_reuse_for_review",project_id:"project-1",node_id:"node-1",
 origin_command_id:"cmd-1",direction_version:"v1",request_id:"request-1",
 permissions_scope:["read"],evidence_digest:evidence,
 approver_id:"owner-sandbox",key_id:"sandbox-key-1",
 issued_at:"2026-10-27T03:39:00.000Z",expires_at:"2026-10-27T03:45:00.000Z"
});
const expected=()=>({
 project_id:"project-1",node_id:"node-1",origin_command_id:"cmd-1",
 direction_version:"v1",request_id:"request-1",
 permissions_scope:["read"],evidence_digest:evidence
});
const trust=(key=PAIR.publicKey)=>[{
 approver_id:"owner-sandbox",key_id:"sandbox-key-1",status:"active",
 public_key_pem:key.export({type:"spki",format:"pem"}).toString()
}];
const snapshot=()=>({checked_at:"2026-10-27T03:39:30.000Z",revoked_receipt_ids:[],revoked_key_ids:[]});
const signature=(c,key=PAIR.privateKey)=>sign(null,Buffer.from("TCVL-REVIEW-RECEIPT-V1\0"+
 JSON.stringify(Object.fromEntries(FIELDS.map(f=>[f,c[f]])))),key).toString("base64url");
const receipt=(c=claims(),key=PAIR.privateKey)=>({...c,signature:signature(c,key)});
const verify=(r=receipt(),opts={})=>verifyReceiptForReview({
 receipt:r,expected:opts.expected||expected(),now:opts.now||NOW,
 trustedKeys:Object.hasOwn(opts,"trustedKeys")?opts.trustedKeys:trust(),
 revocationSnapshot:Object.hasOwn(opts,"revocationSnapshot")?opts.revocationSnapshot:snapshot(),
 consumedReceiptIds:Object.hasOwn(opts,"consumedReceiptIds")?opts.consumedReceiptIds:[]
});
const denied=x=>{
 assert.notEqual(x.status,"CRYPTOGRAPHIC_SIGNATURE_VERIFIED_REVIEW_ONLY");
 assert.equal(x.execution_allowed,false);
 assert.equal(x.verified_owner_approval,false);
};
test("R11 synthetic signed receipt establishes only cryptographic integrity, not owner authority",()=>{
 const x=verify();
 assert.equal(x.status,"CRYPTOGRAPHIC_SIGNATURE_VERIFIED_REVIEW_ONLY");
 assert.equal(x.verified_signature,true);
 assert.equal(x.verified_owner_approval,false);
 assert.equal(x.execution_allowed,false);
 assert.equal(x.requires_independent_g2,true);
 assert.match(JSON.stringify(x),/EXTERNAL_TRUST_ANCHOR_NOT_ATTESTED/);
});
test("R11 missing independently selected trust anchor fails closed",()=>{
 denied(verify(receipt(),{trustedKeys:[]}));
 denied(verify(receipt(),{trustedKeys:null}));
});
test("R11 a caller's mismatched public key cannot validate the owner's signature",()=>{
 denied(verify(receipt(),{trustedKeys:trust(ALT.publicKey)}));
});
test("R11 an attacker-controlled replacement signature cannot validate the source",()=>{
 denied(verify(receipt(claims(),ALT.privateKey)));
});
test("R11 every material identity/version/scope/evidence field is bound by the signature",()=>{
 for(const key of ["project_id","node_id","origin_command_id","direction_version","request_id","evidence_digest","approver_id","key_id"]){
  const r=receipt();r[key]=key==="evidence_digest"?"0".repeat(64):"forged";
  denied(verify(r));
 }
 const r=receipt();r.permissions_scope=["admin"];denied(verify(r));
});
test("R11 signature-valid receipt for a different task, version or evidence must be rejected",()=>{
 for(const key of ["project_id","node_id","origin_command_id","direction_version","request_id","evidence_digest"]){
  const different=expected();
  different[key]=key==="evidence_digest"?"f".repeat(64):"other";
  denied(verify(receipt(),{expected:different}));
 }
 const scope=expected();scope.permissions_scope=["admin"];denied(verify(receipt(),{expected:scope}));
});
test("R11 stale, future-dated and expired receipts are blocked",()=>{
 denied(verify(receipt(),{now:"2026-10-27T03:50:00.000Z"}));
 denied(verify(receipt(),{now:"2026-10-27T03:38:00.000Z"}));
 const c=claims();c.expires_at="2026-10-27T03:39:00.000Z";denied(verify(receipt(c)));
});
test("R11 revoked receipt or key denies, even for a mathematically valid signature",()=>{
 const s=snapshot();s.revoked_receipt_ids=["test-receipt-01"];
 denied(verify(receipt(),{revocationSnapshot:s}));
 const t=snapshot();t.revoked_key_ids=["sandbox-key-1"];
 denied(verify(receipt(),{revocationSnapshot:t}));
});
test("R11 absent or stale revocation snapshot is not treated as healthy",()=>{
 denied(verify(receipt(),{revocationSnapshot:null}));
 const s=snapshot();s.checked_at="2026-10-27T03:20:00.000Z";
 denied(verify(receipt(),{revocationSnapshot:s}));
});
test("R11 consumed receipt ID cannot replay, even if signature remains valid",()=>{
 denied(verify(receipt(),{consumedReceiptIds:["test-receipt-01"]}));
});
test("R11 ambiguous receipt format, unknown fields and duplicate permissions are rejected",()=>{
 const extra=receipt();extra.authorization=true;denied(verify(extra));
 const dup=claims();dup.permissions_scope=["read","read"];denied(verify(receipt(dup)));
 const invalid=claims();invalid.decision="start_worker";denied(verify(receipt(invalid)));
 const bad=receipt();delete bad.signature;denied(verify(bad));
});
test("R11 disabled signing key and divergent approver identity fail closed",()=>{
 const keys=trust();keys[0].status="revoked";denied(verify(receipt(),{trustedKeys:keys}));
 const other=trust();other[0].approver_id="different-approver";denied(verify(receipt(),{trustedKeys:other}));
});
test("R11 missing replay database snapshot fails closed",()=>{
 denied(verify(receipt(),{consumedReceiptIds:null}));
});
test("R11 neither receipt nor the validation result may convey execution authorization",()=>{
 const c=claims();const r=receipt(c);
 const x=verify(r);
 assert.equal("verified_receiver_ack" in x,false);
 assert.equal(x.execution_allowed,false);
 assert.equal(x.verified_owner_approval,false);
 assert.equal(JSON.stringify(x).includes(r.signature),false);
 assert.equal(JSON.stringify(x).includes("BEGIN PUBLIC KEY"),false);
});
