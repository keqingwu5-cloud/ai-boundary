# Known limitations (BOT-B isolation hardening)

## network_calls
- Current test only prints `network_calls: 0`.
- There is no actual network-blocking mechanism (e.g. no proxy, no sandbox netns).
- Evidence level: DECLARATION_ONLY

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