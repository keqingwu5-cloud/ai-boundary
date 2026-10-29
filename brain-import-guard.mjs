/* Isolated import validation and persistence. No DOM, network or private-memory access. */
import {validateLearningRecords} from './brain-learning-feedback.mjs';
const record=x=>x!==null && typeof x==="object" && !Array.isArray(x);
const id=x=>typeof x==="string" && x.length>0 && x.length<=200;
const vec3=x=>Array.isArray(x) && x.length===3 && x.every(Number.isFinite);
export function validateBrainImport(s) {
  if(!record(s)||!Array.isArray(s.brains)||!Array.isArray(s.nodes)||
     !Array.isArray(s.links)||!Array.isArray(s.history))return {ok:false,reason:"top_level_invalid"};
  // Explicit future versions must not be silently migrated back to v2.
  // Unversioned legacy snapshots remain accepted for compatibility pending a
  // separately reviewed migration policy and real historic sample coverage.
  if(s.version!==undefined&&s.version!==1&&s.version!==2)
    return {ok:false,reason:"unsupported_graph_version"};
  if(s.brains.length>1000||s.nodes.length>25000||s.links.length>60000||
     s.history.length>200000)return {ok:false,reason:"collection_too_large"};
  const brains=new Map(),nodes=new Map(),linkIds=new Set();
  for(const b of s.brains){
    if(!record(b)||!id(b.id)||brains.has(b.id))return {ok:false,reason:"brain_id_invalid_or_duplicate"};
    if(b.position!==undefined&&!vec3(b.position))return {ok:false,reason:"brain_position_invalid"};
    brains.set(b.id,b);
  }
  if(!brains.has("main"))return {ok:false,reason:"main_brain_missing"};
  for(const b of s.brains){
    if(b.parentBrainId!=null&&!brains.has(b.parentBrainId))return {ok:false,reason:"brain_parent_missing"};
  }
  // The old PR #4 validator already checked brain ancestry cycles; rejecting
  // them here closes the divergence without touching valid legacy snapshots.
  const visitedBrains=new Set();
  for(const b of s.brains){
    if(visitedBrains.has(b.id))continue;
    const local=new Set(),line=[];
    let cur=b;
    while(cur&&!visitedBrains.has(cur.id)){
      if(local.has(cur.id))return {ok:false,reason:"brain_parent_cycle"};
      local.add(cur.id);line.push(cur.id);
      cur=cur.parentBrainId==null?null:brains.get(cur.parentBrainId);
    }
    for(const x of line)visitedBrains.add(x);
  }
  for(const n of s.nodes){
    if(!record(n)||!id(n.id)||nodes.has(n.id))return {ok:false,reason:"node_id_invalid_or_duplicate"};
    if(!id(n.brainId)||!brains.has(n.brainId))return {ok:false,reason:"node_brain_missing"};
    if(n.parentId!=null&&!id(n.parentId))return {ok:false,reason:"node_parent_invalid"};
    if(typeof n.title!=="string"||!vec3(n.pos))return {ok:false,reason:"node_shape_invalid"};
    if(n.concepts!==undefined&&(!Array.isArray(n.concepts)||n.concepts.some(v=>typeof v!=="string")))
      return {ok:false,reason:"node_concepts_invalid"};
    if(n.media!=null&&!record(n.media))return {ok:false,reason:"node_media_invalid"};
    // R11 only validates present feedback. Historical graphs without the
    // optional field remain byte-for-byte compatible and are never upgraded.
    if(n.learningRecords!==undefined&&!validateLearningRecords(n.learningRecords))
      return {ok:false,reason:"node_learning_records_invalid"};
    nodes.set(n.id,n);
  }
  for(const n of s.nodes){
    if(n.parentId!=null&&(!nodes.has(n.parentId)||n.parentId===n.id))
      return {ok:false,reason:"node_parent_missing_or_self"};
  }
  // Detect cycles without confusing allowed cross-brain relations with parent ancestry.
  const done=new Set(),active=new Set();
  for(const n of s.nodes){
    if(done.has(n.id))continue;
    const chain=[];let current=n;
    while(current&&!done.has(current.id)){
      if(active.has(current.id))return {ok:false,reason:"node_parent_cycle"};
      active.add(current.id);chain.push(current.id);
      current=current.parentId==null?null:nodes.get(current.parentId);
    }
    for(const key of chain){active.delete(key);done.add(key);}
  }
  for(const b of s.brains)if(b.rootNodeId!=null&&!nodes.has(b.rootNodeId))
    return {ok:false,reason:"brain_root_missing"};
  for(const l of s.links){
    if(!record(l)||!id(l.id)||linkIds.has(l.id))
      return {ok:false,reason:"link_id_invalid_or_duplicate"};
    if(!nodes.has(l.from)||!nodes.has(l.to)||l.from===l.to)
      return {ok:false,reason:"link_endpoint_missing_or_self"};
    linkIds.add(l.id);
  }
  if(s.history.some(x=>!record(x)))return {ok:false,reason:"history_event_invalid"};
  return {ok:true,reason:"ok"};
}
// Best-effort rollback: never intentionally replace a different writer's value.
// The read-and-restore check is NOT atomic and does not make localStorage CAS-safe.
function restoreIfOwned(storage,key,ours,previous){
  if(storage.getItem(key)!==ours)return false;
  if(previous===null)storage.removeItem(key);
  else storage.setItem(key,previous);
  return storage.getItem(key)===previous;
}
export function commitBrainImport(storage,mainKey,undoKey,nextState,nextUndo,expectedMainRaw){
  let oldMain,oldUndo;
  try{oldMain=storage.getItem(mainKey);oldUndo=storage.getItem(undoKey);}
  catch(_){return {ok:false,reason:"snapshot_read_failed",rollbackOk:true};}
  // Optimistic revision check: never overwrite another tab's newer snapshot.
  if(expectedMainRaw!==undefined && oldMain!==expectedMainRaw)
    return {ok:false,reason:"stale_write_conflict",rollbackOk:true};
  let undoWritten=false,mainWritten=false,undoJSON,mainJSON;
  try{
    undoJSON=JSON.stringify(nextUndo);mainJSON=JSON.stringify(nextState);
    if(typeof undoJSON!=="string"||typeof mainJSON!=="string")throw Error("serialize_failed");
    // A failed main setItem leaves main unchanged; undo is restored below.
    storage.setItem(undoKey,undoJSON);undoWritten=true;
    storage.setItem(mainKey,mainJSON);mainWritten=true;
    if(storage.getItem(mainKey)!==mainJSON||storage.getItem(undoKey)!==undoJSON)
      throw Error("readback_mismatch");
    return {ok:true,reason:"ok",rollbackOk:true};
  }catch(e){
    let rollbackOk=true;
    // If a newer value appeared during this write, do not deliberately
    // overwrite it with our old snapshot. Leave the conflict visible.
    if(mainWritten){try{if(!restoreIfOwned(storage,mainKey,mainJSON,oldMain))rollbackOk=false;}catch(_){rollbackOk=false;}}
    if(undoWritten){try{if(!restoreIfOwned(storage,undoKey,undoJSON,oldUndo))rollbackOk=false;}catch(_){rollbackOk=false;}}
    return {ok:false,reason:e&&e.message==="readback_mismatch"?"readback_mismatch":"write_failed",rollbackOk};
  }
}
