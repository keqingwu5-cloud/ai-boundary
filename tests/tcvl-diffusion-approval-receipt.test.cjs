"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {SCHEMA,TEST_TRUST_SOURCE,canonicalBytes,assessReceipt}=
 require("../tcvl-diffusion-approval-receipt.cjs");

// All signing keys are generated in a disposable Node test process.
// They are NOT project owner, GPT②, or a production authorization identity.
const pair=crypto.generateKeyPairSync("ed25519");
const attacker=crypto.generateKeyPairSync("ed25519");
const publicPEM=pair.publicKey.export({type:"spki",format:"pem"});
const NOW="2026-10-27T03:35:00Z";
const expected={project_id:"sandbox-project",task_id:"sandbox-task",node_id:"sandbox-node",
 origin_command_id:"sandbox-cmd",direction_version:"v1",request_id:"sandbox-request",
 audience:"isolated-diffusion"};
const payload={
 schema:SCHEMA,action:"approve_node_reuse",decision:"approved",
 ...expected,approver_id:"synthetic-reviewer",receipt_id:"synthetic-receipt-1",
 nonce:"nonce-synthetic-1",issued_at:"2026-10-27T03:34:00Z",expires_at:"2026-10-27T03:39:00Z"
};
const trustRoot={source:TEST_TRUST_SOURCE,signers:[{
 id:"fixture-key",approver_id:"synthetic-reviewer",role:"independent_reviewer",
 valid_from:"2026-10-27T00:00:00Z",valid_until:"2026-10-28T00:00:00Z",
 public_key_pem:publicPEM
}]};
const revocations={checked_at:NOW,revoked_receipt_ids:[],revoked_signer_ids:[],revoked_node_ids:[]};
const replayLedger={checked_at:NOW,consumed_receipt_ids:[],consumed_nonces:[]};
function sign(p=payload,key=pair.privateKey,signer_id="fixture-key"){
 return {payload:p,signer_id,signature_b64:crypto.sign(null,canonicalBytes(p),key).toString("base64")};
}
function check(overrides={}){
 return assessReceipt({receipt:sign(),expected,trustRoot,revocations,replayLedger,now:NOW,...overrides});
}
function altered(field,value){
 return check({receipt:sign({...payload,[field]:value})});
}
test("R11: valid ephemeral Ed25519 fixture confirms integrity but NEVER authorizes execution",()=>{
 const r=check();
 assert.equal(r.status,"SYNTHETIC_RECEIPT_INTEGRITY_VERIFIED");
 assert.equal(r.cryptographic_integrity,true);
 assert.equal(r.execution_allowed,false);
 assert.equal(r.independent_authority_verified,false);
 assert.match(r.receipt_digest,/^[0-9a-f]{64}$/);
});
test("R11: missing real trust root refuses to promote caller-supplied approval",()=>{
 for(const root of [undefined,null,{}, {source:"REAL_OWNER",signers:trustRoot.signers}]){
   const r=check({trustRoot:root});
   assert.equal(r.status,"REJECTED");
   assert.equal(r.reason,"NO_APPROVED_TRUST_ROOT");
   assert.equal(r.execution_allowed,false);
 }
});
test("R11: unsigned or malformed receipts fail closed",()=>{
 for(const receipt of [null,{}, {payload}, {payload:{...payload,unexpected:"yes"},signer_id:"fixture-key",signature_b64:"fake"}]){
  assert.equal(check({receipt}).status,"REJECTED");
 }
});
test("R11: replaced signature, payload tampering and attacker key cannot pass",()=>{
 const original=sign();
 for(const receipt of [
   {...original,signature_b64:Buffer.alloc(64,6).toString("base64")},
   {...original,payload:{...payload,node_id:"another-node"}},
   sign(payload,attacker.privateKey)
 ]){
   const r=check({receipt});assert.equal(r.status,"REJECTED");
 }
});
test("R11: signer identity and independent reviewer role must agree with pinned synthetic signer",()=>{
 assert.equal(check({receipt:sign(payload,pair.privateKey,"another-fixture-key")}).status,"REJECTED");
 assert.equal(check({trustRoot:{...trustRoot,signers:[{...trustRoot.signers[0],role:"developer"}]}}).status,"REJECTED");
 assert.equal(check({receipt:sign({...payload,approver_id:"someone-else"})}).status,"REJECTED");
});
test("R11: task, node, project, origin, version, request and audience all bind to receipt",()=>{
 for(const field of Object.keys(expected)){
  const r=altered(field,expected[field]+"-swapped");
  assert.equal(r.reason,"IDENTITY_OR_VERSION_MISMATCH",field);
 }
});
test("R11: approval for another action or decision is never reusable",()=>{
 assert.equal(altered("action","deploy_prod").reason,"WRONG_RECEIPT_PURPOSE");
 assert.equal(altered("decision","rejected").reason,"WRONG_RECEIPT_PURPOSE");
});
test("R11: signed receipt with expired, future or excessive lifetime is refused",()=>{
 for(const p of [
  {...payload,expires_at:"2026-10-27T03:35:00Z"},
  {...payload,issued_at:"2026-10-27T03:40:00Z",expires_at:"2026-10-27T03:45:00Z"},
  {...payload,expires_at:"2026-10-27T05:00:00Z"}
 ]){
  assert.equal(check({receipt:sign(p)}).reason,"EXPIRED_OR_INVALID_RECEIPT");
 }
});
test("R11: receipt without fresh revocation evidence fails closed",()=>{
 for(const x of [null,{}, {...revocations,checked_at:"2026-10-27T03:00:00Z"}]){
  assert.equal(check({revocations:x}).reason,"REVOCATION_EVIDENCE_MISSING_OR_STALE");
 }
});
test("R11: receipt revoked, signing key revoked or target node revoked is refused",()=>{
 for(const changes of [
  {revoked_receipt_ids:[payload.receipt_id]},
  {revoked_signer_ids:["fixture-key"]},
  {revoked_node_ids:[payload.node_id]}
 ]){
  assert.equal(check({revocations:{...revocations,...changes}}).reason,"APPROVAL_REVOKED");
 }
});
test("R11: no fresh replay record cannot be interpreted as no replay",()=>{
 for(const x of [null,{}, {...replayLedger,checked_at:"2026-10-27T02:00:00Z"}]){
  assert.equal(check({replayLedger:x}).reason,"REPLAY_EVIDENCE_MISSING_OR_STALE");
 }
});
test("R11: already-used receipt id or nonce is rejected as replay",()=>{
 for(const c of [
  {consumed_receipt_ids:[payload.receipt_id]},
  {consumed_nonces:[payload.nonce]}
 ]){
  assert.equal(check({replayLedger:{...replayLedger,...c}}).reason,"REPLAY_DETECTED");
 }
});
test("R11: signer certificate validity window is also bound to the signed event",()=>{
 const limited={...trustRoot.signers[0],valid_until:"2026-10-27T03:37:00Z"};
 assert.equal(check({trustRoot:{...trustRoot,signers:[limited]}}).reason,"SIGNER_IDENTITY_OR_LIFETIME_MISMATCH");
});
test("R11: malformed clocks fail closed before checking any authorization",()=>{
 assert.equal(check({now:"today"}).reason,"CLOCK_INVALID");
 assert.equal(check({receipt:sign({...payload,issued_at:"10/27/2026"})}).status,"REJECTED");
});
test("R11: no raw evidence, private key, signer public PEM or full payload is returned",()=>{
 const result=check(),output=JSON.stringify(result);
 assert.equal(output.includes("BEGIN PUBLIC KEY"),false);
 assert.equal(output.includes("synthetic-reviewer"),false);
 assert.equal(output.includes("nonce-synthetic-1"),false);
 assert.equal(output.includes("sandbox-task"),false);
});
test("R11: changing the claimed trust root source cannot turn synthetic proof into real approval",()=>{
 const callerClaims={...trustRoot,source:"OFFICIAL_PRODUCTION_TRUSTED"};
 const r=check({trustRoot:callerClaims});
 assert.equal(r.independent_authority_verified,false);
 assert.equal(r.execution_allowed,false);
});

test("R11 negative: unknown signer validity timestamps cannot silently pass",()=>{
 for(const signer of [
  {...trustRoot.signers[0],valid_from:"not-a-time"},
  {...trustRoot.signers[0],valid_until:"not-a-time"},
  {...trustRoot.signers[0],valid_from:undefined},
  {...trustRoot.signers[0],valid_until:undefined}
 ]){
  const r=check({trustRoot:{...trustRoot,signers:[signer]}});
  assert.equal(r.reason,"SIGNER_IDENTITY_OR_LIFETIME_MISMATCH");
 }
});
test("R11 negative: ambiguous duplicate signer IDs invalidate the trust snapshot",()=>{
 const dup={...trustRoot.signers[0],public_key_pem:attacker.publicKey.export({type:"spki",format:"pem"})};
 const r=check({trustRoot:{...trustRoot,signers:[trustRoot.signers[0],dup]}});
 assert.equal(r.status,"REJECTED");
 assert.equal(r.reason,"SIGNER_REGISTRY_AMBIGUOUS");
});
test("R11 negative: malformed revocation/replay arrays are not healthy empty ledgers",()=>{
 const r1=check({revocations:{...revocations,revoked_receipt_ids:[null]}});
 const r2=check({replayLedger:{...replayLedger,consumed_nonces:[null]}});
 assert.equal(r1.reason,"REVOCATION_EVIDENCE_MISSING_OR_STALE");
 assert.equal(r2.reason,"REPLAY_EVIDENCE_MISSING_OR_STALE");
});
