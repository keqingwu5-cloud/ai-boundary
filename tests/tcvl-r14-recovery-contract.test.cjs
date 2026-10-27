"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const shell=fs.readFileSync(path.join(__dirname,"../scripts/test-r14-pg-recovery.sh"),"utf8");
const source=fs.readFileSync(path.join(__dirname,"../tcvl-review-reconcile.cjs"),"utf8");
test("R14 only touches disposable Docker database and always removes it",()=>{
 assert.match(shell,/docker run --name "\$cid" -d/);
 assert.match(shell,/docker rm -f "\$cid"/);
 assert.match(shell,/trap cleanup EXIT/);
 assert.doesNotMatch(shell,/--publish|--network host|(-p\s+[0-9]+:)/);
 assert.doesNotMatch(shell,/SUPABASE|NOTION_|SERVICE_ROLE|POSTGRES_HOST|PGHOST/);
});
test("R14 actual crash tests distinguish committed WAL and uncommitted transaction",()=>{
 assert.match(shell,/docker kill --signal=SIGKILL "\$cid"/);
 assert.match(shell,/docker start "\$cid"/);
 assert.match(shell,/pg_terminate_backend\(\$backend_pid\)/);
 assert.match(shell,/uncommitted transaction rolled back/);
});
test("R14 unknown response must be checked with DB readback and mismatched payload blocked",()=>{
 assert.match(shell,/UNKNOWN|unknown-response-r14/i);
 assert.match(shell,/blind replay prevented/);
 assert.match(shell,/conflicting payload blocked/);
 assert.match(shell,/cannot mutate saved evidence/);
});
test("R14 reconciliation cannot have auto-execution or unconditional retry",()=>{
 assert.doesNotMatch(source,/execution_allowed\s*:\s*true/);
 assert.doesNotMatch(source,/automatic_retry_allowed\s*:\s*true/);
 assert.match(source,/REVIEW_UNKNOWN_MANUAL_RECHECK/);
});
