#!/usr/bin/env bash
# R13 isolated PostgreSQL test. NO HOST PORT and NO PRODUCTION CREDENTIALS.
set -euo pipefail
cd "$(dirname "$0")/.."
cid="tcvl-r13-$RANDOM-$$"
tmp="$(mktemp -d)"
cleanup(){ docker rm -f "$cid" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
docker run --name "$cid" --detach --env POSTGRES_PASSWORD=TEST_ONLY_EPHEMERAL_R13 \
  postgres:16-alpine >/dev/null
healthy=0
for i in $(seq 1 40); do
 if docker exec "$cid" pg_isready -U postgres >/dev/null 2>&1; then healthy=1; break; fi
 sleep 1
done
[[ "$healthy" -eq 1 ]] || { echo "R13 POSTGRES_NOT_READY"; exit 1; }
docker cp sql/r13_candidate_review_reservation.sql "$cid":/tmp/r13.sql >/dev/null
docker exec --user postgres "$cid" psql -X -U postgres -v ON_ERROR_STOP=1 \
  --file /tmp/r13.sql >/dev/null
query(){
 docker exec --user postgres "$cid" psql -X -A -t -q -U postgres \
  -v ON_ERROR_STOP=1 -c "$1" | tr -d '\r'
}
digest="$(printf 'a%.0s' {1..64})"
reservation_sql(){
 printf "SELECT tcvl_r13_candidate.reserve_review_only('%s','%s','demo-project','v1','%s',clock_timestamp()+interval '15 minutes');" "$1" "$2" "$digest"
}
assert_eq(){
 if [[ "$1" != "$2" ]]; then
  echo "R13 FAILURE expected '$2', observed '$1' (3)"; exit 1
 fi
}
# 24 INDEPENDENT psql sessions; only one may persist the same receipt.
for i in $(seq 1 24); do
 (query "$(reservation_sql 'concurrent-r13' 'key-a')" >"$tmp/out-$i") &
done
wait
wins="$(grep -lx 'REVIEW_RESERVED_ONLY' "$tmp"/out-* | wc -l | tr -d ' ')"
blocked="$(grep -lx 'BLOCKED_REPLAY_OR_CONFLICT' "$tmp"/out-* | wc -l | tr -d ' ')"
assert_eq "$wins" "1" "cross-session unique reservation"
assert_eq "$blocked" "23" "cross-session conflict rejection"
echo "R13 CROSS_SESSION_REPLAY: one reservation, 23 denials"

# Different process invocations retain the same receipt in one persistent DB.
assert_eq "$(query "$(reservation_sql 'concurrent-r13' 'key-a')")" \
 "BLOCKED_REPLAY_OR_CONFLICT" "persisted cross-process replay"

assert_eq "$(query "SELECT tcvl_r13_candidate.revoke_key_for_review('key-z');")" \
 "REVIEW_KEY_REVOKED" "key revocation"
assert_eq "$(query "$(reservation_sql 'after-key-revoke' 'key-z')")" \
 "BLOCKED_REVOKED" "future use of revoked key"

assert_eq "$(query "SELECT tcvl_r13_candidate.revoke_receipt_for_review('revoked-receipt');")" \
 "REVIEW_RECEIPT_REVOKED" "receipt revocation"
assert_eq "$(query "$(reservation_sql 'revoked-receipt' 'key-a')")" \
 "BLOCKED_REVOKED" "future use of revoked receipt"

expired="SELECT tcvl_r13_candidate.reserve_review_only('expired-r13','key-a','demo-project','v1','$digest',clock_timestamp()-interval '1 second');"
assert_eq "$(query "$expired")" "BLOCKED_EXPIRED" "expired receipt"

# A reservation inside a failed transaction must roll back and be reclaimable.
txn="$(reservation_sql 'rollback-r13' 'key-a')"
rollback_output="$(query "BEGIN; $txn ROLLBACK;")"
[[ "$rollback_output" == *REVIEW_RESERVED_ONLY* ]] || { echo "R13 ROLLBACK_SETUP_FAILED"; exit 1; }
assert_eq "$(query "$txn")" "REVIEW_RESERVED_ONLY" "rollback recovered"

# Deterministic cross-session revocation race: hold the SAME key lock in
# transaction A; transaction B's reservation must wait until A revokes/commits.
docker exec -i --user postgres "$cid" psql -X -A -t -q -U postgres -v ON_ERROR_STOP=1 \
 >"$tmp/revocation-transaction.out" 2>&1 <<'R13_TXN' &
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('tcvl_r13_key:key-race', 0));
\echo LOCK_ACQUIRED
SELECT pg_sleep(1.5);
SELECT tcvl_r13_candidate.revoke_key_for_review('key-race');
COMMIT;
R13_TXN
lock_holder=$!
locked=0
for i in $(seq 1 40); do
 if grep -q 'LOCK_ACQUIRED' "$tmp/revocation-transaction.out"; then locked=1; break; fi
 sleep 0.1
done
[[ "$locked" -eq 1 ]] || { echo "R13 RACE_SETUP_LOCK_FAILED"; exit 1; }
race_result="$(query "$(reservation_sql 'race-after-revocation' 'key-race')")"
wait "$lock_holder"
assert_eq "$race_result" "BLOCKED_REVOKED" "reservation races with key revocation"
echo "R13 CROSS_SESSION_REVOKE_RACE: blocked after lock holder commits"

# A restricted/untrusted role must not be able to invoke candidate reservation.
query "CREATE ROLE r13_untrusted NOLOGIN;" >/dev/null
if docker exec --user postgres "$cid" psql -X -U postgres -v ON_ERROR_STOP=1 \
 -c "SET ROLE r13_untrusted; SELECT tcvl_r13_candidate.reserve_review_only('untrusted','key-a','demo-project','v1','$digest',clock_timestamp()+interval '5 minutes');" \
 >"$tmp/untrusted.out" 2>&1; then
 echo "R13 ERROR: untrusted role incorrectly called schema"; exit 1
fi
grep -qi 'permission denied' "$tmp/untrusted.out" || {
 echo "R13 ERROR: restriction test did not fail for permissions"; exit 1;
}
echo "R13 UNTRUSTED_ROLE: permission denied as required"

# Confirm stored state can never be misread as execution authorized.
rows="$(query "SELECT count(*) FROM tcvl_r13_candidate.review_reservations WHERE stage <> 'review_reserved';")"
assert_eq "$rows" "0" "no approved/dispatched stage"
echo "R13 RECOVERY/REVOCATION/EXPIRY/NO_EXECUTION: PASS"
echo "R13 LIMITATION: ephemeral PostgreSQL only; no independently trusted owner, protected service, G2, or production deployment"
