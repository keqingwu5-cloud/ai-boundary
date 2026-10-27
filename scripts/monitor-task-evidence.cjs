"use strict";
/*
 * R8: a *bounded observation ledger*, not a task completion engine.
 * Only first-party GitHub metadata refs, no untrusted issue text or private sources.
 */
const REPO = "keqingwu5-cloud/ai-boundary";
const ROOT = "https://github.com/"+REPO;
const SCHEMA = "tcvl-task-evidence-r8/v1";
const MAX_EVIDENCE_PER_TASK = 25;
const VALID_KINDS = new Set(["issue","pr","comment"]);
const VALID_ACK = new Set(["NOT_ASSESSED","CLAIM_ONLY_NOT_VERIFIED"]);
const VALID_PRIORITIES = new Set(["CHANGE","REVIEW_UNVERIFIED","CRITICAL_UNVERIFIED"]);
function parseReference(event){
  if(!event || !VALID_KINDS.has(event.kind) ||
    typeof event.ref !== "string" || !VALID_ACK.has(event.ack_status) ||
    !VALID_PRIORITIES.has(event.priority)) return null;
  // Canonical URLs from the monitored repo only. Ignore unrelated runs, commits,
  // other project issues, query strings, anchor spoofing and malformed IDs.
  const m=/^https:\/\/github\.com\/keqingwu5-cloud\/ai-boundary\/(issues|pull)\/([1-9][0-9]*)(#issuecomment-([1-9][0-9]*))?$/.exec(event.ref);
  if(!m) return null;
  const number=Number(m[2]);
  if(!Number.isSafeInteger(number))return null;
  if(event.kind==="comment" ? !m[4] : Boolean(m[3]))return null;
  if(event.kind==="issue" && m[1]!=="issues")return null;
  if(event.kind==="pr" && m[1]!=="pull")return null;
  if(event.kind==="comment" && m[1]!=="issues" && m[1]!=="pull")return null;
  if(event.kind==="issue" && !/^issue:\d+:/.test(event.key||""))return null;
  if(event.kind==="pr" && !/^pr:\d+:/.test(event.key||""))return null;
  if(event.kind==="comment" && !/^comment:\d+:/.test(event.key||""))return null;
  return {number,kind:event.kind,ref:event.ref,at:event.at,
    ack_claim:event.ack_status==="CLAIM_ONLY_NOT_VERIFIED",
    review_signal:event.priority!=="CHANGE",
    identity:event.key};
}
function reconcileTaskEvidence({anchors,events,checkpoint,checkedAt}){
  if(!Array.isArray(anchors) || anchors.length===0 ||
    !Array.isArray(events) || !Array.isArray(checkpoint?.seen) ||
    typeof checkedAt!=="string" || !Number.isFinite(Date.parse(checkedAt)))
      throw Error("TASK_EVIDENCE_CONTRACT_INVALID");
  if(anchors.length>30)throw Error("TASK_EVIDENCE_ANCHOR_LIMIT");
  const anchorNumbers=new Set();
  for(const a of anchors){
    if(!Number.isSafeInteger(a.number) || anchorNumbers.has(a.number) ||
      !["issue","pr"].includes(a.kind)|| typeof a.role!=="string" ||
      typeof a.purpose!=="string" || !["open","closed"].includes(a.observed_github_state))
      throw Error("TASK_EVIDENCE_ANCHOR_INVALID");
    anchorNumbers.add(a.number);
  }
  const seen=new Set(checkpoint.seen);
  const grouped=new Map(anchors.map(a=>[a.number,new Map()]));
  let unattributed=0, rejected=0;
  for(const raw of events){
    const v=parseReference(raw);
    if(!v){rejected++;continue;}
    if(!grouped.has(v.number)){unattributed++;continue;}
    // The GitHub issue comment API serves comments on issues and PRs. But a
    // direct Issue state must never be represented as evidence for a PR.
    const a=anchors.find(x=>x.number===v.number);
    if(v.kind!=="comment" && v.kind!==a.kind){rejected++;continue;}
    if(!raw.key || typeof raw.key!=="string"){rejected++;continue;}
    const map=grouped.get(v.number);
    if(!map.has(v.identity))map.set(v.identity,{kind:v.kind,reference:v.ref,
      observed_at:typeof v.at==="string"&&Number.isFinite(Date.parse(v.at))?v.at:"UNKNOWN",
      already_in_prior_checkpoint:seen.has(v.identity),
      review_signal:v.review_signal,ack_claim_only:v.ack_claim});
  }
  let overflow=false;
  const tasks=anchors.map(a=>{
    const entries=[...grouped.get(a.number).values()];
    entries.sort((x,y)=>String(x.reference).localeCompare(String(y.reference))||
      String(x.observed_at).localeCompare(String(y.observed_at)));
    if(entries.length>MAX_EVIDENCE_PER_TASK)overflow=true;
    const fresh=entries.filter(x=>!x.already_in_prior_checkpoint);
    return {
      task_id:"github:"+a.kind+":"+a.number,
      role:a.role,
      declared_purpose:a.purpose,
      purpose_origin:"CANDIDATE_TASK_CONTRACT_NOT_GITHUB_STATUS",
      github_reference:a.reference,
      observed_github_state:a.observed_github_state,
      observation:"API_EVENT_METADATA_ONLY",
      direct_evidence_count:entries.length,
      recent_unseen_count:fresh.length,
      evidence_refs:entries.slice(0,MAX_EVIDENCE_PER_TASK),
      evidence_overflow:entries.length>MAX_EVIDENCE_PER_TASK,
      unverified_ack_claims:entries.filter(x=>x.ack_claim_only).length,
      review_signal_count:entries.filter(x=>x.review_signal).length,
      outcome:"NOT_INFERRED_FROM_ACTIVITY_OR_CLOSED_STATE",
      verified_work_completed:false,
      verified_receiver_ack:false,
      verified_owner_approval:false
    };
  });
  return {
    schema:SCHEMA,checked_at:checkedAt,
    scope:"SIX_EXISTING_GITHUB_ANCHORS_ONLY",
    cross_source_not_verified:true,
    no_observation_is_not_proof_of_no_work:true,
    tasks,
    unmatched_valid_gitHub_events:unattributed,
    rejected_or_unrelated_events:rejected,
    any_evidence_overflow:overflow,
    verified_completion_count:0,
    verified_gpt_receiver_ack_count:0,
    actual_delivery_and_approval_not_established:true,
    status:overflow?"REVIEW_EVIDENCE_OVERFLOW":"OBSERVATION_ONLY_NOT_OUTCOME_PROOF"
  };
}
module.exports={SCHEMA,ROOT,parseReference,reconcileTaskEvidence};
