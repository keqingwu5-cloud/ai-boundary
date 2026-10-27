"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const sql=fs.readFileSync(path.join(__dirname,"../sql/r13_candidate_review_reservation.sql"),"utf8");
const sh=fs.readFileSync(path.join(__dirname,"../scripts/test-r13-pg-ephemeral.sh"),"utf8");
test("R13 is explicitly not a production migration or an authorization source",()=>{
 assert.match(sql,/DO NOT APPLY TO PRODUCTION/);
 assert.match(sql,/review.only|review_only/i);
 assert.doesNotMatch(sql,/GRANT\s+(?:ALL|EXECUTE|INSERT|UPDATE)\s+.+\s+TO\s+PUBLIC/i);
 assert.match(sql,/REVOKE ALL ON SCHEMA tcvl_r13_candidate FROM PUBLIC/);
 assert.doesNotMatch(sql,/^\s*(?!--).*SECURITY DEFINER/im);
});
test("R13 reservation only inserts review_reserved, never approved or dispatched",()=>{
 assert.match(sql,/ON CONFLICT \(receipt_id\) DO NOTHING/);
 assert.match(sql,/PRIMARY KEY\s*\(\s*kind,\s*ref_id\s*\)/);
 assert.match(sql,/stage\s*text.+DEFAULT\s*'review_reserved'/);
 assert.match(sql,/CHECK\s*\(stage\s*=\s*'review_reserved'\)/);
 assert.doesNotMatch(sql,/execution_allowed\s*boolean|stage\s*=\s*'approved'/);
});
test("R13 key and receipt advisory locks protect both reservation and revocation",()=>{
 assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('tcvl_r13_key:'/);
 assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('tcvl_r13_receipt:'/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION tcvl_r13_candidate\.revoke_key_for_review/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION tcvl_r13_candidate\.revoke_receipt_for_review/);
 assert.match(sql,/clock_timestamp\(\)/);
});
test("R13 ephemeral integration exercises independent SQL clients, rollback and denied anonymous role",()=>{
 assert.match(sh,/seq 1 24/);
 assert.match(sh,/BLOCKED_REPLAY_OR_CONFLICT/);
 assert.match(sh,/BLOCKED_REVOKED/);
 assert.match(sh,/ROLLBACK/);
 assert.match(sh,/CREATE ROLE r13_untrusted NOLOGIN/);
 assert.match(sh,/docker rm -f/);
 assert.doesNotMatch(sh,/--publish|-p\s+5432/);
});
test("R13 SQL simulation never mentions secrets, starts a worker or grants unauthenticated access",()=>{
 assert.doesNotMatch(sql,/CREATE EXTENSION|http_post|pg_net|dblink|COPY .* PROGRAM/);
 assert.doesNotMatch(sh,/AWS_SECRET|SUPABASE_SERVICE_ROLE|NOTION_TOKEN|PRIVATE_KEY/);
 assert.match(sql,/SECURITY INVOKER/);
});
