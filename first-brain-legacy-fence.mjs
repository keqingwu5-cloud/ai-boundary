/* R15 legacy writer detection.
 * Immutable SHA-256 seal of legacy bytes, held in the FIRST indexedDB snapshot.
 * Detects divergence, but CANNOT prevent an uncooperative old application from
 * writing localStorage. The only strong cutover is to close/upgrade old writers.
 */
const MAIN='aiBrain.v1',UNDO='aiBrain.v1.undo';
const err=reason=>({ok:false,reason});
function hex(bytes){return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
async function digest(raw){
 if(!globalThis.crypto?.subtle||!globalThis.TextEncoder)return null;
 return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)));
}
export async function makeLegacyFence(storage,expectedMainRaw,expectedUndoRaw){
 if(typeof expectedMainRaw!=='string'||typeof expectedUndoRaw!=='string')return err('legacy_fence_source_invalid');
 let main,undo;
 try{main=storage.getItem(MAIN);undo=storage.getItem(UNDO)??'[]';}
 catch(_){return err('legacy_fence_unreadable');}
 if(main!==expectedMainRaw||undo!==expectedUndoRaw)return err('legacy_fence_source_changed');
 try{
  const mainSha=await digest(main),undoSha=await digest(undo);
  if(!mainSha||!undoSha)return err('legacy_fence_crypto_unavailable');
  return {ok:true,fence:{version:1,mainSha,undoSha}};
 }catch(_){return err('legacy_fence_crypto_failed');}
}
export async function verifyLegacyFence(storage,fence){
 if(!fence||fence.version!==1||typeof fence.mainSha!=='string'||
    typeof fence.undoSha!=='string'||!/^[a-f0-9]{64}$/.test(fence.mainSha)||
    !/^[a-f0-9]{64}$/.test(fence.undoSha))return err('legacy_fence_missing_or_invalid');
 let main,undo;
 try{main=storage.getItem(MAIN);undo=storage.getItem(UNDO)??'[]';}
 catch(_){return err('legacy_fence_unreadable');}
 if(typeof main!=='string')return err('legacy_writer_detected');
 try{
  const mainSha=await digest(main),undoSha=await digest(undo);
  if(!mainSha||!undoSha)return err('legacy_fence_crypto_unavailable');
  if(mainSha!==fence.mainSha||undoSha!==fence.undoSha)return err('legacy_writer_detected');
  return {ok:true,reason:'legacy_fence_matches'};
 }catch(_){return err('legacy_fence_crypto_failed');}
}
