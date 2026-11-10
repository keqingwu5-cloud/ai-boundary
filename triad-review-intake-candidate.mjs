/**
 * Research-only intake check for the Grok / First Brain triad handoff.
 * No I/O, delivery, authentication, proof verification or approval.
 * This module does NOT judge the duel or run any competing agent.
 */
export const TRIAD_INTAKE_SCHEMA = 'firstbrain.triad-handoff-intake.candidate.v0.1';
export const TRIAD_TASK_ID = 'FB-GROK-DUEL-CONTEXT-TRIAGE-20261110-V02';
export const TRIAD_SOURCE_ISSUE = 'https://github.com/keqingwu5-cloud/ai-boundary/issues/151';
export const TRIAD_ROUTE_IDS = Object.freeze(Array.from({length: 10}, (_, i) =>
  'G' + String(i + 1).padStart(2, '0')));
const PR149 = 'https://github.com/keqingwu5-cloud/ai-boundary/pull/149';
const SHA = /^[a-f0-9]{40}$/;
const SOURCE = /^https:\/\/github\.com\/keqingwu5-cloud\/ai-boundary\/(issues|pull)\/[1-9][0-9]*(?:#issuecomment-[1-9][0-9]*)?$/;
const OWNERS = Object.freeze(['GROK', 'BOT3', 'GPT2', 'GPT1']);
const REVIEWERS = Object.freeze(['BOT3', 'GPT2']);
const ROUTE_STATES = Object.freeze(['PROPOSED', 'BLOCKED', 'ISOLATED_TEST_CLAIM']);
const RECEIPT_CLAIMS = Object.freeze(['HANDOFF_POSTED', 'MANUAL_BRIDGE', 'RECEIVED_CLAIM']);
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const exact = (x, keys) => obj(x) && Object.keys(x).every(k => keys.includes(k)) &&
  keys.every(k => Object.prototype.hasOwnProperty.call(x, k));
const text = (x, min = 1, max = 300) => typeof x === 'string' && x.length >= min &&
  x.length <= max && !/[\u0000-\u001f]/.test(x);
const url = x => typeof x === 'string' && SOURCE.test(x);
const distinct = xs => new Set(xs).size === xs.length;
const blocked = reason => Object.freeze({
  status: 'blocked', reason, decision: 'HOLD', approval: 'NOT_APPROVED',
  actual_ack: 'NOT_VERIFIED', independent_review: 'NOT_VERIFIED',
  safe_to_autopromote: false
});
const candidate = fields => Object.freeze({
  status: 'candidate_only', decision: 'HOLD', approval: 'NOT_APPROVED',
  actual_ack: 'NOT_VERIFIED', independent_review: 'NOT_VERIFIED',
  safe_to_autopromote: false, persistence: 'NONE', external_io: false,
  ...fields
});

/**
 * The trusted expected SHA must be obtained separately from the GitHub PR,
 * not taken from the submitted packet. Caller authentication remains external.
 * Returned claims are strictly a local contract check, never a verified ACK.
 */
export function inspectTriadIntake(packet, {expectedPr149Sha} = {}) {
  if (!SHA.test(expectedPr149Sha ?? '')) return blocked('EXPECTED_SOURCE_SHA_REQUIRED');
  if (!exact(packet, ['schema', 'task_id', 'source_issue_url', 'source_pr_sha',
    'receipt_claim', 'readback', 'routes']) ||
    packet.schema !== TRIAD_INTAKE_SCHEMA || packet.task_id !== TRIAD_TASK_ID ||
    packet.source_issue_url !== TRIAD_SOURCE_ISSUE || !SHA.test(packet.source_pr_sha) ||
    !RECEIPT_CLAIMS.includes(packet.receipt_claim))
    return blocked('INTAKE_CONTRACT_INVALID');

  if (packet.source_pr_sha !== expectedPr149Sha)
    return blocked('SOURCE_SHA_STALE');

  const r = packet.readback;
  if (!exact(r, ['goal', 'v01_status', 'v02_status', 'release_gate',
    'external_software_status', 'user_notify_policy', 'source_refs',
    'counterassumptions']) ||
    r.goal !== 'FIRST_BRAIN_FIRST' ||
    r.v01_status !== 'SYNTHETIC_PROXY_ONLY' ||
    r.v02_status !== 'DESIGN_NOT_VERIFIED' ||
    r.release_gate !== 'HOLD' ||
    r.external_software_status !== 'NOT_RUN' ||
    r.user_notify_policy !== 'REVIEW_GATE_ONLY' ||
    !Array.isArray(r.source_refs) || r.source_refs.length < 2 ||
    r.source_refs.length > 10 || !r.source_refs.every(url) ||
    !distinct(r.source_refs) || !r.source_refs.includes(TRIAD_SOURCE_ISSUE) ||
    !r.source_refs.includes(PR149) ||
    !Array.isArray(r.counterassumptions) || r.counterassumptions.length < 3 ||
    r.counterassumptions.length > 10 ||
    !r.counterassumptions.every(s => text(s, 8, 280)))
    return blocked('READBACK_INCOMPLETE');

  if (!Array.isArray(packet.routes) || packet.routes.length !== TRIAD_ROUTE_IDS.length)
    return blocked('ROUTING_COVERAGE_INCOMPLETE');

  const ids = new Set();
  const reviewers = new Set();
  for (const x of packet.routes) {
    if (!exact(x, ['id', 'owner', 'reviewers', 'state', 'source_ref', 'evidence_refs']) ||
      !TRIAD_ROUTE_IDS.includes(x.id) || ids.has(x.id) ||
      !OWNERS.includes(x.owner) ||
      !Array.isArray(x.reviewers) || x.reviewers.length > 2 ||
      !x.reviewers.every(y => REVIEWERS.includes(y) && y !== x.owner) ||
      !distinct(x.reviewers) ||
      !ROUTE_STATES.includes(x.state) ||
      !url(x.source_ref) ||
      !Array.isArray(x.evidence_refs) || x.evidence_refs.length > 3 ||
      !x.evidence_refs.every(url) || !distinct(x.evidence_refs))
      return blocked('ROUTING_CONTRACT_INVALID');

    if (x.state === 'ISOLATED_TEST_CLAIM' && x.evidence_refs.length === 0)
      return blocked('TEST_EVIDENCE_REFERENCE_REQUIRED');
    ids.add(x.id);
    for (const reviewer of x.reviewers) reviewers.add(reviewer);
  }
  if (!TRIAD_ROUTE_IDS.every(id => ids.has(id)) ||
      !REVIEWERS.every(reviewer => reviewers.has(reviewer)))
    return blocked('ROUTING_COVERAGE_INCOMPLETE');

  return candidate({
    task_id: TRIAD_TASK_ID,
    source_issue_url: TRIAD_SOURCE_ISSUE,
    source_pr_sha: packet.source_pr_sha,
    route_count: ids.size,
    review_role_coverage: [...reviewers].sort(),
    receipt_claim: packet.receipt_claim,
    receipt_verification: 'NOT_VERIFIED',
    implementation_verification: 'NOT_VERIFIED',
    next_step: 'INDEPENDENT_SOURCE_AND_RECEIVER_VERIFICATION_REQUIRED'
  });
}
