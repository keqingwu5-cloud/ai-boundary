/* R21: explicit, read-only export of the CURRENT First Brain IDB authority.
 * The exported file may contain personal graph content. This module never
 * uploads it, never auto-downloads, and NEVER imports/restores any snapshot.
 * SHA-256 detects accidental byte changes, not malicious rewriting/authenticity.
 */
import {readSnapshot} from './transactional-brain-store.mjs';
import {readTransactional3D,MAIN_KEY} from './first-brain-idb-adapter.mjs';
import {validateBrainImport} from './brain-import-guard.mjs';

export const TRANSACTIONAL_BACKUP_SCHEMA='first-brain.transactional.backup.v1';
const AUTH_KEY='aiBrain.v1.persistence.authority';
const failed=reason=>({ok:false,reason});
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validSha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
// Metadata sanity only: digest cannot prove provenance, ownership, or signer identity.
const validExportedAt=x=>{
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x))return false;
 const n=Date.parse(x);
 return Number.isFinite(n)&&new Date(n).toISOString()===x&&n<=Date.now()+300000;
};
async function sha256(text){
 if(typeof text!=='string'||!globalThis.crypto?.subtle||!globalThis.TextEncoder)
   return null;
 const bytes=new TextEncoder().encode(text);
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
function payload(envelope){
 return JSON.stringify({schema:envelope.schema,key:envelope.key,
  revision:envelope.revision,exportedAt:envelope.exportedAt,
  mainRaw:envelope.mainRaw,undoRaw:envelope.undoRaw,
  legacyFence:envelope.legacyFence});
}
function validGraphRaw(raw){
 if(typeof raw!=='string')return false;
 try{return validateBrainImport(JSON.parse(raw)).ok===true;}catch(_){return false;}
}
function validUndoRaw(raw){
 if(typeof raw!=='string')return false;
 try{
  const values=JSON.parse(raw);
  return Array.isArray(values)&&values.length<=12&&
   values.every(x=>typeof x==='string'&&validGraphRaw(x));
 }catch(_){return false;}
}
export async function verifyTransactionalBackup(envelope){
 if(!isObject(envelope)||envelope.schema!==TRANSACTIONAL_BACKUP_SCHEMA||
   envelope.key!==MAIN_KEY||!Number.isSafeInteger(envelope.revision)||
   envelope.revision<1||!validExportedAt(envelope.exportedAt)||
   typeof envelope.mainRaw!=='string'||
   typeof envelope.undoRaw!=='string'||!isObject(envelope.legacyFence)||
   envelope.legacyFence.version!==1||
   !validSha(envelope.legacyFence.mainSha)||!validSha(envelope.legacyFence.undoSha)||
   !isObject(envelope.sha256)||!validSha(envelope.sha256.mainRaw)||
   !validSha(envelope.sha256.undoRaw)||!validSha(envelope.sha256.payload))
   return failed('backup_format_invalid');
 if(!validGraphRaw(envelope.mainRaw)||!validUndoRaw(envelope.undoRaw))
   return failed('backup_graph_or_undo_invalid');
 try{
  const main=await sha256(envelope.mainRaw),undo=await sha256(envelope.undoRaw);
  const digest=await sha256(payload(envelope));
  if(!main||!undo||!digest)return failed('backup_crypto_unavailable');
  if(main!==envelope.sha256.mainRaw||undo!==envelope.sha256.undoRaw||
    digest!==envelope.sha256.payload)return failed('backup_digest_mismatch');
  return {ok:true,reason:'backup_bytes_verified',revision:envelope.revision};
 }catch(_){return failed('backup_crypto_failed');}
}
// expectedRevision MUST be supplied by the active UI. A stale tab must not
// quietly export a newer revision that the user has not yet seen/reviewed.
export async function exportVerifiedTransactionalBackup(databaseName,storage,
 {expectedRevision}={}){
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
   return failed('expected_revision_required');
 let authority;
 try{authority=storage.getItem(AUTH_KEY);}catch(_){return failed('authority_unreadable');}
 if(authority!=='idb')return failed('transactional_authority_not_active');
 const first=await readSnapshot(databaseName,MAIN_KEY);
 if(!first.ok)return first;
 if(!first.snapshot)return failed('transactional_snapshot_missing');
 if(first.snapshot.revision!==expectedRevision)return failed('stale_revision');
 const verified=await readTransactional3D(databaseName);
 if(!verified.ok)return verified;
 if(verified.revision!==expectedRevision||
   verified.mainRaw!==first.snapshot.mainRaw||
   verified.undoRaw!==first.snapshot.undoRaw)
   return failed('snapshot_changed_during_backup');
 const s=first.snapshot;
 const envelope={schema:TRANSACTIONAL_BACKUP_SCHEMA,key:MAIN_KEY,
  revision:s.revision,exportedAt:new Date().toISOString(),
  mainRaw:s.mainRaw,undoRaw:s.undoRaw,legacyFence:s.legacyFence};
 // A valid legacy seal is already checked by readTransactional3D.
 const a=await sha256(s.mainRaw),b=await sha256(s.undoRaw);
 if(!a||!b)return failed('backup_crypto_unavailable');
 const c=await sha256(payload(envelope));
 if(!c)return failed('backup_crypto_unavailable');
 envelope.sha256={mainRaw:a,undoRaw:b,payload:c};
 const check=await verifyTransactionalBackup(envelope);
 if(!check.ok)return check;
 const last=await readSnapshot(databaseName,MAIN_KEY);
 if(!last.ok)return last;
 if(!last.snapshot||last.snapshot.revision!==s.revision||
   last.snapshot.mainRaw!==s.mainRaw||last.snapshot.undoRaw!==s.undoRaw||
   JSON.stringify(last.snapshot.legacyFence)!==JSON.stringify(s.legacyFence))
   return failed('snapshot_changed_during_backup');
 try{
  if(storage.getItem(AUTH_KEY)!=='idb')
   return failed('authority_changed_during_backup');
 }catch(_){return failed('authority_unreadable');}
 return {ok:true,reason:'verified_current_snapshot',backup:envelope};
}
