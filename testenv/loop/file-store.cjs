'use strict';
/**
 * Local durable JSON file store for isolated testenv.
 * Mirrors api/pg-store-candidate contract without Postgres/Docker.
 * Labels: MOCK executor results live under result_kind=MOCK only.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function error(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

/** Full lifecycle (reject illegal transitions):
 *  submitted → acked → running → verified → done | failed
 * Wire aliases: queued=submitted, leased≈acked+running, executed=verified, ack_received=done.
 * ACK only from executed (verified). leased→ack is illegal (skips execution).
 */
const LEGAL_TRANSITIONS = Object.freeze({
  queued: Object.freeze(['leased', 'blocked', 'failed']),
  leased: Object.freeze(['executed', 'queued', 'failed', 'blocked']),
  executed: Object.freeze(['ack_received', 'queued', 'failed']),
  ack_received: Object.freeze([]),
  failed: Object.freeze([]),
  blocked: Object.freeze([]),
});

function assertTransition(from, to) {
  const allowed = LEGAL_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw error('EVENT_CONFLICT', 'illegal_transition:' + from + '->' + to);
  }
}


function createFileStore({
  dataDir,
  clock = () => new Date().toISOString(),
  makeAttemptId = () => crypto.randomUUID(),
  leaseSeconds = 30,
  defaultMaxAttempts = 3,
  defaultCostCapUsd = 0.05,
} = {}) {
  if (!dataDir) throw new TypeError('dataDir required');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'store.json');
  const lockPath = path.join(dataDir, 'store.lock');
  let _injectFailAt = null; // 'after_execute' | 'before_ack_persist' | null
  function maybeInject(label) {
    if (_injectFailAt && _injectFailAt === label) {
      _injectFailAt = null;
      throw error('INJECTED_FAIL', 'injected_write_failure:' + label);
    }
  }

  function empty() {
    return {
      version: 1,
      grants: {},
      events: {},
      attempts: [],
      receipts: [],
      logs: [],
      cost_ledger: [], // {event_id, attempt_id, kind:MOCK|REAL, usd, at}
      staged_results: {},
      rejects: [],
      side_effects: {},
      meta: { created_at: clock(), total_cost_usd: 0 },
    };
  }

  function load() {
    if (!fs.existsSync(dbPath)) return empty();
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }

  function save(db) {
    const tmp = dbPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, dbPath);
  }

  function withLock(fn) {
    // Simple exclusive lock via O_EXCL file; retry briefly for restart tests.
    const start = Date.now();
    while (true) {
      try {
        const fd = fs.openSync(lockPath, 'wx');
        fs.writeSync(fd, String(process.pid));
        fs.closeSync(fd);
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        // Stale lock recovery: if lock older than 10s, take over (restart recovery)
        try {
          const st = fs.statSync(lockPath);
          if (Date.now() - st.mtimeMs > 10000) fs.unlinkSync(lockPath);
        } catch { /* race */ }
        if (Date.now() - start > 15000) throw error('LOCK_TIMEOUT', 'store lock timeout');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      }
    }
    try {
      const db = load();
      const rejectsBefore = (db.rejects || []).length;
      try {
        const result = fn(db);
        save(db);
        return result;
      } catch (err) {
        // Persist rejection history even when the mutating op fails.
        if ((db.rejects || []).length > rejectsBefore || err.code === 'INJECTED_FAIL') {
          // For INJECTED_FAIL: do NOT save (simulate crash before durable write).
          if (err.code !== 'INJECTED_FAIL') save(db);
        }
        throw err;
      }
    } finally {
      try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
    }
  }

  function audit(db, eventId, actor, action, detail = {}) {
    db.logs.push({
      id: db.logs.length + 1,
      event_id: eventId,
      actor_endpoint_id: actor,
      action,
      detail,
      created_at: clock(),
    });
  }

  function rejectLog(db, eventId, actor, reason, detail = {}) {
    db.rejects = db.rejects || [];
    db.rejects.push({
      id: (db.rejects.length || 0) + 1,
      event_id: eventId || null,
      actor_endpoint_id: actor || null,
      reason,
      detail,
      created_at: clock(),
    });
    audit(db, eventId, actor, 'rejected', { reason, ...detail });
  }

  /** Single grant gate used by enqueue + checkGrant (scope, expiry, stop, revoke, action). */
  function grantAllows(row, eventLike, action, at) {
    if (!row) return false;
    if (row.stopped) return false;
    if (row.revoked_at) return false;
    if (!(row.allowed_actions || []).includes(action)) return false;
    if (Date.parse(row.expires_at) <= Date.parse(at)) return false;
    if (row.task_id !== eventLike.task_id) return false;
    if (row.source_endpoint_id !== eventLike.source_endpoint_id) return false;
    if (row.destination_endpoint_id !== eventLike.destination_endpoint_id) return false;
    return true;
  }

  function checkGrant(db, event, action, at) {
    if (!event.grant_id) throw error('FORBIDDEN', 'event missing human grant');
    const row = db.grants[event.grant_id];
    if (!grantAllows(row, event, action, at)) {
      throw error('FORBIDDEN', 'grant revoked, expired, stopped or out of scope');
    }
    return row;
  }

  /** Detect tampered / inconsistent stored results (system readback gate). */
  function computeResultIntegrity(e) {
    if (!e || !e.result || typeof e.result !== 'object') return 'missing_result';
    if (e.result_bound_digest && e.payload_digest && e.result_bound_digest !== e.payload_digest) {
      return 'bound_digest_mismatch';
    }
    const instruction = String(e.result.instruction || '').slice(0, 200);
    const echo = e.result.echo;
    if (e.payload != null && echo != null) {
      try {
        if (JSON.stringify(echo) !== JSON.stringify(e.payload)) return 'echo_payload_mismatch';
      } catch {
        return 'echo_payload_mismatch';
      }
    }
    const canonical = JSON.stringify({ instruction, echo });
    const outSha = crypto.createHash('sha256').update(canonical).digest('hex');
    if (outSha !== e.result.output_sha256) return 'output_sha_tampered';
    return 'ok';
  }

  function correctLease(e, p, at, allowed) {
    if (
      !allowed.includes(e.state) ||
      e.current_attempt_id !== p.attempt_id ||
      e.destination_endpoint_id !== p.endpoint_id ||
      !e.lease_until ||
      Date.parse(e.lease_until) <= Date.parse(at)
    ) {
      throw error('EVENT_CONFLICT', 'invalid attempt, endpoint, state or expired lease');
    }
  }

  return {
    dataDir,
    dbPath,

    /** Admin: create a human grant (synthetic local only). */
    createGrant(g) {
      return withLock((db) => {
        const grant_id = g.grant_id || crypto.randomUUID();
        const row = {
          grant_id,
          task_id: g.task_id,
          source_endpoint_id: g.source_endpoint_id,
          destination_endpoint_id: g.destination_endpoint_id,
          allowed_actions: g.allowed_actions || ['send', 'receive', 'execute', 'ack'],
          max_attempts: g.max_attempts ?? defaultMaxAttempts,
          cost_cap_usd: g.cost_cap_usd ?? defaultCostCapUsd,
          expires_at: g.expires_at || new Date(Date.now() + 86400000).toISOString(),
          stopped: !!g.stopped,
          revoked_at: g.revoked_at || null,
          created_at: clock(),
        };
        db.grants[grant_id] = row;
        return row;
      });
    },

    async enqueue(p) {
      return withLock((db) => {
        const at = clock();
        if (!p?.event_id || !p.task_id || !p.idempotency_key || !p.source_endpoint_id || !p.destination_endpoint_id || !p.payload_digest || !p.payload_version) {
          throw error('BAD_REQUEST', 'missing queue field');
        }
        const grants = Object.values(db.grants).filter((x) =>
          grantAllows(
            x,
            {
              task_id: p.task_id,
              source_endpoint_id: p.source_endpoint_id,
              destination_endpoint_id: p.destination_endpoint_id,
            },
            'send',
            at
          )
        );
        grants.sort((a, b) => Date.parse(b.expires_at) - Date.parse(a.expires_at));
        const grant = grants[0];
        if (!grant) throw error('FORBIDDEN', 'no effective task-scoped human grant');

        const priorById = db.events[p.event_id];
        const priorByKey = Object.values(db.events).find(
          (x) => x.source_endpoint_id === p.source_endpoint_id && x.idempotency_key === p.idempotency_key
        );
        if (priorByKey) {
          if (
            priorByKey.event_id === p.event_id &&
            priorByKey.task_id === p.task_id &&
            priorByKey.destination_endpoint_id === p.destination_endpoint_id &&
            priorByKey.payload_version === p.payload_version &&
            priorByKey.payload_digest === p.payload_digest &&
            priorByKey.grant_id === grant.grant_id
          ) {
            return priorByKey; // idempotent
          }
          throw error('IDEMPOTENCY_CONFLICT', 'event identity already used');
        }
        if (priorById) throw error('EVENT_CONFLICT', 'event identity already used');

        const row = {
          event_id: p.event_id,
          task_id: p.task_id,
          source_endpoint_id: p.source_endpoint_id,
          destination_endpoint_id: p.destination_endpoint_id,
          idempotency_key: p.idempotency_key,
          payload_version: p.payload_version,
          payload_digest: p.payload_digest,
          payload: p.payload,
          state: 'queued',
          grant_id: grant.grant_id,
          attempt_count: 0,
          current_attempt_id: null,
          lease_until: null,
          next_attempt_at: at,
          created_at: at,
          updated_at: at,
          result_kind: null, // MOCK | REAL | null
          result: null,
          lifecycle: 'submitted',
          last_error: null,
        };
        db.events[p.event_id] = row;
        audit(db, p.event_id, p.source_endpoint_id, 'queued', { grant_id: grant.grant_id });
        return row;
      });
    },

    async lease({ destination_endpoint_id }) {
      return withLock((db) => {
        const at = clock();
        const atMs = Date.parse(at);
        const candidates = Object.values(db.events)
          .filter((x) => {
            if (x.destination_endpoint_id !== destination_endpoint_id) return false;
            if (x.state === 'queued' && Date.parse(x.next_attempt_at) <= atMs) return true;
            if (x.state === 'leased' && x.lease_until && Date.parse(x.lease_until) <= atMs) return true;
            return false;
          })
          .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
        const row = candidates[0];
        if (!row) return [];

        let grant;
        try {
          grant = checkGrant(db, row, 'receive', at);
        } catch (e) {
          if (e.code !== 'FORBIDDEN') throw e;
          assertTransition(row.state, 'blocked');
          row.state = 'blocked';
          row.lifecycle = 'failed';
          row.updated_at = at;
          audit(db, row.event_id, destination_endpoint_id, 'blocked', { reason: 'grant_invalid' });
          return [];
        }
        if (row.attempt_count >= grant.max_attempts) {
          assertTransition(row.state, 'failed');
          row.state = 'failed';
          row.lifecycle = 'failed';
          row.updated_at = at;
          audit(db, row.event_id, destination_endpoint_id, 'failed', { reason: 'attempt_limit' });
          return [];
        }
        // Cost cap check before lease
        const spent = db.cost_ledger
          .filter((c) => c.event_id === row.event_id)
          .reduce((s, c) => s + (c.usd || 0), 0);
        if (spent >= (grant.cost_cap_usd ?? defaultCostCapUsd)) {
          assertTransition(row.state, 'failed');
          row.state = 'failed';
          row.lifecycle = 'failed';
          row.last_error = 'cost_cap_exceeded';
          row.updated_at = at;
          audit(db, row.event_id, destination_endpoint_id, 'failed', { reason: 'cost_cap_exceeded', spent });
          return [];
        }

        const attemptId = makeAttemptId();
        // Lease reclaim: expired leased returns to submitted then running again.
        if (row.state === 'leased') {
          assertTransition('leased', 'queued');
          row.state = 'queued';
          row.lifecycle = 'submitted';
        }
        assertTransition(row.state, 'leased');
        row.state = 'leased';
        // Receiver take: acked then running (same lease step; both audited).
        row.lifecycle = 'acked';
        audit(db, row.event_id, destination_endpoint_id, 'acked', { attempt_id: attemptId });
        row.lifecycle = 'running';
        row.current_attempt_id = attemptId;
        row.attempt_count += 1;
        row.lease_until = new Date(atMs + leaseSeconds * 1000).toISOString();
        row.updated_at = at;
        db.attempts.push({
          event_id: row.event_id,
          attempt_id: attemptId,
          attempt_no: row.attempt_count,
          leased_at: at,
          lease_until: row.lease_until,
        });
        audit(db, row.event_id, destination_endpoint_id, 'leased', {
          attempt_id: attemptId,
          attempt_count: row.attempt_count,
        });
        return [row];
      });
    },

    async markExecuted(p) {
      return withLock((db) => {
        const at = clock();
        const e = db.events[p.event_id];
        if (!e) throw error('NOT_FOUND', 'unknown event');
        try {
          checkGrant(db, e, 'execute', at);
          correctLease(e, p, at, ['leased']);
          assertTransition(e.state, 'executed');
        } catch (err) {
          rejectLog(db, e.event_id, p.endpoint_id, err.code || 'ERROR', { op: 'execute', message: err.message });
          throw err;
        }
        db.receipts.push({
          event_id: e.event_id,
          attempt_id: p.attempt_id,
          endpoint_id: p.endpoint_id,
          channel: 'api',
          kind: 'execution',
          evidence: { reference: p.execution_evidence },
          created_at: at,
        });
        // Attach staged result (required for verified/done readback exact match)
        const stagedKey = e.event_id + '|' + p.attempt_id;
        const staged = db.staged_results && db.staged_results[stagedKey];
        if (staged) {
          e.result = staged;
          delete db.staged_results[stagedKey];
        } else if (p.result && typeof p.result === 'object') {
          e.result = p.result;
        }
        if (e.result) {
          const okShape =
            e.result &&
            typeof e.result === 'object' &&
            e.result.result_kind === 'MOCK' &&
            typeof e.result.output_sha256 === 'string' &&
            e.result.output_sha256.length === 64 &&
            e.result.verified === true;
          if (!okShape) {
            e.result_invalid = true;
            e.last_error = 'EXECUTED_BUT_RESULT_INVALID';
            rejectLog(db, e.event_id, p.endpoint_id, 'EXECUTED_BUT_RESULT_INVALID', {
              attempt_id: p.attempt_id,
            });
            // Still mark executed but flag invalid — ack will refuse
          } else {
            // Bind result to this event payload digest
            e.result_bound_digest = e.payload_digest;
            e.result_bound_attempt = p.attempt_id;
          }
        }
        e.state = 'executed';
        e.lifecycle = 'verified';
        e.updated_at = at;
        maybeInject('after_execute');
        if (typeof p.execution_evidence === 'string') {
          if (p.execution_evidence.includes('result_kind=MOCK')) e.result_kind = 'MOCK';
          else if (p.execution_evidence.includes('result_kind=REAL')) e.result_kind = 'REAL';
        }
        if (e.result && e.result.result_kind) e.result_kind = e.result.result_kind;
        audit(db, e.event_id, p.endpoint_id, 'executed', { attempt_id: p.attempt_id, result_kind: e.result_kind });
        return e;
      });
    },

    async ack(p) {
      return withLock((db) => {
        const at = clock();
        const e = db.events[p.event_id];
        if (!e) throw error('NOT_FOUND', 'unknown event');
        if (p.channel !== 'api') throw error('BAD_REQUEST', 'ChatGPT read receipt is a separate channel');
        try {
          checkGrant(db, e, 'ack', at);
        } catch (err) {
          rejectLog(db, e.event_id, p.endpoint_id, err.code || 'FORBIDDEN', { op: 'ack', message: err.message });
          throw err;
        }
        // Must be verified (executed) first — leased→ack is illegal (skips execution).
        try {
          correctLease(e, p, at, ['executed']);
          assertTransition(e.state, 'ack_received');
        } catch (err) {
          rejectLog(db, e.event_id, p.endpoint_id, err.code || 'EVENT_CONFLICT', { op: 'ack', message: err.message });
          throw err;
        }
        if (e.payload_digest !== p.payload_digest || e.payload_version !== p.payload_version) {
          rejectLog(db, e.event_id, p.endpoint_id, 'EVENT_CONFLICT', { op: 'ack', reason: 'wrong_payload' });
          throw error('EVENT_CONFLICT', 'wrong payload digest or version');
        }
        if (!e.result || typeof e.result !== 'object') {
          rejectLog(db, e.event_id, p.endpoint_id, 'EVENT_CONFLICT', { op: 'ack', reason: 'missing_result' });
          throw error('EVENT_CONFLICT', 'ack_requires_execution_result');
        }
        if (e.result_invalid || e.last_error === 'EXECUTED_BUT_RESULT_INVALID') {
          rejectLog(db, e.event_id, p.endpoint_id, 'EXECUTED_BUT_RESULT_INVALID', { op: 'ack' });
          throw error('EVENT_CONFLICT', 'EXECUTED_BUT_RESULT_INVALID');
        }
        if (e.result_bound_digest && e.result_bound_digest !== e.payload_digest) {
          rejectLog(db, e.event_id, p.endpoint_id, 'EVENT_CONFLICT', { op: 'ack', reason: 'result_digest_mismatch' });
          throw error('EVENT_CONFLICT', 'result_not_bound_to_payload');
        }
        if (p.expected_output_sha256 && p.expected_output_sha256 !== e.result.output_sha256) {
          rejectLog(db, e.event_id, p.endpoint_id, 'EVENT_CONFLICT', { op: 'ack', reason: 'output_sha_mismatch' });
          throw error('EVENT_CONFLICT', 'output_sha256_mismatch');
        }
        maybeInject('before_ack_persist');
        db.receipts.push({
          event_id: e.event_id,
          attempt_id: p.attempt_id,
          endpoint_id: p.endpoint_id,
          channel: 'api',
          kind: 'ack',
          evidence: { reference: p.receipt_evidence },
          created_at: at,
        });
        e.state = 'ack_received';
        e.lifecycle = 'done';
        e.updated_at = at;
        audit(db, e.event_id, p.endpoint_id, 'ack_received', { attempt_id: p.attempt_id });
        return e;
      });
    },

    async fail(p) {
      return withLock((db) => {
        const at = clock();
        const e = db.events[p.event_id];
        if (!e) throw error('NOT_FOUND', 'unknown event');
        const grant = checkGrant(db, e, 'execute', at);
        correctLease(e, p, at, ['leased', 'executed']);
        const terminal = e.attempt_count >= grant.max_attempts;
        const delay = Math.min(3600, 30 * 2 ** Math.min(8, e.attempt_count - 1));
        const nextState = terminal ? 'failed' : 'queued';
        assertTransition(e.state, nextState);
        e.state = nextState;
        e.lifecycle = terminal ? 'failed' : 'submitted';
        e.next_attempt_at = terminal ? at : new Date(Date.parse(at) + delay * 1000).toISOString();
        e.lease_until = null;
        e.updated_at = at;
        e.last_error = String(p.reason || 'worker failure').slice(0, 200);
        audit(db, e.event_id, p.endpoint_id, terminal ? 'failed' : 'requeued', {
          attempt_id: p.attempt_id,
          reason: e.last_error,
          backoff_seconds: terminal ? 0 : delay,
        });
        return e;
      });
    },

    async get(eventId, opts = {}) {
      if (opts && opts.verifyReadback) {
        return this.verifyReadback(eventId);
      }
      const db = load();
      const e = db.events[eventId] || null;
      if (!e) return null;
      if (e.result) {
        return Object.assign({}, e, { result_integrity: computeResultIntegrity(e) });
      }
      return e;
    },

    /**
     * System readback: reject if stored result was tampered vs payload / output_sha256.
     * Used by e2e_readback_content_mismatch_negative (must exercise the store, not only deepEqual).
     */
    verifyReadback(event_id) {
      return withLock((db) => {
        const e = db.events[event_id];
        if (!e) throw error('NOT_FOUND', 'unknown event');
        const integrity = computeResultIntegrity(e);
        if (integrity !== 'ok') {
          rejectLog(db, event_id, null, 'readback_result_mismatch', { integrity });
          throw error('EVENT_CONFLICT', 'readback_result_mismatch:' + integrity);
        }
        e.result_integrity = 'ok';
        return e;
      });
    },



    stopGrant({ grant_id, reason }) {
      return withLock((db) => {
        const g = db.grants[grant_id];
        if (!g) throw error('NOT_FOUND', 'unknown grant');
        g.stopped = true;
        g.stop_reason = String(reason || 'STOP_REQUESTED').slice(0, 200);
        g.stop_status = 'STOP_REQUESTED'; // no remote stop evidence in local MOCK
        g.stopped_at = clock();
        audit(db, null, null, 'grant_stopped', { grant_id, reason: g.stop_reason, stop_status: g.stop_status });
        return g;
      });
    },

    revokeGrant({ grant_id, reason }) {
      return withLock((db) => {
        const g = db.grants[grant_id];
        if (!g) throw error('NOT_FOUND', 'unknown grant');
        g.revoked_at = clock();
        g.revoke_reason = String(reason || 'revoked').slice(0, 200);
        audit(db, null, null, 'grant_revoked', { grant_id, reason: g.revoke_reason });
        return g;
      });
    },

    /**
     * Exactly-once side-effect claim for synthetic external actions (R3).
     * Second claim after applied → UNKNOWN_NEEDS_RECONCILIATION (no duplicate apply).
     */
    claimSideEffect({ key, event_id, attempt_id }) {
      return withLock((db) => {
        db.side_effects = db.side_effects || {};
        const prev = db.side_effects[key];
        if (prev && prev.status === 'applied') {
          const row = {
            key,
            event_id,
            attempt_id,
            status: 'UNKNOWN_NEEDS_RECONCILIATION',
            duplicate: true,
            prior_attempt_id: prev.attempt_id,
            at: clock(),
          };
          db.side_effects[key + '|reconcile|' + attempt_id] = row;
          audit(db, event_id, null, 'side_effect_reconcile', row);
          return row;
        }
        const row = { key, event_id, attempt_id, status: 'applied', duplicate: false, at: clock() };
        db.side_effects[key] = row;
        audit(db, event_id, null, 'side_effect_applied', row);
        return row;
      });
    },

    setInjectFail(label) {
      _injectFailAt = label || null;
      return { inject: _injectFailAt };
    },

    listRejects() {
      const db = load();
      return db.rejects || [];
    },

    /** Stage deterministic execution result before markExecuted (verified). */
    stageResult({ event_id, attempt_id, result }) {
      return withLock((db) => {
        if (!event_id || !attempt_id || !result || typeof result !== 'object') {
          throw error('BAD_REQUEST', 'stageResult requires event_id, attempt_id, result object');
        }
        db.staged_results = db.staged_results || {};
        db.staged_results[event_id + '|' + attempt_id] = result;
        return { staged: true, event_id, attempt_id };
      });
    },

    /** Record synthetic cost (MOCK=0 by default; REAL would charge). */
    recordCost({ event_id, attempt_id, kind, usd }) {
      return withLock((db) => {
        if (kind !== 'MOCK' && kind !== 'REAL') throw error('BAD_REQUEST', 'kind must be MOCK or REAL');
        const entry = { event_id, attempt_id, kind, usd: Number(usd) || 0, at: clock() };
        db.cost_ledger.push(entry);
        db.meta.total_cost_usd = db.cost_ledger.reduce((s, c) => s + (c.usd || 0), 0);
        return entry;
      });
    },

    snapshot() {
      return load();
    },

    reset() {
      return withLock((db) => {
        Object.assign(db, empty());
        return db;
      });
    },
  };
}

module.exports = { createFileStore, LEGAL_TRANSITIONS, assertTransition };
