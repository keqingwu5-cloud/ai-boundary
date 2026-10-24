"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {evaluate, REQUIRED_FILES, parseArgs, RELEASE_GATES} = require("../scripts/memory-release-gate.cjs");
function sandbox(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-gate-test-"));
  for (const file of files) {const dst = path.join(dir, file); fs.mkdirSync(path.dirname(dst), {recursive:true}); fs.writeFileSync(dst, "candidate fixture\n");}
  return dir;
}
const SHA = "0123456789abcdef0123456789abcdef01234567";

test("missing candidate files remain visible without claiming successful coverage", t => {
  const dir = sandbox([]); t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const out = evaluate({root:dir, sha:SHA});
  assert.equal(out.static_candidate_file_inventory.status, "INCOMPLETE");
  assert.equal(out.static_candidate_file_inventory.missing.length, REQUIRED_FILES.length);
  assert.equal(out.release_verdict, "NO_GO");
});
test("complete synthetic file set is not an independent security attestation", t => {
  const dir = sandbox(REQUIRED_FILES); t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const out = evaluate({root:dir, sha:SHA});
  assert.equal(out.static_candidate_file_inventory.status, "PRESENT_NOT_SECURITY_ATTESTED");
  assert.equal(out.commit_sha, SHA);
  assert.equal(out.release_verdict, "NO_GO");
  assert.equal(out.may_merge_main, false);
  assert.equal(out.may_deploy, false);
});
test("unverified all-PASS and claimed owner approval cannot upgrade release status", t => {
  const dir = sandbox(REQUIRED_FILES); t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const claims = Object.fromEntries(RELEASE_GATES.map(([id]) => [id, {pass:true, approved_by:"owner"}]));
  const out = evaluate({root:dir, sha:SHA, suppliedClaims:claims});
  assert.equal(out.untrusted_claims_received, true);
  assert.equal(out.untrusted_claims_can_authorize_release, false);
  assert.equal(out.release_verdict, "NO_GO");
  assert.equal(out.blockers.length, RELEASE_GATES.length);
});
test("no commit identity does not get guessed or substituted", t => {
  const dir = sandbox(REQUIRED_FILES); t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const out = evaluate({root:dir, sha:"branch-name"});
  assert.equal(out.commit_sha, null);
  assert.ok(out.blockers.some(b => b.id === "fixed_commit_sha"));
});
test("same-origin ciphertext access risk is always reported as a release blocker", t => {
  const dir = sandbox(REQUIRED_FILES); t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const out = evaluate({root:dir, sha:SHA});
  assert.equal(out.known_same_origin_ciphertext_exposure, "OPEN_RELEASE_BLOCKER");
  assert.ok(out.blockers.some(b => b.id === "private_https_origin"));
});
test("unknown or incomplete CLI options are rejected, not reinterpreted", () => {
  assert.throws(() => parseArgs(["--approve"]), /unknown_or_incomplete/);
  assert.throws(() => parseArgs(["--out"]), /unknown_or_incomplete/);
});
test("candidate mode emits auditable JSON and keeps exit=0 while verdict is NO_GO", t => {
  const dir = sandbox(REQUIRED_FILES); t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const out = spawnSync(process.execPath, [path.join(__dirname,"../scripts/memory-release-gate.cjs"), "--out", "gate-evidence.json"], {cwd:dir,encoding:"utf8",env:{...process.env, GITHUB_SHA:SHA, GITHUB_STEP_SUMMARY:""}});
  assert.equal(out.status, 0, out.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(dir, "gate-evidence.json"), "utf8"));
  assert.equal(report.release_verdict, "NO_GO");
  assert.ok(!/password|private.key|token_value/i.test(JSON.stringify(report)));
});
test("strict main-release mode exits nonzero even with full synthetic file coverage", t => {
  const dir = sandbox(REQUIRED_FILES); t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const out = spawnSync(process.execPath, [path.join(__dirname,"../scripts/memory-release-gate.cjs"), "--strict"], {cwd:dir,encoding:"utf8",env:{...process.env, GITHUB_SHA:SHA, GITHUB_STEP_SUMMARY:""}});
  assert.equal(out.status, 1);
  assert.equal(JSON.parse(out.stdout).release_verdict, "NO_GO");
});
test("append-only output creation refuses to overwrite previous evidence", t => {
  const dir = sandbox(REQUIRED_FILES); t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  const outFile=path.join(dir,"existing.json"); fs.writeFileSync(outFile,"original-log\n");
  const out=spawnSync(process.execPath,[path.join(__dirname,"../scripts/memory-release-gate.cjs"),"--out","existing.json"],{cwd:dir,encoding:"utf8",env:{...process.env,GITHUB_SHA:SHA,GITHUB_STEP_SUMMARY:""}});
  assert.notEqual(out.status,0);
  assert.equal(fs.readFileSync(outFile,"utf8"),"original-log\n");
});
