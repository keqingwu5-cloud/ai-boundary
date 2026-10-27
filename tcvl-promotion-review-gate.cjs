"use strict";
/*
 * R17 G1-only static transition review gate. NO TRUSTED FENCING,
 * NO DB CONNECTION, NO FENCE ACTION, NO PROMOTE/EXECUTE AUTHORITY.
 * Caller-supplied state snapshots are NOT independently authenticated.
 */
const ID=/^[A-Za-z0-9_.:-]{1,120}$/;
const LSN=/^[0-9A-Fa-f]{1,8}\/[0-9A-Fa-f]{1,8}$/;
const KEYS=Object.freeze([
 "schema","current_primary_id","candidate_standby_id",
 "primary_state","standby_state","observed_fencing",
 "target_commit_lsn","standby_replay_lsn",
 "observed_receipt_id","receipt_present_on_standby",
 "observed_revoked_key_id","revocation_present_on_standby","observed_epoch"
]);
const isRecord=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const exact=(x,keys)=>isRecord(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
function response(status){
 return {status,promotion_allowed:false,execution_allowed:false,
   verified_owner_approval:false,verified_gpt2_ack:false,
   trusted_fencing_verified:false,requires_independent_g2:true,
   source_status:"UNTRUSTED_SYNTHETIC_OBSERVATION_ONLY"};
}
function pgLsn(x){
 if(typeof x!=="string"||!LSN.test(x))return null;
 const parts=x.split("/");
 return (BigInt("0x"+parts[0])<<32n)+BigInt("0x"+parts[1]);
}
function assessPromotionReview(evidence){
 try{
  if(!exact(evidence,KEYS)||evidence.schema!=="tcvl-promotion-review/v1"||
    !["current_primary_id","candidate_standby_id","observed_receipt_id","observed_revoked_key_id"]
       .every(k=>typeof evidence[k]==="string"&&ID.test(evidence[k]))||
    evidence.current_primary_id===evidence.candidate_standby_id||
    !["active","stopped","unknown"].includes(evidence.primary_state)||
    !["active","recovery","unknown"].includes(evidence.standby_state)||
    !exact(evidence.observed_fencing,["node_id","power_off_claim"])||
    typeof evidence.observed_fencing.node_id!=="string"||
    !ID.test(evidence.observed_fencing.node_id)||
    typeof evidence.observed_fencing.power_off_claim!=="boolean"||
    !Number.isSafeInteger(evidence.observed_epoch)||evidence.observed_epoch<=0||
    typeof evidence.receipt_present_on_standby!=="boolean"||
    typeof evidence.revocation_present_on_standby!=="boolean")
    return response("BLOCKED_INVALID_EVIDENCE");
  const target=pgLsn(evidence.target_commit_lsn),replay=pgLsn(evidence.standby_replay_lsn);
  if(target===null||replay===null)return response("BLOCKED_INVALID_EVIDENCE");
  // Even a "stopped" assertion is NOT independent evidence that fencing ran.
  if(evidence.primary_state!=="stopped"||
    evidence.standby_state!=="recovery"||
    evidence.observed_fencing.node_id!==evidence.current_primary_id||
    evidence.observed_fencing.power_off_claim!==true)
    return response("BLOCKED_SPLIT_BRAIN_OR_NOT_FENCED");
  if(replay<target)return response("BLOCKED_STANDBY_LAG_OR_UNCERTAIN_COMMIT");
  if(!evidence.receipt_present_on_standby||
     !evidence.revocation_present_on_standby)
    return response("BLOCKED_UNRECONCILED_RECEIPT_OR_REVOKE");
  // This is still never permission to promote. The observation source,
  // trusted fencing, owner authority, replay ledger and G2 are absent.
  return response("READY_FOR_INDEPENDENT_REVIEW_NOT_AUTHORIZED");
 }catch(_){return response("BLOCKED_INVALID_EVIDENCE");}
}
module.exports={assessPromotionReview};
