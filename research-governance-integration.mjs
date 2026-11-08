/* Thin, non-authoritative read-only adapter over PR #75. Do not add writes. */
import {readAuthoritativeNodeContext} from './research-context-bridge.mjs';
import {previewWorldClaimReference} from './concept-reuse-compat.mjs';
import {auditBridgePreview} from './research-governance-bridge.mjs';

export async function previewResearchBridge({storage,nodeId,recordId,...options}={}){
  if(!storage||typeof storage.getItem!=='function')
    return {status:'blocked',decision:'HOLD',reason_codes:['STORAGE_READER_MISSING'],packet:null};
  const brainRef=await readAuthoritativeNodeContext(storage,nodeId);
  if(brainRef.status!=='linked')
    return {status:'blocked',decision:'HOLD',reason_codes:['NODE_'+brainRef.status.toUpperCase()],packet:null};
  const preview=previewWorldClaimReference({storage,brainRef,recordId});
  return auditBridgePreview({preview,...options});
}