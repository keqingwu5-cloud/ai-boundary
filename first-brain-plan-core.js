/* Isolated, add-only plan candidate / local receipt. No network or secrets. */
(function (root,factory){const api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(root)root.FirstBrainPlanCore=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
/** Default allowlist: known first-brain Notion page UUID (no hyphens / with hyphens). An empty allowlist rejects all packets. */
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
  if(Array.isArray(allow)){
    if(allow.length===0) throw Error("source_id_allowlist_empty");
    const norm=normalizeSourceId(p.source_id);
    const ok=allow.some(a=>normalizeSourceId(a)===norm);
    if(!ok) throw Error("source_id_not_allowed");
  }
  if (!Array.isArray(p.dimensions)||p.dimensions.length!==8) throw Error("exactly_eight_dimensions_required");
  const seen=new Set();
  for (const d of p.dimensions) {
    if(!d||!/^D[1-8]$/.test(d.id)||seen.has(d.id)||!text(d.title,80)||!text(d.question,200)) throw Error("dimension_invalid");
    seen.add(d.id);
  }
  if(seen.size!==8) throw Error("dimension_ids_incomplete");
  return p;
}
// The receipt preserves the original baseline. A later local deletion can
// change the current graph without making that historical receipt invalid.
function assertReceiptGraphIntact(state, receipt) {
  const { node_ids: ids, root_node_id: rootId } = receipt.payload;
  const nodes = new Map(state.nodes.map(node => [node.id, node]));
  if (nodes.size !== state.nodes.length) throw Error("receipt_graph_integrity_duplicate_node_id");
  const links = new Map();
  const linked = new Set();
  for (const link of state.links) {
    if (links.has(link.id)) throw Error("receipt_graph_integrity_duplicate_link_id");
    links.set(link.id, link);
    linked.add(link.from);
    linked.add(link.to);
  }
  const deleted = new Set(state.history.slice(state.history.indexOf(receipt) + 1)
    .filter(event => event.action === "delete").map(event => event.payload?.nodeId));
  const rootDeleted = !nodes.has(rootId) && deleted.has(rootId);
  const anchorFields = ["packet_id", "source_id", "source_revision", "packet_sha256"];
  let intact = true;
  for (const id of ids) {
    const node = nodes.get(id);
    if (!node) {
      if (linked.has(id) || links.has("l_" + id) || !(rootDeleted || deleted.has(id))) {
        throw Error("receipt_graph_incomplete_missing_node");
      }
      intact = false;
      continue;
    }
    const anchor = node.planSource;
    if (!anchor || anchorFields.some(field => anchor[field] !== receipt.payload[field])) {
      throw Error("receipt_graph_source_anchor_conflict");
    }
    if (id === rootId ? node.parentId != null : node.parentId !== rootId) {
      throw Error("receipt_graph_integrity_parent_mismatch");
    }
    if (id === rootId) continue;
    const link = links.get("l_" + id);
    if (!link) throw Error("receipt_graph_incomplete_missing_link");
    if (link.from !== rootId || link.to !== id || link.kind !== "derived") {
      throw Error("receipt_graph_integrity_link_mismatch");
    }
  }
  return intact;
}
function preparePlan(original,p,opts) {
  validatePlan(p,opts);
  const digest=opts?.digest,now=opts?.now;
  if(typeof digest!=="string"||!/^[a-f0-9]{64}$/.test(digest)||!Number.isSafeInteger(now)||now<=0)throw Error("receipt_metadata_invalid");
  if(!original||!Array.isArray(original.brains)||!original.brains.some(b=>b.id==="main")||!Array.isArray(original.nodes)||!Array.isArray(original.links)||!Array.isArray(original.history))throw Error("brain_state_invalid");
  const prefix="n_fp_"+p.packet_id.toLowerCase(),rootId=prefix+"_root";
  const wanted=[rootId,...p.dimensions.map(d=>prefix+"_"+d.id.toLowerCase())];
  const existing=original.history.find(h=>h.action==="plan.loaded"&&h.payload?.packet_id===p.packet_id);
  if (existing) {
    const receipt = existing.payload;
    if (receipt.packet_sha256 !== digest || receipt.source_revision !== p.source_revision ||
        receipt.source_id !== p.source_id || receipt.source_url !== p.source_url ||
        receipt.root_node_id !== rootId || !Array.isArray(receipt.node_ids) ||
        receipt.node_ids.length !== wanted.length || wanted.some((id, i) => receipt.node_ids[i] !== id)) {
      throw Error("receipt_conflict_or_missing_nodes");
    }
    const intact = assertReceiptGraphIntact(original, existing);
    return {changed:false,state:original,receipt:existing,addedNodes:0,currentStatus:intact?"structure_matches":"modified_after_import"};
  }
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
return {validatePlan,preparePlan,DEFAULT_ALLOWED_SOURCE_IDS,normalizeSourceId};
});
