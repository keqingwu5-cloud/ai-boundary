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
- Uses local filesystem flag.
- Does not prove cross-process or cross-restart isolation.
- Evidence level: LOCAL_ONLY

## Fingerprint
- Now fetches content from fixed BOT-A commit `f6bea00` at runtime via raw.githubusercontent.com
- Requires network access to GitHub; in strict netns this will fail (expected)
- Evidence level: RUNTIME_FETCH_FROM_FIXED_COMMIT

## Non-author record
- Template only; not an acceptance result.

RELEASE_GATE = HOLD