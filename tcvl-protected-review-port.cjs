"use strict";
/*
 * R12 proof-of-contract: IN-PROCESS, ISOLATED REVIEW ONLY.
 * Never configure as an actual trusted approval source or worker dispatcher.
 * No network, no disk, no secrets; two processes can reserve the SAME receipt.
 */
const {verifyReceiptForReview}=require("./tcvl-approval-receipt-core.cjs");
const ID=/^[a-zA-Z0-9_.:-]{1,120}$/;
const clone=x=>JSON.parse(JSON.stringify(x));
function response(status,reason){
 return {status,reason,environment:"ISOLATED_SIMULATION_ONLY",
  crypto_integrity_verified:false,verified_owner_approval:false,
  execution_allowed:false,requires_independent_g2:true,
  cross_process_replay_protection:false,trust_root_provisioned:false};
}
function createIsolatedReviewPort({trustedKeys=[],snapshotAt="2026-10-27T00:00:00.000Z"}={}){
 const keys=clone(trustedKeys),consumed=new Set(),revokedReceipts=new Set(),revokedKeys=new Set();
 let observedAt=snapshotAt,epoch=0;
 return Object.freeze({
  kind:"ISOLATED_SIMULATOR",
  snapshot(){
   return {
    trustedKeys:clone(keys),
    revocationSnapshot:{
     checked_at:observedAt,
     revoked_receipt_ids:[...revokedReceipts],
     revoked_key_ids:[...revokedKeys]},
    consumedReceiptIds:[...consumed],
    epoch
   };
  },
  // Synchronous check-and-set WITHOUT an await, atomic in this single
  // JavaScript isolate only. This is NOT a distributed transaction.
  reserve({receiptId,keyId,epoch:previousEpoch}={}){
   if(typeof receiptId!=="string"||!ID.test(receiptId)||
      typeof keyId!=="string"||!ID.test(keyId)||
      !Number.isSafeInteger(previousEpoch)||previousEpoch!==epoch||
      consumed.has(receiptId)||revokedReceipts.has(receiptId)||revokedKeys.has(keyId))
     return {ok:false};
   consumed.add(receiptId);
   return {ok:true};
  },
  revokeReceipt(receiptId,at){
   if(!ID.test(receiptId||"")||!Number.isFinite(Date.parse(at||"")))throw Error("invalid isolated revocation");
   revokedReceipts.add(receiptId);observedAt=at;epoch++;
  },
  revokeKey(keyId,at){
   if(!ID.test(keyId||"")||!Number.isFinite(Date.parse(at||"")))throw Error("invalid isolated revocation");
   revokedKeys.add(keyId);observedAt=at;epoch++;
  }
 });
}
async function reserveForIndependentReview({port,receipt,expected,now}={}){
 if(!port||port.kind!=="ISOLATED_SIMULATOR"||
    typeof port.snapshot!=="function"||typeof port.reserve!=="function")
   return response("BLOCKED_UNCONFIGURED","NO_REAL_TRUST_SOURCE");
 try{
  const snapshot=port.snapshot();
  if(!snapshot || !Number.isSafeInteger(snapshot.epoch)||snapshot.epoch<0||
     !Object.hasOwn(snapshot,"revocationSnapshot")||
     !Object.hasOwn(snapshot,"consumedReceiptIds")||
     !Object.hasOwn(snapshot,"trustedKeys"))
    return response("BLOCKED_INVALID_TRUST_SNAPSHOT","SOURCE_NOT_ATTESTED");
  const cryptographic=verifyReceiptForReview({receipt,expected,now,
   trustedKeys:snapshot.trustedKeys,
   revocationSnapshot:snapshot.revocationSnapshot,
   consumedReceiptIds:snapshot.consumedReceiptIds});
  if(cryptographic.status!=="CRYPTOGRAPHIC_SIGNATURE_VERIFIED_REVIEW_ONLY")
   return response("BLOCKED_CRYPTO_OR_SOURCE",cryptographic.reason||"UNVERIFIED");
  // Deliberately expose a race between proof verification and commit to
  // assert that the final check-and-set rejects concurrent/revoked use.
  await Promise.resolve();
  const reserved=port.reserve({
   receiptId:receipt.receipt_id,keyId:receipt.key_id,epoch:snapshot.epoch
  });
  if(!reserved||reserved.ok!==true)
   return response("BLOCKED_REPLAY_OR_REVOKED","STALE_OR_ALREADY_RESERVED");
  return {...response("ISOLATED_REVIEW_RESERVATION_ONLY","SYNTHETIC_LOCAL_RECEIPT_ONLY"),
   crypto_integrity_verified:true};
 }catch(_){
  return response("BLOCKED_SOURCE_OR_STORAGE_FAILURE","FAIL_CLOSED");
 }
}
module.exports={createIsolatedReviewPort,reserveForIndependentReview};
