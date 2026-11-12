// F05 G-0: tests the imported production candidate, not a local test-only detectGap.
// These are synthetic consistency checks, NOT a live GitHub receiver/ACK test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectGap } from './f05-gap-module.mjs';

const base = Object.freeze({
  delivery_id: 'delivery-1',
  source: 'github:keqingwu5-cloud/ai-boundary/issues/166',
  comment_id: 1001,
  revision: '2026-11-12T01:00:00Z',
  body: 'verified synthetic content'
});
const alter = overrides => Object.freeze({ ...base, ...overrides });
const issue = (status, ev = base) => [{ delivery_id: ev.delivery_id, comment_id: ev.comment_id, status }];

const cases = [
  ['missing source event', [base], [], issue('MISSING')],
  ['already received', [base], [base], []],
  ['same delivery, wrong body', [base], [alter({ body: 'modified' })], issue('MISMATCH')],
  ['same delivery, wrong source', [base], [alter({ source: 'github:another/repo/issues/166' })], issue('MISMATCH')],
  ['same delivery, wrong comment', [base], [alter({ comment_id: 9999 })], issue('MISMATCH')],
  ['same delivery, wrong revision', [base], [alter({ revision: '2026-11-11T23:00:00Z' })], issue('MISMATCH')],
  ['same content, different delivery', [base], [alter({ delivery_id: 'delivery-other' })], issue('MISSING')],
  ['conflicting duplicated inbox record', [base], [base, alter({ body: 'tampered' })], issue('MISMATCH')],
  ['missing revision is not verified', [alter({ revision: undefined })], [base], issue('INVALID_SOURCE_EVENT', alter({ revision: undefined }))],
  ['missing source is not verified', [alter({ source: '' })], [], issue('INVALID_SOURCE_EVENT', alter({ source: '' }))],
  ['all-source-events reconciliation', [base, alter({ delivery_id: 'delivery-2', comment_id: 1002 })], [base],
    issue('MISSING', alter({ delivery_id: 'delivery-2', comment_id: 1002 }))]
];

function checkCases(detector) {
  for (const [name, source, local, expected] of cases) {
    assert.deepEqual(detector(source, local), expected, name);
  }
}

checkCases(detectGap);
assert.throws(() => detectGap(null, []), TypeError);
assert.throws(() => detectGap([], {}), TypeError);
assert.deepEqual(detectGap(Object.freeze([base]), Object.freeze([base])), []);

// In-memory mutations of the actual module source: the same assertions must
// reject each deliberately broken implementation.
const moduleSource = readFileSync(new URL('./f05-gap-module.mjs', import.meta.url), 'utf8');
const mutations = [
  ['always-missing', 'if (byDelivery.length === 0)', 'if (true)'],
  ['never-missing', 'if (byDelivery.length === 0)', 'if (false)'],
  ['ignore-source', 'r.source === ev.source', 'true'],
  ['ignore-comment', 'r.comment_id === ev.comment_id', 'true'],
  ['ignore-revision', 'r.revision === ev.revision', 'true'],
  ['ignore-body', 'r.body === ev.body', 'true']
];
let killed = 0;
for (const [name, needle, replacement] of mutations) {
  assert.ok(moduleSource.includes(needle), `mutation target not found: ${name}`);
  const mutated = moduleSource.replace(needle, replacement);
  const url = `data:text/javascript;base64,${Buffer.from(mutated).toString('base64')}`;
  const { detectGap: brokenDetector } = await import(url);
  let wasCaught = false;
  try {
    checkCases(brokenDetector);
  } catch (error) {
    if (error instanceof assert.AssertionError) wasCaught = true;
    else throw error;
  }
  assert.ok(wasCaught, `suite failed to catch mutation: ${name}`);
  killed++;
}
console.log(`f05 gap detection: PASS cases=${cases.length} mutation_kills=${killed}/${mutations.length}`);
console.log('EXIT=0');
