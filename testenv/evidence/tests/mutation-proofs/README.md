# Mutation proofs (rp41 independent-review WEAKs)

Each mutation removes one fix, confirms the targeted test FAILs, then restores.

| id | mutation | expected FAIL | log | result |
| --- | --- | --- | --- | --- |
| mut1 | `computeResultIntegrity` always `ok` | `e2e_readback_content_mismatch_negative` | `mut1-mismatch-no-integrity.out` | FAIL (exit 1) |
| mut2 | remove scope+expiry from `grantAllows` | `R7_synthetic_two_store_isolation` | `mut2-r7-no-scope-expiry.out` | FAIL (exit 1) |
| mut3 | remove stopped+revoked from `grantAllows` | `R8_retry_cost_stop_limits` (also R4) | `mut3-r8-no-stop-revoke.out` | FAIL (exit 1) |
| mut4 | wrong tip in `testenv-commit-sha.txt` | `R9_coverage_manifest` | `mut4-r9-bad-tip-pin.out` | FAIL (exit 1) |
| mut5 | remove `claimSideEffect` from mock-executor | `R3_retry_side_effect_exactly_once` | `mut5-r3-no-executor-claim.out` | FAIL (exit 1) |

Asia/Taipei times are inside each `.out` file.
