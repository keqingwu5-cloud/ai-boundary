import { createHash } from 'node:crypto';

const sha = x => typeof x === 'string' && /^[0-9a-f]{40}$/i.test(x);
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  throw new TypeError('Payload must be JSON-compatible (finite numbers, plain objects, arrays, strings, booleans and null).');
}
export function payloadHash(payload) {
  return createHash('sha256').update(canonical(payload)).digest('hex');
}
const nonempty = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 1024;

function validate(item, ruleSha) {
  if (!plain(item)) return 'INVALID_TASK_OBJECT';
  for (const key of ['projectId', 'taskId', 'kind', 'sourceRef', 'sourceRevision']) if (!nonempty(item[key])) return `MISSING_${key}`;
  if (!sha(item.ruleSha)) return 'INVALID_RULE_SHA';
  if (item.ruleSha.toLowerCase() !== ruleSha.toLowerCase()) return 'STALE_RULE_SHA';
  if (!Object.hasOwn(item, 'payload')) return 'MISSING_PAYLOAD';
  try { payloadHash(item.payload); } catch { return 'INVALID_PAYLOAD'; }
  return null;
}
const identity = t => canonical([t.projectId, t.taskId, t.kind, t.sourceRef, t.sourceRevision, t.ruleSha.toLowerCase()]);

export function prepareBatch({ items, prior = [], activeRuleSha }) {
  if (!sha(activeRuleSha)) throw new TypeError('A fixed full Git commit SHA for the active rules is required.');
  if (!Array.isArray(items) || !Array.isArray(prior)) throw new TypeError('items and prior must be arrays.');
  if (items.length > 10000 || prior.length > 100000) throw new RangeError('Batch too large.');
  const seen = new Map();
  for (const record of prior) {
    if (!plain(record) || !plain(record.task) || !/^[0-9a-f]{64}$/i.test(record.payloadHash)) throw new TypeError('Invalid prior ledger entry.');
    const t = record.task;
    for (const key of ['projectId', 'taskId', 'kind', 'sourceRef', 'sourceRevision']) if (!nonempty(t[key])) throw new TypeError('Invalid prior ledger task.');
    if (!sha(t.ruleSha)) throw new TypeError('Invalid prior ledger rule SHA.');
    const k = identity(t);
    if (seen.has(k) && seen.get(k) !== record.payloadHash.toLowerCase()) throw new TypeError('Conflicting prior ledger entries: fail closed.');
    seen.set(k, record.payloadHash.toLowerCase());
  }
  const decisions = [];
  const ledgerCandidates = [];
  for (const item of items) {
    const error = validate(item, activeRuleSha);
    if (error) { decisions.push({ taskId: item?.taskId ?? null, status: 'BLOCKED', reason: error }); continue; }
    const k = identity(item), h = payloadHash(item.payload);
    if (seen.has(k)) {
      const same = seen.get(k) === h;
      decisions.push({ taskId: item.taskId, status: same ? 'DUPLICATE_SKIP' : 'BLOCKED', reason: same ? 'SAME_SOURCE_AND_PAYLOAD' : 'IDENTITY_PAYLOAD_CONFLICT' });
      continue;
    }
    seen.set(k, h);
    const record = { task: { projectId: item.projectId, taskId: item.taskId, kind: item.kind, sourceRef: item.sourceRef, sourceRevision: item.sourceRevision, ruleSha: item.ruleSha.toLowerCase() }, payloadHash: h };
    ledgerCandidates.push(record);
    decisions.push({ taskId: item.taskId, status: 'ACCEPT_CANDIDATE', reason: 'NEW_VERSIONED_TASK', payloadHash: h });
  }
  return { decisions, ledgerCandidates, stats: { accepted: decisions.filter(d => d.status === 'ACCEPT_CANDIDATE').length, duplicate: decisions.filter(d => d.status === 'DUPLICATE_SKIP').length, blocked: decisions.filter(d => d.status === 'BLOCKED').length } };
}

export function compareObservedRuns(baseline, candidate) {
  function metrics(rows) {
    if (!Array.isArray(rows) || rows.length === 0) throw new TypeError('Observed run arrays must be nonempty.');
    let durationMs = 0, qualified = 0, rejected = 0, costUsd = 0, hasCost = true;
    for (const r of rows) {
      if (!plain(r) || !Number.isFinite(r.durationMs) || r.durationMs <= 0 || typeof r.qualified !== 'boolean') throw new TypeError('Each run requires measured durationMs > 0 and independently reviewed qualified boolean.');
      if (!nonempty(r.evidenceRef) || !nonempty(r.reviewerId)) throw new TypeError('Each run needs evidenceRef and reviewerId; unverified claims cannot be benchmarked.');
      durationMs += r.durationMs; qualified += r.qualified ? 1 : 0; rejected += r.qualified ? 0 : 1;
      if (r.costUsd === null || r.costUsd === undefined) hasCost = false;
      else if (Number.isFinite(r.costUsd) && r.costUsd >= 0) costUsd += r.costUsd;
      else throw new TypeError('Invalid measured cost.');
    }
    return { count: rows.length, qualified, rejected, durationMs, qualifiedPerHour: qualified * 3600000 / durationMs, costUsd: hasCost ? costUsd : null };
  }
  const b = metrics(baseline), c = metrics(candidate);
  return { baseline: b, candidate: c, qualifiedThroughputRatio: b.qualified > 0 ? c.qualifiedPerHour / b.qualifiedPerHour : null, note: 'Only meaningful with comparable tasks, environments, evaluation and independent verification. Null ratio means unmeasurable baseline.' };
}
