// Minimal synthetic inner-drive loop (DESIGN_ONLY / SYNTHETIC)
// Demonstrates: event → candidate → auth check → isolated exec → evidence → review
// No real BOT, no external side effects, no paid API.

const states = [];

function runSyntheticLoop() {
  const event = { id: 'SYN-FAIL-001', type: 'synthetic_failure' };
  states.push({ step: 'event', ...event });

  // Task candidate
  const candidate = { task_id: 'T-SYN-001', from: event.id, auth: 'pending' };
  states.push({ step: 'candidate', ...candidate });

  // Auth check (synthetic: always permitted in isolation)
  candidate.auth = 'permitted_isolated';
  states.push({ step: 'auth', result: candidate.auth });

  // Isolated exec (no-op)
  const evidence = { test: 'synthetic_pass', exit: 0 };
  states.push({ step: 'exec', evidence });

  // Review (simulated kick or accept)
  const review = { decision: 'ACCEPT_TECHNICAL_SYNTHETIC', note: 'no real reviewer' };
  states.push({ step: 'review', ...review });

  return { states, evidence_level: 'SYNTHETIC', bot_created: false };
}

const result = runSyntheticLoop();
console.log(JSON.stringify(result, null, 2));
console.log('EXIT=0');