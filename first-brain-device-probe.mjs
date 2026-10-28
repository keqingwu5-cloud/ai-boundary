/* R17 device-only diagnostic. Never imports/opens First Brain databases,
 * never reads localStorage, and never uploads data. A probe is entirely synthetic.
 */
export const R17_PREFIX='first-brain-r17-isolated-probe-';
const okId=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
const denied=reason=>({ok:false,reason});
const probeName=id=>okId(id)?R17_PREFIX+id:null;
export function newProbeId(){
 const bytes=new Uint8Array(16);
 crypto.getRandomValues(bytes);
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
function openDatabase(id){
 const name=probeName(id);
 if(!name)return Promise.resolve(denied('invalid_probe_id'));
 return new Promise(resolve=>{
  let request;
  try{request=indexedDB.open(name,1);}
  catch(_){resolve(denied('indexeddb_open_exception'));return;}
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains('receipts'))db.createObjectStore('receipts',{keyPath:'key'});
  };
  request.onsuccess=()=>resolve({ok:true,db:request.result});
  request.onerror=()=>resolve(denied('indexeddb_open_failed'));
  request.onblocked=()=>resolve(denied('indexeddb_open_blocked'));
 });
}
function transactionWrite(db,entries,abort=false){
 return new Promise(resolve=>{
  let tx;
  try{
   tx=db.transaction('receipts','readwrite');
   const store=tx.objectStore('receipts');
   for(const [key,value] of entries)store.put({key,value});
   if(abort)tx.abort();
  }catch(_){try{tx?.abort();}catch(_){}resolve(denied('write_setup_failed'));return;}
  tx.oncomplete=()=>resolve({ok:true});
  tx.onabort=()=>resolve(denied('transaction_aborted'));
  tx.onerror=()=>resolve(denied('transaction_failed'));
 });
}
function transactionRead(db){
 return new Promise(resolve=>{
  let tx,graph,undo;
  try{
   tx=db.transaction('receipts','readonly');
   graph=tx.objectStore('receipts').get('graph');
   undo=tx.objectStore('receipts').get('undo');
  }catch(_){resolve(denied('read_setup_failed'));return;}
  tx.oncomplete=()=>resolve({ok:true,graph:graph.result?.value,undo:undo.result?.value});
  tx.onabort=()=>resolve(denied('read_aborted'));
  tx.onerror=()=>resolve(denied('read_failed'));
 });
}
const expected=id=>({graph:'synthetic-r17-graph-'+id,undo:'synthetic-r17-undo-'+id});
export async function verifyProbe(id){
 const opened=await openDatabase(id);
 if(!opened.ok)return opened;
 try{
  const read=await transactionRead(opened.db);
  if(!read.ok)return read;
  const target=expected(id);
  return read.graph===target.graph&&read.undo===target.undo
   ?{ok:true,reason:'synthetic_graph_undo_match'}
   :denied('synthetic_receipt_missing_or_modified');
 }finally{opened.db.close();}
}
export async function startProbe(id){
 const opened=await openDatabase(id);
 if(!opened.ok)return opened;
 const db=opened.db;
 try{
  const target=expected(id);
  const first=await transactionWrite(db,Object.entries(target));
  if(!first.ok)return first;
  const initial=await transactionRead(db);
  if(!initial.ok||initial.graph!==target.graph||initial.undo!==target.undo)
    return denied('initial_synthetic_readback_failed');
  const aborted=await transactionWrite(db,[['graph','unsafe-r17-graph'],['undo','unsafe-r17-undo']],true);
  if(aborted.ok||aborted.reason!=='transaction_aborted')
    return denied('abort_test_failed');
  const after=await transactionRead(db);
  if(!after.ok||after.graph!==target.graph||after.undo!==target.undo)
    return denied('abort_leaked_partial_state');
  return {ok:true,reason:'atomic_graph_undo_and_abort_verified'};
 }finally{db.close();}
}
export async function clearProbe(id){
 const name=probeName(id);
 if(!name)return denied('invalid_probe_id');
 return new Promise(resolve=>{
  let req;
  try{req=indexedDB.deleteDatabase(name);}
  catch(_){resolve(denied('delete_failed'));return;}
  req.onsuccess=()=>resolve({ok:true,reason:'isolated_probe_deleted'});
  req.onerror=()=>resolve(denied('delete_failed'));
  req.onblocked=()=>resolve(denied('delete_blocked_close_other_tabs'));
 });
}
export async function readStorageHints(){
 const result={persistent:'unknown',quota:'unavailable',usage:'unavailable'};
 try{
  if(navigator.storage?.persisted)result.persistent=await navigator.storage.persisted();
  if(navigator.storage?.estimate){
   const e=await navigator.storage.estimate();
   if(Number.isFinite(e.quota))result.quota=Math.round(e.quota/1048576);
   if(Number.isFinite(e.usage))result.usage=Math.round(e.usage/1048576);
  }
 }catch(_){}
 return result;
}
