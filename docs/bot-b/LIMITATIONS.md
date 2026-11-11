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
- `stop-cross-restart-test.mjs`: flag survives process exit (simulated restart)
- Evidence level: CROSS_PROCESS + SIMULATED_RESTART
- Does not prove survival across real host reboot

## Fingerprint
- Online mode: fetches from fixed BOT-A commit `f6bea00`
- Offline mode: uses local `fingerprint-cache.txt` (set OFFLINE=1)
- Evidence level: RUNTIME_FETCH or OFFLINE_CACHE

## Non-author record
- Template only; not an acceptance result.

RELEASE_GATE = HOLD