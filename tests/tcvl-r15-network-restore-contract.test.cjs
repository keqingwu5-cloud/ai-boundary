"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const sh=fs.readFileSync(path.join(__dirname,"../scripts/test-r15-pg-network-restore.sh"),"utf8");
test("R15 only uses temporary isolated network without published host ports",()=>{
 assert.match(sh,/docker network create --internal/);
 assert.match(sh,/docker network disconnect --force/);
 assert.match(sh,/docker network rm/);
 assert.match(sh,/docker rm -f/);
 assert.match(sh,/trap cleanup EXIT/);
 assert.doesNotMatch(sh,/--network host|--publish|-p 5432:5432/);
 assert.doesNotMatch(sh,/SUPABASE_SERVICE_ROLE|NOTION_TOKEN|PRIVATE_KEY/);
});
test("R15 injects actual live TCP session link-loss instead of merely discarding SQL output",()=>{
 assert.match(sh,/psql .*?-h r15-primary/);
 assert.match(sh,/application_name='r15_tcp_drop'/);
 assert.match(sh,/docker network disconnect --force "\$net" "\$client"/);
 assert.match(sh,/NO_BLIND_RETRY/);
 assert.match(sh,/pg_stat_activity/);
});
test("R15 true independent restore verifies logical data integrity and revoked IDs",()=>{
 assert.match(sh,/pg_dump .*--format=custom/);
 assert.match(sh,/pg_restore/);
 assert.match(sh,/--exit-on-error/);
 assert.match(sh,/md5\(COALESCE\(string_agg/);
 assert.match(sh,/after_count/);
 assert.match(sh,/after_revoke/);
 assert.match(sh,/BLOCKED_REPLAY_OR_CONFLICT/);
 assert.match(sh,/BLOCKED_REVOKED/);
});
test("R15 restore preserves DB permissions and does not promote execution",()=>{
 assert.doesNotMatch(sh,/--no-acl|--no-privileges|GRANT ALL|SECURITY DEFINER/);
 assert.match(sh,/CREATE ROLE r15_untrusted NOLOGIN/);
 assert.match(sh,/grep -qi 'permission denied'/);
 assert.match(sh,/stage <> 'review_reserved'/);
 assert.doesNotMatch(sh,/execution_allowed=true|start_worker|dispatch_worker/);
});
test("R15 explicitly states backup/restore does not establish PITR, HA or owner authority",()=>{
 assert.match(sh,/NOT PITR or HA failover/);
 assert.match(sh,/real G2 ACK/);
});
