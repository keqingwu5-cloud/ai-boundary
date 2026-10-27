"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const sql=fs.readFileSync("sql/r20_candidate_untrusted_review_ledger.sql","utf8");
const script=fs.readFileSync("scripts/test-r20-pg-untrusted-review-ledger.sh","utf8");
test("R20 never installs a production migration or worker permission",()=>{
 assert.match(sql,/THROWAWAY POSTGRES ONLY/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/REVOKE ALL ON SCHEMA tcvl_r20_candidate FROM PUBLIC/);
 assert.match(sql,/REVOKE ALL ON FUNCTION tcvl_r20_candidate.reserve_untrusted_metadata/);
 assert.doesNotMatch(sql,/^\s*GRANT\s+/im);
 assert.doesNotMatch(sql,/^\s*[^-].*SECURITY DEFINER/im);
 assert.doesNotMatch(sql,/execution_allowed\s+boolean|stage='approved'|dispatch_worker/i);
});
test("R20 stores all v2 draft claims losslessly but never a verified approval flag",()=>{
 assert.match(sql,/envelope jsonb NOT NULL/);
 assert.match(sql,/receipt_id text PRIMARY KEY/);
 assert.match(sql,/nonce text NOT NULL UNIQUE/);
 assert.match(sql,/CHECK\(stage='untrusted_metadata_only'\)/);
 for(const n of ["task_id","node_id","origin_command_id","direction_version","request_id",
  "audience","permissions_scope","evidence_digest","approver_id","key_id","nonce",
  "issued_at","expires_at"])assert.ok(sql.includes(n),n);
});
test("R20 same transaction checks receipt, key and node revocations before reservation",()=>{
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/kind='receipt'/);assert.match(sql,/kind='key'/);assert.match(sql,/kind='node'/);
 assert.match(sql,/ON CONFLICT DO NOTHING RETURNING receipt_id/);
 assert.match(sql,/BLOCKED_DUPLICATE_RECEIPT_OR_NONCE/);
});
test("R20 test has no public ports and independently tests replays, nonce and limited DB role",()=>{
 assert.match(script,/docker rm -f "\$cid"/);
 assert.match(script,/trap cleanup EXIT/);
 assert.doesNotMatch(script,/--publish|--privileged|--network host|-p\s+5432/);
 assert.match(script,/seq 1 16/);
 assert.match(script,/CREATE ROLE r20_untrusted NOLOGIN/);
 assert.match(script,/permission denied/);
});
