/**
 * Negative / adversarial tests for the cognitive-transition sidecar (V0.1).
 * Synthetic data only. In-memory only. Never produces real APPROVED.
 * Run with: node tests/cognitive-transition-negative.mjs
 */
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit} from '../proof-audit-candidate.mjs';
import {createCognitiveTransition} from '../cognitive-transition-candidate.mjs';

const H = c => c.repeat(64);
let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    const ok = await fn();
    if (ok === true) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${ok === false ? '' : ` -> ${JSON.stringify(ok)}`}`); }
  } catch (err) {
    failed++;
    console.log(`FAIL: ${name} -> threw ${err?.message ?? err}`);
  }
}

const blocked = (r, reason) => r?.status === 'blocked' && r.approval === 'NOT_APPROVED' &&
  (reason === undefined || r.reason === reason) ? true : r;

async function setup() {
  const control = createControlCycle();
  const audit = createProofAudit({control});
  const cog = createCognitiveTransition({control, audit});
  await control.registerDomain({
    domain_id: 'eng-neg-synth', contract_revision: 'v0.1', description: 'synthetic negative domain'
  });
  const obs = await control.observe({
    event_id: 'evt-neg', domain_id: 'eng-neg-synth', source_id: 'synth-sensor',
    revision: 'V11', source_hash: H('a'), baseline_ref: 'V10-approved-claim'
  });
  if (obs.status !== 'candidate_only') throw Error('setup observe failed');
  const proof = await audit.openProof({
    proof_id: 'proof-neg', event_id: 'evt-neg', expected_control_version: obs.version,
    sector: 'ENGINEERING', created_by_claim: 'synthetic_operator', scope_ref: 'scope-neg'
  });
  if (proof.status !== 'candidate_only') throw Error('setup proof failed');
  return {control, audit, cog};
}

const openRec = (over = {}) => ({
  transition_id: 'trans-neg', event_id: 'evt-neg', proof_id: 'proof-neg', project_id: 'proj-neg',
  s0_revision: 'V10', s0_hash: H('b'), source_revision: 'synth-rev',
  created_by_claim: 'synthetic_operator', ...over
});

async function opened() {
  const s = await setup();
  const t = await s.cog.openTransition(openRec());
  if (t.status !== 'candidate_only') throw Error('open failed');
  return {...s, v: t.version};
}

const actionRec = (v, over = {}) => ({
  transition_id: 'trans-neg', expected_version: v, action_id: 'act-neg', kind: 'RESEARCH_ONLY',
  predicted_s1: {revision: 'V11-tested'}, confidence: 0.5, assumptions: [],
  counterfactual_ref: 'cf-neg', ...over
});

async function withAction() {
  const s = await opened();
  const a = await s.cog.proposeAction(actionRec(s.v));
  if (a.status !== 'candidate_only') throw Error('propose failed');
  return {...s, v: a.version};
}

const calRec = (v, over = {}) => ({
  transition_id: 'trans-neg', expected_version: v, action_id: 'act-neg',
  error_summary: 'synthetic calibration', counter_evidence_ref: 'ev-neg', revised_confidence: 0.4,
  ...over
});

const memRec = (v, over = {}) => ({
  transition_id: 'trans-neg', expected_version: v, kind: 'COUNTERFACTUAL', ref_id: 'mem-neg',
  summary_hash: H('d'), epistemic: 'INFERRED', ...over
});

const obsRec = (v, over = {}) => ({
  transition_id: 'trans-neg', expected_version: v, o1_revision: 'V11-obs', o1_hash: H('c'),
  observed_at: '2026-11-09', source_ref: 'synth-obs', ...over
});

async function main() {
  await check('constructor requires control', () => {
    const {audit} = {audit: {readProof() {}}};
    try { createCognitiveTransition({audit}); return false; }
    catch (e) { return e.message === 'CONTROL_REQUIRED' || e.message; }
  });
  await check('constructor requires audit', () => {
    try { createCognitiveTransition({control: {readEvent() {}}}); return false; }
    catch (e) { return e.message === 'AUDIT_REQUIRED' || e.message; }
  });

  await check('missing control event -> CONTROL_EVENT_NOT_FOUND', async () => {
    const {cog} = await setup();
    return blocked(await cog.openTransition(openRec({event_id: 'evt-missing'})), 'CONTROL_EVENT_NOT_FOUND');
  });
  await check('proof mismatch -> PROOF_MISMATCH', async () => {
    const {cog} = await setup();
    return blocked(await cog.openTransition(openRec({proof_id: 'proof-missing'})), 'PROOF_MISMATCH');
  });
  await check('invalid s0_hash blocked', async () => {
    const {cog} = await setup();
    return blocked(await cog.openTransition(openRec({s0_hash: 'not-a-hash'})), 'TRANSITION_CONTRACT_INVALID');
  });
  await check('duplicate transition id -> TRANSITION_ID_COLLISION', async () => {
    const {cog} = await opened();
    return blocked(await cog.openTransition(openRec()), 'TRANSITION_ID_COLLISION');
  });

  await check('drive epistemic APPROVED blocked', async () => {
    const {cog, v} = await opened();
    return blocked(await cog.addDrive({
      transition_id: 'trans-neg', expected_version: v, layer: 'NEED', claim: 'synthetic',
      epistemic: 'APPROVED', evidence_ref: 'ev-1', counter_hypothesis: null
    }), 'DRIVE_CONTRACT_INVALID');
  });
  await check('stale expected_version -> VERSION_CONFLICT', async () => {
    const {cog, v} = await opened();
    return blocked(await cog.proposeAction(actionRec(v + 7)), 'VERSION_CONFLICT');
  });
  await check('unknown action kind EXECUTE_PRODUCTION blocked', async () => {
    const {cog, v} = await opened();
    return blocked(await cog.proposeAction(actionRec(v, {kind: 'EXECUTE_PRODUCTION'})), 'ACTION_CONTRACT_INVALID');
  });
  await check('proposeAction confidence > 1 blocked', async () => {
    const {cog, v} = await opened();
    return blocked(await cog.proposeAction(actionRec(v, {confidence: 1.5})), 'ACTION_CONTRACT_INVALID');
  });
  await check('proposeAction confidence NaN blocked', async () => {
    const {cog, v} = await opened();
    return blocked(await cog.proposeAction(actionRec(v, {confidence: NaN})), 'ACTION_CONTRACT_INVALID');
  });
  await check('proposed action executed===false and approval NOT_APPROVED', async () => {
    const {cog} = await withAction();
    const a = cog.readTransition('trans-neg').actions[0];
    return (a.executed === false && a.approval === 'NOT_APPROVED' && a.epistemic === 'PREDICTED') || a;
  });

  await check('recordObservation extra approval:APPROVED field blocked (exact keys)', async () => {
    const {cog, v} = await withAction();
    return blocked(await cog.recordObservation(obsRec(v, {approval: 'APPROVED'})), 'OBSERVATION_CONTRACT_INVALID');
  });
  await check('observation does not approve', async () => {
    const {cog, v} = await withAction();
    const r = await cog.recordObservation(obsRec(v));
    const t = cog.readTransition('trans-neg');
    return (r.approval === 'NOT_APPROVED' && t.approval === 'NOT_APPROVED' &&
      t.observations[0].approval === 'NOT_APPROVED' && t.observations[0].epistemic === 'OBSERVED') || {r, t};
  });

  await check('calibrate unknown action_id -> PREDICTION_NOT_FOUND', async () => {
    const {cog, v} = await withAction();
    return blocked(await cog.calibrate(calRec(v, {action_id: 'act-unknown'})), 'PREDICTION_NOT_FOUND');
  });
  await check('calibrate revised_confidence: 9 blocked (proven hole at 166dbc2)', async () => {
    const {cog, v} = await withAction();
    return blocked(await cog.calibrate(calRec(v, {revised_confidence: 9})), 'CALIBRATION_CONTRACT_INVALID');
  });
  await check('calibrate revised_confidence: NaN blocked', async () => {
    const {cog, v} = await withAction();
    return blocked(await cog.calibrate(calRec(v, {revised_confidence: NaN})), 'CALIBRATION_CONTRACT_INVALID');
  });
  await check('calibrate revised_confidence: -0.1 / Infinity blocked', async () => {
    const {cog, v} = await withAction();
    const a = await cog.calibrate(calRec(v, {revised_confidence: -0.1}));
    const b = await cog.calibrate(calRec(v, {revised_confidence: Infinity}));
    return (blocked(a, 'CALIBRATION_CONTRACT_INVALID') === true &&
      blocked(b, 'CALIBRATION_CONTRACT_INVALID') === true) || {a, b};
  });
  await check('calibrate revised_confidence: 0 and 1 accepted (boundary)', async () => {
    const {cog, v} = await withAction();
    const a = await cog.calibrate(calRec(v, {revised_confidence: 0}));
    const b = await cog.calibrate(calRec(a.version, {revised_confidence: 1}));
    return (a.status === 'candidate_only' && b.status === 'candidate_only' &&
      b.approval === 'NOT_APPROVED') || {a, b};
  });

  await check('memory ref epistemic APPROVED blocked', async () => {
    const {cog, v} = await opened();
    return blocked(await cog.addMemoryRef(memRec(v, {epistemic: 'APPROVED'})), 'MEMORY_REF_INVALID');
  });
  await check('addMemoryRef extra private_content blocked', async () => {
    const {cog, v} = await opened();
    return blocked(await cog.addMemoryRef(memRec(v, {private_content: 'secret synthetic text'})), 'MEMORY_REF_INVALID');
  });
  await check('memory_ref copied_content === false', async () => {
    const {cog, v} = await opened();
    const r = await cog.addMemoryRef(memRec(v));
    const m = cog.readTransition('trans-neg').memory_refs[0];
    return (r.status === 'candidate_only' && m.copied_content === false && !('private_content' in m)) || m;
  });

  await check('full flow: approval NOT_APPROVED, persistence IN_MEMORY_ONLY, times axes', async () => {
    const {cog, v} = await withAction();
    const o = await cog.recordObservation(obsRec(v));
    const c = await cog.calibrate(calRec(o.version));
    await cog.addMemoryRef(memRec(c.version));
    const t = cog.readTransition('trans-neg');
    const ver = await cog.verifyTransition('trans-neg');
    const stats = cog.stats();
    return (t.approval === 'NOT_APPROVED' && t.persistence === 'IN_MEMORY_ONLY' &&
      t.times.APPROVAL === 'UNKNOWN' && t.times.EVENT === 'UNKNOWN' &&
      t.times.REVISION === 'UNKNOWN' && t.times.OBSERVATION === '2026-11-09' &&
      ver.local_chain_consistent === true && ver.durable === false &&
      stats.approved === 0 && stats.external_io === false) || {t, ver, stats};
  });
  await check('times.OBSERVATION stays UNKNOWN when observed_at omitted', async () => {
    const {cog, v} = await withAction();
    const rec = obsRec(v); delete rec.observed_at;
    const r = await cog.recordObservation(rec);
    const t = cog.readTransition('trans-neg');
    return (r.status === 'candidate_only' && t.times.OBSERVATION === 'UNKNOWN') || t.times;
  });

  await check('missing transition read blocked', async () => {
    const {cog} = await setup();
    const r = cog.readTransition('trans-missing');
    const ver = await cog.verifyTransition('trans-missing');
    return (blocked(r, 'TRANSITION_NOT_FOUND') === true &&
      blocked(ver, 'TRANSITION_NOT_FOUND') === true) || {r, ver};
  });

  console.log(`\nSUMMARY: ${passed} passed, ${failed} failed (synthetic, in-memory, no APPROVED produced)`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('FAIL', err);
  process.exit(1);
});
