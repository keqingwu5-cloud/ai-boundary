#!/usr/bin/env bash
# R20 G1 disposable PostgreSQL. NO PRODUCTION DB / PORT / REAL OWNER.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
cid="tcvl-r20-$RANDOM-$$"
tmp="$(mktemp -d)"
cleanup(){ docker rm -f "$cid" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
docker run -d --name "$cid" -e POSTGRES_PASSWORD=R20_SYNTHETIC_ONLY postgres:16-alpine >/dev/null
ready=0
for _ in $(seq 1 100); do
 if [[ "$(docker exec "$cid" sh -c 'cat /proc/1/comm' 2>/dev/null || true)" == postgres ]] \
   && docker exec --user postgres "$cid" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c 'SELECT 1;' >/dev/null 2>&1;then ready=1;break;fi
 sleep 0.2
done
[[ "$ready" == 1 ]] || { echo "R20_POSTGRES_NOT_READY"; exit 1; }
docker cp sql/r20_candidate_untrusted_review_ledger.sql "$cid":/tmp/r20.sql >/dev/null
docker exec --user postgres "$cid" psql -X -U postgres -v ON_ERROR_STOP=1 -f /tmp/r20.sql >/dev/null
q(){ docker exec --user postgres "$cid" psql -XqAt -U postgres -v ON_ERROR_STOP=1 -c "$1" | tr -d '\r'; }
assert(){ [[ "$1" == "$2" ]] || { echo "R20_ASSERT_FAILED $3 expected '$2' got '$1'"; exit 1; }; }
digest="$(printf 'a%.0s' {1..64})"
payload(){
 printf "jsonb_build_object('schema','tcvl.review-receipt/v2-candidate','purpose','reserve_for_independent_review','claim_status','review_requested','project_id','project1','task_id','task1','node_id','%s','origin_command_id','command1','direction_version','v2','request_id','request1','audience','isolated-review','permissions_scope',jsonb_build_array('read'),'evidence_digest','%s','approver_id','synthetic','key_id','%s','receipt_id','%s','nonce','%s','issued_at',to_char((clock_timestamp()-interval '1 minute') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),'expires_at',to_char((clock_timestamp()+interval '5 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))" "$3" "$digest" "$4" "$1" "$2"
}
reserve(){ printf 'SELECT tcvl_r20_candidate.reserve_untrusted_metadata(%s);' "$(payload "$1" "$2" "$3" "$4")"; }
for i in $(seq 1 16); do ( q "$(reserve receipt1 nonce1 node1 key1)" >"$tmp/r-$i" ) & done
wait
success="$(grep -lxc 'UNTRUSTED_REVIEW_METADATA_RECORDED_ONLY' "$tmp"/r-* | wc -l | tr -d ' ')"
blocked="$(grep -lxc 'BLOCKED_DUPLICATE_RECEIPT_OR_NONCE' "$tmp"/r-* | wc -l | tr -d ' ')"
assert "$success" "1" "cross-session unique receipt"
assert "$blocked" "15" "cross-session replay denials"
assert "$(q "$(reserve receipt2 nonce1 node1 key1)")" "BLOCKED_DUPLICATE_RECEIPT_OR_NONCE" "nonce unique across receipts"
assert "$(q "$(reserve receipt1 nonce2 node1 key1)")" "BLOCKED_DUPLICATE_RECEIPT_OR_NONCE" "receipt unique across nonces"
assert "$(q "SELECT count(*) FROM tcvl_r20_candidate.review_metadata WHERE receipt_id='receipt1' AND nonce='nonce1' AND jsonb_typeof(envelope->'permissions_scope')='array' AND envelope->>'task_id'='task1' AND envelope->>'node_id'='node1' AND envelope->>'origin_command_id'='command1' AND envelope->>'evidence_digest'='$digest' AND stage='untrusted_metadata_only';")" "1" "complete identity and untrusted stage stored"
echo "R20 CROSS_SESSION: one metadata record, 15 duplicate refusals; receipt and nonce independently unique"

assert "$(q "SELECT tcvl_r20_candidate.revoke_untrusted_metadata('key','key-r20-revoked');")" "UNTRUSTED_REVIEW_REFERENCE_REVOKED" "test key revoked"
assert "$(q "$(reserve receipt3 nonce3 node1 key-r20-revoked)")" "BLOCKED_REVOKED_METADATA" "revoked key"
assert "$(q "SELECT tcvl_r20_candidate.revoke_untrusted_metadata('node','node-r20-revoked');")" "UNTRUSTED_REVIEW_REFERENCE_REVOKED" "test node revoked"
assert "$(q "$(reserve receipt4 nonce4 node-r20-revoked key1)")" "BLOCKED_REVOKED_METADATA" "revoked node"
assert "$(q "SELECT tcvl_r20_candidate.revoke_untrusted_metadata('receipt','receipt5');")" "UNTRUSTED_REVIEW_REFERENCE_REVOKED" "test receipt revoked"
assert "$(q "$(reserve receipt5 nonce5 node1 key1)")" "BLOCKED_REVOKED_METADATA" "revoked receipt"
echo "R20 REVOCATION: key/node/receipt review metadata blocked"

assert "$(q "SELECT tcvl_r20_candidate.reserve_untrusted_metadata($(payload receipt6 nonce6 node1 key1) || '{\"execution_allowed\":true}'::jsonb);")" "BLOCKED_INVALID_METADATA" "forged execution flag"
assert "$(q "SELECT tcvl_r20_candidate.reserve_untrusted_metadata(jsonb_set($(payload receipt6 nonce6 node1 key1),'{permissions_scope}','[\"read\",\"read\"]'::jsonb));")" "BLOCKED_INVALID_METADATA" "duplicate permissions"
assert "$(q "SELECT tcvl_r20_candidate.reserve_untrusted_metadata(jsonb_set($(payload receipt6 nonce6 node1 key1),'{evidence_digest}','\"unsafe\"'::jsonb));")" "BLOCKED_INVALID_METADATA" "evidence digest invalid"
assert "$(q "SELECT count(*) FROM tcvl_r20_candidate.review_metadata WHERE stage<>'untrusted_metadata_only';")" "0" "never privileged stage"
q "CREATE ROLE r20_untrusted NOLOGIN;" >/dev/null
if docker exec --user postgres "$cid" psql -X -U postgres -v ON_ERROR_STOP=1 \
 -c "SET ROLE r20_untrusted; SELECT tcvl_r20_candidate.reserve_untrusted_metadata($(payload forged nonce-forged node1 key1));" \
 >"$tmp/restricted" 2>&1; then
 echo "R20_UNTRUSTED_ROLE_MUST_BE_DENIED"; exit 1
fi
grep -qi 'permission denied' "$tmp/restricted" || { echo "R20_ROLE_FAILURE_UNEXPECTED"; exit 1; }
echo "R20 FALSE_AUTHORITY: forged flags blocked; unauthenticated role denied; no permission to execute"
echo "R20 LIMITATIONS: privileged test database owner still can insert UNSIGNED review metadata; no protected signer, owner approval, true atomic authorized consume, or G2"
