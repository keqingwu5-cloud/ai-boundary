"use strict";
/* Candidate verification inventory, not a deployment or an authorization service.
 * No network calls, credentials, vault access, writes to GitHub or auto-approval.
 * Real-world release gates are intentionally fail-closed until separately verified.
 */
const fs = require("node:fs");
const path = require("node:path");

const SCHEMA = "memory-v1-release-gate/v1";
const REQUIRED_FILES = Object.freeze([
  "memory.html",
  "memory.js",
  "memory-controls-core.js",
  "memory-impact-core.js",
  "scripts/check-memory-private-origin.cjs",
  "scripts/package-memory-v1.cjs",
  "scripts/verify-memory-v1-bundle.cjs",
  "tests/memory-browser-e2e.test.cjs",
  "tests/memory-isolated-origin-policy.test.cjs",
  "tests/memory-private-origin-preflight.test.cjs",
  "docs/memory-v1-independent-security-review.md",
  "docs/memory-v1-real-origin-preflight.md",
]);
const RELEASE_GATES = Object.freeze([
  ["private_https_origin", "Real private DNS/TLS/host ownership and isolation have not been independently verified by this job."],
  ["response_headers", "Real private HTTPS HTTP response headers and CSP have not been independently verified by this job."],
  ["cross_origin_negative_tests", "Actual public/private-origin negative security tests have not been independently verified by this job."],
  ["backup_restore_and_rollback", "Actual authorized old-vault backup migration, data comparison and rollback are not verified by this job."],
  ["independent_security_review", "Independent reviewer identity, fixed-SHA findings and ACK are not authenticated by this job."],
  ["owner_merge_approval", "Separate owner approval of the main-branch merge is not authenticated by this job."],
  ["owner_deploy_approval", "Separate owner approval of deployment is not authenticated by this job."],
]);
const SHA = /^[a-f0-9]{40}$/i;
function evaluate({root = process.cwd(), sha = "", ref = "", event = "", suppliedClaims = {}} = {}) {
  const present = REQUIRED_FILES.filter(f => fs.existsSync(path.join(root, f)));
  const missing = REQUIRED_FILES.filter(f => !present.includes(f));
  const claimsReceived = !!(suppliedClaims && typeof suppliedClaims === "object" && Object.keys(suppliedClaims).length);
  const fixedSha = typeof sha === "string" && SHA.test(sha) ? sha.toLowerCase() : null;
  const blockers = RELEASE_GATES.map(([id, reason]) => ({id, status: "NOT_INDEPENDENTLY_VERIFIED", reason}));
  if (!fixedSha) blockers.unshift({id: "fixed_commit_sha", status: "UNVERIFIED", reason: "A full 40-character immutable commit SHA is required for release evidence."});
  if (missing.length) blockers.unshift({id: "candidate_files", status: "MISSING", reason: "Missing candidate files: " + missing.join(", ")});
  return {
    schema: SCHEMA,
    classification: "CANDIDATE_AUTOMATED_INVENTORY_ONLY",
    commit_sha: fixedSha,
    github_ref: typeof ref === "string" ? ref.slice(0, 240) : "",
    github_event: typeof event === "string" ? event.slice(0, 80) : "",
    static_candidate_file_inventory: {status: missing.length ? "INCOMPLETE" : "PRESENT_NOT_SECURITY_ATTESTED", count: present.length, missing},
    github_tests: "NOT_ASSESSED_BY_THIS_REPORT_CHECK_SEPARATE_CI_JOBS",
    untrusted_claims_received: claimsReceived,
    untrusted_claims_can_authorize_release: false,
    known_same_origin_ciphertext_exposure: "OPEN_RELEASE_BLOCKER",
    blockers,
    release_verdict: "NO_GO",
    may_merge_main: false,
    may_deploy: false,
    note: "This is a fail-closed evidence inventory. Tests and supplied booleans cannot stand in for authenticated owner approval, independent review, or real private-origin checks."
  };
}
function parseArgs(argv) {
  const options = {strict: false, out: ""};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--strict") options.strict = true;
    else if (argv[i] === "--out" && i + 1 < argv.length) options.out = argv[++i];
    else throw Error("unknown_or_incomplete_argument:" + argv[i]);
  }
  return options;
}
function main() {
  let options;
  try {options = parseArgs(process.argv.slice(2));}
  catch (err) {process.stderr.write(err.message + "\n");process.exitCode = 2;return;}
  const report = evaluate({root: process.cwd(), sha: process.env.GITHUB_SHA || "", ref: process.env.GITHUB_REF || "", event: process.env.GITHUB_EVENT_NAME || ""});
  const json = JSON.stringify(report, null, 2) + "\n";
  if (options.out) {
    const dest = path.resolve(options.out);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.writeFileSync(dest, json, {flag: "wx"}); // never overwrite evidence from another attempt
  }
  process.stdout.write(json);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## Memory V1 release evidence gate\n\n" +
      "- Verdict: **NO_GO** (deliberately fail-closed)\n" +
      "- Candidate file inventory: **" + report.static_candidate_file_inventory.status + "**\n" +
      "- Origin/signer/independent review/owner approvals: **NOT INDEPENDENTLY VERIFIED**\n" +
      "- Known same-origin ciphertext exposure: **OPEN RELEASE BLOCKER**\n" +
      "- Main merge and deployment: **NOT AUTHORIZED**\n");
  }
  if (options.strict) process.exitCode = 1; // For main-targeting PRs; never changes prod.
}
if (require.main === module) main();
module.exports = {SCHEMA, REQUIRED_FILES, RELEASE_GATES, evaluate, parseArgs};
