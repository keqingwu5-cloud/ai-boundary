# F05 G-0 | Source-to-inbox reconciliation candidate (isolated)

Status: `CANDIDATE / NOT_AUTONOMOUS / NOT_GROK_ACK / RELEASE_GATE=HOLD`.

Files:
- `f05-source-reconcile.mjs`: read-only GitHub REST comment-list adapter and current-state normalizer; explicit source vs transmission identity separation; fail-closed local inbox comparison and fsync'ed local JSONL audit journal.
- `f05-source-reconcile-test.mjs`: synthetic source/inbox comparisons, bad-source/partial-snapshot controls, real subprocess restart and audit replay.
- `bot-b-min-test.mjs`: invokes candidate suite, but the GitHub Actions workflow is not automatically triggered by pushes to this GPT1 research branch.

Reproduction from repository root (Node.js 22):

```sh
node docs/bot-b/f05-source-reconcile-test.mjs
```

Observed in local isolated check: **19 candidate checks passed**. This is not proof that the GitHub Actions run for the final HEAD passed; there is no authenticated Grok receiving runtime, PostgreSQL inbox readback or provider delivery log in this check.

Live source read **only if an existing authorized GitHub credential is already available**:

```sh
GITHUB_TOKEN=<existing-authorized-token> node docs/bot-b/f05-source-reconcile.mjs \
  --repo=keqingwu5-cloud/ai-boundary \
  --issue=166 \
  --comment-id=6811676695 \
  --inbox=/path/to/isolated/inbox-snapshot.json \
  --audit=/path/to/isolated/audit.jsonl
```

Do **not** create new tokens, secrets or a runtime without separate approval. Do not commit the token or source bodies. `--source=/path/to/snapshot.json` can replace the live fetch for tests, but is **unattested** and cannot prove current provider state.

Inbox snapshot structure is `{schema:'firstbrain.inbox-snapshot.v1',origin:'ISOLATED_FILE_CANDIDATE',repo:'...',issue:166,complete:true,observed_at:'ISO-8601',records:[...]}`. Each record has `source_key`, `revision`, `body_sha256`, `persisted:true`, `persisted_at`. These are local candidate inputs, not evidence that a real webhook delivered or persisted them. Local evidence is tagged `ISOLATED_LOCAL_CANDIDATE`.

Critical limits:
1. GitHub REST returns a comment's current body and `updated_at`; it does not establish every historical `issue_comment.edited` payload or actual webhook delivery/ACK.
2. Source snapshots and local inbox data must be in comparable observation windows; a self-declared `complete:true` on a local JSON file does not authenticate a real DB or receiver.
3. A `LOCAL_RECORD_MATCH_ONLY` proves only agreement of candidate input fields; `OVERDUE_UNPERSISTED_IN_ISOLATED_INBOX` proves absence in the *supplied isolated snapshot*, not a provider transport failure.
4. The tool is one-shot and not a 24/7 independent watcher. It does not create a GitHub webhook listener or automatically wake up Grok.
5. The audit JSONL is append-only with file `fsync` and per-status deduplication for the isolated candidate. It does not claim power-loss durability, DB transactions, signing or independent provenance.
6. `netns/mount` isolation checks remain separate; no overall READY from a local suite.

Next real acceptance evidence (Grok/BOT3, not this candidate): trusted webhook configuration/delivery, actual authorized receiver identity, durable inbox DB readback, independent live GitHub source scan, controlled real event missing from inbox, durable missing audit and restart readback, independent recipient ACK/source-side verification, pinned HEAD CI and nonauthor review. Missing permissions/runtime => `CHANGE_REQUEST/BLOCKED`.

For #166 and #41 linkage only. No main merge, external deployment, new credentials, paid API or real trades.
