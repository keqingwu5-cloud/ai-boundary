/**
 * First Brain — Triad Duel V0.2 (isolated research sidecar).
 * Synthetic in-memory only. Never produces real APPROVED.
 * Addresses G01 (joint utility), G02 (referee separation), G05 (legality gate),
 * G07 (no presupposed winner). Evidence types preserved.
 * Does not claim equivalence to CARA / OpenSpiel real software.
 */
import {sha256, stableJson} from './nary-composition.mjs';

export const DUEL_SCHEMA = 'firstbrain.triad-duel.candidate.v0.2';
export const PLAYERS = Object.freeze(['CARA', 'OPENSPIEL', 'FIRSTBRAIN']);
export const ACTIONS = Object.freeze(['A', 'B', 'C']);
export const EVIDENCE = Object.freeze(['ACTUAL', 'PREDICTED', 'COUNTERFACTUAL', 'SYNTHETIC_DEMONSTRATION']);

const denied = reason => ({
  status: 'blocked', reason, decision: 'HOLD', authority: 'none',
  epistemic: 'UNKNOWN', approval: 'NOT_APPROVED', evidence: 'SYNTHETIC_DEMONSTRATION'
});
const cand = extra => ({
  status: 'candidate_only', decision: 'HOLD', authority: 'none',
  epistemic: 'UNKNOWN', approval: 'NOT_APPROVED',
  evidence: 'SYNTHETIC_DEMONSTRATION', ...extra
});

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Referee is separate from strategy. Computes joint utility + chance.
 * Does not know or modify player strategies.
 */
function refereeUtility(joint, chance) {
  // Minimal joint-dependent utility: interaction terms + chance
  const base = { CARA: 2, OPENSPIEL: 2, FIRSTBRAIN: 2 };
  const interaction = joint.CARA === joint.OPENSPIEL ? 1 : 0;
  const fbBonus = joint.FIRSTBRAIN === 'C' && joint.CARA !== 'C' ? 1 : 0;
  return {
    CARA: base.CARA + (joint.CARA === 'A' ? 3 : 0) + chance * 2 + interaction,
    OPENSPIEL: base.OPENSPIEL + (joint.OPENSPIEL === 'B' ? 3 : 0) + (1 - chance) * 2,
    FIRSTBRAIN: base.FIRSTBRAIN + fbBonus + (joint.FIRSTBRAIN === 'A' ? 1 : 0)
  };
}

export function createTriadDuel({ seed = 42, maxRounds = 6 } = {}) {
  if (!Number.isInteger(seed) || seed < 0) throw Error('SEED_INVALID');
  const rng = seededRandom(seed);
  const history = [];
  let round = 0;

  function informationState(player, asOfRound) {
    if (!PLAYERS.includes(player)) return denied('PLAYER_INVALID');
    if (asOfRound < 0 || asOfRound > history.length) return denied('AS_OF_INVALID');
    // Only public history up to asOf; no opponent private actions or future
    const publicHistory = history.slice(0, asOfRound).map(h => ({
      round: h.round,
      public_actions: { ...h.joint }, // in this minimal version all actions are submitted publicly after lock
      outcome: h.outcome,
      evidence: h.evidence
    }));
    return cand({
      player,
      as_of: asOfRound,
      public_history: publicHistory,
      own_private: null, // no private in this minimal demo
      future_hidden: true
    });
  }

  async function submitRound(jointActions, legalityClaims = {}) {
    if (round >= maxRounds) return denied('MAX_ROUNDS_REACHED');
    if (!jointActions || typeof jointActions !== 'object') return denied('JOINT_INVALID');
    for (const p of PLAYERS) {
      if (!ACTIONS.includes(jointActions[p])) return denied('ACTION_INVALID');
    }

    // Legality gate (G05): any claimed violation blocks the round
    const illegal = Object.entries(legalityClaims).some(([p, claim]) =>
      PLAYERS.includes(p) && claim === 'ILLEGAL'
    );
    if (illegal) {
      const entry = {
        round: round + 1,
        joint: { ...jointActions },
        outcome: null,
        valid: false,
        reason: 'LEGALITY_VIOLATION',
        evidence: 'SYNTHETIC_DEMONSTRATION',
        seed_used: seed
      };
      history.push(Object.freeze(entry));
      round++;
      return denied('LEGALITY_VIOLATION');
    }

    const chance = rng();
    const utilities = refereeUtility(jointActions, chance);
    const scores = Object.values(utilities);
    const maxScore = Math.max(...scores);
    const winners = PLAYERS.filter(p => utilities[p] === maxScore);
    const soleWinner = winners.length === 1 ? winners[0] : null;

    const entry = {
      round: round + 1,
      joint: { ...jointActions },
      chance,
      utilities,
      sole_winner: soleWinner,
      valid: true,
      evidence: 'SYNTHETIC_DEMONSTRATION',
      seed_used: seed
    };
    history.push(Object.freeze(entry));
    round++;

    const hash = await sha256(stableJson(entry));
    return cand({
      round: entry.round,
      utilities,
      sole_winner: soleWinner,
      valid: true,
      entry_hash: hash
    });
  }

  function getStandings() {
    const wins = { CARA: 0, OPENSPIEL: 0, FIRSTBRAIN: 0 };
    let validRounds = 0;
    for (const h of history) {
      if (h.valid && h.sole_winner) {
        wins[h.sole_winner]++;
        validRounds++;
      }
    }
    const maxWins = Math.max(...Object.values(wins));
    const leaders = PLAYERS.filter(p => wins[p] === maxWins && maxWins > 0);
    const status = leaders.length > 1 || maxWins === 0 ? 'TIE_PENDING' : 'SOLE_LEADER';
    return cand({
      wins,
      valid_rounds: validRounds,
      leaders,
      status,
      total_rounds: history.length,
      persistence: 'IN_MEMORY_ONLY'
    });
  }

  function replay(seedOverride) {
    // Minimal: just return current history (full replay would re-execute)
    return cand({
      seed: seedOverride ?? seed,
      history: history.map(h => ({ ...h })),
      replayable: true
    });
  }

  return Object.freeze({
    submitRound,
    informationState,
    getStandings,
    replay,
    stats: () => cand({ rounds: history.length, seed, external_io: false, approved: 0 })
  });
}
