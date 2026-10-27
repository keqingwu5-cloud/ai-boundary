'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const platform=require('../tcvl-platform-core.js'),diffusion=require('../tcvl-node-diffusion-core.js'),bridge=require('../tcvl-diffusion-bridge.js');
const at='2026-10-26T00:00:00.000Z';
function workspace(){return platform.addProject(platform.createWorkspace(),{id:'p1',title:'Test',goal:'isolation',at});}
function decision(){return diffusion.decide({parent:{id:'root',origin_command_id:'cmd1',direction_version:'v1',permissions_scope:['read']},request:{id:'r1',reason:'research evidence',capabilities:['research'],evidence_refs:['issue:65']}});}
test('cross-module: candidate creates only proposal and branch link',()=>{const w=workspace(),d=decision(),x=bridge.applyCandidate(w,d,{projectId:'p1',at});assert.equal(x.result,'proposed');assert.equal(x.workspace.proposals[0].stage,'candidate');assert.equal(x.workspace.links[0].stage,'candidate');assert.equal(x.workspace.tasks.length,0);assert.equal(w.proposals.length,0);});
test('cross-module: repeated candidate does not duplicate proposal',()=>{const d=decision(),w=bridge.applyCandidate(workspace(),d,{projectId:'p1',at}).workspace;const x=bridge.applyCandidate(w,d,{projectId:'p1',at});assert.equal(x.result,'already_proposed');assert.equal(x.workspace.proposals.length,1);});
test('cross-module: candidate task queues without remote ACK',()=>{const d=decision(),w=bridge.applyCandidate(workspace(),d,{projectId:'p1',at}).workspace;const x=bridge.planChildTask(w,{projectId:'p1',nodeId:d.node.id,requestId:'r1',title:'Test research',reason:'isolation',owner:'human',at});assert.equal(x.workspace.tasks[0].status,'queued');assert.equal(x.workspace.tasks[0].history.length,1);assert.equal('verified_ack' in x.workspace.tasks[0],false);});
test('negative: no task without proposal',()=>assert.throws(()=>bridge.planChildTask(workspace(),{projectId:'p1',nodeId:'unknown',requestId:'r1',title:'x',reason:'x',owner:'human',at}),/candidate/));
test('negative: permission-bearing candidate rejected',()=>{const d=decision();d.node.permissions_scope=['admin'];assert.throws(()=>bridge.applyCandidate(workspace(),d,{projectId:'p1',at}),/permissions/);});
test('legacy: stopped decision leaves workspace unchanged',()=>{const w=workspace(),s=JSON.stringify(w);const x=bridge.applyCandidate(w,{action:'stop'},{projectId:'p1',at});assert.equal(JSON.stringify(x.workspace),s);});

test('P1 negative: rejected proposal must never queue child task',()=>{
 const d=decision();
 const proposed=bridge.applyCandidate(workspace(),d,{projectId:'p1',at}).workspace;
 const rejected=platform.proposalDecision(proposed,{proposalId:'diffusion:'+d.node.id,
   decision:'rejected',reason:'failed review',impact:'no queue allowed',next:'revise proposal',at,seq:'seq-reject-01'});
 const before=JSON.stringify(rejected);
 assert.throws(()=>bridge.planChildTask(rejected,{projectId:'p1',nodeId:d.node.id,requestId:'r1',
   title:'must not queue',reason:'denied',owner:'human',at}),/rejected|approved|not approved|proposal.*state/i);
 assert.equal(JSON.stringify(rejected),before,'failed gate must leave original registry unchanged');
});
test('P1 negative: proposal cannot authorize child task from a different project',()=>{
 const d=decision();
 const w=bridge.applyCandidate(workspace(),d,{projectId:'p1',at}).workspace;
 // The target project must exist, otherwise the platform's generic
 // "project missing" guard masks this bridge-specific ownership flaw.
 const both=platform.addProject(w,{id:'p2',title:'Other project',goal:'isolation',at});
 assert.throws(()=>bridge.planChildTask(both,{projectId:'p2',nodeId:d.node.id,requestId:'r1',
   title:'cross project task',reason:'wrong project',owner:'human',at}),/project|scope|proposal/i);
});

test('P1 negative: duplicate child request after rejection must not return already_queued',()=>{
 const d=decision();let w=bridge.applyCandidate(workspace(),d,{projectId:'p1',at}).workspace;
 w=bridge.planChildTask(w,{projectId:'p1',nodeId:d.node.id,requestId:'r1',
   title:'review',reason:'proposal review',owner:'human',at}).workspace;
 w=platform.proposalDecision(w,{proposalId:'diffusion:'+d.node.id,
   decision:'rejected',reason:'deny',impact:'stop progression',next:'re-evaluate',at,seq:'seq-reject-02'});
 assert.throws(()=>bridge.planChildTask(w,{projectId:'p1',nodeId:d.node.id,requestId:'r1',
  title:'review',reason:'retry after rejection',owner:'human',at}),/proposal.*state|rejected|approved/i);
});
test('P1 negative: re-applying a rejected proposal never pretends it is an active proposal',()=>{
 const d=decision();
 let w=bridge.applyCandidate(workspace(),d,{projectId:'p1',at}).workspace;
 w=platform.proposalDecision(w,{proposalId:'diffusion:'+d.node.id,
   decision:'rejected',reason:'denied',impact:'hold',next:'new proposal',at,seq:'seq-reject-03'});
 const before=JSON.stringify(w),r=bridge.applyCandidate(w,d,{projectId:'p1',at});
 assert.equal(r.result,'blocked_rejected_proposal');
 assert.equal(JSON.stringify(r.workspace),before);
});
test('reuse advice is not a verified authorization or a new queued task',()=>{
 const w=workspace();
 const r=bridge.applyCandidate(w,{action:'reuse_proposal',node_id:'eligible',requires_review:true,verified_approval:false},{projectId:'p1',at});
 assert.equal(r.result,'reuse_requires_review');
 assert.equal(r.verified_approval,false);
 assert.equal(r.workspace.tasks.length,0);
 assert.equal(JSON.stringify(r.workspace),JSON.stringify(w));
});

test('R10: reuse proposal cannot create tasks or be mistaken for independent approval',()=>{
 const w=workspace(),before=JSON.stringify(w);
 const r=bridge.applyCandidate(w,{action:'reuse_proposal',node_id:'eligible',
  verified_approval:false,execution_allowed:false,requires_review:true},{projectId:'p1',at});
 assert.equal(r.result,'reuse_requires_review');
 assert.equal(r.verified_approval,false);
 assert.equal(r.execution_allowed,false);
 assert.equal(r.workspace.tasks.length,0);
 assert.equal(JSON.stringify(w),before);
});
test('R10: legacy reuse action cannot bypass the new advisory-only contract',()=>{
 const w=workspace(),before=JSON.stringify(w);
 const r=bridge.applyCandidate(w,{action:'reuse',node_id:'spoofed',
  verified_approval:true,execution_allowed:true},{projectId:'p1',at});
 assert.equal(r.result,'blocked_unverified_legacy_reuse');
 assert.equal(r.verified_approval,false);
 assert.equal(r.execution_allowed,false);
 assert.equal(JSON.stringify(r.workspace),before);
});
test('R10: candidate proposal cannot be queued when its source direction was revoked',()=>{
 const d=decision();
 let w=bridge.applyCandidate(workspace(),d,{projectId:'p1',at}).workspace;
 w.proposals[0].stage='revoked';
 assert.throws(()=>bridge.planChildTask(w,{projectId:'p1',nodeId:d.node.id,requestId:'revoked',
 title:'revoked task',reason:'stop',owner:'human',at}),/proposal state/i);
});

test('R10: caller cannot spoof trusted reuse through proposed decision payload flags',()=>{
 const w=workspace();
 const result=bridge.applyCandidate(w,{action:'reuse_proposal',node_id:'spoofed',
  requires_review:true,verified_approval:true,execution_allowed:true},{projectId:'p1',at});
 assert.equal(result.result,'reuse_requires_review');
 assert.equal(result.verified_approval,false);
 assert.equal(result.execution_allowed,false);
 assert.equal(result.workspace.tasks.length,0);
});

test('R15 audit negative: cross-project same request ID cannot be reported already_queued',()=>{
 const d=decision();
 let w=bridge.applyCandidate(workspace(),d,{projectId:'p1',at}).workspace;
 w=bridge.planChildTask(w,{projectId:'p1',nodeId:d.node.id,requestId:'r1',
  title:'P1 original review',reason:'original',owner:'human',at}).workspace;
 w=platform.addProject(w,{id:'p2',title:'Second',goal:'different scope',at});
 const d2=decision();d2.node.id='root.r2';d2.node.diffusion_request_id='r2';
 w=bridge.applyCandidate(w,d2,{projectId:'p2',at}).workspace;
 const before=JSON.stringify(w);
 assert.throws(()=>bridge.planChildTask(w,{projectId:'p2',nodeId:d2.node.id,
  requestId:'r1',title:'P2 should not inherit P1',reason:'unrelated',owner:'human',at}),
  /task.*identity.*conflict|request.*conflict|project.*conflict/i);
 assert.equal(JSON.stringify(w),before,'failed dedup must not mutate original evidence');
});

test('R17: same project + same request ID + different node stays origin-unverified',()=>{
 let w=workspace(),d=decision();
 w=bridge.applyCandidate(w,d,{projectId:'p1',at}).workspace;
 w=bridge.planChildTask(w,{projectId:'p1',nodeId:d.node.id,requestId:'r1',
  title:'Original P1',reason:'initial',owner:'human',at}).workspace;
 const other=decision();other.node.id='root.another';
 w=bridge.applyCandidate(w,other,{projectId:'p1',at}).workspace;
 const old=JSON.stringify(w);
 const x=bridge.planChildTask(w,{projectId:'p1',nodeId:other.node.id,requestId:'r1',
  title:'Same ID different node',reason:'collision',owner:'human',at});
 assert.equal(x.result,'already_queued_requires_origin_review');
 assert.equal(x.verified_same_node,false);
 assert.equal(x.execution_allowed,false);
 assert.equal(x.workspace.tasks.length,1);
 assert.equal(JSON.stringify(w),old);
});
