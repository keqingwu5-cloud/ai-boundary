/* R24 formal recovery READ-ONLY preflight. Not a restore or an approval.
 * Inputs may be sensitive: never log raw Graph/Undo or send them externally.
 * A digest is integrity evidence, NOT a signature or provenance attestation.
 * No IndexedDB/localStorage access or mutation exists in this module.
 */
import {verifyTransactionalBackup} from './first-brain-transactional-backup.mjs';
export const FORMAL_RECOVERY_GATE='first-brain-r24-formal-recovery-preflight/v1';
const digest=async raw=>{
 if(typeof raw!=='string'||!globalThis.crypto?.subtle||!globalThis.TextEncoder)
   return null;
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
};
const blocked=(reasons,verified=false)=>({
 schema:FORMAL_RECOVERY_GATE,status:'blocked',candidateVerified:verified,
 restoreAuthorized:false,mergeAuthorized:false,deploymentAuthorized:false,
 reasons:[...new Set(reasons)]});
/* An independent observer must establish currentSnapshot and original legacy
 * bytes via an authorized read-only procedure BEFORE calling this. Merely
 * passing currentSnapshot:null does NOT prove the real IDB is absent.
 * This function intentionally never returns restoreAuthorized:true.
 */
export async function inspectFormalRecoveryCandidate({
 backup,authority,currentSnapshot,legacyMainRaw,legacyUndoRaw
}={}){
 const reasons=[];
 const checked=await verifyTransactionalBackup(backup);
 if(!checked.ok)reasons.push('backup_'+checked.reason);
 if(authority!=='idb')reasons.push('transactional_authority_unverified');
 if(currentSnapshot===undefined)reasons.push('current_snapshot_observation_required');
 else if(currentSnapshot!==null)
   reasons.push('existing_snapshot_preserve_no_overwrite');
 if(typeof legacyMainRaw!=='string'||typeof legacyUndoRaw!=='string')
   reasons.push('origin_legacy_bytes_missing');
 else if(checked.ok){
  try{
   const [main,undo]=await Promise.all([digest(legacyMainRaw),digest(legacyUndoRaw)]);
   if(!main||!undo)reasons.push('origin_fence_crypto_unavailable');
   else if(main!==backup.legacyFence.mainSha||undo!==backup.legacyFence.undoSha)
    reasons.push('origin_legacy_bytes_diverged');
  }catch(_){reasons.push('origin_fence_crypto_failed');}
 }
 if(!reasons.length){
  // Preconditions can be *candidate* evidence for independent human review,
  // never a proof that Safari/old writers/reviewers/owner have approved.
  return blocked(['physical_apple_safari_evidence_required',
   'independent_reviewer_ack_required','old_writer_shutdown_evidence_required',
   'explicit_owner_recovery_permission_required',
   'verified_external_backup_provenance_required'],true);
 }
 return blocked(reasons,false);
}
