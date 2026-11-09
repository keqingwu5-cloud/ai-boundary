/**
 * Synthetic V10 (approved baseline claim) → V11 observation candidate.
 * In-memory only. Never produces real APPROVED status.
 * Run with: node tests/cognitive-transition-synthetic.mjs
 */
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit} from '../proof-audit-candidate.mjs';
import {createCognitiveTransition} from '../cognitive-transition-candidate.mjs';

async function main() {
  const control = createControlCycle();
  const audit = createProofAudit({control});
  const cog = createCognitiveTransition({control, audit});

  // 1. Register domain + observe V11 candidate (never auto-approve)
  await control.registerDomain({
    domain_id: 'eng-v11-synth',
    contract_revision: 'v0.1',
    description: 'synthetic engineering domain'
  });

  const obs = await control.observe({
    event_id: 'evt-v11-synth',
    domain_id: 'eng-v11-synth',
    source_id: 'synth-sensor',
    revision: 'V11',
    source_hash: 'a'.repeat(64),
    baseline_ref: 'V10-approved-claim'
  });
  if (obs.status !== 'candidate_only') throw new Error('observe failed');

  // 2. Open proof
  const proof = await audit.openProof({
    proof_id: 'proof-v11-synth',
    event_id: 'evt-v11-synth',
    expected_control_version: obs.version,
    sector: 'ENGINEERING',
    created_by_claim: 'synthetic_operator',
    scope_ref: 'scope-v11'
  });
  if (proof.status !== 'candidate_only') throw new Error('proof open failed');

  // 3. Open cognitive transition S0=V10 claim
  const t = await cog.openTransition({
    transition_id: 'trans-v10-v11',
    event_id: 'evt-v11-synth',
    proof_id: 'proof-v11-synth',
    project_id: 'proj-synth',
    s0_revision: 'V10',
    s0_hash: 'b'.repeat(64),
    source_revision: 'synth-rev',
    created_by_claim: 'synthetic_operator'
  });
  if (t.status !== 'candidate_only') throw new Error('transition open failed');

  // 4. Add drive (INFERRED, not APPROVED)
  await cog.addDrive({
    transition_id: 'trans-v10-v11',
    expected_version: t.version,
    layer: 'NEED',
    claim: 'Upgrade pressure observed; motive is hypothesis only',
    epistemic: 'INFERRED',
    evidence_ref: 'ev-need-1',
    counter_hypothesis: 'Could be sensor noise'
  });

  // 5. Propose action with predicted S1
  const act = await cog.proposeAction({
    transition_id: 'trans-v10-v11',
    expected_version: 2,
    action_id: 'act-test-v11',
    kind: 'RESEARCH_ONLY',
    predicted_s1: {revision: 'V11-tested', stability: 'unknown'},
    confidence: 0.6,
    assumptions: ['sensor is calibrated'],
    counterfactual_ref: 'cf-keep-v10'
  });
  if (act.status !== 'candidate_only') throw new Error('propose failed');

  // 6. Record observation O1
  await cog.recordObservation({
    transition_id: 'trans-v10-v11',
    expected_version: act.version,
    o1_revision: 'V11-obs',
    o1_hash: 'c'.repeat(64),
    observed_at: '2026-11-09',
    source_ref: 'synth-obs'
  });

  // 7. Calibrate
  await cog.calibrate({
    transition_id: 'trans-v10-v11',
    expected_version: 4,
    action_id: 'act-test-v11',
    error_summary: 'Prediction partially matched; confidence revised down',
    counter_evidence_ref: 'ev-cal-1',
    revised_confidence: 0.4
  });

  // 8. Memory ref (hash only)
  await cog.addMemoryRef({
    transition_id: 'trans-v10-v11',
    expected_version: 5,
    kind: 'COUNTERFACTUAL',
    ref_id: 'mem-cf-1',
    summary_hash: 'd'.repeat(64),
    epistemic: 'INFERRED'
  });

  const final = cog.readTransition('trans-v10-v11');
  const verified = await cog.verifyTransition('trans-v10-v11');

  console.log(JSON.stringify({
    synthetic: true,
    transition_id: final.transition_id,
    approval: final.approval,
    epistemic_s0: final.s0.epistemic,
    actions: final.actions.length,
    observations: final.observations.length,
    calibrations: final.calibrations.length,
    chain_ok: verified.local_chain_consistent,
    note: 'No real APPROVED produced. Observation ≠ Approval.'
  }, null, 2));

  if (final.approval !== 'NOT_APPROVED' || !verified.local_chain_consistent) {
    throw new Error('Synthetic invariant violated');
  }
  console.log('PASS: synthetic V10→V11 cognitive transition completed under HOLD');
}

main().catch(err => {
  console.error('FAIL', err);
  process.exit(1);
});
