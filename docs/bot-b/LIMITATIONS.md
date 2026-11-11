# Known limitations (BOT-B isolation hardening)

## network_calls
- `network-block-test.mjs`: in-process override of http/https.request
- `netns-isolation-test.mjs`: kernel network namespace via `unshare --net`
- Evidence level: KERNEL_NETNS (when unshare succeeds)

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