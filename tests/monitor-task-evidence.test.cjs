"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {reconcileTaskEvidence,parseReference} = require("../scripts/monitor-task-evidence.cjs");
const NOW="2026-10-27T02:30:00.000Z";
const ROOT="https://github.com/keqingwu5-cloud/ai-boundary";
const anchors=[
  {number:31,kind:"issue",role:"policy_reference",purpose:"Draft policy",reference:ROOT+"/issues/31",observed_github_state:"open"},
  {number:56,kind:"issue",role:"independent_review",purpose:"G2 review",reference:ROOT+"/issues/56",observed_github_state:"open"},
  {number:66,kind:"pr",role:"candidate_under_test",purpose:"Sandbox CI",reference:ROOT+"/pull/66",observed_github_state:"open"}
];
const e=(kind,id,ref,extra={})=>({
 kind,key:kind+":"+id+":"+NOW,ref,at:NOW,priority:"CHANGE",
 ack_status:"NOT_ASSESSED",...extra
});
const check=(events,checkpointSeen=[],selectedAnchors=anchors)=>
 reconcileTaskEvidence({anchors:selectedAnchors,events,checkpoint:{seen:checkpointSeen},checkedAt:NOW});
test("task purpose remains distinct from observed action, state and acceptance",()=>{
 const result=check([e("issue",31,ROOT+"/issues/31")]);
 const task=result.tasks[0];
 assert.equal(task.declared_purpose,"Draft policy");
 assert.equal(task.direct_evidence_count,1);
 assert.equal(task.recent_unseen_count,1);
 assert.equal(task.verified_work_completed,false);
 assert.equal(task.verified_owner_approval,false);
 assert.equal(result.verified_completion_count,0);
});
test("a newly observed PR update must link to PR URL, not a different Issue",()=>{
 const result=check([e("pr",66,ROOT+"/pull/66")]);
 assert.equal(result.tasks[2].evidence_refs[0].reference,ROOT+"/pull/66");
 assert.equal(result.tasks[0].direct_evidence_count,0);
});
test("a PR issue-comment is attributed to the PR without granting completion",()=>{
 const c=e("comment",501,ROOT+"/issues/66#issuecomment-501");
 const result=check([c]);
 assert.equal(result.tasks[2].direct_evidence_count,1);
 assert.equal(result.tasks[2].verified_work_completed,false);
});
test("a suspicious ACK is only a reported claim, never an independently verified receipt",()=>{
 const c=e("comment",890,ROOT+"/issues/56#issuecomment-890",{ack_status:"CLAIM_ONLY_NOT_VERIFIED"});
 const result=check([c]);
 assert.equal(result.tasks[1].unverified_ack_claims,1);
 assert.equal(result.tasks[1].verified_receiver_ack,false);
 assert.equal(result.verified_gpt_receiver_ack_count,0);
});
test("closed GitHub issue with observed change still does not prove the objective completed",()=>{
 const closed=[{...anchors[0],observed_github_state:"closed"}];
 const result=check([e("issue",31,ROOT+"/issues/31")],[],closed);
 assert.equal(result.tasks[0].observed_github_state,"closed");
 assert.equal(result.tasks[0].outcome,"NOT_INFERRED_FROM_ACTIVITY_OR_CLOSED_STATE");
 assert.equal(result.tasks[0].verified_work_completed,false);
});
test("same checkpoint event is recognized as already observed and not a new task advance",()=>{
 const x=e("issue",31,ROOT+"/issues/31");
 const result=check([x],[x.key]);
 assert.equal(result.tasks[0].recent_unseen_count,0);
 assert.equal(result.tasks[0].evidence_refs[0].already_in_prior_checkpoint,true);
});
test("unrelated issue stays unmatched, not silently assigned to nearest task",()=>{
 const result=check([e("issue",700,ROOT+"/issues/700")]);
 assert.equal(result.unmatched_valid_gitHub_events,1);
 assert.equal(result.tasks.every(x=>x.direct_evidence_count===0),true);
 assert.equal(result.no_observation_is_not_proof_of_no_work,true);
});
test("other repository or crafted URL cannot spoof a task evidence link",()=>{
 const forged=e("comment",4,"https://github.com/attacker/ai-boundary/issues/31#issuecomment-4");
 const query=e("issue",31,ROOT+"/issues/31?secret=1");
 const fragment=e("comment",4,ROOT+"/issues/31#issuecomment-4?other=1");
 const result=check([forged,query,fragment]);
 assert.equal(result.rejected_or_unrelated_events,3);
 assert.equal(result.tasks[0].direct_evidence_count,0);
});
test("event key must identify the same issue or PR referenced by its URL",()=>{
 const event=e("issue",999,ROOT+"/issues/31");
 const result=check([event]);
 assert.equal(result.rejected_or_unrelated_events,1);
 assert.equal(result.tasks[0].direct_evidence_count,0);
});
test("comment identity must match the exact numbered evidence reference",()=>{
 const event=e("comment",400,ROOT+"/issues/31#issuecomment-401");
 const result=check([event]);
 assert.equal(result.rejected_or_unrelated_events,1);
 assert.equal(result.tasks[0].direct_evidence_count,0);
});
test("wrong entity kind is not mistaken for this anchor",()=>{
 const result=check([e("issue",66,ROOT+"/issues/66")]);
 assert.equal(result.rejected_or_unrelated_events,1);
 assert.equal(result.tasks[2].direct_evidence_count,0);
});
test("non-GitHub, run and commit observations have no task-level completion semantics",()=>{
 const result=check([
  e("run",11,ROOT+"/actions/runs/11"),
  e("commit",101,ROOT+"/commit/"+"a".repeat(40)),
  {...e("notion",501,"notion:sha256:abcd")}
 ]);
 assert.equal(result.rejected_or_unrelated_events,3);
 assert.equal(result.tasks.every(x=>x.direct_evidence_count===0),true);
});
test("identical evidence key is deduplicated without discarding prior metadata",()=>{
 const a=e("comment",77,ROOT+"/issues/31#issuecomment-77");
 const r=check([a,{...a}]);
 assert.equal(r.tasks[0].direct_evidence_count,1);
 assert.equal(r.tasks[0].recent_unseen_count,1);
});
test("report never serializes issue text or secret candidate data",()=>{
 const a={...e("issue",31,ROOT+"/issues/31"),body:"NOT_FOR_LOGS",title:"SECRET_NOT_FOR_LOGS"};
 const s=JSON.stringify(check([a]));
 assert.equal(s.includes("NOT_FOR_LOGS"),false);
 assert.equal(s.includes("SECRET_NOT_FOR_LOGS"),false);
});
test("overflow cannot pretend all task evidence is present",()=>{
 const many=Array.from({length:26},(_,i)=>
   e("comment",i+1,ROOT+"/issues/31#issuecomment-"+(i+1)));
 const r=check(many);
 assert.equal(r.tasks[0].direct_evidence_count,26);
 assert.equal(r.tasks[0].evidence_refs.length,25);
 assert.equal(r.tasks[0].evidence_overflow,true);
 assert.equal(r.any_evidence_overflow,true);
 assert.equal(r.status,"REVIEW_EVIDENCE_OVERFLOW");
});
test("scope is explicit and mismatched or duplicated anchors fail closed",()=>{
 const issue=[anchors[0],anchors[0]];
 assert.throws(()=>check([],[],issue),/TASK_EVIDENCE_ANCHOR_INVALID/);
 assert.throws(()=>check([],[],[{...anchors[0],observed_github_state:"RECEIVED"}]),/TASK_EVIDENCE_ANCHOR_INVALID/);
});
test("no observed task activity is not interpreted as nothing needs to be done",()=>{
 const r=check([]);
 assert.equal(r.tasks.every(x=>x.recent_unseen_count===0),true);
 assert.equal(r.tasks.every(x=>x.verified_work_completed===false),true);
 assert.equal(r.status,"OBSERVATION_ONLY_NOT_OUTCOME_PROOF");
});
test("priority review signals attach only to their own task",()=>{
 const warning=e("issue",31,ROOT+"/issues/31",{priority:"REVIEW_UNVERIFIED"});
 const r=check([warning]);
 assert.equal(r.tasks[0].review_signal_count,1);
 assert.equal(r.tasks[1].review_signal_count,0);
});
