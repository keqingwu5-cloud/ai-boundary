/* Read-only cross-page research reference (NOT a memory store or AI delivery service). */
import {validateBrainImport} from './brain-import-guard.mjs';
const NODE_ID=/^[A-Za-z0-9_.:-]{1,160}$/;
export const RESEARCH_REF_VERSION="brain.research-link.v1";
export function checkedNodeId(raw){
  return typeof raw==="string"&&NODE_ID.test(raw)?raw:null;
}
export function fromWorldModelQuery(search){
  const params=new URLSearchParams(typeof search==="string"?search:"");
  return checkedNodeId(params.get("node"));
}
export function worldModelHref(raw){
  const id=checkedNodeId(raw);
  return id?"./world-model.html?node="+encodeURIComponent(id):"./world-model.html";
}
export function brainHref(raw){
  const id=checkedNodeId(raw);
  return id?"./index.html#node="+encodeURIComponent(id):"./index.html";
}
export function feedHref(raw){
  const id=checkedNodeId(raw);
  return id?"./feed.html#node="+encodeURIComponent(id):"./feed.html";
}
export function readNodeContext(storage,raw){
  const id=checkedNodeId(raw);
  if(!id)return {status:"invalid",node:null};
  let source;
  try{
    const text=storage.getItem("aiBrain.v1");
    if(!text)return {status:"not_saved",node:null};
    source=JSON.parse(text);
  }catch(_){return {status:"unreadable",node:null};}
  if(!source||!Array.isArray(source.nodes)||source.nodes.length>25000)
    return {status:"unreadable",node:null};
  const matches=source.nodes.filter(n=>n&&typeof n==="object"&&n.id===id);
  if(matches.length>1)return {status:"ambiguous",node:null};
  // A node alone does not make a corrupt graph an authoritative research source.
  const integrity=validateBrainImport(source);
  if(!integrity.ok)return {status:"unreadable",node:null};
  if(matches.length!==1)return {status:"missing",node:null};
  const n=matches[0];
  if(typeof n.title!=="string")return {status:"unreadable",node:null};
  // Only a compact locator, not the private graph, evidence or full research text.
  return {status:"linked",node:{
    id,brainId:typeof n.brainId==="string"?n.brainId:"",
    title:n.title.slice(0,180),
    kind:typeof n.kind==="string"?n.kind:"",
    status:typeof n.status==="string"?n.status:""
  }};
}
// Read-only resolution honors the First Brain's active persistence authority.
// Never silently fall back to a stale localStorage node after an IDB cutover.
export async function readAuthoritativeNodeContext(storage,raw){
  let authority;
  try{authority=storage.getItem('aiBrain.v1.persistence.authority');}
  catch(_){return {status:'unreadable',node:null};}
  if(authority===null)return readNodeContext(storage,raw);
  if(authority!=='idb')return {status:'unreadable',node:null};
  let current;
  try{
    const {readTransactional3D}=await import('./first-brain-idb-adapter.mjs');
    current=await readTransactional3D('aiBrain.firstBrain.transaction.r1');
  }catch(_){return {status:'unreadable',node:null};}
  if(!current.ok)return {status:'unreadable',node:null};
  const shim={getItem:key=>key==='aiBrain.v1'?JSON.stringify(current.graph):null};
  return readNodeContext(shim,raw);
}
export function exportResearchReference(ref){
  if(!ref||ref.status!=="linked"||!ref.node)return null;
  return {schema:RESEARCH_REF_VERSION,source:"aiBrain.v1",node_id:ref.node.id,
    brain_id:ref.node.brainId,link_status:"local_read_only_unverified",
    scope:"reference_only_not_evidence_or_approval"};
}
