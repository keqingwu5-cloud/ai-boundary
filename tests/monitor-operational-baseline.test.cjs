"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {ANCHORS,POLICY,INTENT_FINGERPRINT,CANDIDATE_BRANCH,collectAnchors,buildBaseline}=
 require("../scripts/monitor-operational-baseline.cjs");
const WHEN="2026-10-27T03:00:00Z";
const SHA="b".repeat(40);
const evidence={status:"RESTORED"};
const github={events:[{kind:"issue"},{kind:"comment"},{kind:"commit"}],main_sha:SHA};
const notion={status:"NOT_CONFIGURED"};
const fixture=(a,state="open")=>({
 number:a.number,pull_request:a.kind==="pr"?{url:"https://api.github.com/example"}:undefined,
 state,updated_at:WHEN,
 html_url:"https://github.com/keqingwu5-cloud/ai-boundary/"+(a.kind==="pr"?"pull":"issues")+"/"+a.number
});
function base(opts={}){
 const anchors=opts.anchors||ANCHORS.map(a=>({
 number:a.number,role:a.role,kind:a.kind,purpose:a.purpose,
 observed_github_state:"open",verified_receiver_ack:false,
 task_completion_status:"NOT_VERIFIED_BY_OPEN_CLOSED_FLAG"
 }));
 return buildBaseline({anchors,github:opts.github||github,notion:opts.notion||notion,
 checkpoint:opts.checkpoint||evidence,branch:opts.branch||CANDIDATE_BRANCH,
 event:opts.event||"pull_request",checkedAt:WHEN,
 previousIntentFingerprint:Object.hasOwn(opts,"previousIntentFingerprint")?
  opts.previousIntentFingerprint:INTENT_FINGERPRINT});
}
test("contract explicitly identifies what the process is doing, not merely a commit/time",()=>{
 const r=base();
 assert.match(r.task_contract.purpose,/task.*PR.*version.*handoff/i);
 assert.match(r.task_contract.expected_operation,/PR validation/);
 assert.equal(r.intended_vs_observed.actual_operation,"ISOLATED_PR_VALIDATION");
 assert.equal(r.intended_vs_observed.observed_github_main_sha,SHA);
 assert.equal(r.conclusion,"CANDIDATE_EVIDENCE_ONLY");
 assert.equal(r.intent_continuity,"MATCH");
});
test("candidate reports work activity breakdown and does not infer semantic task status",()=>{
 const r=base();
 assert.deepEqual(r.observed_activity_types,{issue:1,comment:1,commit:1});
 assert.equal(r.observed_activity_count,3);
 for(const t of r.task_anchors){
   assert.equal(t.verified_receiver_ack,false);
   assert.match(t.task_completion_status,/NOT_VERIFIED/);
 }
 assert.equal(r.real_gpt_receiver_ack_verified,false);
 assert.equal(r.approval_or_deployment_verified,false);
});
test("versioned mission contract carries safety, approval and external memory boundary",()=>{
 assert.match(POLICY.intended_task,/15-minute/);
 assert.match(POLICY.prohibited_actions.join(","),/main merge/);
 assert.match(POLICY.prohibited_actions.join(","),/private memory/);
 assert.match(POLICY.prohibited_actions.join(","),/replace\/disable existing hourly/);
 assert.equal(POLICY.actual_owner_approval,"NOT_MACHINE_VERIFIED");
 assert.equal(POLICY.independent_G2,"NOT_MACHINE_VERIFIED");
});
test("live anchors query original Github resources, never use a previous title as source",async()=>{
 const routes=[];
 const read=await collectAnchors(async url=>{
   routes.push(url);
   const n=Number(url.split("/").pop());
   const entry=ANCHORS.find(a=>a.number===n);
   return fixture(entry);
 });
 assert.equal(read.length,ANCHORS.length);
 assert.equal(routes[0],"/repos/keqingwu5-cloud/ai-boundary/issues/31");
 assert.equal(read.find(a=>a.number===66).kind,"pr");
 assert.equal(read.find(a=>a.number===31).role,"policy_reference");
});
test("an Issue closed on GitHub does not prove G2 completion, owner approval or delivery",async()=>{
 const items=await collectAnchors(async url=>{
  const n=Number(url.split("/").pop());
  return fixture(ANCHORS.find(a=>a.number===n),"closed");
 });
 assert.equal(items.every(a=>a.observed_github_state==="closed"),true);
 assert.equal(items.every(a=>a.verified_approval===false),true);
 assert.equal(items.every(a=>a.task_completion_status==="NOT_VERIFIED_BY_OPEN_CLOSED_FLAG"),true);
 assert.equal(base({anchors:items}).real_gpt_receiver_ack_verified,false);
});
test("missing public contract anchor is a hard error, not an ignored absent task",async()=>{
 await assert.rejects(()=>collectAnchors(async()=>{throw Error("GITHUB_REQUEST_FAILED_HTTP_404")}),/404/);
});
test("wrong PR/issue kind and mismatched URL fail closed",async()=>{
 await assert.rejects(()=>collectAnchors(async url=>{
   const n=Number(url.split("/").pop()); const a=ANCHORS.find(x=>x.number===n);
   const r=fixture(a);if(n===66)delete r.pull_request;
   return r;
 }),/ANCHOR_MISMATCH_66/);
 await assert.rejects(()=>collectAnchors(async url=>{
   const n=Number(url.split("/").pop()); const r=fixture(ANCHORS.find(x=>x.number===n));
   if(n===31)r.html_url="https://github.com/other/other/issues/31";
   return r;
 }),/ANCHOR_MISMATCH_31/);
});
test("cannot claim correct baseline using an incomplete or shuffled set of tasks",()=>{
 assert.throws(()=>base({anchors:[]}),/SCOPE_INCOMPLETE/);
 const anchors=ANCHORS.map(a=>({number:a.number,role:a.role}));
 anchors.reverse();assert.throws(()=>base({anchors}),/ANCHOR_ORDER_CHANGED/);
});
test("GitHub branch or event mismatch cannot be normalized away as candidate success",()=>{
 const a=base({branch:"main",event:"schedule"});
 assert.equal(a.intended_vs_observed.stage_match,false);
 assert.equal(a.conclusion,"REVIEW_UNVERIFIED");
 const b=base({event:"push"});
 assert.equal(b.conclusion,"REVIEW_UNVERIFIED");
});
test("Notion cannot silently become configured in a public GitHub-only candidate",()=>{
 const a=base({notion:{status:"READ_SUCCEEDED_METADATA_ONLY"}});
 assert.equal(a.intended_vs_observed.source_scope_match,false);
 assert.equal(a.conclusion,"REVIEW_UNVERIFIED");
});
test("checkpoint bootstrap is explicitly incomplete evidence, never long-term confidence",()=>{
 const a=base({checkpoint:{status:"BOOTSTRAP"},previousIntentFingerprint:null});
 assert.equal(a.intended_vs_observed.evidence_continuity_verified,false);
 assert.equal(a.intent_continuity,"FIRST_PIN");
 assert.equal(a.conclusion,"REVIEW_UNVERIFIED");
});
test("changed task purpose fingerprint cannot self-promote after a new commit",()=>{
 const a=base({previousIntentFingerprint:"0".repeat(64)});
 assert.equal(a.intent_continuity,"POLICY_CHANGED_REVIEW");
 assert.equal(a.conclusion,"REVIEW_UNVERIFIED");
});
test("first purpose pin is explicit and still requires independent approval",()=>{
 const a=base({previousIntentFingerprint:null});
 assert.equal(a.intent_continuity,"FIRST_PIN");
 assert.equal(a.approval_or_deployment_verified,false);
 assert.equal(a.real_gpt_receiver_ack_verified,false);
});
test("literal task content never leaks from live Issue metadata into a public report",async()=>{
 const anchors=await collectAnchors(async url=>{
  const a=ANCHORS.find(x=>x.number===Number(url.split("/").pop()));
  return {...fixture(a),body:"CONFIDENTIAL test-only text",title:"SECRETTITLE"};
 });
 const snap=base({anchors});
 assert.equal(JSON.stringify(snap).includes("CONFIDENTIAL"),false);
 assert.equal(JSON.stringify(snap).includes("SECRETTITLE"),false);
});
