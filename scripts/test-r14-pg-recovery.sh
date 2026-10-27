#!/usr/bin/env bash
# R14: disposable PostgreSQL WAL/crash/unknown-outcome recovery experiment.
# NO PROD / NO USER DATA / NO HOST PORT / NO AUTHORITY OR WORKER.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
cid="tcvl-r14-$RANDOM-$$"
tmp="$(mktemp -d)"
cleanup(){ docker rm -f "$cid" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
docker run --name "$cid" -d --env POSTGRES_PASSWORD=R14_EPHEMERAL_TEST_ONLY postgres:16-alpine >/dev/null
ready(){
  # postgres image can briefly open a temporary initialization server
  # then stop it before starting the real postmaster. pg_isready alone
  # may report a false positive during that phase.
  for _ in $(seq 1 90); do
    if docker exec --user postgres "$cid" psql -X -q -t -A -U postgres \
      -v ON_ERROR_STOP=1 -c 'SELECT 1;' >/dev/null 2>&1; then
      sleep 0.4
      if docker exec --user postgres "$cid" psql -X -q -t -A -U postgres \
        -v ON_ERROR_STOP=1 -c 'SELECT 1;' >/dev/null 2>&1; then return 0; fi
    fi
    sleep 0.2
  done
  echo "R14_SQL_NOT_STABLY_READY"; return 1
}
ready
docker cp sql/r13_candidate_review_reservation.sql "$cid":/tmp/r13.sql >/dev/null
docker exec --user postgres "$cid" psql -X -U postgres -v ON_ERROR_STOP=1 -f /tmp/r13.sql >/dev/null
query(){
  docker exec --user postgres "$cid" psql -X -A -t -q -U postgres -v ON_ERROR_STOP=1 -c "$1" | tr -d '\r'
}
assert_eq(){
  if [[ "$1" != "$2" ]]; then
    echo "R14_ASSERT_FAILED at [$3], expected [$2], observed [$1]"; exit 1
  fi
}
digest="$(printf 'b%.0s' {1..64})"
reserve(){
  printf "SELECT tcvl_r13_candidate.reserve_review_only('%s','%s','demo-project','v1','%s',clock_timestamp()+interval '30 minutes');" "$1" "$2" "$digest"
}
state(){
  query "SELECT receipt_id||'|'||project_id||'|'||direction_version||'|'||evidence_digest||'|'||stage FROM tcvl_r13_candidate.review_reservations WHERE receipt_id='$1';"
}
# Case 1: committed receipt and revoked key must survive immediate SIGKILL
# of the *whole disposable database container*, then WAL crash recovery.
assert_eq "$(query "$(reserve 'durable-r14' 'key-r14')")" "REVIEW_RESERVED_ONLY" "pre-crash durable reserve"
assert_eq "$(query "SELECT tcvl_r13_candidate.revoke_key_for_review('revoked-r14');")" "REVIEW_KEY_REVOKED" "pre-crash revocation"
docker kill --signal=SIGKILL "$cid" >/dev/null
docker start "$cid" >/dev/null
ready
assert_eq "$(state 'durable-r14')" "durable-r14|demo-project|v1|$digest|review_reserved" "committed WAL replay state"
assert_eq "$(query "$(reserve 'durable-r14' 'key-r14')")" "BLOCKED_REPLAY_OR_CONFLICT" "deny replay after unclean restart"
assert_eq "$(query "$(reserve 'new-after-revoke-r14' 'revoked-r14')")" "BLOCKED_REVOKED" "persisted revoke after unclean restart"
echo "R14 CRASH_RESTART_WAL: committed receipt + revoked key persisted; replay denied"

# Case 2: kill a backend that already reserved INSIDE AN UNCOMMITTED tx.
# A separate connection cannot see the row, even after abrupt backend death.
docker exec -i --user postgres "$cid" psql -X -A -t -q -U postgres -v ON_ERROR_STOP=1 \
  >"$tmp/uncommitted.out" 2>&1 <<SQL &
BEGIN;
SELECT pg_backend_pid();
SELECT tcvl_r13_candidate.reserve_review_only('uncommitted-r14','key-r14','demo-project','v1','$digest',clock_timestamp()+interval '30 minutes');
\echo R14_TXN_ACTIVE
SELECT pg_sleep(40);
COMMIT;
SQL
txjob=$!
seen_tx=0
for _ in $(seq 1 100); do
  if grep -q 'R14_TXN_ACTIVE' "$tmp/uncommitted.out"; then seen_tx=1; break; fi
  sleep 0.1
done
[[ "$seen_tx" == 1 ]] || { echo "R14_UNCOMMITTED_SETUP_FAILED"; exit 1; }
backend_pid="$(grep -E '^[[:space:]]*[0-9]+[[:space:]]*$' "$tmp/uncommitted.out" | head -1 | tr -d '[:space:]')"
[[ "$backend_pid" =~ ^[0-9]+$ ]] || { echo "R14_BACKEND_PID_MISSING"; exit 1; }
assert_eq "$(query "SELECT pg_terminate_backend($backend_pid);")" "t" "forced backend abort"
if wait "$txjob"; then echo "R14_UNCOMMITTED_CONNECTION_UNEXPECTED_SUCCESS"; exit 1; fi
assert_eq "$(query "SELECT count(*) FROM tcvl_r13_candidate.review_reservations WHERE receipt_id='uncommitted-r14';")" "0" "uncommitted transaction rolled back"
assert_eq "$(query "$(reserve 'uncommitted-r14' 'key-r14')")" "REVIEW_RESERVED_ONLY" "aborted reservation can be safely resubmitted only after verified readback"
echo "R14 ABORTED_TRANSACTION: uncommitted row absent after backend termination"

# Case 3: response lost after COMMIT. Query DB by ID rather than blindly
# treating an unknown transport outcome as not committed / safe to retry.
query "$(reserve 'unknown-response-r14' 'key-r14')" >/dev/null
observed="$(state 'unknown-response-r14')"
assert_eq "$observed" "unknown-response-r14|demo-project|v1|$digest|review_reserved" "uncertain-commit readback"
assert_eq "$(query "$(reserve 'unknown-response-r14' 'key-r14')")" \
  "BLOCKED_REPLAY_OR_CONFLICT" "blind replay prevented after lost client response"
conflict="SELECT tcvl_r13_candidate.reserve_review_only('unknown-response-r14','key-wrong','other-project','v2','$(printf 'c%.0s' {1..64})',clock_timestamp()+interval '30 minutes');"
assert_eq "$(query "$conflict")" "BLOCKED_REPLAY_OR_CONFLICT" "same receipt ID conflicting payload blocked"
assert_eq "$(state 'unknown-response-r14')" "$observed" "conflicting retry cannot mutate saved evidence"
echo "R14 UNCERTAIN_COMMIT: durable readback, no blind re-reserve, conflicting payload denied"

# Case 4: an in-memory "preflight" is never authorization; after restart the
# transaction store is still only for review_reserved (no execution state).
assert_eq "$(query "SELECT count(*) FROM tcvl_r13_candidate.review_reservations WHERE stage <> 'review_reserved';")" "0" "review-only DB stages"
echo "R14 REVIEW_ONLY: no approval, no worker, no external side effects"
echo "R14 LIMITATIONS: single disposable PostgreSQL container; no HA/PITR, protected identity, independent G2, or production data"
