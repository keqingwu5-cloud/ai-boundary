"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const sh=fs.readFileSync("scripts/test-r17-unsafe-asynchronous-failover.sh","utf8");
test("R17 unsafe-lag demonstration is throwaway Docker-only without host publication",()=>{
 assert.match(sh,/docker network create --internal/);
 assert.match(sh,/docker rm -f/);
 assert.match(sh,/trap cleanup EXIT/);
 assert.doesNotMatch(sh,/--network host|--publish|--privileged/);
 assert.match(sh,/R17 PRODUCTION_NO_GO/);
});
test("R17 proves committed primary receipt and revocation are MISSING on paused replay",()=>{
 assert.match(sh,/pg_wal_replay_pause/);
 assert.match(sh,/R16 ASYNC_REPLAY_LAG_NEGATIVE/);
 assert.match(sh,/previously committed receipt LOST after premature promotion/);
 assert.match(sh,/previously committed revocation LOST after premature promotion/);
});
test("R17 expects dangerous duplicate/revoked-key acceptance as a failure counterexample",()=>{
 assert.match(sh,/unsafe promoted node accepted already-used receipt ID/);
 assert.match(sh,/unsafe promoted node accepted previously revoked key/);
 assert.match(sh,/R17 EXPECTED_UNSAFE_ASYNC_FAILOVER/);
});
test("R17 never operates two simultaneously active primaries or claims split-brain fencing",()=>{
 const stop=sh.indexOf('docker stop -t 3 "$primary"');
 const promote=sh.indexOf('pg_ctl -D /tmp/r16_data promote -w');
 assert.ok(stop>0&&promote>stop);
 assert.match(sh,/SPLIT_BRAIN_NOT_SIMULATED/);
 assert.match(sh,/no trusted fencing/);
});
