'use strict';
/**
 * MOCK executor — never calls OpenAI or any paid API.
 * REAL path is documented but throws NOT_ENABLED.
 * Result payload is deterministic (exact-match friendly; no wall-clock fields).
 */
const crypto = require('node:crypto');

function buildMockResult(payload) {
  const instruction = String(payload?.instruction || payload?.goal || 'noop').slice(0, 200);
  const echo =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? JSON.parse(JSON.stringify(payload))
      : {};
  const canonical = JSON.stringify({ instruction, echo });
  return {
    mode: 'MOCK',
    result_kind: 'MOCK',
    instruction,
    echo,
    verified: true,
    note: 'synthetic local execution; OpenAI NOT connected',
    output_sha256: crypto.createHash('sha256').update(canonical).digest('hex'),
  };
}

function createMockExecutor({ store, costPerMockUsd = 0 } = {}) {
  return async function performTask(task) {
    // Exactly-once side-effect claim on the worker/executor path (not API-only).
    if (store && typeof store.claimSideEffect === 'function' && task?.event_id) {
      const claim = store.claimSideEffect({
        key: 'mock-exec:' + task.event_id,
        event_id: task.event_id,
        attempt_id: task.attempt_id,
      });
      if (claim.status === 'UNKNOWN_NEEDS_RECONCILIATION') {
        const err = new Error('side_effect_duplicate: UNKNOWN_NEEDS_RECONCILIATION');
        err.code = 'UNKNOWN_NEEDS_RECONCILIATION';
        throw err;
      }
    }
    const result = buildMockResult(task?.payload);
    if (store && typeof store.stageResult === 'function') {
      store.stageResult({
        event_id: task.event_id,
        attempt_id: task.attempt_id,
        result,
      });
    }
    if (store && typeof store.recordCost === 'function') {
      store.recordCost({
        event_id: task.event_id,
        attempt_id: task.attempt_id,
        kind: 'MOCK',
        usd: costPerMockUsd,
      });
    }
    const evidence = `result_kind=MOCK|task=${task.task_id}|attempt=${task.attempt_id}|output_sha256=${result.output_sha256}`;
    return {
      execution_evidence: evidence,
      receipt_evidence: `MOCK_RECEIPT|${task.event_id}|${task.attempt_id}|${result.output_sha256}`,
      result,
    };
  };
}

/** Documented REAL hook — intentionally disabled. Never call OpenAI. */
function createRealExecutorStub() {
  return async function performTask() {
    const err = new Error('REAL_EXECUTOR_NOT_ENABLED: OpenAI wiring is plan-only; no key, no request, no billing');
    err.code = 'NOT_ENABLED';
    throw err;
  };
}

module.exports = { createMockExecutor, createRealExecutorStub, buildMockResult };
