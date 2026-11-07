# First Brain — read-only source cursor (candidate)

This feature belongs to Draft PR #105. It is a **bounded GitHub Issue reader**, not a background agent receiver and not production task dispatch.

## Runtime

- `api/task-locator-github-adapter.cjs`: GitHub REST issue/comment reader, completeness and search checks.
- `api/task-source-summary.cjs`: deterministic digest over public source identity, URL and content. Only **complete** snapshots can be considered healthy.
- `api/task-source-checkpoint.cjs`: load a scoped previous cursor, compare, atomically write a new small cursor on BASELINE or CONTENT_CHANGED. On NO_UPDATE it preserves the old cursor; on MONITOR_UNHEALTHY, invalid scope or corrupt file it does **not** overwrite a previous successful value.

In the Draft PR workflow, `actions/cache/restore@v4` tries to retrieve the latest matching cursor for the same PR. `actions/cache/save@v4` saves a new immutable cache entry **only after a healthy baseline or content change**. Cache keys contain the PR number, run ID and attempt ID. If no cache is found, the result is **ABSENT_CACHE_MISS_OR_FIRST_RUN**, not a fabricated NO_UPDATE.

`bridge-evidence/source-cursor.json` contains schema, public source scope, SHA-256 digest, record count and last successful check timestamp. It never stores issue/comment bodies, credentials, private memory, or alleged remote-agent acknowledgements.

## Verifiable status

- `BASELINE`: no prior restorable cursor, or first use; saves a new one.
- `NO_UPDATE`: prior valid cursor restored and source content is unchanged; no unnecessary save.
- `CONTENT_CHANGED`: previous valid cursor exists, source content changed; advances after a complete source read.
- `MONITOR_UNHEALTHY`: read incomplete, source invalid, or unresolved; **no new cursor**. Corrupt/wrong-scope cursor also fails the job without resetting it.

## Deliberate limits

GitHub Actions cache is **best effort**, not a permanent database: it may be evicted or unavailable; fork PRs, cancellation, simultaneous runs and branch scope can affect restoration. On cache miss the next check returns BASELINE, not proof of a previously unseen change. This workflow runs on pull-request changes or manual dispatch; **no scheduled monitoring was added**. It does not deliver user notifications, trigger other ChatGPT sessions or certify independent ACK.

Never treat this file as consent to merge `main`, deploy, process private vaults, send paid requests, or start trading.

## Safe rollback

Remove the three cache steps in `.github/workflows/mainbrain-api-candidate.yml` and the new checkpoint helper/test. Original read-only CLI source checks continue working; no production database migration is required.

## Cross-run verification evidence (2026-11-07)

- [Run #42344210335](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42344210335): live baseline generated; scoped cache entry saved.
- [Run #42344273286](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42344273286): restored that exact cursor, returned `RESTORED_VALID / NO_UPDATE / checkpoint_written=false`.
- This document update triggers another PR CI run after the existing #41 evidence update, to check `CONTENT_CHANGED` in a genuine third run. Its result must be read from GitHub logs; no result is presumed here.
