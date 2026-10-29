'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {inspectSandboxPlan,PLAN,REPO,SCOPES}=require('../api/g1l-sandbox/sandbox-readiness.cjs');
const valid=()=>({
 accepted_scope:PLAN,
 approval_record:'https://github.com/'+REPO+'/issues/41#issuecomment-6500061627',
 synthetic_only:true,private_data_allowed:false,real_ack_claimed:false,
 production_restore_enabled:false,main_merge_enabled:false,
 railway:{connected:true,plan:'hobby',monthly_usage_stop_enabled:true,monthly_usage_cap_usd:5},
 database:{connected:true,plan:'free',isolated:true,read_write_only_for_receiver:true,
   admin_access:false,atomic_attempt_nonce_transaction:true,audit_append_only:true,recovery_tested:true},
 model:{project_isolated:true,connected:true,name:'gpt-5.4-mini-2026-03-17',
   monthly_hard_limit_enabled:true,monthly_hard_limit_usd:5,requests_per_minute:2},
 quota:{events:100,max_input_tokens:5000,max_output_tokens:1000},
 source:{repository:REPO,commit:'f'.repeat(40),path:'sandbox/g1l/synthetic-task.json',
   verified_public:true,only_synthetic:true},
 identity:{operator_pinned:true,revocation_supported:true,key_id_nonsecret:true,
   same_as_chatgpt_conversation:false,api_scopes:[...SCOPES],
   github_write_access:false,private_memory_access:false,production_db_access:false,
   can_approve_own_receipts:false},
 stop:{enabled:true,preemptive:true,revocation_fail_closed:true},
 audit:{external_receipt_validator:true,unknown_side_effects_block_retry:true}
});
test('G1L no configuration blocks all execution',()=>{
 const r=inspectSandboxPlan(undefined);assert.equal(r.status,'BLOCKED');
 assert.equal(r.deploy_authorized,false);assert.equal(r.real_gpt2_ack_verified,false);
});
test('G1L all required declarations are still unverified external claims, never approval',()=>{
 const r=inspectSandboxPlan(valid());assert.equal(r.status,'PENDING_EXTERNAL_ATTESTATION');
 assert.deepEqual(r.blockers,[]);assert.equal(r.ready_to_deploy,false);
 assert.equal(r.provider_configuration_verified,false);assert.equal(r.cross_ai_e2e_verified,false);
});
const invalid=[
 ['unexpected approval scope',c=>c.accepted_scope='G1L-FULL-PRODUCTION','SCOPE_NOT_PINNED'],
 ['approval record wrong issue',c=>c.approval_record='https://github.com/example/other','OWNER_DECISION_POINTER_MISMATCH'],
 ['private data enabled',c=>c.private_data_allowed=true,'PRIVATE_OR_NON_SYNTHETIC_INPUT_FORBIDDEN'],
 ['Railway account disconnected',c=>c.railway.connected=false,'RAILWAY_CONNECTION_NOT_VERIFIED'],
 ['Railway hard stop absent',c=>c.railway.monthly_usage_stop_enabled=false,'RAILWAY_COST_STOP_NOT_VERIFIED'],
 ['Railway cap increased',c=>c.railway.monthly_usage_cap_usd=25,'RAILWAY_COST_STOP_NOT_VERIFIED'],
 ['database disconnected',c=>c.database.connected=false,'ISOLATED_FREE_DATABASE_NOT_VERIFIED'],
 ['database is production',c=>c.database.isolated=false,'ISOLATED_FREE_DATABASE_NOT_VERIFIED'],
 ['database role escalated',c=>c.database.admin_access=true,'DATABASE_LEAST_PRIVILEGE_NOT_VERIFIED'],
 ['database nonce transaction not atomic',c=>c.database.atomic_attempt_nonce_transaction=false,'DURABLE_ATOMIC_RECEIPT_LEDGER_NOT_VERIFIED'],
 ['database recovery untested',c=>c.database.recovery_tested=false,'AUDIT_AND_RECOVERY_EVIDENCE_MISSING'],
 ['model API project disconnected',c=>c.model.connected=false,'ISOLATED_MODEL_PROJECT_NOT_VERIFIED'],
 ['model switched silently',c=>c.model.name='unapproved-model','MODEL_VERSION_NOT_PINNED'],
 ['model limit notification only',c=>c.model.monthly_hard_limit_enabled=false,'MODEL_PROJECT_HARD_STOP_NOT_VERIFIED'],
 ['model spend cap raised',c=>c.model.monthly_hard_limit_usd=50,'MODEL_PROJECT_HARD_STOP_NOT_VERIFIED'],
 ['rate limit too high',c=>c.model.requests_per_minute=1000,'MODEL_RATE_LIMIT_UNBOUNDED'],
 ['events exceed 100',c=>c.quota.events=101,'EVENT_COUNT_LIMIT_EXCEEDED'],
 ['input tokens exceed 5000',c=>c.quota.max_input_tokens=5001,'INPUT_TOKEN_LIMIT_EXCEEDED'],
 ['output tokens exceed 1000',c=>c.quota.max_output_tokens=1001,'OUTPUT_TOKEN_LIMIT_EXCEEDED'],
 ['source unpinned floating branch',c=>c.source.commit='main','PUBLIC_SYNTHETIC_SOURCE_NOT_PINNED'],
 ['source path outside sandbox',c=>c.source.path='private/memory.json','PUBLIC_SYNTHETIC_SOURCE_NOT_PINNED'],
 ['source public proof absent',c=>c.source.verified_public=false,'SOURCE_PROVENANCE_NOT_VERIFIED'],
 ['trust root not pinned',c=>c.identity.operator_pinned=false,'INDEPENDENT_RECEIVER_IDENTITY_NOT_VERIFIED'],
 ['trust root not revocable',c=>c.identity.revocation_supported=false,'INDEPENDENT_RECEIVER_IDENTITY_NOT_VERIFIED'],
 ['claim identical ChatGPT conversation identity',c=>c.identity.same_as_chatgpt_conversation=true,'CHATGPT_IDENTITY_MISREPRESENTED'],
 ['unnecessary GitHub scope',c=>c.identity.api_scopes.push('repo:write'),'RECEIVER_SCOPE_TOO_BROAD_OR_MISSING'],
 ['GitHub write access present',c=>c.identity.github_write_access=true,'FORBIDDEN_ELEVATED_PERMISSIONS'],
 ['private memory access present',c=>c.identity.private_memory_access=true,'FORBIDDEN_ELEVATED_PERMISSIONS'],
 ['no safety kill switch',c=>c.stop.enabled=false,'STOP_OR_REVOKE_NOT_VERIFIED'],
 ['unknown side effects retry enabled',c=>c.audit.unknown_side_effects_block_retry=false,'RECEIPT_PROVENANCE_OR_RETRY_SAFETY_MISSING'],
 ['premature real ACK claimed',c=>c.real_ack_claimed=true,'PREMATURE_RELEASE_OR_ACK_CLAIM'],
 ['main merge enabled',c=>c.main_merge_enabled=true,'PREMATURE_RELEASE_OR_ACK_CLAIM']
];
for(const [title,mutate,expected] of invalid){
 test('G1L fail-closed: '+title,()=>{
  const c=valid();mutate(c);const r=inspectSandboxPlan(c);
  assert.equal(r.status,'BLOCKED');assert.ok(r.blockers.includes(expected));
  assert.equal(r.deploy_authorized,false);assert.equal(r.real_gpt2_ack_verified,false);
 });
}
test('G1L synthetic applicant cannot bypass by declaring extra attestation flags',()=>{
 const c=valid();c.provider_verified=true;c.model_response_id='fake';
 c.actual_gpt2_ack_verified=true;c.deploy_authorized=true;
 const r=inspectSandboxPlan(c);
 assert.equal(r.status,'PENDING_EXTERNAL_ATTESTATION');assert.equal(r.deploy_authorized,false);
 assert.equal(r.real_gpt2_ack_verified,false);
});
