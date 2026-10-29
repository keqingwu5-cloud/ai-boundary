'use strict';
/* G1L review-only sandbox preflight. NO network, billing, secrets, or execution.
 * Inputs are untrusted assertions; no 'ready to deploy' result is possible.
 */
const PLAN='G1L-20261029-SYNTHETIC-ONLY';
const REPO='keqingwu5-cloud/ai-boundary';
const SCOPES=['tasks:receive','tasks:execute','tasks:ack'];
const CAP_USD=5;
const pin=/^[a-f0-9]{40}$/;
const is=(a,b)=>a===b;
function inspectSandboxPlan(c){
 const blockers=[];
 const add=(ok,reason)=>{if(!ok)blockers.push(reason)};
 if(!c||typeof c!=='object'||Array.isArray(c))
  return {status:'BLOCKED',blockers:['MISSING_CONFIGURATION'],
    deploy_authorized:false,real_gpt2_ack_verified:false,charges_authorized_by_code:false};
 const railway=c.railway||{},db=c.database||{},model=c.model||{},identity=c.identity||{},
  source=c.source||{},quota=c.quota||{},stop=c.stop||{},audit=c.audit||{};
 add(c.accepted_scope===PLAN,'SCOPE_NOT_PINNED');
 add(c.approval_record==='https://github.com/'+REPO+'/issues/41#issuecomment-6500061627',
  'OWNER_DECISION_POINTER_MISMATCH');
 add(c.synthetic_only===true&&c.private_data_allowed===false,
  'PRIVATE_OR_NON_SYNTHETIC_INPUT_FORBIDDEN');
 add(railway.connected===true&&railway.plan==='hobby',
  'RAILWAY_CONNECTION_NOT_VERIFIED');
 add(railway.monthly_usage_stop_enabled===true&&is(railway.monthly_usage_cap_usd,CAP_USD),
  'RAILWAY_COST_STOP_NOT_VERIFIED');
 add(db.connected===true&&db.plan==='free'&&db.isolated===true,
  'ISOLATED_FREE_DATABASE_NOT_VERIFIED');
 add(db.read_write_only_for_receiver===true&&db.admin_access===false,
  'DATABASE_LEAST_PRIVILEGE_NOT_VERIFIED');
 add(db.atomic_attempt_nonce_transaction===true,
  'DURABLE_ATOMIC_RECEIPT_LEDGER_NOT_VERIFIED');
 add(db.audit_append_only===true&&db.recovery_tested===true,
  'AUDIT_AND_RECOVERY_EVIDENCE_MISSING');
 add(model.project_isolated===true&&model.connected===true,
  'ISOLATED_MODEL_PROJECT_NOT_VERIFIED');
 add(model.name==='gpt-5.4-mini-2026-03-17',
  'MODEL_VERSION_NOT_PINNED');
 add(model.monthly_hard_limit_enabled===true&&is(model.monthly_hard_limit_usd,CAP_USD),
  'MODEL_PROJECT_HARD_STOP_NOT_VERIFIED');
 add(Number.isInteger(model.requests_per_minute)&&model.requests_per_minute>=1&&model.requests_per_minute<=5,
  'MODEL_RATE_LIMIT_UNBOUNDED');
 add(Number.isInteger(quota.events)&&quota.events>=1&&quota.events<=100,
  'EVENT_COUNT_LIMIT_EXCEEDED');
 add(Number.isInteger(quota.max_input_tokens)&&quota.max_input_tokens>=1&&quota.max_input_tokens<=5000,
  'INPUT_TOKEN_LIMIT_EXCEEDED');
 add(Number.isInteger(quota.max_output_tokens)&&quota.max_output_tokens>=1&&quota.max_output_tokens<=1000,
  'OUTPUT_TOKEN_LIMIT_EXCEEDED');
 add(source.repository===REPO&&pin.test(source.commit||'')&&
  typeof source.path==='string'&&/^sandbox\/g1l\/[a-z0-9._-]+\.json$/.test(source.path),
  'PUBLIC_SYNTHETIC_SOURCE_NOT_PINNED');
 add(source.verified_public===true&&source.only_synthetic===true,
  'SOURCE_PROVENANCE_NOT_VERIFIED');
 add(identity.operator_pinned===true&&identity.revocation_supported===true&&
  identity.key_id_nonsecret===true,'INDEPENDENT_RECEIVER_IDENTITY_NOT_VERIFIED');
 add(identity.same_as_chatgpt_conversation===false,
  'CHATGPT_IDENTITY_MISREPRESENTED');
 add(Array.isArray(identity.api_scopes)&&identity.api_scopes.length===SCOPES.length&&
  SCOPES.every(x=>identity.api_scopes.includes(x)),
  'RECEIVER_SCOPE_TOO_BROAD_OR_MISSING');
 add(identity.github_write_access===false&&identity.private_memory_access===false&&
  identity.production_db_access===false&&identity.can_approve_own_receipts===false,
  'FORBIDDEN_ELEVATED_PERMISSIONS');
 add(stop.enabled===true&&stop.preemptive===true&&stop.revocation_fail_closed===true,
  'STOP_OR_REVOKE_NOT_VERIFIED');
 add(audit.external_receipt_validator===true&&audit.unknown_side_effects_block_retry===true,
  'RECEIPT_PROVENANCE_OR_RETRY_SAFETY_MISSING');
 add(c.real_ack_claimed!==true&&c.production_restore_enabled===false&&c.main_merge_enabled===false,
  'PREMATURE_RELEASE_OR_ACK_CLAIM');
 return {
  status:blockers.length?'BLOCKED':'PENDING_EXTERNAL_ATTESTATION',
  blockers,
  provider_claims_only:true,
  provider_configuration_verified:false,
  ready_to_deploy:false,
  deploy_authorized:false,
  charges_authorized_by_code:false,
  real_gpt2_ack_verified:false,
  cross_ai_e2e_verified:false,
  note:'Pure configuration shape checks; cannot verify providers, operator authority, billed limits, model cognition, or genuine GPT2 identity.'
 };
}
module.exports={PLAN,REPO,SCOPES,inspectSandboxPlan};
