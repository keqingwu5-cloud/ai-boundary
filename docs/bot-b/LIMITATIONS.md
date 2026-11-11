# Known limitations (BOT-B isolation hardening)

## network_calls
- `network-block-test.mjs`: in-process override of http/https.request
- `netns-isolation-test.mjs`: kernel network namespace via `unshare --net`
- Evidence level: KERNEL_NETNS (when unshare succeeds)

## mount namespace
- `mount-ns-test.mjs`: kernel mount namespace via `unshare --mount`
- Full private propagation requires additional `mount --make-rprivate`
- Evidence level: KERNEL_MOUNT_NS

## STOP/revoke
- `stop-flag-test.mjs`: local filesystem flag (same process)
- `stop-cross-process-test.mjs`: flag set in one node process, observed in another
- Evidence level: CROSS_PROCESS (local filesystem)
- Does not yet prove survival across host reboot or container restart

## Fingerprint
- Fetches content from fixed BOT-A commit `f6bea00` at runtime
- Requires network access to GitHub
- Evidence level: RUNTIME_FETCH_FROM_FIXED_COMMIT

## Non-author record
- Template only; not an acceptance result.

RELEASE_GATE = HOLD