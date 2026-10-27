"use strict";
// R21 isolated, synthetic-only signature integrity review. Never authorizes execution.
const crypto=require("node:crypto");
const {FIELDS,assessUnifiedReviewEnvelope}=require("./tcvl-r19-review-envelope.cjs");
function response(status,valid=false){
 return {status,synthetic_signature_valid:valid,execution_allowed:false,
  verified_owner_approval:false,trusted_signer_verified:false,
  cross_process_replay_protection:false,requires_independent_g2:true,
  verified_gpt2_ack:false,authority_source:"ISOLATED_SYNTHETIC_KEYSET_ONLY"};
}
function createIsolatedSignedReviewPort({syntheticAuthorities,syntheticClock}={}){
 const key=Array.isArray(syntheticAuthorities)&&syntheticAuthorities.length===1?syntheticAuthorities[0]:null;
 if(!key||typeof syntheticClock!=="function"||
    !["active","revoked"].includes(key.status)||
    !/^[A-Za-z0-9_.:-]{1,120}$/.test(key.key_id||"")||
    !/^[A-Za-z0-9_.:-]{1,120}$/.test(key.approver_id||""))
    throw Error("SYNTHETIC_CONFIG_REQUIRED");
 let publicKey;
 try{
  publicKey=crypto.createPublicKey(key.public_key_pem);
  if(publicKey.asymmetricKeyType!=="ed25519")throw Error("bad algorithm");
 }catch(_){throw Error("SYNTHETIC_CONFIG_REQUIRED");}
 const originalAuthority=Object.freeze({
  key_id:key.key_id,approver_id:key.approver_id,
  public_key_pem:key.public_key_pem,status:key.status
 });
 const used=new Set(),nonces=new Set(),revoked=new Set();
 function revokeForTest({kind,id}={}){revoked.add(kind+":"+id);return response("SYNTHETIC_TEST_REVOCATION_RECORDED_ONLY");}
 function reserveSignedReview({signed,expected}={}){
  try{
   if(!signed||Object.keys(signed).sort().join(",")!=="envelope,signature"||
      typeof signed.signature!=="string"||!/^[A-Za-z0-9_-]{86}$/.test(signed.signature))
    return response("BLOCKED_INVALID_SIGNED_INPUT");
   const e=signed.envelope;
   const shape=assessUnifiedReviewEnvelope({envelope:e,expected});
   if(shape.status==="BLOCKED_TASK_OR_EVIDENCE_MISMATCH")
    return response("BLOCKED_TASK_OR_EVIDENCE_MISMATCH");
   if(shape.status!=="READY_FOR_CONTRACT_REVIEW_NOT_AUTHORIZED")return response("BLOCKED_INVALID_SIGNED_INPUT");
   const tick=syntheticClock(),now=Date.parse(tick);
   if(typeof tick!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/.test(tick)||
    !Number.isFinite(now)||new Date(now).toISOString()!==tick||
    now<Date.parse(e.issued_at)||now>=Date.parse(e.expires_at))
    return response("BLOCKED_TIME_WINDOW");
   // Caller owns the input object. Its mutation must NOT rewrite our initial
   // synthetic authority snapshot, reactivate a revoked signer, or silently
   // change the key-to-approver binding used by this test fixture.
   if(["key_id","approver_id","public_key_pem","status"].some(k=>
      key[k]!==originalAuthority[k]))
    return response("BLOCKED_SYNTHETIC_AUTHORITY_CONFIG_MUTATED");
   if(originalAuthority.status!=="active"||originalAuthority.key_id!==e.key_id||
      originalAuthority.approver_id!==e.approver_id)
    return response("BLOCKED_UNRECOGNIZED_SYNTHETIC_SIGNER");
   const bytes=Buffer.from("TCVL-R21-SYNTHETIC-REVIEW-V2\0"+JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,e[k]]))),"utf8");
   const signatureBytes=Buffer.from(signed.signature,"base64url");
   // Ed25519 is exactly 64 bytes, and a 64-byte base64url string has only
   // two significant bits in its last character. Reject textual aliases
   // with nonzero unused bits before cryptographic verification.
   if(signatureBytes.length!==64||
      signatureBytes.toString("base64url")!==signed.signature)
    return response("BLOCKED_NONCANONICAL_SIGNATURE_ENCODING");
   if(!crypto.verify(null,bytes,publicKey,signatureBytes))
    return response("BLOCKED_SIGNATURE_MISMATCH");
   if(["key:"+e.key_id,"node:"+e.node_id,"receipt:"+e.receipt_id].some(x=>revoked.has(x)))
    return response("BLOCKED_SYNTHETIC_REVOKED");
   if(used.has(e.receipt_id)||nonces.has(e.nonce))return response("BLOCKED_REPLAY_RECEIPT_OR_NONCE");
   used.add(e.receipt_id);nonces.add(e.nonce);
   return response("SYNTHETIC_SIGNATURE_REVIEW_RESERVED_ONLY",true);
  }catch(_){return response("BLOCKED_INVALID_SIGNED_INPUT");}
 }
 return Object.freeze({reserveSignedReview,revokeForTest});
}
module.exports={createIsolatedSignedReviewPort};
