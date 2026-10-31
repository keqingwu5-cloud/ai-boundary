/* Isolated, add-only plan candidate / local receipt. No network or secrets. */
(function (root,factory){const api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(root)root.FirstBrainPlanCore=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
/** Default allowlist: known first-brain Notion page UUID (with / without hyphens). An explicit override must be a non-empty array of non-empty strings. */
const DEFAULT_ALLOWED_SOURCE_IDS=Object.freeze([
  "4009d611-eff6-8173-aee2-f23d5eda3350",
  "4009d611eff68173aee2f23d5eda3350"
]);
function normalizeSourceId(s){return String(s||"").trim().toLowerCase().replace(/-/g,"");}
function validatePlan(p,opts) {
  const text=(v,n)=>typeof v==="string"&&v.trim().length>0&&v.length<=n;
  if (!p||p.schema!=="ai-boundary.first-brain-plan.v1") throw Error("plan_schema_invalid");
  if (!text(p.packet_id,80)||!/^[A-Z0-9][A-Z0-9_-]*$/.test(p.packet_id)) throw Error("packet_id_invalid");
  if (!text(p.source_id,100)||!text(p.source_revision,100)||!text(p.title,100)||!text(p.goal,500)) throw Error("plan_metadata_invalid");
  if (!text(p.source_url,512)||!/^https:\/\/[^\s<>]+$/.test(p.source_url)) throw Error("source_url_invalid");
  const allow=opts&&Object.prototype.hasOwnProperty.call(opts,"allowedSourceIds")
    ? opts.allowedSourceIds
    : DEFAULT_ALLOWED_SOURCE_IDS;
  // Explicitly malformed overrides must never bypass source verification.
  if(!Array.isArray(allow)||allow.some(a=>typeof a!=="string"||!a.trim()))
    throw Error("source_id_allowlist_invalid");
  if(allow.length===0) throw Error("source_id_allowlist_empty");
  const norm=normalizeSourceId(p.source_id);
  const ok=allow.some(a=>normalizeSourceId(a)===norm);
  if(!ok) throw Error("source_id_not_allowed");
  if (!Array.isArray(p.dimensions)||p.dimensions.length!==8) throw Error("exactly_eight_dimensions_required");
  const seen=new Set();
  for (const d of p.dimensions) {
    if(!d||!/^D[1-8]$/.test(d.id)||seen.has(d.id)||!text(d.title,80)||!text(d.question,200)) throw Error("dimension_invalid");
    seen.add(d.id);
  }
  if(seen.size!==8) throw Error("dimension_ids_incomplete");
  return p;
}
/** Verify receipt graph still intact. Missing structure = corruption; title/note edits on intact nodes = legitimate user edit (idempotent unchanged). */
function assertReceiptGraphIntact(state,receipt){
  const payload=receipt&&receipt.payload;
  if(!payload||!Array.isArray(payload.node_ids)||payload.node_ids.length!==9) throw Error("receipt_corrupt_missing_node_ids");
  const rootId=payload.root_node_id;
  if(typeof rootId!=="string"||!rootId) throw Error("receipt_corrupt_missing_root");
  if(payload.node_ids[0]!==rootId) throw Error("receipt_corrupt_root_mismatch");
  const byId=new Map((state.nodes||[]).map(n=>[n.id,n]));
  for(const id of payload.node_ids){
    if(!byId.has(id)) throw Error("receipt_graph_incomplete_missing_node");
  }
  const root=byId.get(rootId);
  if(!root) throw Error("receipt_graph_incomplete_missing_node");
  const childIds=payload.node_ids.slice(1);
  for(const cid of childIds){
    const child=byId.get(cid);
    if(child.parentId!==rootId) throw Error("receipt_graph_integrity_parent_mismatch");
    const linkId="l_"+cid;
    const link=(state.links||[]).find(l=>l.id===linkId);
    if(!link) throw Error("receipt_graph_incomplete_missing_link");
    if(link.from!==rootId||link.to!==cid) throw Error("receipt_graph_integrity_link_mismatch");
  }
  // Duplicate link IDs among plan links = corruption
  const planLinkIds=childIds.map(cid=>"l_"+cid);
  const allIds=(state.links||[]).map(l=>l.id);
  for(const lid of planLinkIds){
    if(allIds.filter(x=>x===lid).length!==1) throw Error("receipt_graph_integrity_duplicate_link_id");
  }
  return true;
}
function preparePlan(original,p,opts) {
  validatePlan(p,opts);
  const digest=opts?.digest,now=opts?.now;
  if(typeof digest!=="string"||!/^[a-f0-9]{64}$/.test(digest)||!Number.isSafeInteger(now)||now<=0)throw Error("receipt_metadata_invalid");
  if(!original||!Array.isArray(original.brains)||!original.brains.some(b=>b.id==="main")||!Array.isArray(original.nodes)||!Array.isArray(original.links)||!Array.isArray(original.history))throw Error("brain_state_invalid");
  const existing=original.history.find(h=>h.action==="plan.loaded"&&h.payload?.packet_id===p.packet_id);
  if(existing){
    const rootId=existing.payload.root_node_id;
    if(existing.payload.packet_sha256!==digest||existing.payload.source_revision!==p.source_revision||!original.nodes.some(n=>n.id===rootId))throw Error("receipt_conflict_or_missing_nodes");
    // Distinguish corruption (incomplete/broken graph) from legitimate user edits on intact nodes.
    assertReceiptGraphIntact(original,existing);
    return {changed:false,state:original,receipt:existing,addedNodes:0};
  }
  const prefix="n_fp_"+p.packet_id.toLowerCase(),rootId=prefix+"_root";
  const wanted=[rootId,...p.dimensions.map(d=>prefix+"_"+d.id.toLowerCase())];
  if(wanted.some(id=>original.nodes.some(n=>n.id===id)))throw Error("node_id_conflict");
  // Reject pre-existing link IDs that would collide with plan links
  for(const id of wanted.slice(1)){
    const lid="l_"+id;
    if(original.links.some(l=>l.id===lid)) throw Error("link_id_conflict");
  }
  const state=JSON.parse(JSON.stringify(original));
  const source={who:"Notion",outlet:"第一大腦總規劃／研究候選",date:p.source_revision.slice(0,10),url:p.source_url,also:[]};
  const mk=(id,parentId,kind,title,oneLiner,pos)=>({
    id,brainId:"main",parentId,kind,title,type:"推理與判斷",oneLiner,source,
    assumptions:"規劃候選；需由第一大腦審視，未經獨立驗證",reasoning:[],counterEvidence:[],
    media:{video:"",image:""},status:"open",createdBy:"plan_import_candidate",createdAt:now,
    collapsed:false,pos,botNotes:[],concepts:[],processPattern:"",
    planSource:{packet_id:p.packet_id,source_id:p.source_id,source_revision:p.source_revision,packet_sha256:digest}
  });
  const rootPos=[-0.23,0.18,0.32];
  state.nodes.push(mk(rootId,null,"question",p.title,p.goal,rootPos));
  p.dimensions.forEach((d,i)=>{
    const angle=i*2*Math.PI/8,childId=prefix+"_"+d.id.toLowerCase();
    const pos=[rootPos[0]+0.13*Math.cos(angle),rootPos[1]+0.11*Math.sin(angle),rootPos[2]-0.06];
    state.nodes.push(mk(childId,rootId,"extension",d.title,d.question,pos));
    state.links.push({id:"l_"+childId,from:rootId,to:childId,kind:"derived",createdAt:now});
  });
  const receipt={
    ts:now,action:"plan.loaded",payload:{
      packet_id:p.packet_id,source_id:p.source_id,source_url:p.source_url,source_revision:p.source_revision,
      packet_sha256:digest,root_node_id:rootId,node_ids:wanted,added_nodes:9,
      result:"local_candidate_loaded",verification:"local_state_only",nodeId:rootId,title:p.title
    }
  };
  state.history.push(receipt);
  return {changed:true,state,receipt,addedNodes:9};
}
return {validatePlan,preparePlan,assertReceiptGraphIntact,DEFAULT_ALLOWED_SOURCE_IDS,normalizeSourceId};
});
