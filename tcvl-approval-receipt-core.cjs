"use strict";
/*
 * R11 offline receipt INTEGRITY verifier only.
 * NO I/O, NO persistence, NO key provisioning, NO authority to dispatch workers.
 *
 * Caller-supplied trust keys, consumed IDs and revocations are NOT themselves
 * authenticated or backed by an atomic store. Accordingly even a valid Ed25519
 * signature is NEVER an independently verified owner approval.
 */
const crypto=require("node:crypto");
const SCHEMA="tcvl-approval-receipt/v1";
const FIELDS=Object.freeze([
 "schema","receipt_id","decision","project_id","node_id",
 "origin_command_id","direction_version","request_id","permissions_scope",
 "evidence_digest","approver_id","key_id","issued_at","expires_at"
]);
const ID=/^[A-Za-z0-9_.:-]{1,120}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const B64URL=/^[A-Za-z0-9_-]{86}$/; // Ed25519: 64 bytes, canonical unpadded b64url
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const FIELDS_EXPECTED=Object.freeze([
 "project_id","node_id","origin_command_id","direction_version",
 "request_id","permissions_scope","evidence_digest"
]);
function timestamp(x){
 if(typeof x!=="string"||!ISO.test(x))return NaN;
 const ms=Date.parse(x);
 return Number.isFinite(ms)?ms:NaN;
}
function isRecord(x){return !!x&&typeof x==="object"&&!Array.isArray(x);}
function exactKeys(x,names){
 return isRecord(x)&&Object.keys(x).length===names.length&&
 names.every(k=>Object.hasOwn(x,k));
}
function validScope(s){
 return Array.isArray(s)&&s.length<=24&&
 s.every(x=>typeof x==="string"&&ID.test(x))&&
 new Set(s).size===s.length;
}
function dataToSign(x){
 const claims=Object.fromEntries(FIELDS.map(k=>[k,x[k]]));
 return Buffer.from("TCVL-REVIEW-RECEIPT-V1\0"+JSON.stringify(claims),"utf8");
}
function deny(reason){
 return {status:"DENIED",reason,verified_signature:false,
 verified_owner_approval:false,execution_allowed:false,requires_independent_g2:true,
 trust_anchor_status:"EXTERNAL_TRUST_ANCHOR_NOT_ATTESTED"};
}
function verifyReceiptForReview({receipt,expected,now,trustedKeys,revocationSnapshot,consumedReceiptIds}={}){
 try{
  if(!exactKeys(receipt,[...FIELDS,"signature"]))return deny("RECEIPT_SCHEMA_INVALID");
  if(receipt.schema!==SCHEMA||receipt.decision!=="approve_reuse_for_review")return deny("RECEIPT_SCHEMA_INVALID");
  if(!FIELDS.filter(k=>!["schema","decision","permissions_scope","evidence_digest","issued_at","expires_at"].includes(k))
    .every(k=>ID.test(receipt[k]||"")))return deny("RECEIPT_IDENTITY_INVALID");
  if(!validScope(receipt.permissions_scope)||!DIGEST.test(receipt.evidence_digest||""))
    return deny("RECEIPT_SCOPE_OR_EVIDENCE_INVALID");
  if(!B64URL.test(receipt.signature||""))return deny("SIGNATURE_INVALID");
  const bytes=Buffer.from(receipt.signature,"base64url");
  if(bytes.length!==64||bytes.toString("base64url")!==receipt.signature)return deny("SIGNATURE_INVALID");
  const issued=timestamp(receipt.issued_at),expiry=timestamp(receipt.expires_at),clock=timestamp(now);
  if(!Number.isFinite(issued)||!Number.isFinite(expiry)||!Number.isFinite(clock)||
     issued>clock||clock>=expiry||expiry<=issued||expiry-issued>3600000)
     return deny("RECEIPT_TIME_INVALID");
  if(!exactKeys(expected,FIELDS_EXPECTED)||
    !FIELDS_EXPECTED.filter(k=>k!=="permissions_scope"&&k!=="evidence_digest")
      .every(k=>ID.test(expected[k]||""))||
    !validScope(expected.permissions_scope)||!DIGEST.test(expected.evidence_digest||""))
    return deny("EXPECTED_TASK_CONTRACT_INVALID");
  for(const key of FIELDS_EXPECTED){
    if(JSON.stringify(receipt[key])!==JSON.stringify(expected[key]))
      return deny("TASK_BINDING_MISMATCH");
  }
  if(!Array.isArray(consumedReceiptIds)||consumedReceiptIds.length>5000||
      consumedReceiptIds.some(x=>!ID.test(x)))return deny("REPLAY_STORE_MISSING_OR_INVALID");
  if(consumedReceiptIds.includes(receipt.receipt_id))return deny("REPLAYED_RECEIPT");
  if(!isRecord(revocationSnapshot)||
    !exactKeys(revocationSnapshot,["checked_at","revoked_receipt_ids","revoked_key_ids"])||
    !Array.isArray(revocationSnapshot.revoked_receipt_ids)||
    !Array.isArray(revocationSnapshot.revoked_key_ids)||
    [...revocationSnapshot.revoked_receipt_ids,...revocationSnapshot.revoked_key_ids].some(x=>!ID.test(x)))
      return deny("REVOCATION_EVIDENCE_INVALID");
  const refreshed=timestamp(revocationSnapshot.checked_at);
  if(!Number.isFinite(refreshed)||refreshed>clock||
    clock-refreshed>300000)return deny("REVOCATION_SNAPSHOT_STALE");
  if(revocationSnapshot.revoked_receipt_ids.includes(receipt.receipt_id)||
      revocationSnapshot.revoked_key_ids.includes(receipt.key_id))
    return deny("REVOKED_RECEIPT_OR_KEY");
  if(!Array.isArray(trustedKeys)||!trustedKeys.length||trustedKeys.length>16)
    return deny("NO_TRUST_KEY_PROVISIONED");
  if(trustedKeys.some(x=>!isRecord(x)||!ID.test(x.key_id||"")||
      !ID.test(x.approver_id||"")||!["active","revoked"].includes(x.status)||
      typeof x.public_key_pem!=="string"))
    return deny("TRUST_KEYS_INVALID");
  if(new Set(trustedKeys.map(x=>x.key_id)).size!==trustedKeys.length)
    return deny("AMBIGUOUS_TRUST_KEYS");
  const key=trustedKeys.find(x=>x.key_id===receipt.key_id&&
    x.approver_id===receipt.approver_id&&x.status==="active");
  if(!key)return deny("UNTRUSTED_OR_REVOKED_APPROVER");
  const publicKey=crypto.createPublicKey(key.public_key_pem);
  if(publicKey.asymmetricKeyType!=="ed25519")return deny("WRONG_SIGNATURE_ALGORITHM");
  if(!crypto.verify(null,dataToSign(receipt),publicKey,bytes))
    return deny("SIGNATURE_MISMATCH");
  // IMPORTANT: authenticity of the trust anchor, receipt consumption, and
  // revocation snapshot must be established OUTSIDE this untrusted sandbox.
  // Never set verified_owner_approval or execution_allowed to true here.
  return {status:"CRYPTOGRAPHIC_SIGNATURE_VERIFIED_REVIEW_ONLY",
    verified_signature:true,verified_owner_approval:false,execution_allowed:false,
    requires_independent_g2:true,
    trust_anchor_status:"EXTERNAL_TRUST_ANCHOR_NOT_ATTESTED",
    replay_store_status:"CALLER_SNAPSHOT_NOT_ATOMICALLY_VERIFIED",
    revocation_source_status:"CALLER_SNAPSHOT_NOT_AUTHENTICATED"};
 }catch(_){return deny("VERIFIER_INPUT_OR_CRYPTO_FAILURE");}
}
module.exports={SCHEMA,FIELDS,verifyReceiptForReview};
