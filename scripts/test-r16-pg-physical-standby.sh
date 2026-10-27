#!/usr/bin/env bash
# R16 G1: PostgreSQL 16 physical streaming standby and CONTROLLED promotion.
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

# Generate NEW WAL after the physical backup, then prove the standby has
# replayed both a receipt and a revocation before planned failover.
assert_eq "$(pq "$(reserve 'after-backup-r16' 'live-key-r16')")" "REVIEW_RESERVED_ONLY" "post-basebackup change"
assert_eq "$(pq "SELECT tcvl_r13_candidate.revoke_key_for_review('revoked-r16');")" \
 "REVIEW_KEY_REVOKED" "post-basebackup revocation"
replayed=0
for _ in $(seq 1 100);do
 s="$(sq "SELECT (SELECT count(*) FROM tcvl_r13_candidate.review_reservations WHERE receipt_id='after-backup-r16')::text || ':' || (SELECT count(*) FROM tcvl_r13_candidate.revocations WHERE kind='key' AND ref_id='revoked-r16')::text;" 2>/dev/null || true)"
 if [[ "$s" == "1:1" ]];then replayed=1;break;fi
 sleep 0.2
done
[[ "$replayed" == "1" ]] || { echo R16_STANDBY_NOT_CAUGHT_UP;exit 1; }
echo "R16 WAL_REPLAY: post-basebackup receipt and key revocation visible in standby"

# Fencing is ONLY an explicit manual test precondition: first stop primary,
# then promote standby. This is NOT automated failover or split-brain control.
docker stop -t 3 "$primary" >/dev/null
running="$(docker inspect -f '{{.State.Running}}' "$primary")"
assert_eq "$running" "false" "old primary must be stopped before promotion"
docker exec --user postgres "$standby" pg_ctl -D /tmp/r16_data promote -w >/dev/null
assert_eq "$(sq 'SELECT pg_is_in_recovery();')" "f" "promoted standby is now primary"
assert_eq "$(sq "$(reserve 'seed-r16' 'live-key-r16')")" "BLOCKED_REPLAY_OR_CONFLICT" "seed replay denied"
assert_eq "$(sq "$(reserve 'after-backup-r16' 'live-key-r16')")" "BLOCKED_REPLAY_OR_CONFLICT" "recent receipt replay denied"
assert_eq "$(sq "$(reserve 'new-after-promotion-r16' 'revoked-r16')")" "BLOCKED_REVOKED" "revoked key remains blocked after promote"
assert_eq "$(sq "SELECT count(*) FROM tcvl_r13_candidate.review_reservations WHERE stage <> 'review_reserved';")" "0" "promoted data stays review only"
echo "R16 CONTROLLED_PROMOTION: old primary stopped first; replayed receipts and revocations preserved"
echo "R16 NO_AUTOMATIC_FENCING: split-brain and unsynced-commit loss remain OPEN blockers"
echo "R16 LIMITATION: single CI host, synthetic physical standby; no cross-host failover, PITR, independent owner or G2"
