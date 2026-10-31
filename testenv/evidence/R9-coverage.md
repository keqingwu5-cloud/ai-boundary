# R9 — Test coverage & version authenticity

- Written (Asia/Taipei): 2026-10-31 10:55:12 Asia/Taipei
- Pinned tip (unified across summary/R9/versions.env): `f959bb9a3c25f4ad3f70fc21209b300283309e1b`
- git HEAD (live): `1f1fd9b8df5075fae6ad7908469fe06507ea8520`
- Pin rule: pin === live HEAD, or pin is ancestor of HEAD
- K1/K2 verified against: `e3488eab8b4cbee635a63b1bc2eb009ebaa105b7`
- queue-wt: `a99f48a1cf3a848ef770b77701bf1e6283f11bad`
- PR #86 L1 fix: `d6ceb5618615f79f3e8be027fb1bca245e8b3f40`
- Environment: local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei
- Suite counts (from suite-summary.json): {"PASS":14,"FAIL":0,"BLOCKED":0,"NOT_RUN":4}
- Risk pack counts (this run): {"PASS":11,"FAIL":0,"BLOCKED":1,"NOT_RUN":1}
- SHA pin unity: testenv-commit-sha.txt === versions.env testenv_tip === suite tip_sha_file (live HEAD may be a descendant chore commit)

| test ID | full SHA | command | environment | PASS/FAIL/NOT_RUN | reason |
| --- | --- | --- | --- | --- | --- |
| `BOOT` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"pid":431097,"boot":"{\"ok\":true,\"port\":18765,\"mode\":\"MOCK\",\"grant_id\":\"grant-local-e2e-001\"}"} |
| `unauthorized_rejection` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"error":"UNAUTHORIZED"} |
| `unauthorized_forged_token` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"error":"UNAUTHORIZED"} |
| `source_and_version_stamping` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"event_id":"e0191e8c-d4da-4d15-a881-c6f3adc5e529","source":"origin-local","payload_version":"1","digest":"0b764f6c595799fa924d9380d9e5c044fc4014a76d8b339194e15 |
| `dedup_idempotency` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"same":"cfe390e2-60ad-4fdb-95c6-2c115f257a84","conflict":{"error":"IDEMPOTENCY_CONFLICT"}} |
| `retry` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"event_id":"evt-retry-b3504583","attempts":2,"mid_state":"queued"} |
| `timeout_lease_reclaim` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"oldAttempt":"df000de1-75cc-44cf-8a7b-44adc1864682","newAttempt":"7a051470-f1d1-47c0-a1eb-44281c29b3f6"} |
| `restart_recovery` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"event_id":"fc45bfc2-8487-4f3f-bc57-2e8f7b6286ed","state":"ack_received","result_kind":"MOCK"} |
| `cost_cap` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"event_id":"evt-cost-8717d70f","state":"failed","last_error":"cost_cap_exceeded"} |
| `reporting` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"totals":{"events":6,"ack_received":3,"failed":1,"MOCK":3,"REAL":0,"total_cost_usd":0.02}} |
| `e2e_submit_ack_readback` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"event_id":"32e70a95-50bd-417e-b9ed-c1361506af4a","exact_match":true,"instruction":"full-e2e-merlin-visible","output_sha256":"bd0c7ddb390cf34384663d7fb412366d6 |
| `e2e_readback_content_mismatch_negative` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"event_id":"evt-mismatch-5d1dc187","verify_code":"EVENT_CONFLICT","verify_msg":"readback_result_mismatch:echo_payload_mismatch","get_integrity":"echo_payload_m |
| `state_machine_illegal_transition_negative` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"queued_ack":"EVENT_CONFLICT","leased_ack_skip_execute":"EVENT_CONFLICT","leased_ack_msg":"invalid attempt, endpoint, state or expired lease","queued_execute": |
| `openai_real_executor` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **NOT_RUN** | {"reason":"Merlin policy: read-only plan only; no key create, no model request, no billing, not wired to execution","env_OPENAI_API_KEY":"UNSET"} |
| `openai_paid_api_call` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **NOT_RUN** | {"reason":"forbidden without approval"} |
| `supabase_wake` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **NOT_RUN** | {"reason":"project xsgtpcutpnniomlrqazs INACTIVE; wake needs Merlin approval"} |
| `deploy_production` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **NOT_RUN** | {"reason":"needs Merlin approval"} |
| `mock_real_separation` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node run-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"MOCK":7,"REAL":0} |
| `K1_content_readback_exact_match` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"maps_to":"K1","tests":["e2e_submit_ack_readback","e2e_readback_content_mismatch_negative"],"tip_sha_file":"f959bb9a3c25f4ad3f70fc21209b300283309e1b","suite_co |
| `K2_no_skip_execute_to_complete` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"maps_to":"K2","tests":["state_machine_illegal_transition_negative"],"tip_sha_file":"f959bb9a3c25f4ad3f70fc21209b300283309e1b"} |
| `R1_forged_endpoint_rejected` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"execute_forged":"EVENT_CONFLICT","ack_forged":"EVENT_CONFLICT","rejects":2,"grant_id":"g-r1"} |
| `R1_real_cross_ai_identity` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **BLOCKED** | {"reason":"Issue #41 real cross-AI / independent GPT② ACK still BLOCKED; local API identity ≠ ChatGPT read receipt"} |
| `R2_replay_and_cross_task_reject` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"old_attempt_ack":"EVENT_CONFLICT","wrong_version":"EVENT_CONFLICT","cross_event":"EVENT_CONFLICT","rejects":3} |
| `R3_retry_side_effect_exactly_once` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"first":"applied","second":"UNKNOWN_NEEDS_RECONCILIATION","executor_duplicate":"UNKNOWN_NEEDS_RECONCILIATION","claim_wired_in_executor":true} |
| `R4_stop_revoke_vs_complete_race` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"stop_blocks_execute":"FORBIDDEN","revoke_blocks_ack":"FORBIDDEN","stop_status":"STOP_REQUESTED","final_state":"executed"} |
| `R5_crash_inject_write_recovery` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"after_execute_inject":"INJECTED_FAIL","mid_state":"leased","before_ack_inject":"INJECTED_FAIL","result_preserved":true,"final":"ack_received"} |
| `R6_result_binding_invalid_rejected` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"invalid_flag":"EXECUTED_BUT_RESULT_INVALID","ack_invalid":"EXECUTED_BUT_RESULT_INVALID","ack_wrong_sha":"output_sha256_mismatch"} |
| `R7_synthetic_two_store_isolation` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"cross_get":null,"wrong_project_enqueue":"FORBIDDEN","expired_grant":"FORBIDDEN","scope_execute":"FORBIDDEN","expired_execute":"FORBIDDEN"} |
| `R7_real_supabase_rls` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **NOT_RUN** | {"reason":"real Supabase not connected; project INACTIVE; needs Merlin approval to wake"} |
| `R8_retry_cost_stop_limits` | `1f1fd9b8df5075fae6ad7908469fe06507ea8520` | `cd /workspace/f05/testenv/loop && node risk-tests.cjs` | local MOCK testenv; Node; file-store; no Docker/PG/Supabase/OpenAI; Asia/Taipei | **PASS** | {"terminal":"failed","cost_cap":"cost_cap_exceeded","stop_execute":"FORBIDDEN","stop_enqueue":"FORBIDDEN","revoke_execute":"FORBIDDEN","REAL_costs":0} |
| `pr86_unit_and_l1_negative` | `d6ceb5618615f79f3e8be027fb1bca245e8b3f40` | `cd /workspace/f05/testenv/pr86-fix && node --test tests/first-brain-plan-core.test.cjs tests/first-brain-plan-core-l1-negative.test.cjs` | local pr86-fix worktree | **PASS** | 16/16 at fix SHA |

## Four suite NOT_RUN items (explained)

| test ID | status | reason | needs |
| --- | --- | --- | --- |
| openai_real_executor | NOT_RUN | Merlin policy: plan-only; no key create, no model request, no billing; REAL not wired | Merlin approve OpenAI key + billing + wiring |
| openai_paid_api_call | NOT_RUN | Paid API call forbidden without approval | Merlin approve paid usage |
| supabase_wake | NOT_RUN | Project xsgtpcutpnniomlrqazs INACTIVE | Merlin approve wake (or isolated project) |
| deploy_production | NOT_RUN | Production/staging deploy needs explicit approval | Merlin approve deploy |

Also: `R7_real_supabase_rls` is **NOT_RUN** (same Supabase gate). `R1_real_cross_ai_identity` is **BLOCKED** (Issue #41 true cross-AI ACK ≠ local API).

## claimSideEffect wiring
- Wired into `loop/mock-executor.cjs` `performTask` (worker path via `server.cjs`); R3 asserts executor duplicate → UNKNOWN_NEEDS_RECONCILIATION.

## Commands to reproduce
```bash
cd /workspace/f05/testenv/loop && node run-tests.cjs
cd /workspace/f05/testenv/loop && node risk-tests.cjs
cd /workspace/f05/testenv/pr86-fix && node --test tests/first-brain-plan-core.test.cjs tests/first-brain-plan-core-l1-negative.test.cjs
```

## Evidence paths
- `evidence/tests/suite-summary.json`
- `evidence/tests/risk-pack-summary.json`
- `evidence/inventory/testenv-commit-sha.txt`
- `evidence/inventory/versions.env`
- `evidence/tests/mutation-proofs/`

## pr86-fix/ prerequisite (gitignored)
R9 verifies `pr86-fix/tests/first-brain-plan-core*.cjs` on disk. That directory is **gitignored** and must be a local worktree of the #86 L1 fix (`d6ceb561…`), e.g.:

```bash
git worktree add /workspace/f05/testenv/pr86-fix <ai-boundary-clone> d6ceb5618615f79f3e8be027fb1bca245e8b3f40
# or: ln -sfn /workspace/f05/pr86-fix-review-d6ceb56 /workspace/f05/testenv/pr86-fix
```

Without it, R9 soft-skips the pr86 path asserts (records `pr86_paths_present:false`) but still verifies SHA pins / suite / commands for the loop.
