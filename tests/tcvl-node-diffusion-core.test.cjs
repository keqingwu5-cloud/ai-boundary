'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{decide}=require('../tcvl-node-diffusion-core.js');
const parent=()=>({id:'root',origin_command_id:'cmd1',direction_version:'v1',depth:0,permissions_scope:['read']});
const request=()=>({id:'r1',reason:'evidence requires specialized research',capabilities:['research'],evidence_refs:['issue:65']});
const run=(o={})=>decide({parent:parent(),request:request(),nodes:[],tasks:[],...o});
test('positive: creates candidate without inheriting permissions',()=>{const x=run();assert.equal(x.action,'candidate');assert.equal(x.node.status,'candidate');assert.deepEqual(x.node.permissions_scope,[]);assert.equal(x.node.origin_command_id,'cmd1');});
test('positive: reuse compatible existing node',()=>{const x=run({nodes:[{id:'research1',capabilities:['research'],permissions_scope:['read'],status:'active',origin_command_id:'cmd1',direction_version:'v1',approval_direction_version:'v1',approval_status:'approved',approval_evidence_refs:['review:research1']}]});assert.equal(x.action,'reuse_proposal');assert.equal(x.node_id,'research1');assert.equal(x.execution_allowed,false);});
test('negative: duplicate request rejected',()=>assert.equal(run({tasks:[{diffusion_request_id:'r1'}]}).reason,'duplicate_request'));
test('negative: permission escalation rejected',()=>assert.equal(run({request:{...request(),permissions_scope:['admin']}}).reason,'permission_escalation'));
test('negative: max depth blocks expansion',()=>assert.equal(run({parent:{...parent(),depth:3}}).reason,'depth_limit'));
test('negative: max children blocks expansion',()=>assert.equal(run({nodes:[{id:'x',parent_node_id:'root',status:'active'}],limits:{maxChildren:1}}).reason,'child_limit'));
test('negative: ancestry cycle blocked',()=>assert.equal(run({parent:{...parent(),parent_node_id:'x'},nodes:[{id:'x',parent_node_id:'root'}]}).reason,'cycle'));
test('legacy: parent and registry remain unchanged',()=>{const p=parent(),n=[{id:'old',capabilities:[],status:'active'}],before=JSON.stringify([p,n]);run({parent:p,nodes:n});assert.equal(JSON.stringify([p,n]),before);});
test('cross-module: output is a proposal, not task or ACK',()=>{const x=run();assert.equal(x.requires_review,true);assert.equal(x.node.status,'candidate');assert.equal('verified_ack' in x.node,false);});

test('P1 negative: never reuse an unapproved candidate even when capabilities match',()=>{
 const node={id:'research-candidate',status:'candidate',capabilities:['research'],permissions_scope:['read']};
 const r=run({nodes:[node]});
 assert.notEqual(r.action,'reuse','candidate has no verified activation authority');
 assert.equal(node.status,'candidate','decision must not mutate registry');
});
test('P1 negative: active node missing requested permissions cannot be reused',()=>{
 const node={id:'research-no-read',status:'active',capabilities:['research'],permissions_scope:[]};
 const r=run({nodes:[node],request:{...request(),permissions_scope:['read']}});
 assert.notEqual(r.action,'reuse','parent scope cannot substitute for target node permission');
});
test('P1 negative: stopped or rejected nodes must not become reuse targets',()=>{
 for(const status of ['stopped','rejected','paused','revoked']){
  const r=run({nodes:[{id:'former',status,capabilities:['research'],permissions_scope:['read']}]});
  assert.notEqual(r.action,'reuse','unavailable state: '+status);
 }
});

test('P1 negative: active alone cannot provide a provenance-backed approval',()=>{
 const r=run({nodes:[{id:'unknown-approval',status:'active',direction_version:'v1',
 capabilities:['research'],permissions_scope:['read']}]});
 assert.notEqual(r.action,'reuse');
});
test('P1 negative: different direction version cannot be reused',()=>{
 const r=run({nodes:[{id:'old-direction',status:'active',direction_version:'v0',
 approval_status:'approved',approval_evidence_refs:['review:old'],
 capabilities:['research'],permissions_scope:['read']}]});
 assert.notEqual(r.action,'reuse');
});
test('P1 negative: invalid requested permission shape is rejected instead of ignored',()=>{
 assert.throws(()=>run({request:{...request(),permissions_scope:'read'}}),/permission|request/i);
});

test('R10: eligible approved-looking node is only a reuse proposal, never execution approval',()=>{
 const candidate={id:'research1',capabilities:['research'],permissions_scope:['read'],status:'active',
  origin_command_id:'cmd1',direction_version:'v1',approval_direction_version:'v1',
  approval_status:'approved',approval_evidence_refs:['review:research1']};
 const result=run({nodes:[candidate]});
 assert.equal(result.action,'reuse_proposal');
 assert.equal(result.requires_review,true);
 assert.equal(result.verified_approval,false);
 assert.equal(result.execution_allowed,false);
 assert.equal(JSON.stringify(result).includes('review:research1'),false,'untrusted approval string not echoed as evidence');
});
test('R10: revoked approval cannot be reused with an otherwise active and approved-looking node',()=>{
 const node={id:'revoked-node',status:'active',origin_command_id:'cmd1',direction_version:'v1',approval_direction_version:'v1',approval_status:'approved',
  approval_evidence_refs:['review:revoked'],approval_revoked_at:'2026-10-27T03:10:00Z',
  capabilities:['research'],permissions_scope:['read']};
 const outcome=run({nodes:[node]});
 assert.notEqual(outcome.action,'reuse','ineligible node cannot appear as legacy reuse');
 assert.notEqual(outcome.action,'reuse_proposal','ineligible node cannot appear as future reuse proposal');
});
test('R10: stale approval from another direction cannot authorize reuse',()=>{
 const node={id:'stale-approval',status:'active',origin_command_id:'cmd1',direction_version:'v1',approval_direction_version:'v0',
  approval_status:'approved',approval_evidence_refs:['review:old'],
  capabilities:['research'],permissions_scope:['read']};
 const outcome=run({nodes:[node]});
 assert.notEqual(outcome.action,'reuse','ineligible node cannot appear as legacy reuse');
 assert.notEqual(outcome.action,'reuse_proposal','ineligible node cannot appear as future reuse proposal');
});
test('R10: invalid or missing claimed approval evidence cannot produce reusable proposal',()=>{
 for(const refs of [[],[''],[null],['  '],null]){
 const node={id:'untrusted',status:'active',origin_command_id:'cmd1',direction_version:'v1',approval_direction_version:'v1',
  approval_status:'approved',approval_evidence_refs:refs,capabilities:['research'],permissions_scope:['read']};
 const outcome=run({nodes:[node]});
 assert.notEqual(outcome.action,'reuse','ineligible node cannot appear as legacy reuse');
 assert.notEqual(outcome.action,'reuse_proposal','ineligible node cannot appear as future reuse proposal');
 }
});

test('R10: cross-origin node cannot become reuse proposal despite matching claimed approval',()=>{
 const node={id:'other-origin',status:'active',origin_command_id:'another-command',
 direction_version:'v1',approval_direction_version:'v1',
 approval_status:'approved',approval_evidence_refs:['review:other'],
 capabilities:['research'],permissions_scope:['read']};
 const result=run({nodes:[node]});
 assert.notEqual(result.action,'reuse');
 assert.notEqual(result.action,'reuse_proposal');
});
test('R10: even forged approval refs cannot set an execution flag from the planner',()=>{
 const node={id:'forged-review',status:'active',origin_command_id:'cmd1',
 direction_version:'v1',approval_direction_version:'v1',
 approval_status:'approved',approval_evidence_refs:['review:forged-claim'],
 verified_approval:true,execution_allowed:true,
 capabilities:['research'],permissions_scope:['read']};
 const result=run({nodes:[node]});
 assert.equal(result.action,'reuse_proposal');
 assert.equal(result.verified_approval,false);
 assert.equal(result.execution_allowed,false);
 assert.equal(result.approval_claim_status,'CLAIM_ONLY_NOT_VERIFIED');
});
