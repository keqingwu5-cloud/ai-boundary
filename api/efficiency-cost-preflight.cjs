'use strict';

// FIRST-BRAIN efficiency/cost preflight: deterministic, no I/O or dispatch.
// Signed provenance MUST be verified upstream; reviewed=true is not a signature.
const HEX64 = /^[a-f0-9]{64}$/i;
const VALID_STATUS = new Set(['complete', 'partial', 'error', 'unknown']);
const VALID_RISK = new Set(['low', 'high']);
const MAX_ITEMS = 1000;

function nonempty(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 512; }
function int(value) { return Number.isSafeInteger(value) && value >= 0; }
function nonnegativeCost(value) { return int(value) ? value : null; }

function planPreflight(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input_object_required');
  const { purposeDigest, sources, prior = [], limits = {}, nowMs } = input;
  if (!HEX64.test(purposeDigest || '')) throw new TypeError('purpose_digest_required');
  if (!Array.isArray(sources) || sources.length > MAX_ITEMS || !Array.isArray(prior) || prior.length > MAX_ITEMS) throw new TypeError('bounded_arrays_required');
  if (!int(nowMs) || !int(limits.maxReadCalls) || !int(limits.maxEstimatedMicros) || !int(limits.maxCacheAgeMs)) throw new TypeError('limits_required');
  const ids = new Set();
  const cache = new Map();
  for (const previous of prior) {
    if (!previous || !nonempty(previous.sourceId)) throw new TypeError('invalid_prior_source');
    if (cache.has(previous.sourceId)) throw new TypeError('ambiguous_prior_source');
    cache.set(previous.sourceId, previous);
  }
  let calls = 0, reserved = 0, reused = 0, blocked = 0;
  const decisions = [];
  for (const source of sources) {
    if (!source || !nonempty(source.sourceId) || !VALID_STATUS.has(source.status) || !VALID_RISK.has(source.risk)) throw new TypeError('invalid_source');
    if (ids.has(source.sourceId)) throw new TypeError('duplicate_source_id');
    ids.add(source.sourceId);
    const row = { sourceId: source.sourceId, action: '', reason: '' };
    if (source.status !== 'complete' || !HEX64.test(source.fingerprint || '')) {
      row.action = 'BLOCK_SOURCE'; row.reason = 'source_incomplete_or_unversioned'; blocked += 1;
    } else if (source.risk === 'high' || source.contradiction === true) {
      row.action = 'REVIEW_REQUIRED'; row.reason = 'high_risk_or_contradiction'; blocked += 1;
    } else {
      const old = cache.get(source.sourceId);
      const age = old && int(old.verifiedAtMs) ? nowMs - old.verifiedAtMs : -1;
      if (old && old.reviewed === true && nonempty(old.evidenceRef) &&
          old.sourceId === source.sourceId && old.fingerprint === source.fingerprint &&
          old.purposeDigest === purposeDigest && age >= 0 && age <= limits.maxCacheAgeMs) {
        row.action = 'REUSE_VERIFIED'; row.reason = 'same_source_purpose_fingerprint_within_age'; reused += 1;
      } else if (nonnegativeCost(source.estimatedReadMicros) === null) {
        row.action = 'BLOCK_UNKNOWN_COST'; row.reason = 'read_cost_not_estimated'; blocked += 1;
      } else if (calls >= limits.maxReadCalls || source.estimatedReadMicros > limits.maxEstimatedMicros - reserved) {
        row.action = 'BLOCK_BUDGET'; row.reason = 'bounded_read_or_cost_budget_exceeded'; blocked += 1;
      } else {
        calls += 1;
        reserved += source.estimatedReadMicros;
        row.action = 'TARGETED_VERIFY'; row.reason = 'unverified_changed_or_stale_source';
      }
    }
    decisions.push(row);
  }
  return { schema: 'efficiency-preflight.v1', runtimeAllowed: false, autoDispatch: false,
    decisions, summary: { sources: sources.length, reused, targetedVerifications: calls,
      blocked, estimatedReadMicros: reserved, estimatedCostSource: 'caller_supplied_not_billing',
      actualUsdSavings: 'UNKNOWN', modelCallsAuthorized: 0 } };
}

function summarizeUsage(records) {
  if (!Array.isArray(records) || records.length > MAX_ITEMS) throw new TypeError('bounded_usage_array_required');
  const byId = new Map();
  let knownMicros = 0, unknownCount = 0;
  for (const r of records) {
    if (!r || !nonempty(r.usageId) || !nonempty(r.eventId) ||
        !['provider_invoice', 'provider_meter', 'synthetic'].includes(r.kind)) throw new TypeError('usage_provenance_required');
    const row = JSON.stringify({eventId:r.eventId, kind:r.kind, chargeMicros:r.chargeMicros});
    if (byId.has(r.usageId)) {
      if (byId.get(r.usageId) !== row) throw new TypeError('conflicting_usage_id');
      continue;
    }
    byId.set(r.usageId, row);
    if (r.kind === 'synthetic' || !int(r.chargeMicros)) { unknownCount += 1; continue; }
    if (knownMicros > Number.MAX_SAFE_INTEGER - r.chargeMicros) throw new TypeError('usage_overflow');
    knownMicros += r.chargeMicros;
  }
  return { schema:'cost-ledger-summary.v1', distinctRecords:byId.size, knownMicros,
    unknownCount, complete:unknownCount===0, actualSpendCertified:false,
    warning:'Provider invoice/reconciliation and retry charges must be verified externally.' };
}

function main() {
  const text = require('node:fs').readFileSync(0,'utf8');
  const data = JSON.parse(text);
  process.stdout.write(JSON.stringify({preflight:planPreflight(data.preflight),usage:summarizeUsage(data.usage || [])})+'\n');
}
if (require.main === module) {
  try { main(); } catch(err) { process.stderr.write('PRECHECK_ERROR:'+err.message+'\n'); process.exitCode = 2; }
}
module.exports = {planPreflight,summarizeUsage};
