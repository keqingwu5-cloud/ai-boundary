/* World model v2 history journal. Independent of First Brain/Memory.
 * v1 is immutable baseline; every mutation appends a versioned event to ONE v2 key.
 * localStorage is NOT a transactional cross-tab or tamper-proof database. */
export const LEGACY_KEY='worldModel.verify.v1';
export const JOURNAL_KEY='worldModel.verify.events.v2';
export const JOURNAL_SCHEMA='worldModel.verify.events.v2';
export const STATUSES=['待驗證','事件事實已確認（自評）','假設被反例推翻（自評）','證據不足'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const bad=(reason)=>({ok:false,reason,rows:[],events:[],rawV2:null,rawV1:null});
function validateRows(rows){
 if(!Array.isArray(rows)||rows.length>500)return false;
 const ids=new Set();
 for(const r of rows){
  if(!object(r)||typeof r.id!=='string'||!r.id||r.id.length>200||ids.has(r.id)||
   typeof r.hypothesis!=='string'||r.hypothesis.length>800||
   typeof r.falsifier!=='string'||r.falsifier.length>800||
   typeof r.createdOn!=='string'||typeof r.deadline!=='string'||
   !STATUSES.includes(r.status))return false;
  ids.add(r.id);
 }
 return true;
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function replay(rows,event){
 const current=clone(rows);
 if(event.type==='create'){
  if(event.before!==null||!validateRows([event.after])||
    current.some(r=>r.id===event.after.id)||event.recordId!==event.after.id)
    throw Error('create_shape');
  current.push(clone(event.after));
 }else if(event.type==='status'){
  const idx=current.findIndex(r=>r.id===event.recordId);
  if(idx<0||!same(current[idx],event.before)||!object(event.after)||
     event.after.id!==event.recordId||!STATUSES.includes(event.after.status)||
     event.after.status===event.before.status)throw Error('status_mismatch');
  const expected={...event.before,status:event.after.status};
  if(!same(event.after,expected))throw Error('status_unrelated_changes');
  current[idx]=clone(event.after);
 }else if(event.type==='delete'){
  const idx=current.findIndex(r=>r.id===event.recordId);
  if(idx<0||!same(current[idx],event.before)||event.after!==null)throw Error('delete_mismatch');
  current.splice(idx,1);
 }else if(event.type==='import'||event.type==='restore'){
  if(event.recordId!==null||!same(current,event.before)||!validateRows(event.after))
    throw Error('snapshot_mismatch');
  return clone(event.after);
 }else throw Error('unknown_event');
 if(!validateRows(current))throw Error('rows_invalid');
 return current;
}
export function readWorldLedger(storage){
 let rawV1,rawV2;
 try{rawV1=storage.getItem(LEGACY_KEY);rawV2=storage.getItem(JOURNAL_KEY);}
 catch(_){return bad('storage_unreadable');}
 let base;
 try{base=rawV1===null?[]:JSON.parse(rawV1);}catch(_){return bad('legacy_corrupt');}
 if(!validateRows(base))return bad('legacy_invalid');
 if(rawV2===null)return {ok:true,reason:'ok',rows:clone(base),events:[],rawV1,rawV2,baseRaw:rawV1};
 let ledger;
 try{ledger=JSON.parse(rawV2);}catch(_){return bad('journal_corrupt');}
 if(!object(ledger)||ledger.schema!==JOURNAL_SCHEMA||ledger.baseRaw!==rawV1||
    !Array.isArray(ledger.events)||ledger.events.length>2000)return bad('journal_invalid_or_base_changed');
 let rows=clone(base),prior=null;const ids=new Set();
 for(let i=0;i<ledger.events.length;i++){
  const e=ledger.events[i];
  if(!object(e)||e.version!==i+1||typeof e.eventId!=='string'||!e.eventId||
     ids.has(e.eventId)||e.previousEventId!==prior||!['create','status','delete','import','restore'].includes(e.type)||
     typeof e.at!=='string'||Number.isNaN(Date.parse(e.at))||
     typeof e.reason!=='string'||!e.reason.trim()||e.reason.length>500||
     (e.sourceNodeId!==null&&(typeof e.sourceNodeId!=='string'||!/^[a-z0-9_.:-]{1,160}$/i.test(e.sourceNodeId))))
    return bad('journal_event_invalid');
  try{rows=replay(rows,e);}catch(_){return bad('journal_chain_broken');}
  ids.add(e.eventId);prior=e.eventId;
 }
 return {ok:true,reason:'ok',rows,events:clone(ledger.events),rawV1,rawV2,baseRaw:rawV1};
}
export function rowsAtVersion(storage,version){
 const state=readWorldLedger(storage);
 if(!state.ok)return state;
 if(!Number.isInteger(version)||version<0||version>state.events.length)return bad('version_invalid');
 let rows=state.rawV1===null?[]:JSON.parse(state.rawV1);
 try{
  for(const e of state.events.slice(0,version))rows=replay(rows,e);
 }catch(_){return bad('historical_replay_failed');}
 return {ok:true,version,rows:clone(rows)};
}
export function appendWorldLedger(storage,expectedRawV2,change){
 const before=readWorldLedger(storage);
 if(!before.ok)return {ok:false,reason:before.reason};
 if(before.rawV2!==expectedRawV2)return {ok:false,reason:'stale_tab_conflict'};
 if(before.events.length>=2000)return {ok:false,reason:'journal_full_export_required'};
 if(!object(change)||typeof change.reason!=='string'||!change.reason.trim()||
    change.reason.length>500)return {ok:false,reason:'reason_required'};
 const type=change.type;
 let previous=null,next=null,id=null;
 if(type==='create'){
  next=clone(change.row);id=next.id;
 }else if(type==='status'||type==='delete'){
  id=change.recordId;
  previous=before.rows.find(r=>r.id===id);
  if(!previous)return {ok:false,reason:'record_missing'};
  previous=clone(previous);
  next=type==='status'?{...previous,status:change.status}:null;
 }else if(type==='import'||type==='restore'){
  previous=clone(before.rows);next=clone(change.rows);id=null;
 }else return {ok:false,reason:'type_invalid'};
 const last=before.events.at(-1);
 const event={
  version:before.events.length+1,
  eventId:typeof change.eventId==='string'&&change.eventId?change.eventId:
    'w2-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12),
  previousEventId:last?.eventId||null,
  type,recordId:id,at:new Date().toISOString(),reason:change.reason.trim(),
  sourceNodeId:change.sourceNodeId??null,before:previous,after:next
 };
 let after;
 try{after=replay(before.rows,event);}
 catch(e){return {ok:false,reason:'invalid_transition_'+e.message};}
 const payload={schema:JOURNAL_SCHEMA,baseRaw:before.rawV1,events:[...before.events,event]};
 const value=JSON.stringify(payload);
 // Recheck both snapshots immediately before writing. Browser storage has no atomic
 // compare-and-swap; a simultaneous interleaving still requires a server-side lock.
 try{
  if(storage.getItem(JOURNAL_KEY)!==expectedRawV2||storage.getItem(LEGACY_KEY)!==before.rawV1)
    return {ok:false,reason:'stale_tab_conflict'};
  storage.setItem(JOURNAL_KEY,value);
  if(storage.getItem(JOURNAL_KEY)!==value)return {ok:false,reason:'readback_mismatch'};
 }catch(_){return {ok:false,reason:'storage_write_failed'};}
 return {ok:true,reason:'ok',rows:after,events:payload.events,rawV1:before.rawV1,rawV2:value,event};
}
