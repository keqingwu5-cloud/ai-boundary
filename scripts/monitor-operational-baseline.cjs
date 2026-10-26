"use strict";
/*
 * Task-aware operational baseline, not a governance approval mechanism.
 * Purpose and restrictions are the human-approved candidate scope, while
 * GitHub issues provide read-only observations, never inferred authorization.
 */
const REPO = "keqingwu5-cloud/ai-boundary";
const SCHEMA = "tcvl-monitor-purpose-observation/v1";
const CANDIDATE_BRANCH = "candidate/monitor-15min-github-notion-20261027";
const ANCHORS = Object.freeze([
  Object.freeze({number:31,kind:"issue",role:"policy_reference",purpose:"Confirm applicable constraints and distinguish draft governance from approved policy"}),
  Object.freeze({number:36,kind:"issue",role:"observer_contract",purpose:"Observe source, target, version and trustworthy acknowledgement boundaries"}),
  Object.freeze({number:41,kind:"issue",role:"handoff_dependency",purpose:"Track real recipient-side read and ACK evidence without assuming delivery"}),
  Object.freeze({number:54,kind:"issue",role:"provenance_contract",purpose:"Track source, version and evidence-lineage work"}),
  Object.freeze({number:56,kind:"issue",role:"independent_review",purpose:"Identify pending independent G2 review and counter-evidence"}),
  Object.freeze({number:66,kind:"pr",role:"candidate_under_test",purpose:"Test read-only 15-minute monitoring code on an isolated draft PR"})
]);
const POLICY = Object.freeze({
  intended_task:"Develop and test a 15-minute read-only GitHub-monitoring candidate while existing hourly GitHub+Notion monitoring remains in place",
  phase:"CANDIDATE_PRE_INDEPENDENT_G2",
  purpose:"Find task, PR, version, handoff, ACK-claim, security and release-blocking changes and preserve traceable, non-sensitive evidence",
  expected_operation:"PR validation and manual isolated testing only; no continuous 15-minute schedule yet",
  required_source:"GitHub REST",
  optional_source:"Notion (explicitly disabled in this public runner candidate)",
  expected_outputs:["sanitized GitHub change inventory","checkpoint evidence","test results","stage- and task-scoped review signals"],
  prohibited_actions:["main merge","production deploy","credential changes","private memory/database writes","automatic GPT recipient ACK","replace/disable existing hourly monitoring"],
  actual_owner_approval:"NOT_MACHINE_VERIFIED",
  independent_G2:"NOT_MACHINE_VERIFIED"
});
const isISO=s=>typeof s==="string" && Number.isFinite(Date.parse(s));
function isExpectedAnchor(x,a){
  return x && x.number===a.number &&
    (a.kind==="pr"?Boolean(x.pull_request):!x.pull_request) &&
    ["open","closed"].includes(x.state) && isISO(x.updated_at) &&
    (x.html_url===undefined||x.html_url==="https://github.com/"+REPO+"/"+(a.kind==="pr"?"pull":"issues")+"/"+a.number);
}
async function collectAnchors(request){
  const anchors=[];
  for(const a of ANCHORS){
    const res=await request("/repos/"+REPO+"/issues/"+a.number);
    if(!isExpectedAnchor(res,a))throw Error("OPERATING_BASELINE_ANCHOR_MISMATCH_"+a.number);
    anchors.push({
      number:a.number,role:a.role,kind:a.kind,purpose:a.purpose,
      reference:"https://github.com/"+REPO+"/"+(a.kind==="pr"?"pull":"issues")+"/"+a.number,
      observed_github_state:res.state,observed_updated_at:new Date(res.updated_at).toISOString(),
      task_completion_status:"NOT_VERIFIED_BY_OPEN_CLOSED_FLAG",
      verified_receiver_ack:false,verified_approval:false
    });
  }
  return anchors;
}
function buildBaseline({anchors,github,notion,checkpoint,branch,event,checkedAt}){
  if(!Array.isArray(anchors)||anchors.length!==ANCHORS.length)throw Error("OPERATING_BASELINE_SCOPE_INCOMPLETE");
  for(let i=0;i<ANCHORS.length;i++){
    if(anchors[i]?.number!==ANCHORS[i].number || anchors[i]?.role!==ANCHORS[i].role)
      throw Error("OPERATING_BASELINE_ANCHOR_ORDER_CHANGED");
  }
  if(!isISO(checkedAt))throw Error("OPERATING_BASELINE_TIME_INVALID");
  if(typeof github?.main_sha!=="string"||!/^[a-f0-9]{40}$/i.test(github.main_sha))
    throw Error("OPERATING_BASELINE_GITHUB_HEAD_INVALID");
  const allowed=["pull_request","workflow_dispatch"];
  const stageMatch=branch===CANDIDATE_BRANCH && allowed.includes(event);
  const scopeMatch=notion?.status==="NOT_CONFIGURED";
  const evidenceMatch=checkpoint?.status==="RESTORED";
  return {
    schema:SCHEMA,
    checked_at:checkedAt,
    task_contract:POLICY,
    intended_vs_observed:{
      intended_stage:POLICY.phase,
      actual_event:event||"UNKNOWN",
      actual_branch:branch||"UNKNOWN",
      stage_match:stageMatch,
      expected_github_source:"READ_SUCCEEDED",
      observed_github_source:"READ_SUCCEEDED",
      observed_github_main_sha:github.main_sha,
      expected_notion_source:"NOT_CONFIGURED",
      observed_notion_source:notion?.status||"UNKNOWN",
      source_scope_match:scopeMatch,
      checkpoint_status:checkpoint?.status||"UNKNOWN",
      evidence_continuity_verified:evidenceMatch
    },
    task_anchors:anchors,
    observed_activity_count:Number.isSafeInteger(github?.events?.length)?github.events.length:null,
    task_meaning_not_inferred_from_issue_state:true,
    real_gpt_receiver_ack_verified:false,
    approval_or_deployment_verified:false,
    conclusion:stageMatch && scopeMatch && evidenceMatch?"CANDIDATE_EVIDENCE_ONLY":"REVIEW_UNVERIFIED",
    pending_gates:["independent G2","owner release authorization","real 15-minute schedule","notification delivery","separate Notion safety approval"]
  };
}
module.exports={SCHEMA,REPO,POLICY,ANCHORS,CANDIDATE_BRANCH,collectAnchors,buildBaseline};
