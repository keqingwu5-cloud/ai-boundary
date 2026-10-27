"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const shell=fs.readFileSync("scripts/test-r16-pg-physical-standby.sh","utf8");
test("R16 only temporary internal Docker network without privileged host ports or real credential env",()=>{
 assert.match(shell,/docker network create --internal/);
 assert.match(shell,/docker network rm/);
 assert.match(shell,/docker rm -f/);
 assert.match(shell,/trap cleanup EXIT/);
 assert.doesNotMatch(shell,/--network host|--publish|--privileged/);
 assert.doesNotMatch(shell,/SUPABASE_SERVICE_ROLE|NOTION_TOKEN|REAL_PRIVATE_KEY/);
});
test("R16 physical replication has a real standby rather than logical restore",()=>{
 assert.match(shell,/pg_basebackup .*?-X stream -R/);
 assert.match(shell,/standby.signal/);
 assert.match(shell,/pg_stat_replication/);
 assert.match(shell,/pg_is_in_recovery/);
 assert.match(shell,/WAL_REPLAY/);
 assert.doesNotMatch(shell,/pg_dump|pg_restore/);
});
test("R16 promotes only after old primary is stopped and WAL receipt/revocation observed",()=>{
 const stop=shell.indexOf('docker stop -t 3 "$primary"');
 const promote=shell.indexOf('pg_ctl -D /tmp/r16_data promote -w');
 assert.ok(stop>0&&promote>stop,"no simultaneous intentional active primaries");
 assert.match(shell,/STANDBY_NOT_CAUGHT_UP/);
 assert.match(shell,/assert_eq "\$running" "false"/);
 assert.match(shell,/BLOCKED_REPLAY_OR_CONFLICT/);
 assert.match(shell,/BLOCKED_REVOKED/);
});
test("R16 does not advertise asynchronous replication as lossless/fenced HA",()=>{
 assert.match(shell,/NO_AUTOMATIC_FENCING/);
 assert.match(shell,/split-brain and unsynced-commit loss remain OPEN/);
 assert.match(shell,/no cross-host failover, PITR/);
 assert.doesNotMatch(shell,/execution_allowed\s*=\s*true/);
});
