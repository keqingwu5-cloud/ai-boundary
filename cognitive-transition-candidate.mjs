/**
 * First Brain — Three-Axis Cognitive Transition V0.1 (isolated sidecar candidate).
 * In-memory only. References existing control-cycle / proof-audit / progress-journal.
 * Never copies private memory, never promotes to APPROVED without external authority,
 * never performs real I/O, network, persistence or worker start.
 * Distinguishes OBSERVED / INFERRED / PREDICTED / UNKNOWN / APPROVED.
 */
import {sha256, stableJson} from './nary-composition.mjs';

export const COG_SCHEMA = 'firstbrain.cognitive-transition.candidate.v0.1';
export const EPISTEMIC = Object.freeze(['OBSERVED', 'INFERRED', 'PREDICTED', 'UNKNOWN', 'APPROVED']);
export const MEMORY_KINDS = Object.freeze(['EVENT', 'COGNITIVE', 'PROCEDURAL', 'COUNTERFACTUAL']);
export const TIME_AXES = Object.freeze(['EVENT', 'OBSERVATION', 'APPROVAL', 'REVISION']);
export const DRIVE_LAYERS = Object.freeze(['NEED', 'CONSTRAINT', 'CHOICE']);

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const HEX = /^[0-9a-f]{64}$/;
const id = x => typeof x === 'string' && ID.test(x);
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const exact = (o, keys) => isObj(o) && Object.keys(o).every(k => keys.includes(k));
const cp = v => JSON.parse(JSON.stringify(v));
const denied = reason => ({
  status: 'blocked', reason, decision: 'HOLD', authority: 'none',
  epistemic: 'UNKNOWN', approval: 'NOT_APPROVED'
});
const cand = extra => ({
  status: 'candidate_only', decision: 'HOLD', authority: 'none',
  epistemic: 'UNKNOWN', approval: 'NOT_APPROVED', ...extra
});

export function createCognitiveTransition({
  control, audit, maxTransitions = 256, maxRefs = 1024
} = {}) {
  if (!control || typeof control.readEvent !== 'function') throw Error('CONTROL_REQUIRED');
  if (!audit || typeof audit.readProof !== 'function') throw Error('AUDIT_REQUIRED');
  if (!Number.isInteger(maxTransitions) || maxTransitions < 1 || maxTransitions > 10000 ||
      !Number.isInteger(maxRefs) || maxRefs < 1 || maxRefs > 100000) throw Error('LIMIT_INVALID');

  const transitions = new Map();
  let totalRefs = 0;

  function checkEpistemic(value, allowed = EPISTEMIC) {
    return allowed.includes(value) ? null : 'EPISTEMIC_INVALID';
  }

  async function append(t, kind, details) {
    if (totalRefs >= maxRefs) return denied('REF_CAPACITY_REACHED');
    const entry = {
      transition_id: t.id,
      sequence: t.version + 1,
      kind,
      details: cp(details),
      prev_hash: t.history.length ? t.history.at(-1).hash : null
    };
    const hash = await sha256(stableJson(entry));
    if (t.version !== entry.sequence - 1) return denied('VERSION_CONFLICT');
    if (totalRefs >= maxRefs) return denied('REF_CAPACITY_REACHED');
    t.history.push({...entry, hash});
    t.version++;
    totalRefs++;
    return cand({transition_id: t.id, version: t.version, entry_hash: hash});
  }

  /**
   * Open a transition candidate linked to an existing control event + proof.
   * S0 is the observed baseline; never auto-promotes to APPROVED.
   */
  async function openTransition(record) {
    if (!exact(record, ['transition_id', 'event_id', 'proof_id', 'project_id',
      's0_revision', 's0_hash', 'source_revision', 'created_by_claim']) ||
      !id(record.transition_id) || !id(record.event_id) || !id(record.proof_id) ||
      !id(record.project_id) || !id(record.s0_revision) || !HEX.test(record.s0_hash) ||
      !id(record.source_revision) || !id(record.created_by_claim))
      return denied('TRANSITION_CONTRACT_INVALID');

    const ev = control.readEvent(record.event_id);
    if (ev.status !== 'candidate_only') return denied('CONTROL_EVENT_NOT_FOUND');
    const pr = audit.readProof(record.proof_id);
    if (pr.status !== 'candidate_only' || pr.event_id !== record.event_id)
      return denied('PROOF_MISMATCH');

    if (transitions.has(record.transition_id))
      return denied('TRANSITION_ID_COLLISION');
    if (transitions.size >= maxTransitions) return denied('TRANSITION_CAPACITY');

    const t = {
      id: record.transition_id,
      event_id: record.event_id,
      proof_id: record.proof_id,
      project_id: record.project_id,
      s0: {revision: record.s0_revision, hash: record.s0_hash, epistemic: 'OBSERVED'},
      drivers: [],
      actions: [],
      predictions: [],
      observations: [],
      calibrations: [],
      memory_refs: [],
      times: {EVENT: 'UNKNOWN', OBSERVATION: 'UNKNOWN', APPROVAL: 'UNKNOWN', REVISION: 'UNKNOWN'},
      version: 0,
      history: [],
      created_by_claim: record.created_by_claim
    };
    transitions.set(t.id, t);

    const out = await append(t, 'TRANSITION_OPENED', {
      s0: t.s0, source_revision: record.source_revision,
      identity: 'CLAIM_ONLY', approval: 'NOT_APPROVED'
    });
    if (out.status === 'blocked') transitions.delete(t.id);
    return out;
  }

  /** Add a drive / motive candidate (need / constraint / choice). Epistemic only. */
  async function addDrive(record) {
    if (!exact(record, ['transition_id', 'expected_version', 'layer', 'claim',
      'epistemic', 'evidence_ref', 'counter_hypothesis']) ||
      !id(record.transition_id) || !DRIVE_LAYERS.includes(record.layer) ||
      typeof record.claim !== 'string' || record.claim.length > 280 ||
      !EPISTEMIC.includes(record.epistemic) || record.epistemic === 'APPROVED' ||
      !id(record.evidence_ref))
      return denied('DRIVE_CONTRACT_INVALID');

    const t = transitions.get(record.transition_id);
    if (!t) return denied('TRANSITION_NOT_FOUND');
    if (t.version !== record.expected_version) return denied('VERSION_CONFLICT');

    const d = {
      layer: record.layer,
      claim: record.claim,
      epistemic: record.epistemic,
      evidence_ref: record.evidence_ref,
      counter_hypothesis: record.counter_hypothesis ?? null,
      identity: 'CLAIM_ONLY'
    };
    t.drivers.push(d);
    return append(t, 'DRIVE_CANDIDATE', d);
  }

  /** Propose an action / scenario with predicted S1 (never executed). */
  async function proposeAction(record) {
    if (!exact(record, ['transition_id', 'expected_version', 'action_id', 'kind',
      'predicted_s1', 'confidence', 'assumptions', 'counterfactual_ref']) ||
      !id(record.transition_id) || !id(record.action_id) ||
      !['REUSE', 'ALTERNATIVE', 'CHALLENGE_PREMISE', 'STOP', 'RESEARCH_ONLY'].includes(record.kind) ||
      !isObj(record.predicted_s1) || typeof record.confidence !== 'number' ||
      record.confidence < 0 || record.confidence > 1)
      return denied('ACTION_CONTRACT_INVALID');

    const t = transitions.get(record.transition_id);
    if (!t) return denied('TRANSITION_NOT_FOUND');
    if (t.version !== record.expected_version) return denied('VERSION_CONFLICT');

    const a = {
      action_id: record.action_id,
      kind: record.kind,
      predicted_s1: cp(record.predicted_s1),
      confidence: record.confidence,
      assumptions: cp(record.assumptions ?? []),
      counterfactual_ref: record.counterfactual_ref ?? null,
      epistemic: 'PREDICTED',
      executed: false,
      approval: 'NOT_APPROVED'
    };
    t.actions.push(a);
    t.predictions.push({action_id: a.action_id, predicted: a.predicted_s1, epistemic: 'PREDICTED'});
    return append(t, 'ACTION_PREDICTED', a);
  }

  /** Record an observation O1. Does NOT promote to APPROVED. */
  async function recordObservation(record) {
    if (!exact(record, ['transition_id', 'expected_version', 'o1_revision', 'o1_hash',
      'observed_at', 'source_ref']) ||
      !id(record.transition_id) || !id(record.o1_revision) || !HEX.test(record.o1_hash) ||
      !id(record.source_ref))
      return denied('OBSERVATION_CONTRACT_INVALID');

    const t = transitions.get(record.transition_id);
    if (!t) return denied('TRANSITION_NOT_FOUND');
    if (t.version !== record.expected_version) return denied('VERSION_CONFLICT');

    const o = {
      revision: record.o1_revision,
      hash: record.o1_hash,
      observed_at: record.observed_at ?? 'UNKNOWN',
      source_ref: record.source_ref,
      epistemic: 'OBSERVED',
      approval: 'NOT_APPROVED'
    };
    t.observations.push(o);
    t.times.OBSERVATION = o.observed_at;
    return append(t, 'OBSERVATION_RECORDED', o);
  }

  /** Produce a calibration candidate comparing prediction vs observation. */
  async function calibrate(record) {
    if (!exact(record, ['transition_id', 'expected_version', 'action_id',
      'error_summary', 'counter_evidence_ref', 'revised_confidence']) ||
      !id(record.transition_id) || !id(record.action_id) ||
      typeof record.error_summary !== 'string' ||
      typeof record.revised_confidence !== 'number')
      return denied('CALIBRATION_CONTRACT_INVALID');

    const t = transitions.get(record.transition_id);
    if (!t) return denied('TRANSITION_NOT_FOUND');
    if (t.version !== record.expected_version) return denied('VERSION_CONFLICT');

    const pred = t.predictions.find(p => p.action_id === record.action_id);
    if (!pred) return denied('PREDICTION_NOT_FOUND');

    const c = {
      action_id: record.action_id,
      error_summary: record.error_summary,
      counter_evidence_ref: record.counter_evidence_ref ?? null,
      revised_confidence: record.revised_confidence,
      epistemic: 'INFERRED',
      approval: 'NOT_APPROVED'
    };
    t.calibrations.push(c);
    return append(t, 'CALIBRATION_CANDIDATE', c);
  }

  /** Add a memory reference (never copies private content). */
  async function addMemoryRef(record) {
    if (!exact(record, ['transition_id', 'expected_version', 'kind', 'ref_id',
      'summary_hash', 'epistemic']) ||
      !id(record.transition_id) || !MEMORY_KINDS.includes(record.kind) ||
      !id(record.ref_id) || !HEX.test(record.summary_hash) ||
      !EPISTEMIC.includes(record.epistemic) || record.epistemic === 'APPROVED')
      return denied('MEMORY_REF_INVALID');

    const t = transitions.get(record.transition_id);
    if (!t) return denied('TRANSITION_NOT_FOUND');
    if (t.version !== record.expected_version) return denied('VERSION_CONFLICT');

    const m = {
      kind: record.kind,
      ref_id: record.ref_id,
      summary_hash: record.summary_hash,
      epistemic: record.epistemic,
      copied_content: false
    };
    t.memory_refs.push(m);
    return append(t, 'MEMORY_REF', m);
  }

  function readTransition(transitionId) {
    const t = transitions.get(transitionId);
    if (!t) return denied('TRANSITION_NOT_FOUND');
    return cand({
      schema: COG_SCHEMA,
      transition_id: t.id,
      event_id: t.event_id,
      proof_id: t.proof_id,
      project_id: t.project_id,
      s0: t.s0,
      drivers: cp(t.drivers),
      actions: cp(t.actions),
      observations: cp(t.observations),
      calibrations: cp(t.calibrations),
      memory_refs: cp(t.memory_refs),
      times: cp(t.times),
      version: t.version,
      history_head_hash: t.history.at(-1)?.hash ?? null,
      persistence: 'IN_MEMORY_ONLY',
      approval: 'NOT_APPROVED'
    });
  }

  async function verifyTransition(transitionId) {
    const t = transitions.get(transitionId);
    if (!t) return denied('TRANSITION_NOT_FOUND');
    let prior = null;
    for (let i = 0; i < t.history.length; i++) {
      const {hash, ...entry} = t.history[i];
      if (entry.sequence !== i + 1 || entry.prev_hash !== prior ||
          await sha256(stableJson(entry)) !== hash)
        return denied('LOCAL_CHAIN_INVALID');
      prior = hash;
    }
    return cand({
      transition_id: transitionId,
      local_chain_consistent: true,
      checked_entries: t.history.length,
      durable: false,
      approval: 'NOT_APPROVED'
    });
  }

  return Object.freeze({
    openTransition, addDrive, proposeAction, recordObservation,
    calibrate, addMemoryRef, readTransition, verifyTransition,
    stats: () => cand({
      transitions: transitions.size,
      refs: totalRefs,
      external_io: false,
      approved: 0
    })
  });
}
