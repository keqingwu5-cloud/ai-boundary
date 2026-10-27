#!/usr/bin/env bash
# R17 G1: intentionally unsafe PROMOTION after loss of WAL TRANSPORT in disposable PostgreSQL.
# Standby MUST have replayed the receipt+revocation evidence before takeover.
# NO AUTO FAILOVER / NO DUAL PRIMARY / NO REAL AUTHORITY / NO PUBLIC PORTS.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
tag="$RANDOM-$$"; net="tcvl-r16-net-$tag"
primary="tcvl-r16-primary-$tag"; standby="tcvl-r16-standby-$tag"
cleanup(){
 docker rm -f "$standby" "$primary" >/dev/null 2>&1 || true
 docker network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create --internal "$net" >/dev/null
docker run -d --name "$primary" --network "$net" --network-alias r16-primary \
 --env POSTGRES_PASSWORD=R16_SYNTHETIC_ONLY postgres:16-alpine >/dev/null
pq(){
 docker exec --user postgres "$primary" psql -X -t -A -q -U postgres -v ON_ERROR_STOP=1 -c "$1" | tr -d '\r'
}
sq(){
 docker exec --user postgres "$standby" psql -X -t -A -q -U postgres -v ON_ERROR_STOP=1 -h /tmp -c "$1" | tr -d '\r'
}
assert_eq(){
 if [[ "$1" != "$2" ]];then echo "R16_ASSERT_FAILED $3: expected '$2' got '$1'";exit 1;fi
}
ready_primary=0
for _ in $(seq 1 120);do
 if [[ "$(docker exec "$primary" sh -c 'cat /proc/1/comm' 2>/dev/null || true)" == "postgres" ]] \
  && pq 'SELECT 1;' >/dev/null 2>&1;then ready_primary=1;break;fi
 sleep 0.2
done
[[ "$ready_primary" == "1" ]] || { echo R16_PRIMARY_NOT_READY;exit 1; }
docker cp sql/r13_candidate_review_reservation.sql "$primary":/tmp/isolated_schema.sql >/dev/null
docker exec --user postgres "$primary" psql -X -U postgres -v ON_ERROR_STOP=1 \
 -f /tmp/isolated_schema.sql >/dev/null
pq "CREATE ROLE r16_repl WITH REPLICATION LOGIN PASSWORD 'R16_SYNTHETIC_REPLICATION_ONLY';" >/dev/null
docker exec --user postgres "$primary" sh -c \
 "printf '\nhost replication r16_repl all scram-sha-256\n' >> /var/lib/postgresql/data/pg_hba.conf"
assert_eq "$(pq 'SELECT pg_reload_conf();')" "t" "primary host replication reload"
digest="$(printf 'e%.0s' {1..64})"
reserve(){
 printf "SELECT tcvl_r13_candidate.reserve_review_only('%s','%s','r16-demo','v1','%s',clock_timestamp()+interval '20 minutes');" "$1" "$2" "$digest"
}
assert_eq "$(pq "$(reserve 'seed-r16' 'live-key-r16')")" "REVIEW_RESERVED_ONLY" "base seed"
docker run -d --name "$standby" --network "$net" --entrypoint sh \
 postgres:16-alpine -c 'sleep 360' >/dev/null
# Basebackup runs inside the standby container against the primary's
# REPLICATION-only test role. Its own data directory is entirely temporary.
docker exec --user postgres -e PGPASSWORD=R16_SYNTHETIC_REPLICATION_ONLY "$standby" \
 pg_basebackup -h r16-primary -U r16_repl -D /tmp/r16_data -X stream -R -c fast \
 >/dev/null
# -R writes standby.signal; the credentials used by the isolated standby are
# synthetic, then destroyed with the container. No real key or service role.
assert_eq "$(docker exec "$standby" test -f /tmp/r16_data/standby.signal && echo yes)" "yes" "physical standby.signal"
docker exec --user postgres "$standby" sh -c \
 "printf \"\nprimary_conninfo = 'host=r16-primary port=5432 user=r16_repl password=R16_SYNTHETIC_REPLICATION_ONLY application_name=r16_standby'\n\" >> /tmp/r16_data/postgresql.auto.conf"
docker exec --user postgres "$standby" pg_ctl -D /tmp/r16_data \
 -l /tmp/r16_standby.log -o '-c listen_addresses=* -c unix_socket_directories=/tmp' start >/dev/null
standby_ready=0
for _ in $(seq 1 120);do
 if sq 'SELECT pg_is_in_recovery();' >/dev/null 2>&1;then standby_ready=1;break;fi
 sleep 0.2
done
[[ "$standby_ready" == "1" ]] || { echo R16_STANDBY_NOT_READY; exit 1; }
assert_eq "$(sq 'SELECT pg_is_in_recovery();')" "t" "standby must start read-only in recovery"
replica_seen=0
for _ in $(seq 1 100);do
 n="$(pq "SELECT count(*) FROM pg_stat_replication WHERE application_name='r16_standby' AND state='streaming';")"
 if [[ "$n" == "1" ]];then replica_seen=1;break;fi
 sleep 0.2
done
[[ "$replica_seen" == "1" ]] || { echo R16_NOT_STREAMING;exit 1; }
assert_eq "$(sq "SELECT count(*) FROM tcvl_r13_candidate.review_reservations WHERE receipt_id='seed-r16';")" "1" "base backup seed visible"
echo "R16 PHYSICAL_REPLICATION: base backup and active WAL streaming verified"

# R17 high-fidelity negative: disconnect the standby's NETWORK before the
# primary commits anything new. That prevents WAL from being RECEIVED at all.
# Pausing replay only is NOT sufficient: promotion can replay already-received
# WAL and the first R17 test incorrectly expected missing records.
docker network disconnect --force "$net" "$standby"
assert_eq "$(docker inspect -f '{{len .NetworkSettings.Networks}}' "$standby")" "0" "standby network physically disconnected before primary commit"
assert_eq "$(sq 'SELECT pg_is_in_recovery();')" "t" "isolated standby still recovery mode"
assert_eq "$(pq "$(reserve 'disconnected-r17' 'live-key-r16')")" "REVIEW_RESERVED_ONLY" "primary committed after replication link loss"
assert_eq "$(pq "SELECT tcvl_r13_candidate.revoke_key_for_review('revoked-offline-r17');")" "REVIEW_KEY_REVOKED" "primary revoked key after replication link loss"
assert_eq "$(sq "SELECT count(*) FROM tcvl_r13_candidate.review_reservations WHERE receipt_id='disconnected-r17';")" "0" "unreceived committed receipt missing on isolated standby"
assert_eq "$(sq "SELECT count(*) FROM tcvl_r13_candidate.revocations WHERE kind='key' AND ref_id='revoked-offline-r17';")" "0" "unreceived committed revocation missing on isolated standby"
echo "R17 WAL_TRANSPORT_PARTITION: committed primary receipt and revocation were never received by standby"

# Demonstrate the UNSAFE choice ONLY inside disposable PostgreSQL containers.
# Stop the old primary FIRST to prevent any dual active writers in the test,
# then show that a lagged standby cannot reconstruct missing unreceived WAL.
docker stop -t 3 "$primary" >/dev/null
assert_eq "$(docker inspect -f '{{.State.Running}}' "$primary")" "false" "old primary stopped before destructive isolated promotion"
docker exec --user postgres "$standby" pg_ctl -D /tmp/r16_data promote -w >/dev/null
assert_eq "$(sq 'SELECT pg_is_in_recovery();')" "f" "partitioned lagging standby promoted for negative test"
assert_eq "$(sq "SELECT count(*) FROM tcvl_r13_candidate.review_reservations WHERE receipt_id='disconnected-r17';")" "0" "previously committed receipt LOST after promotion without WAL transport"
assert_eq "$(sq "SELECT count(*) FROM tcvl_r13_candidate.revocations WHERE kind='key' AND ref_id='revoked-offline-r17';")" "0" "previously committed key revocation LOST after promotion without WAL transport"
assert_eq "$(sq "$(reserve 'disconnected-r17' 'live-key-r16')")" "REVIEW_RESERVED_ONLY" "unsafe new primary reaccepted previously committed receipt"
assert_eq "$(sq "$(reserve 'after-unsafe-r17' 'revoked-offline-r17')")" "REVIEW_RESERVED_ONLY" "unsafe new primary accepted formerly revoked key"
echo "R17 EXPECTED_UNSAFE_ASYNC_FAILOVER: unreceived committed receipt/revocation missing; duplicates were accepted in throwaway DB"
echo "R17 SPLIT_BRAIN_NOT_SIMULATED: old primary stopped; real independent fencing and quorum remain unverified"
echo "R17 PRODUCTION_NO_GO: no trusted fencing, replay-guarantee or independent owner/G2 authority is configured"
