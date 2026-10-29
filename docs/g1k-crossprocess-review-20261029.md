# G1k: synthetic independent-process handoff (review-only)

**Status:** isolated Draft candidate; must not be claimed as a real GPT2 ACK, real ChatGPT receiver, live agent, production deployment, or trusted semantic E2E.

**Base:** Draft PR #80 head `031bb5c676c16dc21b9a19d7e3930430d91567ac`; staged atop PR #52, not main.

## Scope

- `api/g1k-crossprocess/orchestrator.cjs` builds synthetic messages and runs `receiver.cjs` as a distinct Node OS process. The receiver reads a **local JSON fixture**, not GitHub Issue #41; the Issue URL is an expected-ref **string field only**.
- The receiver generates **test** Ed25519 keys locally, performs a **rule-based** summary, and signs a synthetic read-claim. It is not a model agent and does not prove AI understanding.
- G1h review-only validators process that claim and always hold `actual_gpt2_ack_verified=false`, `semantic_alignment_verified=false`, `cross_ai_e2e_verified=false`.
- `receipt-ledger.cjs` uses a local filesystem exclusive creation `O_EXCL` simulator; tests cover both concurrent OS processes and restart. It is **not** PostgreSQL WAL, cross-host atomicity, replication, authenticated remote receipts, quorum or recovery.
- `semantic-review.cjs` offers lexical missing-constraint detection only. Exact keyword match does not prove that AI meanings agree.
- `tests/g1k-crossprocess.test.cjs` has 33 T01–T08 synthetic scenarios: provenance, attempt/version/digest conflicts, blind sequence, forged attestation, replay, revocation, unknown transport and semantic gap.
- New CI runs Node 20 and 22 for G1k, existing G1h, and handoff/API regressions. No service secrets, model calls, deployment, data migration or external network task fetches.

## Constraints / pending gates

`G1K_GITHUB_CI`: check the linked run at this PR fixed HEAD; do **not** relabel prior local 53/53 as official CI.

`REAL_GPT2_RUNTIME=NOT_CONFIGURED`
`ACTUAL_GPT2_READ=UNVERIFIED`
`TRUSTED_GPT2_ACK=UNVERIFIED`
`CROSS_AI_E2E=BLOCKED`
`MAIN_MERGE=NO_GO`
`DEPLOY=NO_GO`

Live integration needs a separately approved external receiver runtime, independently pinned identity, authorized source access, model API quota, protected durable nonce/receipt and idempotency ledger, independent timestamp/precommit, and semantic review. Historical failures, authorizations, and records are retained.

Traceability: Issues #31, #41, #56; Draft PR #52, #80.
