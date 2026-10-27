/* First Brain 3D => transactional storage adapter, R03-05 first integration gate.
 * Explicit opt-in only. This does NOT switch app.js writers or delete localStorage.
 */
import {validateBrainImport} from './brain-import-guard.mjs';
import {readSnapshot,writeSnapshot} from './transactional-brain-store.mjs';

export const MAIN_KEY='aiBrain.v1',UNDO_KEY='aiBrain.v1.undo';
const fail=reason=>({ok:false,reason});
function readGraph(raw){
  if(typeof raw!=='string')return fail('graph_raw_missing');
  let graph;
  try{graph=JSON.parse(raw);}catch(_){return fail('graph_json_invalid');}
  const checked=validateBrainImport(graph);
  if(!checked.ok)return fail('graph_'+checked.reason);
  return {ok:true,graph};
}
function readUndo(raw){
  if(typeof raw!=='string')return fail('undo_raw_missing');
  let undo;
  try{undo=JSON.parse(raw);}catch(_){return fail('undo_json_invalid');}
  if(!Array.isArray(undo)||undo.length>12||undo.some(x=>typeof x!=='string'))
    return fail('undo_shape_invalid');
  for(const item of undo){
    const test=readGraph(item);
    if(!test.ok)return fail('undo_'+test.reason);
  }
  return {ok:true,undo};
}
// Read ONLY existing stored bytes. Never seed, repair or migrate without explicit consent.
export function inspectLegacy3D(storage){
  let mainRaw,undoRaw;
  try{
    mainRaw=storage.getItem(MAIN_KEY);
    undoRaw=storage.getItem(UNDO_KEY);
  }catch(_){return fail('legacy_storage_unreadable');}
  if(mainRaw===null)return fail('legacy_main_missing');
  const main=readGraph(mainRaw);
  if(!main.ok)return main;
  const undo=readUndo(undoRaw===null?'[]':undoRaw);
  if(!undo.ok)return undo;
  return {ok:true,reason:'ok',mainRaw,undoRaw:undoRaw===null?'[]':undoRaw,
    graph:main.graph,undo:undo.undo};
}
export async function readTransactional3D(databaseName){
  const result=await readSnapshot(databaseName,MAIN_KEY);
  if(!result.ok)return result;
  if(result.snapshot===null)return fail('transactional_snapshot_missing');
  const main=readGraph(result.snapshot.mainRaw);
  if(!main.ok)return main;
  const undo=readUndo(result.snapshot.undoRaw);
  if(!undo.ok)return undo;
  return {ok:true,revision:result.snapshot.revision,graph:main.graph,
    undo:undo.undo,mainRaw:result.snapshot.mainRaw,undoRaw:result.snapshot.undoRaw};
}
// The caller must explicitly opt in. Copy is non-destructive and not activated
// as an authority in the main UI; only tests or an approved migration flow call this.
export async function stageLegacy3D(databaseName,storage,{confirmed=false}={}){
  if(confirmed!==true)return fail('explicit_confirmation_required');
  const source=inspectLegacy3D(storage);
  if(!source.ok)return source;
  // An existing transactional snapshot is never replaced by an old legacy copy.
  const previous=await readSnapshot(databaseName,MAIN_KEY);
  if(!previous.ok)return previous;
  if(previous.snapshot!==null)return fail('transactional_snapshot_exists');
  const outcome=await writeSnapshot(databaseName,MAIN_KEY,0,source.mainRaw,source.undoRaw);
  if(!outcome.ok)return outcome;
  return {ok:true,revision:outcome.revision,reason:'copy_staged_legacy_untouched'};
}
// Candidate Graph edits are committed atomically with their Undo stack.
// Existing app.js and world-model UI continue to use their old authority until
// a future switch covers ALL readers and writers and completes migration Gates.
export async function commitTransactional3D(databaseName,expectedRevision,graph,undo){
  const checked=validateBrainImport(graph);
  if(!checked.ok)return fail('graph_'+checked.reason);
  if(!Array.isArray(undo))return fail('undo_shape_invalid');
  let mainRaw,undoRaw;
  try{mainRaw=JSON.stringify(graph);undoRaw=JSON.stringify(undo);}
  catch(_){return fail('serialization_failed');}
  const history=readUndo(undoRaw);
  if(!history.ok)return history;
  return writeSnapshot(databaseName,MAIN_KEY,expectedRevision,mainRaw,undoRaw);
}
