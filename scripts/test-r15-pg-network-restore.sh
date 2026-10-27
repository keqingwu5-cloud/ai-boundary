#!/usr/bin/env bash
# R15 G1 ISOLATED: TCP break + independent logical backup/restore.
# NO PUBLIC PORTS, NO PROD DB, NO REAL KEYS, NO WORKERS/APPROVAL.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
tag="$RANDOM-$$"
net="tcvl-r15-net-$tag"
primary="tcvl-r15-primary-$tag"
client="tcvl-r15-client-$tag"
restored="tcvl-r15-restored-$tag"
tmp="$(mktemp -d)"
cleanup(){
 docker rm -f "$client" "$restored" "$primary" >/dev/null 2>&1 || true
 docker network rm "$net" >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
docker network create --internal "$net" >/dev/null
docker run -d --name "$primary" --network "$net" --network-alias r15-primary \
 --env POSTGRES_PASSWORD=R15_SYNTHETIC_EPHEMERAL_ONLY postgres:16-alpine >/dev/null

ready(){
 local name="$1"
 for _ in $(seq 1 100); do
  if [[ "$(docker exec "$name" sh -c 'cat /proc/1/comm' 2>/dev/null || true)" == "postgres" ]] \
    && docker exec --user postgres "$name" psql -X -A -t -q -U postgres \
      -v ON_ERROR_STOP=1 -c 'SELECT 1;' >/dev/null 2>&1; then return 0; fi
  sleep 0.2
 done
 echo "R15_FINAL_POSTGRES_NOT_READY: $name"; exit 1
}
query(){
 docker exec --user postgres "$primary" psql -X -A -t -q -U postgres -v ON_ERROR_STOP=1 -c "$1" | tr -d '\r'
}
restored_query(){
 docker exec --user postgres "$restored" psql -X -A -t -q -U postgres -v ON_ERROR_STOP=1 -c "$1" | tr -d '\r'
}
assert_eq(){
 if [[ "$1" != "$2" ]]; then
  echo "R15_ASSERT_FAILED $3 expected '$2' observed '$1'"; exit 1
 fi
}
ready "$primary"
docker cp sql/r13_candidate_review_reservation.sql "$primary":/tmp/isolated_schema.sql >/dev/null
docker exec --user postgres "$primary" psql -X -U postgres -v ON_ERROR_STOP=1 \
 -f /tmp/isolated_schema.sql >/dev/null
digest="$(printf 'd%.0s' {1..64})"
reserve(){
 printf "SELECT tcvl_r13_candidate.reserve_review_only('%s','%s','r15-demo','v1','%s',clock_timestamp()+interval '25 minutes');" "$1" "$2" "$digest"
}
assert_eq "$(query "$(reserve 'tcp-known-r15' 'key-r15')")" "REVIEW_RESERVED_ONLY" "initial durable record"
assert_eq "$(query "SELECT tcvl_r13_candidate.revoke_key_for_review('revoked-key-r15');")" "REVIEW_KEY_REVOKED" "initial durable key revocation"
assert_eq "$(query "SELECT tcvl_r13_candidate.revoke_receipt_for_review('revoked-receipt-r15');")" "REVIEW_RECEIPT_REVOKED" "initial independent receipt revocation"

# CLIENT RUNS A REAL TCP CONNECTION THROUGH A PRIVATE DOCKER NETWORK.
docker run -d --name "$client" --network "$net" --entrypoint sh \
 postgres:16-alpine -c 'sleep 240' >/dev/null
assert_eq "$(docker exec -e PGPASSWORD=R15_SYNTHETIC_EPHEMERAL_ONLY "$client" \
 psql -X -A -t -q -h r15-primary -U postgres -d postgres -v ON_ERROR_STOP=1 \
 -c 'SELECT 1;' | tr -d '\r')" "1" "real private TCP client connection"

# Start a real TCP query that has reached the server and is still running.
# The complete simple-query batch may commit OR abort after the client link
# disappears: this is precisely why only server-side readback can classify it.
docker exec -d -e PGPASSWORD=R15_SYNTHETIC_EPHEMERAL_ONLY "$client" \
 sh -c "PGAPPNAME=r15_tcp_drop psql -X -A -t -q -h r15-primary -U postgres -d postgres -v ON_ERROR_STOP=1 \
   -c \"BEGIN; SELECT pg_sleep(4); $(reserve 'tcp-interrupted-r15' 'key-r15') COMMIT;\" \
   >/tmp/r15_tcp_result 2>&1" >/dev/null
observed_active=0
for _ in $(seq 1 60); do
 active="$(query "SELECT count(*) FROM pg_stat_activity WHERE application_name='r15_tcp_drop' AND state='active';")"
 if [[ "$active" =~ ^[1-9][0-9]*$ ]]; then observed_active=1; break; fi
 sleep 0.1
done
[[ "$observed_active" -eq 1 ]] || { echo "R15_REAL_TCP_QUERY_NOT_ACTIVE"; exit 1; }
docker network disconnect --force "$net" "$client"
sleep 5
# After a real link break the client's success/failure is never used to
# authorize anything or decide that an unknown transaction may be retried.
observed="$(query "SELECT count(*) FROM tcvl_r13_candidate.review_reservations WHERE receipt_id='tcp-interrupted-r15';")"
case "$observed" in
 "1")
  assert_eq "$(query "$(reserve 'tcp-interrupted-r15' 'key-r15')")" \
    "BLOCKED_REPLAY_OR_CONFLICT" "committed despite link loss"
  echo "R15 REAL_TCP_INTERRUPTION: DB committed after client disconnected; replay blocked"
  ;;
 "0")
  echo "R15_INCONCLUSIVE_COMMIT_CASE: row absent after real TCP break; cannot claim committed-after-disconnect proof"
  exit 2
  ;;
 *) echo "R15_UNEXPECTED_DB_READBACK_COUNT: $observed"; exit 1;;
esac
echo "R15 NO_BLIND_RETRY: observed persistent DB state, no automatic replay"

# Create a portable logical backup, retaining ACLs and ownership. DO NOT use
# --no-acl / --no-privileges: that could accidentally reopen function EXECUTE.
docker exec --user postgres "$primary" pg_dump -U postgres \
  --format=custom --schema=tcvl_r13_candidate --dbname=postgres >"$tmp/r15_backup.dump"
[[ -s "$tmp/r15_backup.dump" ]] || { echo "R15_BACKUP_EMPTY"; exit 1; }
before="$(query "SELECT md5(COALESCE(string_agg(row_to_json(t)::text, ';' ORDER BY t.receipt_id),'')) FROM (SELECT receipt_id,key_id,project_id,direction_version,evidence_digest,expires_at,reserved_at,stage FROM tcvl_r13_candidate.review_reservations) t;")"
before_revocations_hash="$(query "SELECT md5(COALESCE(string_agg(row_to_json(v)::text, ';' ORDER BY v.kind,v.ref_id),'')) FROM (SELECT kind,ref_id,revoked_at FROM tcvl_r13_candidate.revocations) v;")"
before_count="$(query "SELECT count(*) FROM tcvl_r13_candidate.review_reservations;")"
before_revoke="$(query "SELECT count(*) FROM tcvl_r13_candidate.revocations WHERE kind='key' AND ref_id='revoked-key-r15';")"
assert_eq "$before_revoke" "1" "expected key revocation in backup source"

docker run -d --name "$restored" --network "$net" \
 --env POSTGRES_PASSWORD=R15_SYNTHETIC_EPHEMERAL_ONLY postgres:16-alpine >/dev/null
ready "$restored"
docker exec -i --user postgres "$restored" pg_restore \
 --exit-on-error --username=postgres --dbname=postgres <"$tmp/r15_backup.dump" >/dev/null
after="$(restored_query "SELECT md5(COALESCE(string_agg(row_to_json(t)::text, ';' ORDER BY t.receipt_id),'')) FROM (SELECT receipt_id,key_id,project_id,direction_version,evidence_digest,expires_at,reserved_at,stage FROM tcvl_r13_candidate.review_reservations) t;")"
after_revocations_hash="$(restored_query "SELECT md5(COALESCE(string_agg(row_to_json(v)::text, ';' ORDER BY v.kind,v.ref_id),'')) FROM (SELECT kind,ref_id,revoked_at FROM tcvl_r13_candidate.revocations) v;")"
after_count="$(restored_query "SELECT count(*) FROM tcvl_r13_candidate.review_reservations;")"
after_revoke="$(restored_query "SELECT count(*) FROM tcvl_r13_candidate.revocations WHERE kind='key' AND ref_id='revoked-key-r15';")"
assert_eq "$after" "$before" "independent restore exact row hash"
assert_eq "$after_count" "$before_count" "independent restore row count"
assert_eq "$after_revocations_hash" "$before_revocations_hash" "every revoked key/receipt identity AND timestamp recovered"
assert_eq "$after_revoke" "$before_revoke" "independent restore revoked key"
assert_eq "$(restored_query "$(reserve 'tcp-known-r15' 'key-r15')")" \
 "BLOCKED_REPLAY_OR_CONFLICT" "restored backup refuses replay"
assert_eq "$(restored_query "$(reserve 'new-after-restore-r15' 'revoked-key-r15')")" \
 "BLOCKED_REVOKED" "restored revoked key refuses new review"
echo "R15 INDEPENDENT_BACKUP_RESTORE: row digest, row count, revocation and replay matched"

# Security privilege testing AFTER pg_restore matters: restoring ACLs can be
# subtly different from running original SQL. Privilege regression is NO-GO.
restored_query "CREATE ROLE r15_untrusted NOLOGIN;" >/dev/null
if docker exec --user postgres "$restored" psql -X -U postgres -v ON_ERROR_STOP=1 \
  -c "SET ROLE r15_untrusted; SELECT tcvl_r13_candidate.reserve_review_only('forged','key-r15','r15-demo','v1','$digest',clock_timestamp()+interval '5 minutes');" \
  >"$tmp/restricted.out" 2>&1; then
  echo "R15_RESTORED_ACL_FAILURE_UNTRUSTED_ROLE_ACCEPTED"; exit 1
fi
grep -qi 'permission denied' "$tmp/restricted.out" || {
 echo "R15_RESTORED_ACL_FAILURE_NOT_PERMISSION_DENIAL"; exit 1;
}
assert_eq "$(restored_query "SELECT count(*) FROM tcvl_r13_candidate.review_reservations WHERE stage <> 'review_reserved';")" "0" "restored remains review-only"
echo "R15 RESTORED_ACL: untrusted DB role denied; no privileged execution stage"
# Adversarial drift probes occur ONLY in the disposable restored test DB.
# Confirm full-field receipt and all revocation checks would actually notice
# changes that earlier R15's partial digest/count completely missed.
restored_query "UPDATE tcvl_r13_candidate.review_reservations SET expires_at=expires_at+interval '1 minute' WHERE receipt_id='tcp-known-r15';" >/dev/null
drifted_receipts="$(restored_query "SELECT md5(COALESCE(string_agg(row_to_json(t)::text, ';' ORDER BY t.receipt_id),'')) FROM (SELECT receipt_id,key_id,project_id,direction_version,evidence_digest,expires_at,reserved_at,stage FROM tcvl_r13_candidate.review_reservations) t;")"
[[ "$drifted_receipts" != "$before" ]] || { echo "R15_EXPIRY_DRIFT_NOT_DETECTED"; exit 1; }
restored_query "DELETE FROM tcvl_r13_candidate.revocations WHERE kind='receipt' AND ref_id='revoked-receipt-r15';" >/dev/null
drifted_revocations="$(restored_query "SELECT md5(COALESCE(string_agg(row_to_json(v)::text, ';' ORDER BY v.kind,v.ref_id),'')) FROM (SELECT kind,ref_id,revoked_at FROM tcvl_r13_candidate.revocations) v;")"
[[ "$drifted_revocations" != "$before_revocations_hash" ]] || { echo "R15_REVOCATION_DRIFT_NOT_DETECTED"; exit 1; }
echo "R15 INDUCED_DRIFT_DETECTION: changed expires_at and deleted a receipt revocation; both detected in isolated restore"

echo "R15 LIMITATION: logical backup/restore test is NOT PITR or HA failover, independent authorization or real G2 ACK"
