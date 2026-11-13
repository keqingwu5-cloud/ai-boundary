// FirstBrain F05 G-0 — read-only GitHub source vs local inbox evidence.
// CANDIDATE: no webhook subscription, no authenticated Grok receiver, no real ACK.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sha256 = value => createHash('sha256').update(String(value), 'utf8').digest('hex');
const iso = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const integer = x => Number.isSafeInteger(x) && x > 0;
const urlFor = (repo, issue, commentId) => `https://github.com/${repo}/issues/${issue}#issuecomment-${commentId}`;

export function normalizeGitHubComment(raw, repo, issue) {
  if (!object(raw) || !integer(raw.id) || typeof raw.body !== 'string' ||
      !iso(raw.created_at) || !iso(raw.updated_at) ||
      typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !integer(issue)) {
    throw new Error('SOURCE_UNVERIFIED: incomplete comment/source identity');
  }
  if (Date.parse(raw.updated_at) < Date.parse(raw.created_at)) {
    throw new Error('SOURCE_UNVERIFIED: impossible timestamp order');
  }
  return {
    source_key: `github:${repo}#${issue}:${raw.id}`,
    repository: repo, issue_number: issue, comment_id: raw.id,
    // A GitHub REST comment is its *current* state, NOT an event history.
    revision: iso(raw.updated_at), body_sha256: sha256(raw.body),
    created_at: iso(raw.created_at), updated_at: iso(raw.updated_at),
    source_url: urlFor(repo, issue, raw.id),
    source_semantics: 'CURRENT_COMMENT_STATE_ONLY',
  };
}

// One-shot independent read through GitHub REST (all pages). Inaccessible or
// incomplete sources fail closed; a REST read cannot prove webhook delivery.
export async function fetchSourceSnapshot({ repo, issue, token, fetchImpl = fetch, maxPages = 50, now = () => new Date().toISOString() }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '') || !integer(issue)) {
    throw new Error('SOURCE_UNVERIFIED: invalid repository or issue');
  }
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const uri = `https://api.github.com/repos/${repo}/issues/${issue}/comments?per_page=100&page=${page}`;
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'firstbrain-f05-g0-candidate' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try { response = await fetchImpl(uri, { method: 'GET', headers, redirect: 'follow' }); }
    catch { throw new Error('SOURCE_UNVERIFIED: GitHub query failed'); }
    if (!response?.ok) throw new Error(`SOURCE_UNVERIFIED: GitHub HTTP ${response?.status || 'unknown'}`);
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('SOURCE_UNVERIFIED: GitHub invalid JSON'); }
    if (!Array.isArray(payload)) throw new Error('SOURCE_UNVERIFIED: GitHub response is not a list');
    for (const raw of payload) rows.push(normalizeGitHubComment(raw, repo, issue));
    if (payload.length < 100) {
      const keys = new Set();
      for (const row of rows) {
        if (keys.has(row.source_key)) throw new Error('SOURCE_UNVERIFIED: duplicated source identity across pages');
        keys.add(row.source_key);
      }
      return { schema: 'firstbrain.source-snapshot.v1', source_origin: 'GITHUB_REST',
        repo, issue, observed_at: iso(now()), page_count: page, complete: true,
        rows };
    }
  }
  throw new Error('SOURCE_UNVERIFIED: pagination maxPages exceeded');
}

function validateSnapshot(snapshot) {
  if (!object(snapshot) || snapshot.schema !== 'firstbrain.source-snapshot.v1' ||
    snapshot.complete !== true || !iso(snapshot.observed_at) || !Array.isArray(snapshot.rows) ||
    typeof snapshot.repo !== 'string' || !integer(snapshot.issue)) return false;
  const keys = new Set();
  for (const ev of snapshot.rows) {
    if (!object(ev) || ev.repository !== snapshot.repo || ev.issue_number !== snapshot.issue ||
      !integer(ev.comment_id) || ev.source_key !== `github:${snapshot.repo}#${snapshot.issue}:${ev.comment_id}` ||
      !iso(ev.created_at) || !iso(ev.revision) ||
      Date.parse(ev.revision) > Date.parse(snapshot.observed_at) ||
      Date.parse(ev.created_at) > Date.parse(ev.revision) ||
      !/^[a-f0-9]{64}$/.test(ev.body_sha256 || '') ||
      ev.source_semantics !== 'CURRENT_COMMENT_STATE_ONLY' || keys.has(ev.source_key)) return false;
    keys.add(ev.source_key);
  }
  return true;
}

// A local file is only a snapshot candidate; its claimed records are not
// independent evidence that an external receiver or Grok actually received.
function validateInbox(inbox, snapshot) {
  if (!object(inbox) || inbox.schema !== 'firstbrain.inbox-snapshot.v1' ||
      !iso(inbox.observed_at) || !Array.isArray(inbox.records) ||
      inbox.repo !== snapshot.repo || inbox.issue !== snapshot.issue ||
      inbox.origin !== 'ISOLATED_FILE_CANDIDATE' || inbox.complete !== true) return false;
  return inbox.records.every(r => object(r) && typeof r.source_key === 'string' &&
    typeof r.revision === 'string' && /^[a-f0-9]{64}$/.test(r.body_sha256 || '') &&
    r.persisted === true && typeof r.persisted_at === 'string' && iso(r.persisted_at) &&
    Date.parse(r.persisted_at) <= Date.parse(inbox.observed_at));
}

export function assessSnapshot({ snapshot, inbox, expectedCommentIds, now, graceMs = 3 * 60 * 1000 }) {
  if (!Array.isArray(expectedCommentIds) || expectedCommentIds.length === 0 ||
      !expectedCommentIds.every(integer) || !Number.isSafeInteger(graceMs) || graceMs < 0 || !iso(now)) {
    throw new TypeError('valid expectedCommentIds, time and graceMs required');
  }
  if (!validateSnapshot(snapshot)) return expectedCommentIds.map(comment_id => ({ comment_id, status: 'SOURCE_UNVERIFIED' }));
  if (Date.parse(snapshot.observed_at) > Date.parse(now)) return expectedCommentIds.map(comment_id => ({ comment_id, status: 'SNAPSHOT_INCOMPARABLE' }));
  const selected = new Map(snapshot.rows.map(e => [e.comment_id, e]));
  if (!inbox || !validateInbox(inbox, snapshot)) return expectedCommentIds.map(comment_id => ({ comment_id, status: 'INBOX_UNVERIFIED' }));
  if (Date.parse(inbox.observed_at) > Date.parse(now) ||
      Date.parse(inbox.observed_at) < Date.parse(snapshot.observed_at)) {
    return expectedCommentIds.map(comment_id => ({ comment_id, status: 'SNAPSHOT_INCOMPARABLE' }));
  }
  const res = [];
  for (const comment_id of [...new Set(expectedCommentIds)]) {
    const ev = selected.get(comment_id);
    if (!ev) { res.push({ comment_id, status: 'SOURCE_EVENT_NOT_FOUND_OR_NOT_VISIBLE' }); continue; }
    const matchingKey = inbox.records.filter(x => x.source_key === ev.source_key);
    const consistent = matchingKey.length > 0 && matchingKey.every(r =>
      r.revision === ev.revision && r.body_sha256 === ev.body_sha256 &&
      Date.parse(r.persisted_at) >= Date.parse(ev.created_at));
    let status;
    if (matchingKey.length && !consistent) status = 'MISMATCH_OR_CONFLICT';
    else if (matchingKey.length > 1) status = 'DUPLICATE_LOCAL_RECORD';
    else if (matchingKey.length && consistent) status = 'LOCAL_RECORD_MATCH_ONLY';
    else if (Date.parse(now) - Date.parse(ev.revision) >= graceMs &&
      Date.parse(inbox.observed_at) >= Date.parse(ev.revision) + graceMs) {
      status = 'OVERDUE_UNPERSISTED_IN_ISOLATED_INBOX';
    } else status = 'PENDING_OR_SNAPSHOT_TOO_EARLY';
    res.push({ comment_id, source_key: ev.source_key, revision: ev.revision,
      body_sha256: ev.body_sha256, source_url: ev.source_url, status });
  }
  return res;
}

// Append-only local journal. fsync supports process-restart readback, but does
// not constitute a provider-origin proof or universal power-loss guarantee.
export function appendAuditOnce(file, entry) {
  const payload = { schema: 'firstbrain.g0-audit.v1', evidence_level: 'ISOLATED_LOCAL_CANDIDATE',
    ...entry, grok_ack: null, release_gate: 'HOLD' };
  // One incident may be independently observed multiple times. Distinguish
  // incident identity from a specific snapshot observation, and suppress only
  // duplicate observations of the *same* source/inbox snapshots.
  const incident_id = sha256(JSON.stringify({source_key:payload.source_key,
    comment_id:payload.comment_id, revision:payload.revision,
    body_sha256:payload.body_sha256, status:payload.status}));
  const audit_id = sha256(JSON.stringify({incident_id,
    source_origin:payload.source_origin, inbox_origin:payload.inbox_origin,
    source_snapshot_at:payload.source_snapshot_at,
    inbox_snapshot_at:payload.inbox_snapshot_at,
    source_snapshot_sha256:payload.source_snapshot_sha256,
    inbox_snapshot_sha256:payload.inbox_snapshot_sha256}));
  const data = { ...payload, incident_id, audit_id };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const prior = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(s => JSON.parse(s));
    if (prior.some(x => x.audit_id === audit_id)) return { written:false, audit_id };
  }
  const fd = fs.openSync(file, 'a', 0o600);
  try { fs.writeSync(fd, JSON.stringify(data) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  return { written:true, audit_id };
}

export async function main(argv = process.argv.slice(2)) {
  const flags = Object.fromEntries(argv.filter(x => x.startsWith('--')).map(x => {
    const n = x.indexOf('='); return n < 0 ? [x.slice(2), ''] : [x.slice(2,n),x.slice(n+1)];
  }));
  const issue = Number(flags.issue), id = Number(flags['comment-id']);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(flags.repo || '') || !integer(issue) || !integer(id) || !flags.inbox || !flags.audit) {
    throw new Error('usage: --repo=owner/name --issue=N --comment-id=N --inbox=/path/inbox.json --audit=/path/audit.jsonl [--source=/path/snapshot.json]');
  }
  let snapshot;
  if (flags.source) snapshot = JSON.parse(fs.readFileSync(flags.source, 'utf8'));
  else snapshot = await fetchSourceSnapshot({repo: flags.repo, issue, token: process.env.GITHUB_TOKEN});
  let inbox;
  try { inbox = JSON.parse(fs.readFileSync(flags.inbox, 'utf8')); }
  catch { inbox = null; }
  const now = iso(new Date().toISOString());
  const results = assessSnapshot({ snapshot, inbox, expectedCommentIds:[id], now });
  for (const r of results) {
    // Store *only* the limited status/evidence, never a source comment body.
    appendAuditOnce(flags.audit, { ...r, observed_at: now,
      source_origin: flags.source ? 'SUPPLIED_SNAPSHOT_UNATTESTED' : 'GITHUB_REST',
      inbox_origin: inbox?.origin || 'UNVERIFIED', receiver_identity: 'NOT_VERIFIED',
      source_snapshot_at: snapshot?.observed_at || null,
      inbox_snapshot_at: inbox?.observed_at || null,
      // Self-computed fingerprints distinguish observations, but are not
      // independently signed provenance or proof of real receiver operation.
      source_snapshot_sha256: sha256(JSON.stringify(snapshot)),
      inbox_snapshot_sha256: inbox ? sha256(JSON.stringify(inbox)) : null });
  }
  console.log(JSON.stringify({ results, evidence_level: 'ISOLATED_LOCAL_CANDIDATE',
    autonomous_monitoring: false, real_grok_ack: false, release_gate:'HOLD' }));
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => { console.error(e.message); process.exitCode = 2; });
}
