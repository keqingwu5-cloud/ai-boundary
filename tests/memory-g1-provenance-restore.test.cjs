"use strict";
// Synthetic-only G1 regression. No real vault, browser state, network, or credentials.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const impact=require("../memory-impact-core.js");

const clone=x=>JSON.parse(JSON.stringify(x));
function vault(){
  return {
    vaultId:"SYNTHETIC-G1",revision:7,
    memories:[{id:"M1",question:"Question",purpose:"Purpose",
      versions:[{number:1,content:"Original answer",evidence:"Original evidence"}]}],
    candidates:[{id:"C1",eventType:"new_question",parentId:null,
      originId:"TASK-1",question:"Topic",purpose:"Purpose",
      content:"Answer",evidence:"EVIDENCE-A",evidenceLevel:"fact",
      reason:"Original request",status:"pending"}],
    audit:[{id:"EV1",kind:"workflow.recorded",ref:"WORK-1",
      taskTitle:"Synthetic work",actor:"GPT2",status:"blocked",
      reason:"Reason",nextAction:"Review",
      summary:"Original summary",at:"2026-11-01T00:00:00Z"}],
    memoryControls:{direction:{text:"Direction",version:2},
      threshold:{text:"Manual review",version:3},history:[]}
  };
}
function proposal(overrides={}){
  return {id:"C2",eventType:"pitfall",parentId:null,originId:"TASK-1",
    question:"Topic",purpose:"Purpose",content:"Answer",
    evidence:"EVIDENCE-B",evidenceLevel:"fact",reason:"New source event",
    ...overrides};
}

test("unchanged restore has no false difference warnings and does not merge",()=>{
  const a=vault(),r=impact.previewRestore(a,clone(a));
  assert.deepEqual(r.warnings,[]);
  assert.deepEqual(r.changedRecords,{candidates:0,audit:0});
  assert.equal(r.sameVersionControlDivergence,false);
  assert.equal(r.requiresHumanApproval,true);
  assert.equal(r.willMerge,false);
});
test("same candidate ID with changed evidence reports source mutation",()=>{
  const a=vault(),b=clone(a);b.candidates[0].evidence="EVIDENCE-B";
  const r=impact.previewRestore(a,b);
  assert.equal(r.counts.lostCandidates,0);
  assert.equal(r.changedRecords.candidates,1);
  assert.ok(r.warnings.includes("SAME_ID_CANDIDATE_CONTENT_CHANGED"));
});
test("same audit ID with changed summary reports evidence mutation",()=>{
  const a=vault(),b=clone(a);b.audit[0].summary="Rewritten summary";
  const r=impact.previewRestore(a,b);
  assert.equal(r.counts.lostAuditEvents,0);
  assert.equal(r.changedRecords.audit,1);
  assert.ok(r.warnings.includes("SAME_ID_AUDIT_CONTENT_CHANGED"));
});
test("same control versions but changed direction text reports divergence",()=>{
  const a=vault(),b=clone(a);b.memoryControls.direction.text="Rewritten";
  const r=impact.previewRestore(a,b);
  assert.equal(r.sameVersionControlDivergence,true);
  assert.ok(r.warnings.includes("SAME_VERSION_CONTROL_CONTENT_CHANGED"));
});
test("same control versions but changed history reports divergence",()=>{
  const a=vault(),b=clone(a);b.memoryControls.history.push({event:"synthetic"});
  const r=impact.previewRestore(a,b);
  assert.ok(r.warnings.includes("SAME_VERSION_CONTROL_CONTENT_CHANGED"));
});
test("same data in a different object-key order does not warn",()=>{
  const a=vault(),b=clone(a);
  b.candidates[0]=Object.fromEntries(Object.entries(b.candidates[0]).reverse());
  b.audit[0]=Object.fromEntries(Object.entries(b.audit[0]).reverse());
  const r=impact.previewRestore(a,b);
  assert.deepEqual(r.changedRecords,{candidates:0,audit:0});
  assert.deepEqual(r.warnings,[]);
});
test("real missing candidate and audit IDs keep HISTORY_REMOVAL",()=>{
  const a=vault(),b=clone(a);b.candidates=[];b.audit=[];
  const r=impact.previewRestore(a,b);
  assert.equal(r.counts.lostCandidates,1);
  assert.equal(r.counts.lostAuditEvents,1);
  assert.ok(r.warnings.includes("HISTORY_REMOVAL"));
});
test("memory-version rewrite still counts lost version",()=>{
  const a=vault(),b=clone(a);b.memories[0].versions[0].content="Rewritten";
  const r=impact.previewRestore(a,b);
  assert.equal(r.counts.lostVersions,1);
  assert.ok(r.warnings.includes("HISTORY_REMOVAL"));
});
test("older control version keeps CONTROL_VERSION_ROLLBACK",()=>{
  const a=vault(),b=clone(a);b.memoryControls.direction.version=1;
  const r=impact.previewRestore(a,b);
  assert.deepEqual(r.controlsRollingBack,["direction"]);
  assert.ok(r.warnings.includes("CONTROL_VERSION_ROLLBACK"));
});
test("same origin and answer but changed evidence explicitly requires provenance link",()=>{
  const a=vault(),r=impact.preview(a,proposal(),{directionRelation:"aligned"});
  assert.ok(r.warnings.includes("EXACT_ORIGIN_DUPLICATE"));
  assert.ok(r.warnings.includes("SOURCE_VARIANT_NEEDS_PROVENANCE_LINK"));
  assert.equal(r.canSaveCandidate,true);
  assert.equal(r.canApprove,false);
  assert.equal(r.canDispatch,false);
});
test("same origin, completely identical source fields do not create variant warning",()=>{
  const a=vault(),r=impact.preview(a,proposal({
    eventType:"new_question",purpose:"Purpose",evidence:"EVIDENCE-A",
    reason:"Original request"}),{directionRelation:"aligned"});
  assert.ok(r.warnings.includes("EXACT_ORIGIN_DUPLICATE"));
  assert.ok(!r.warnings.includes("SOURCE_VARIANT_NEEDS_PROVENANCE_LINK"));
});
test("a different origin with same answer is not mislabeled source conflict",()=>{
  const r=impact.preview(vault(),proposal({originId:"TASK-2"}),{directionRelation:"aligned"});
  assert.ok(!r.warnings.includes("SOURCE_VARIANT_NEEDS_PROVENANCE_LINK"));
  assert.ok(!r.blocks.includes("SOURCE_ID_CONTENT_CONFLICT"));
});
test("same origin with different answer retains original blocking behavior",()=>{
  const r=impact.preview(vault(),proposal({content:"Altered answer"}),{directionRelation:"aligned"});
  assert.ok(r.blocks.includes("SOURCE_ID_CONTENT_CONFLICT"));
  assert.equal(r.canSaveCandidate,false);
});
test("restore preview and candidate preview are side-effect free",()=>{
  const a=vault(),b=clone(a),p=proposal();
  const before=JSON.stringify([a,b,p]);
  impact.previewRestore(a,b);impact.preview(a,p,{directionRelation:"aligned"});
  assert.equal(JSON.stringify([a,b,p]),before);
});
test("invalid restore input still fails closed",()=>{
  assert.throws(()=>impact.previewRestore(vault(),{}),/restore_impact_input_invalid/);
});
