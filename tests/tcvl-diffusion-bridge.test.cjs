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
