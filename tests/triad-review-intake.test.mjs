import assert from 'node:assert/strict';
import {inspectTriadIntake, TRIAD_INTAKE_SCHEMA, TRIAD_TASK_ID,
  TRIAD_SOURCE_ISSUE, TRIAD_ROUTE_IDS} from '../triad-review-intake-candidate.mjs';

const SHA = '36b5f5ed57c21929c584ccd3415ee7f1c5715f74';
const PR = 'https://github.com/keqingwu5-cloud/ai-boundary/pull/149';
const deep = x => JSON.parse(JSON.stringify(x));
const make = () => ({
  schema: TRIAD_INTAKE_SCHEMA,
  task_id: TRIAD_TASK_ID,
  source_issue_url: TRIAD_SOURCE_ISSUE,
  source_pr_sha: SHA,
  receipt_claim: 'HANDOFF_POSTED',
  readback: {
    goal: 'FIRST_BRAIN_FIRST',
    v01_status: 'SYNTHETIC_PROXY_ONLY',
    v02_status: 'DESIGN_NOT_VERIFIED',
    release_gate: 'HOLD',
    external_software_status: 'NOT_RUN',
    user_notify_policy: 'REVIEW_GATE_ONLY',
    source_refs: [TRIAD_SOURCE_ISSUE, PR],
    counterassumptions: [
      'Fixed synthetic utility is not agent performance.',
      'The role positions may bias the total match score.',
      'A local GitHub comment cannot establish independent receipt.'
    ]
  },
  routes: TRIAD_ROUTE_IDS.map((id, i) => ({
    id, owner: 'GROK',
    reviewers: i < 5 ? ['BOT3'] : ['GPT2'],
    state: 'PROPOSED', source_ref: TRIAD_SOURCE_ISSUE, evidence_refs: []
  }))
});
let passed = 0;
function test(label, fn) {
  try { fn(); passed++; console.log('PASS: ' + label); }
  catch (e) { console.error('FAIL: ' + label); throw e; }
}
const run = (packet, expectedPr149Sha=SHA) => inspectTriadIntake(packet, {expectedPr149Sha});
function reject(label, modify, expected) {
  test(label, () => {
    const packet = make();
    modify(packet);
    const output = run(packet);
    assert.equal(output.status, 'blocked');
    assert.equal(output.reason, expected);
    assert.equal(output.decision, 'HOLD');
    assert.equal(output.actual_ack, 'NOT_VERIFIED');
    assert.equal(output.safe_to_autopromote, false);
  });
}
test('valid complete routing remains a candidate, not a trusted receipt', () => {
  const output = run(make());
  assert.equal(output.status, 'candidate_only');
  assert.equal(output.route_count, 10);
  assert.equal(output.receipt_verification, 'NOT_VERIFIED');
  assert.equal(output.independent_review, 'NOT_VERIFIED');
  assert.equal(output.approval, 'NOT_APPROVED');
  assert.equal(output.decision, 'HOLD');
  assert.equal(output.external_io, false);
});
test('manual bridge and receiver self-claim never become verified ACK', () => {
  for (const receipt_claim of ['MANUAL_BRIDGE', 'RECEIVED_CLAIM']) {
    const packet=make(); packet.receipt_claim=receipt_claim;
    const out=run(packet);
    assert.equal(out.status, 'candidate_only');
    assert.equal(out.actual_ack, 'NOT_VERIFIED');
    assert.equal(out.receipt_verification, 'NOT_VERIFIED');
  }
});
test('expected trusted source SHA required', () => {
  assert.equal(inspectTriadIntake(make()).reason, 'EXPECTED_SOURCE_SHA_REQUIRED');
});
test('changed expected SHA rejects stale submitted source', () => {
  assert.equal(run(make(), 'a'.repeat(40)).reason, 'SOURCE_SHA_STALE');
});
reject('spoofed ACK in submission blocked', p => { p.actual_ack='VERIFIED'; }, 'INTAKE_CONTRACT_INVALID');
reject('spoofed APPROVED in submission blocked', p => { p.approval='APPROVED'; }, 'INTAKE_CONTRACT_INVALID');
reject('incorrect task id blocked', p => {p.task_id='UNRELATED';}, 'INTAKE_CONTRACT_INVALID');
reject('wrong source issue blocked', p => {p.source_issue_url=PR;}, 'INTAKE_CONTRACT_INVALID');
reject('missing version or false status in readback blocked', p => {p.readback.v02_status='COMPLETE';}, 'READBACK_INCOMPLETE');
reject('missing counter assumptions blocked', p => {p.readback.counterassumptions=[];}, 'READBACK_INCOMPLETE');
reject('untrusted external source URL blocked', p => {p.readback.source_refs[0]='https://attacker.example/test';}, 'READBACK_INCOMPLETE');
reject('duplicate route blocked', p => {p.routes[1].id='G01';}, 'ROUTING_CONTRACT_INVALID');
reject('missing route blocked', p => {p.routes.pop();}, 'ROUTING_COVERAGE_INCOMPLETE');
reject('self review blocked', p => {p.routes[0].owner='BOT3';}, 'ROUTING_CONTRACT_INVALID');
reject('unrecognized reviewer identity blocked', p => {p.routes[1].reviewers=['AUTHORIZED'];}, 'ROUTING_CONTRACT_INVALID');
reject('missing both reviewer roles blocked', p => {p.routes.forEach(x=>x.reviewers=['BOT3']);}, 'ROUTING_COVERAGE_INCOMPLETE');
reject('claimed test without source reference blocked', p => {p.routes[0].state='ISOLATED_TEST_CLAIM';}, 'TEST_EVIDENCE_REFERENCE_REQUIRED');
test('claimed test with reference remains a claim', () => {
  const p=make(); p.routes[0].state='ISOLATED_TEST_CLAIM'; p.routes[0].evidence_refs=[PR];
  const out=run(p);
  assert.equal(out.status, 'candidate_only');
  assert.equal(out.implementation_verification, 'NOT_VERIFIED');
});
test('input is unchanged by inspection', () => {
  const p=make(); const before=deep(p); run(p); assert.deepEqual(p,before);
});
test('null and proto-crafted object blocked', () => {
  assert.equal(run(null).status, 'blocked');
  const p=Object.create({schema:TRIAD_INTAKE_SCHEMA});
  assert.equal(run(p).status, 'blocked');
});
console.log('SUMMARY: ' + passed + ' passed, 0 failed (research intake only; no verified ACK)');
