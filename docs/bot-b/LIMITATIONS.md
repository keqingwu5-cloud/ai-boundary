# Known limitations (BOT-B isolation hardening)

## network_calls
- `network-block-test.mjs` intercepts `http.request` / `https.request` and counts calls.
- This is an in-process override, not a kernel-level netns or proxy block.
- Evidence level: IN_PROCESS_INTERCEPTION

## STOP/revoke
- Uses local filesystem flag.
- Does not prove cross-process or cross-restart isolation.
- Evidence level: LOCAL_ONLY

## Fingerprint
- Compares against vendored copy of BOT-A files inside this branch.
- Does not fetch from the original BOT-A commit at runtime.

## Non-author record
- Template only; not an acceptance result.

RELEASE_GATE = HOLD