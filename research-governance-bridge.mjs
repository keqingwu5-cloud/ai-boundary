/* First Brain / World Model / Memory / World-as-Chess research bridge.
 * Pure validation and READ-ONLY preview. No storage writes, ACK creation,
 * production mutations, causal certification, or memory approval.
 * Source: PR #75 candidate interface, not a deployed authority.
 */
export const BRIDGE_SCHEMA = 'firstbrain.research-bridge.preview.v1';
export const SOURCE_SCHEMA = 'tcvl.claim-ref-preview.v0.1';
export const WORLD_JOURNAL_SCHEMA = 'worldModel.verify.events.v2';
export const RELATION_DOMAINS = Object.freeze([
  'navigation', 'evidence', 'world_hypothesis', 'relative_semantics', 'normative', 'simulation'
]);
const ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const KEYS = new Set(['subject_id','object_id','comparison_metric','comparison_class','unit',
  'observer','population','valid_at','jurisdiction','normative_standard','scope']);
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&ID.test(x);
const fail=(reason)=>({status:'blocked',decision:'HOLD',reason_codes:[reason],packet:null});
export function instant(value){
  if(typeof value!=='string')return null;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!m)return null;
  const [yy,mo,dd,hh,mm,ss]=m.slice(1,7).map(Number);
  const dt=new Date(Date.UTC(yy,mo-1,dd,hh,mm,ss));
  if(dt.getUTCFullYear()!==yy||dt.getUTCMonth()+1!==mo||dt.getUTCDate()!==dd||
     dt.getUTCHours()!==hh||dt.getUTCMinutes()!==mm||dt.getUTCSeconds()!==ss)return null;
  if(m[7]!=='Z'){
    const oh=Number(m[7].slice(1,3)), om=Number(m[7].slice(4));
    if(oh>14||om>59||(oh===14&&om!==0))return null;
  }
  const t=Date.parse(value);
  return Number.isFinite(t)?t:null;
}
function cleanReference(raw){
  if(!isObject(raw))return {ok:false};
  const result={};
  for(const [k,v] of Object.entries(raw)){
    if(!KEYS.has(k)||!(v===null||(typeof v==='string'&&v.length<=240)))return {ok:false};
    if(k==='valid_at'&&v!==null&&instant(v)===null)return {ok:false};
    result[k]=v;
  }
  return {ok:true,value:result};
}
/** Validates and projects a PR#75 preview. Caller must obtain it from the real adapter.
 * User-supplied preview is NOT evidence that an authenticated source was read.
 */
export function auditBridgePreview({preview,referenceFrame={},relationDomain='world_hypothesis',
  asOf=null,sourceAvailableAt=null,scenarioIds=[],claimedAck=null}={}){
  if(preview?.status!=='candidate_only'||!isObject(preview.packet))return fail('SOURCE_PREVIEW_NOT_LINKED');
  const p=preview.packet;
  if(p.schema!==SOURCE_SCHEMA||p.approval!=='candidate_only'||p.classification!=='hypothesis'||
     p.causal_relation!=='not_proven'||p.source_independently_verified!==false||
     !isObject(p.claim_locator)||p.claim_locator.system!==WORLD_JOURNAL_SCHEMA||
     p.claim_locator.canonical_id!==null||!id(p.claim_locator.external_id)||!id(p.node_id)||
     !id(p.source_event_id)||!Number.isInteger(p.journal_version)||p.journal_version<1||
     !isObject(p.context_relation)||p.context_relation.type!=='context_reference'||
     p.context_relation.from!==p.node_id||p.context_relation.to!==p.claim_locator.external_id||
     !Array.isArray(p.evidence_refs)||p.evidence_refs.length!==0)return fail('SOURCE_CONTRACT_INVALID');
  if(!RELATION_DOMAINS.includes(relationDomain))return fail('RELATION_DOMAIN_UNKNOWN');
  const ref=cleanReference(referenceFrame);
  if(!ref.ok)return fail('REFERENCE_FRAME_INVALID');
  if(!Array.isArray(scenarioIds)||scenarioIds.length>24||!scenarioIds.every(id)||
    new Set(scenarioIds).size!==scenarioIds.length)return fail('SCENARIOS_INVALID');
  if((asOf!==null&&instant(asOf)===null)||(sourceAvailableAt!==null&&instant(sourceAvailableAt)===null))
    return fail('TIME_INVALID_OR_OFFSET_MISSING');
  if(asOf!==null&&sourceAvailableAt!==null&&instant(sourceAvailableAt)>instant(asOf))
    return fail('SOURCE_NOT_AVAILABLE_AS_OF');
  // A caller-supplied ACK is not authenticated receiver evidence; fail closed.
  if(claimedAck!==null)return fail('CLAIMED_ACK_NOT_AUTHENTICATED');
  const reasons=['NO_INDEPENDENT_EVIDENCE','NO_MEMORY_AUTHORIZATION','NO_VERIFIED_REMOTE_ACK'];
  if(asOf===null||sourceAvailableAt===null)reasons.push('ASOF_UNDETERMINED');
  else reasons.push('SOURCE_AVAILABILITY_NOT_INDEPENDENTLY_VERIFIED');
  if(!Object.keys(ref.value).length)reasons.push('REFERENCE_FRAME_INCOMPLETE');
  return {status:'candidate_only',decision:'HOLD',reason_codes:reasons,packet:{
    schema:BRIDGE_SCHEMA,authority:'none',provenance:'LOCAL_PREVIEW_UNVERIFIED',
    node_id:p.node_id,source_record_id:p.claim_locator.external_id,
    source_event_id:p.source_event_id,journal_version:p.journal_version,
    claim_id:null,memory_record_id:null,memory_approval:'NOT_APPROVED',
    context_relation:{...p.context_relation},relation_domain:relationDomain,
    semantic_certification:'UNVERIFIED',causal_certification:'NOT_PROVEN',
    reference_frame:ref.value,scenario_ids:[...scenarioIds],
    as_of:asOf,source_available_at_hint:sourceAvailableAt,
    source_independently_verified:false,evidence_refs:[],
    ack:{status:'NOT_VERIFIED',receiver_id:null,receipt_id:null},
    proposed_operation:'READ_ONLY_RESEARCH_PREVIEW',
    source_preview_schema:p.schema
  }};
}
/** Pure gate: no input can authorize production memory writes in v1. */
export function authorizeAuthorityMutation(){return fail('BRIDGE_PREVIEW_HAS_NO_WRITE_AUTHORITY');}