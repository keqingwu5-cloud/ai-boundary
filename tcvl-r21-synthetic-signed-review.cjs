"use strict";
// R21 isolated, synthetic-only signature integrity review. Never authorizes execution.
const crypto=require("node:crypto");
const {FIELDS,assessUnifiedReviewEnvelope}=require("./tcvl-r19-review-envelope.cjs");
function response(status,valid=false){
 return {status,synthetic_signature_valid:valid,execution_allowed:false,
  verified_owner_approval:false,trusted_signer_verified:false,
  cross_process_replay_protection:false};
}
function createIsolatedSignedReviewPort({syntheticAuthorities,syntheticClock}={}){
 const key=syntheticAuthorities&&syntheticAuthorities[0];
 if(!key||typeof syntheticClock!=="function")throw Error("SYNTHETIC_CONFIG_REQUIRED");
 const used=new Set(),nonces=new Set(),revoked=new Set();
 function revokeForTest({kind,id}={}){revoked.add(kind+":"+id);return response("SYNTHETIC_TEST_REVOCATION_RECORDED_ONLY");}
 function reserveSignedReview({signed,expected}={}){
  try{
   if(!signed||Object.keys(signed).sort().join(",")!=="envelope,signature"||
      typeof signed.signature!=="string"||!/^[A-Za-z0-9_-]{86}$/.test(signed.signature))
    return response("BLOCKED_INVALID_SIGNED_INPUT");
   const e=signed.envelope;
   const shape=assessUnifiedReviewEnvelope({envelope:e,expected});
   if(shape.status!=="READY_FOR_CONTRACT_REVIEW_NOT_AUTHORIZED")return response("BLOCKED_INVALID_SIGNED_INPUT");
   if(Date.parse(syntheticClock())<Date.parse(e.issued_at)||Date.parse(syntheticClock())>=Date.parse(e.expires_at))
    return response("BLOCKED_TIME_WINDOW");
   if(key.key_id!==e.key_id||key.approver_id!==e.approver_id)return response("BLOCKED_UNRECOGNIZED_SYNTHETIC_SIGNER");
   const bytes=Buffer.from("TCVL-R21-SYNTHETIC-REVIEW-V2\0"+JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,e[k]]))),"utf8");
   if(!crypto.verify(null,bytes,crypto.createPublicKey(key.public_key_pem),Buffer.from(signed.signature,"base64url")))
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
