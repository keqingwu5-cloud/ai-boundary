/* R03-05 isolated feasibility prototype: transactional browser snapshot.
 * NOT wired into app.js or world-model UI; never auto-import legacy localStorage.
 * The single IndexedDB record atomically owns both main and undo snapshots.
 * All future writers must use this authority before any concurrency claim.
 */
const STORE="snapshots";
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const validId=x=>typeof x==="string"&&x.length>0&&x.length<=200;
const validRaw=x=>x===null||typeof x==="string";
const failed=reason=>({ok:false,reason});
function openDatabase(databaseName){
 return new Promise(resolve=>{
  if(!validId(databaseName))return resolve(failed("database_name_invalid"));
  if(typeof indexedDB==="undefined")return resolve(failed("indexeddb_unavailable"));
  let settled=false,request;
  const done=value=>{if(!settled){settled=true;resolve(value);}};
  try{request=indexedDB.open(databaseName,1);}catch(_){return done(failed("database_open_failed"));}
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"key"});
  };
  request.onerror=()=>done(failed("database_open_failed"));
  request.onblocked=()=>done(failed("database_open_blocked"));
  request.onsuccess=()=>{
   if(settled){request.result.close();return;}
   done({ok:true,db:request.result});
  };
 });
}
function validEntry(entry,key){
 return object(entry)&&entry.key===key&&Number.isSafeInteger(entry.revision)&&
  entry.revision>0&&validRaw(entry.mainRaw)&&validRaw(entry.undoRaw);
}
function runTransaction(database,mode,work){
 return new Promise(resolve=>{
  let tx,answer=failed("transaction_incomplete"),settled=false;
  const done=x=>{if(settled)return;settled=true;database.close();resolve(x);};
  try{tx=database.transaction(STORE,mode);work(tx,x=>{answer=x;});}
  catch(_){if(tx){try{tx.abort();}catch(_){}}return done(failed("transaction_start_failed"));}
  tx.oncomplete=()=>done(answer);
  tx.onabort=()=>done(failed("transaction_aborted"));
  tx.onerror=()=>{}; // The abort handler, not a write request, is the completion authority.
 });
}
export async function readSnapshot(databaseName,key){
 if(!validId(key))return failed("key_invalid");
 const opened=await openDatabase(databaseName);
 if(!opened.ok)return opened;
 return runTransaction(opened.db,"readonly",(tx,setResult)=>{
  const req=tx.objectStore(STORE).get(key);
  req.onsuccess=()=>{
   const value=req.result;
   if(value!==undefined&&!validEntry(value,key)){
    setResult(failed("stored_snapshot_invalid"));return;
   }
   setResult({ok:true,reason:"ok",snapshot:value===undefined?null:value});
  };
 });
}
export async function writeSnapshot(databaseName,key,expectedRevision,mainRaw,undoRaw){
 if(!validId(key)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||
    !validRaw(mainRaw)||!validRaw(undoRaw))
  return failed("write_arguments_invalid");
 const opened=await openDatabase(databaseName);
 if(!opened.ok)return opened;
 // One readwrite transaction serializes competing tabs on this object store.
 // No await between get and put: requests remain in the SAME active transaction.
 return runTransaction(opened.db,"readwrite",(tx,setResult)=>{
  const store=tx.objectStore(STORE);
  const req=store.get(key);
  req.onsuccess=()=>{
   const current=req.result;
   if(current!==undefined&&!validEntry(current,key)){
    setResult(failed("stored_snapshot_invalid"));return;
   }
   const revision=current===undefined?0:current.revision;
   if(revision!==expectedRevision){
    setResult({ok:false,reason:"stale_revision",revision});return;
   }
   const next={key,revision:revision+1,mainRaw,undoRaw};
   // Success is ONLY reported by transaction.oncomplete; abort is failure.
   store.put(next);
   setResult({ok:true,reason:"ok",revision:next.revision});
  };
 });
}
