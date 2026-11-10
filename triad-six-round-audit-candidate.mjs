/**
 * Read-only admission check for 6-round triad match summaries.
 * Validates coverage, fixed families, seat balance, and a winner-count ledger.
 * This is NOT a game judge: it cannot validate joint actions or actual payoffs.
 * Never grants promotion, deployment or authenticated peer review.
 */
export const TRIAD_MATCH_SCHEMA = 'firstbrain.triad-six-round-audit.candidate.v0.1';
export const TRIAD_PLAYERS = Object.freeze([
  'CARA_PROXY', 'OPENSPIEL_PROXY', 'FIRST_BRAIN_PROXY'
]);
export const TRIAD_FAMILIES = Object.freeze([
  'ASYMMETRIC_INFO', 'JOINT_ACTION', 'HISTORY_ADAPTATION'
]);
const SHA = /^[0-9a-f]{40}$/;
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const exact = (x, keys) => obj(x) && Object.keys(x).every(k => keys.includes(k)) &&
  keys.every(k => Object.prototype.hasOwnProperty.call(x, k));
const fail = reason => ({
  status: 'blocked', reason, decision: 'HOLD', approval: 'NOT_APPROVED',
  promotion: 'NOT_GRANTED', independent_review: 'NOT_VERIFIED'
});
const report = fields => ({
  status: 'candidate_only', decision: 'HOLD', approval: 'NOT_APPROVED',
  promotion: 'NOT_GRANTED', independent_review: 'NOT_VERIFIED',
  real_software_execution: 'NOT_VERIFIED', payoff_integrity: 'NOT_VERIFIED',
  comparison_to_real_world: 'NOT_ESTABLISHED', ...fields
});

/**
 * expectedEnvironmentSha must come from an independently fetched Git ref;
 * a self-declared SHA cannot establish that code or data really ran.
 */
export function auditTriadSixRounds(match, {expectedEnvironmentSha} = {}) {
  if (!SHA.test(expectedEnvironmentSha ?? ''))
    return fail('EXPECTED_ENVIRONMENT_SHA_REQUIRED');
  if (!exact(match, ['schema','match_id','origin','environment_sha','rounds']) ||
      match.schema !== TRIAD_MATCH_SCHEMA ||
      typeof match.match_id !== 'string' || !ID.test(match.match_id) ||
      !['SYNTHETIC_PROXY','ISOLATED_CANDIDATE'].includes(match.origin) ||
      !SHA.test(match.environment_sha))
    return fail('MATCH_CONTRACT_INVALID');
  if (match.environment_sha !== expectedEnvironmentSha)
    return fail('ENVIRONMENT_SHA_STALE');
  if (!Array.isArray(match.rounds) || match.rounds.length !== 6)
    return fail('SIX_ROUNDS_REQUIRED');

  const wins = Object.fromEntries(TRIAD_PLAYERS.map(p => [p, 0]));
  const seats = Object.fromEntries(TRIAD_PLAYERS.map(p => [p, [0,0,0]]));
  const roundRefs = new Set();
  let draws = 0;
  for (let i=0; i<6; i++) {
    const r=match.rounds[i];
    if (!exact(r, ['round','family','seats','declared_winner','round_ref','record_type']) ||
      r.round !== i+1 ||
      r.family !== TRIAD_FAMILIES[Math.floor(i/2)] ||
      !obj(r.seats) || !exact(r.seats, TRIAD_PLAYERS) ||
      !TRIAD_PLAYERS.every(p => Number.isInteger(r.seats[p]) &&
        r.seats[p] >= 0 && r.seats[p] <= 2) ||
      new Set(TRIAD_PLAYERS.map(p=>r.seats[p])).size !== 3 ||
      !(r.declared_winner === null || TRIAD_PLAYERS.includes(r.declared_winner)) ||
      typeof r.round_ref !== 'string' || !ID.test(r.round_ref) ||
      roundRefs.has(r.round_ref) ||
      r.record_type !== 'SYNTHETIC_DEMONSTRATION')
      return fail('ROUND_CONTRACT_INVALID');

    roundRefs.add(r.round_ref);
    for (const p of TRIAD_PLAYERS) seats[p][r.seats[p]]++;
    if (r.declared_winner === null) draws++;
    else wins[r.declared_winner]++;
  }
  if (!TRIAD_PLAYERS.every(p=>seats[p].every(n=>n===2)))
    return fail('SEAT_BALANCE_INVALID');

  const maxWins=Math.max(...Object.values(wins));
  const leading=TRIAD_PLAYERS.filter(p=>wins[p]===maxWins);
  const pending=leading.length!==1;
  return report({
    match_id: match.match_id,
    origin: match.origin,
    rounds_checked: 6,
    round_wins: {...wins},
    drawn_rounds: draws,
    seat_counts: Object.fromEntries(TRIAD_PLAYERS.map(p=>[p,[...seats[p]]])),
    sole_wins_leader_candidate: pending ? null : leading[0],
    tie_status: pending ? 'TIE_PENDING_PREDECLARED_TIEBREAK' : 'UNIQUE_WINS_LEADER_CANDIDATE',
    promotion_requires: 'SEPARATE_INDEPENDENT_VALIDATION_AND_USER_APPROVAL'
  });
}
