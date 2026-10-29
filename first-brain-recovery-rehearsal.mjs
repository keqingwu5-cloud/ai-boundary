/* R22: isolated, explicitly confirmed recovery rehearsal of a verified R21
 * backup. No production DB names or raw legacy keys are accepted. NO promotion,
 * activation, migration, production write, or automatic restore is provided.
 * A recovery rehearsal is not proof a device can recover evicted data.
 */
import {verifyTransactionalBackup} from './first-brain-transactional-backup.mjs';
import {MAIN_KEY} from './first-brain-idb-adapter.mjs';
export const R22_REHEARSAL_PREFIX='first-brain-r22-rehearsal-';
const SCHEMA='first-brain-r22.rehearsal-stage.v1',STORE='snapshots';
const fail=reason=>({ok:false,reason});
const idValid=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
export function newRecoveryRehearsalId(){
 const bytes=new Uint8Array(16);
 crypto.getRandomValues(bytes);
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export function recoveryRehearsalName(id){
 return idValid(id)?R22_REHEARSAL_PREFIX+id:null;
}
function openRehearsal(id,create=false){
 const name=recoveryRehearsalName(id);
 if(!name)return Promise.resolve(fail('invalid_rehearsal_id'));
 if(typeof indexedDB==='undefined')return Promise.resolve(fail('indexeddb_unavailable'));
 return new Promise(resolve=>{
  let req,done=false,missing=false;
  const finish=result=>{
   if(done){if(result?.db)result.db.close();return;}
   done=true;resolve(result);
  };
  try{req=indexedDB.open(name,1);}
  catch(_){finish(fail('rehearsal_open_failed'));return;}
  req.onupgradeneeded=()=>{
   if(!create){missing=true;try{req.transaction.abort();}catch(_){}return;}
   const db=req.result;
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});
  };
  req.onerror=()=>finish(fail(missing?'rehearsal_missing':'rehearsal_open_failed'));
  req.onblocked=()=>finish(fail('rehearsal_open_blocked'));
  req.onsuccess=()=>finish({ok:true,db:req.result});
 });
}
function readEntry(db){
 return new Promise(resolve=>{
  let tx,result;
  try{
   tx=db.transaction(STORE,'readonly');
   result=tx.objectStore(STORE).get(MAIN_KEY);
  }catch(_){resolve(fail('rehearsal_read_failed'));return;}
  tx.oncomplete=()=>resolve({ok:true,entry:result.result??null});
  tx.onabort=()=>resolve(fail('rehearsal_read_failed'));
  tx.onerror=()=>{};
 });
}
function stageEntry(db,backup){
 return new Promise(resolve=>{
  let tx,answer=fail('rehearsal_write_failed'),done=false;
  const finish=out=>{if(done)return;done=true;resolve(out);};
  try{
   tx=db.transaction(STORE,'readwrite');
   const store=tx.objectStore(STORE),get=store.get(MAIN_KEY);
   get.onsuccess=()=>{
    if(get.result!==undefined){answer=fail('rehearsal_already_exists');return;}
    const entry={
     key:MAIN_KEY,revision:1,mainRaw:backup.mainRaw,undoRaw:backup.undoRaw,
     legacyFence:backup.legacyFence,
     rehearsal:{schema:SCHEMA,sourceRevision:backup.revision,
      sourceDigest:backup.sha256.payload,exportedAt:backup.exportedAt}
    };
    try{store.put(entry);answer={ok:true,reason:'rehearsal_staged'};}
    catch(_){answer=fail('rehearsal_write_failed');try{tx.abort();}catch(_){}}
   };
  }catch(_){try{tx?.abort();}catch(_){}finish(fail('rehearsal_write_failed'));return;}
  tx.oncomplete=()=>finish(answer);
  tx.onabort=()=>finish(fail('rehearsal_transaction_aborted'));
  tx.onerror=()=>{};
 });
}
export async function verifyRecoveryRehearsal(backup,id){
 if(!idValid(id))return fail('invalid_rehearsal_id');
 const checked=await verifyTransactionalBackup(backup);
 if(!checked.ok)return checked;
 const opened=await openRehearsal(id,false);
 if(!opened.ok)return opened;
 try{
  const read=await readEntry(opened.db);
  if(!read.ok)return read;
  const v=read.entry;
  if(!v)return fail('rehearsal_snapshot_missing');
  if(v.key!==MAIN_KEY||v.revision!==1||v.rehearsal?.schema!==SCHEMA||
    v.rehearsal.sourceRevision!==backup.revision||
    v.rehearsal.sourceDigest!==backup.sha256.payload||
    v.rehearsal.exportedAt!==backup.exportedAt||
    v.mainRaw!==backup.mainRaw||v.undoRaw!==backup.undoRaw||
    JSON.stringify(v.legacyFence)!==JSON.stringify(backup.legacyFence))
    return fail('rehearsal_does_not_match_backup');
  return {ok:true,reason:'isolated_roundtrip_matches',
   sourceRevision:backup.revision,stagedRevision:1};
 }finally{opened.db.close();}
}
export async function stageRecoveryRehearsal(backup,id,{confirmed=false}={}){
 if(!idValid(id))return fail('invalid_rehearsal_id');
 if(confirmed!==true)return fail('explicit_confirmation_required');
 const checked=await verifyTransactionalBackup(backup);
 if(!checked.ok)return checked;
 const opened=await openRehearsal(id,true);
 if(!opened.ok)return opened;
 let result;
 try{result=await stageEntry(opened.db,backup);}
 finally{opened.db.close();}
 if(!result.ok)return result;
 const verified=await verifyRecoveryRehearsal(backup,id);
 if(!verified.ok)return verified;
 return {ok:true,reason:'isolated_rehearsal_verified',
  sourceRevision:backup.revision,stagedRevision:1};
}
export async function discardRecoveryRehearsal(id,{confirmed=false}={}){
 const name=recoveryRehearsalName(id);
 if(!name)return fail('invalid_rehearsal_id');
 if(confirmed!==true)return fail('explicit_confirmation_required');
 return new Promise(resolve=>{
  let req;
  try{req=indexedDB.deleteDatabase(name);}
  catch(_){resolve(fail('rehearsal_delete_failed'));return;}
  req.onsuccess=()=>resolve({ok:true,reason:'isolated_rehearsal_deleted'});
  req.onerror=()=>resolve(fail('rehearsal_delete_failed'));
  req.onblocked=()=>resolve(fail('rehearsal_delete_blocked'));
 });
}
