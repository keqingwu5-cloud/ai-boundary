'use strict';
/**
 * Isolated testenv verification suite.
 * MOCK only. OpenAI REAL tests marked NOT_RUN.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const cfg = require('./config.cjs');
const { createFileStore, LEGAL_TRANSITIONS } = require('./file-store.cjs');
const { buildMockResult } = require('./mock-executor.cjs');
const { mintToken } = require('./token.cjs');
const { sha } = require(path.join(cfg.QUEUE_WT, 'api/mainbrain-api.cjs'));

const EVIDENCE = path.resolve(__dirname, '../evidence/tests');
fs.mkdirSync(EVIDENCE, { recursive: true });
const results = [];
const startedTaipei = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) + ' Asia/Taipei';

function record(id, status, detail) {
  const row = {
    id,
    status, // PASS | FAIL | BLOCKED | NOT_RUN
    detail: detail || null,
    at_taipei: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) + ' Asia/Taipei',
  };
  results.push(row);
  console.log(`[${status}] ${id}`, detail && typeof detail === 'object' ? JSON.stringify(detail) : detail || '');
  return row;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function http(method, urlPath, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(`http://${cfg.HOST}:${cfg.PORT}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* */ }
  return { status: r.status, json };
}

function stopServer() {
  spawnSync('bash', [path.join(__dirname, 'stop.sh')], { encoding: 'utf8' });
}
function startServer() {
  const out = spawnSync('bash', [path.join(__dirname, 'start.sh')], { encoding: 'utf8' });
  return out;
}

async function waitReady(ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`http://${cfg.HOST}:${cfg.PORT}/v1/tasks/nosuch`, { method: 'GET' });
      // any HTTP response means server up (401/404)
      if (r.status) return true;
    } catch { /* */ }
    await sleep(100);
  }
  return false;
}

async function run() {
  // Fresh data dir for tests
  const testData = path.join(cfg.ROOT, 'data-test-' + Date.now());
  process.env.TESTENV_DATA_DIR = testData;
  process.env.TESTENV_PORT = String(cfg.PORT);
  // Re-require config? config already loaded — use env for child processes
  fs.mkdirSync(testData, { recursive: true });

  stopServer();
  // Start with env
  const start = spawn('node', [path.join(__dirname, 'server.cjs')], {
    env: { ...process.env, TESTENV_DATA_DIR: testData, TESTENV_EXECUTOR_MODE: 'MOCK', TESTENV_LEASE_SECONDS: '2', TESTENV_MAX_ATTEMPTS: '3', TESTENV_COST_CAP_USD: '0.05' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  fs.writeFileSync(path.join(testData, 'server.pid'), String(start.pid));
  let boot = '';
  start.stdout.on('data', (d) => { boot += d.toString(); });
  start.stderr.on('data', (d) => { boot += d.toString(); });
  const ready = await waitReady(8000);
  if (!ready) {
    record('BOOT', 'FAIL', { boot: boot.slice(0, 500) });
    try { start.kill('SIGKILL'); } catch { /* */ }
    writeOut();
    process.exit(1);
  }
  record('BOOT', 'PASS', { pid: start.pid, boot: boot.trim().slice(0, 200) });

  const store = createFileStore({ dataDir: testData, leaseSeconds: 2, defaultMaxAttempts: 3, defaultCostCapUsd: 0.05 });

  // Ensure grant for TASK-LOCAL-E2E exists (server bootstrap should have created it)
  let grant = Object.values(store.snapshot().grants || {})[0];
  if (!grant) {
    grant = store.createGrant({
      grant_id: 'grant-local-e2e-001',
      task_id: 'TASK-LOCAL-E2E',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: cfg.WORKER_ID,
      max_attempts: 3,
      cost_cap_usd: 0.05,
    });
  }

  const originSend = () => mintToken({ secret: cfg.ORIGIN_SECRET, endpoint_id: cfg.ORIGIN_ID, scopes: ['tasks:send', 'tasks:status'] });
  const originStatus = () => mintToken({ secret: cfg.ORIGIN_SECRET, endpoint_id: cfg.ORIGIN_ID, scopes: ['tasks:status'] });

  // --- 1 unauthorized rejection ---
  try {
    const r = await http('POST', '/v1/tasks/send', {
      body: {
        event_id: crypto.randomUUID(),
        task_id: 'TASK-LOCAL-E2E',
        destination_endpoint_id: cfg.WORKER_ID,
        idempotency_key: 'unauth-1',
        payload_version: '1',
        payload: { instruction: 'nope' },
      },
    });
    assert.equal(r.status, 401);
    record('unauthorized_rejection', 'PASS', r.json);
  } catch (e) {
    record('unauthorized_rejection', 'FAIL', String(e.message || e));
  }

  // forged token
  try {
    const bad = mintToken({ secret: 'x'.repeat(32) + 'forged-secret-value!!!!', endpoint_id: cfg.ORIGIN_ID, scopes: ['tasks:send'] });
    const r = await http('POST', '/v1/tasks/send', {
      token: bad,
      body: {
        event_id: crypto.randomUUID(),
        task_id: 'TASK-LOCAL-E2E',
        destination_endpoint_id: cfg.WORKER_ID,
        idempotency_key: 'forged-1',
        payload_version: '1',
        payload: { instruction: 'nope' },
      },
    });
    assert.equal(r.status, 401);
    record('unauthorized_forged_token', 'PASS', r.json);
  } catch (e) {
    record('unauthorized_forged_token', 'FAIL', String(e.message || e));
  }

  // --- 2 source and version stamping ---
  try {
    const event_id = crypto.randomUUID();
    const payload = { instruction: 'stamp-check', v: 1 };
    const r = await http('POST', '/v1/tasks/send', {
      token: originSend(),
      body: {
        event_id,
        task_id: 'TASK-LOCAL-E2E',
        destination_endpoint_id: cfg.WORKER_ID,
        idempotency_key: 'stamp-' + event_id.slice(0, 8),
        payload_version: '1',
        payload,
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.source_endpoint_id, cfg.ORIGIN_ID);
    assert.equal(r.json.data.payload_version, '1');
    assert.equal(r.json.data.payload_digest, sha(payload));
    // wait for ack
    let final = null;
    for (let i = 0; i < 40; i++) {
      const s = await http('GET', '/v1/tasks/' + event_id, { token: originStatus() });
      final = s.json?.data;
      if (final && ['ack_received', 'failed'].includes(final.state)) break;
      await sleep(100);
    }
    assert.equal(final.state, 'ack_received');
    assert.equal(final.result_kind, 'MOCK');
    assert.equal(final.source_endpoint_id, cfg.ORIGIN_ID);
    assert.equal(final.payload_version, '1');
    record('source_and_version_stamping', 'PASS', {
      event_id,
      source: final.source_endpoint_id,
      payload_version: final.payload_version,
      digest: final.payload_digest,
      result_kind: final.result_kind,
    });
  } catch (e) {
    record('source_and_version_stamping', 'FAIL', String(e.message || e));
  }

  // --- 3 dedup / idempotency ---
  try {
    const event_id = crypto.randomUUID();
    const key = 'dedup-' + event_id.slice(0, 8);
    const body = {
      event_id,
      task_id: 'TASK-LOCAL-E2E',
      destination_endpoint_id: cfg.WORKER_ID,
      idempotency_key: key,
      payload_version: '1',
      payload: { instruction: 'dedup-a' },
    };
    const a = await http('POST', '/v1/tasks/send', { token: originSend(), body });
    const b = await http('POST', '/v1/tasks/send', { token: originSend(), body });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.json.data.event_id, b.json.data.event_id);
    const conflict = await http('POST', '/v1/tasks/send', {
      token: originSend(),
      body: { ...body, payload: { instruction: 'dedup-CHANGED' } },
    });
    assert.equal(conflict.status, 409);
    record('dedup_idempotency', 'PASS', { same: a.json.data.event_id, conflict: conflict.json });
  } catch (e) {
    record('dedup_idempotency', 'FAIL', String(e.message || e));
  }

  // --- 4 retry (force fail then requeue) ---
  try {
    // Use store directly: create event, lease, fail without max, verify requeued
    const store2 = createFileStore({ dataDir: testData, leaseSeconds: 30, defaultMaxAttempts: 3 });
    // create a separate grant/task for controlled retry without racing worker
    store2.createGrant({
      grant_id: 'grant-retry-test',
      task_id: 'TASK-RETRY',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-retry',
      max_attempts: 3,
      cost_cap_usd: 1,
      allowed_actions: ['send', 'receive', 'execute', 'ack'],
    });
    const eid = 'evt-retry-' + crypto.randomUUID().slice(0, 8);
    await store2.enqueue({
      event_id: eid,
      task_id: 'TASK-RETRY',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-retry',
      idempotency_key: 'retry-key-' + eid,
      payload_version: '1',
      payload_digest: sha({ x: 1 }),
      payload: { x: 1 },
    });
    const leased = await store2.lease({ destination_endpoint_id: 'worker-retry' });
    assert.equal(leased.length, 1);
    const attempt = leased[0].current_attempt_id;
    const failed = await store2.fail({
      event_id: eid,
      attempt_id: attempt,
      endpoint_id: 'worker-retry',
      reason: 'injected_fail',
    });
    assert.equal(failed.state, 'queued'); // requeued
    assert.ok(failed.attempt_count === 1);
    // second lease after next_attempt_at — may be in future due to backoff; force next_attempt_at
    const snap = store2.snapshot();
    snap.events[eid].next_attempt_at = new Date(0).toISOString();
    fs.writeFileSync(path.join(testData, 'store.json'), JSON.stringify(snap, null, 2));
    const leased2 = await store2.lease({ destination_endpoint_id: 'worker-retry' });
    assert.equal(leased2.length, 1);
    assert.equal(leased2[0].attempt_count, 2);
    record('retry', 'PASS', { event_id: eid, attempts: leased2[0].attempt_count, mid_state: failed.state });
  } catch (e) {
    record('retry', 'FAIL', String(e.message || e));
  }

  // --- 5 timeout (lease expiry reclaim) ---
  try {
    const store3 = createFileStore({ dataDir: testData, leaseSeconds: 1, defaultMaxAttempts: 3 });
    store3.createGrant({
      grant_id: 'grant-timeout-test',
      task_id: 'TASK-TIMEOUT',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-timeout',
      max_attempts: 3,
      allowed_actions: ['send', 'receive', 'execute', 'ack'],
    });
    const eid = 'evt-timeout-' + crypto.randomUUID().slice(0, 8);
    await store3.enqueue({
      event_id: eid,
      task_id: 'TASK-TIMEOUT',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-timeout',
      idempotency_key: 'to-' + eid,
      payload_version: '1',
      payload_digest: sha({ t: 1 }),
      payload: { t: 1 },
    });
    const l1 = await store3.lease({ destination_endpoint_id: 'worker-timeout' });
    assert.equal(l1.length, 1);
    const oldAttempt = l1[0].current_attempt_id;
    await sleep(1200); // wait lease expiry
    const l2 = await store3.lease({ destination_endpoint_id: 'worker-timeout' });
    assert.equal(l2.length, 1);
    assert.notEqual(l2[0].current_attempt_id, oldAttempt);
    assert.equal(l2[0].attempt_count, 2);
    record('timeout_lease_reclaim', 'PASS', { oldAttempt, newAttempt: l2[0].current_attempt_id });
  } catch (e) {
    record('timeout_lease_reclaim', 'FAIL', String(e.message || e));
  }

  // --- 6 restart recovery ---
  try {
    // enqueue via HTTP, kill server mid-flight on a leased-but-not-done event using store,
    // restart and ensure queued/leased can complete
    const event_id = crypto.randomUUID();
    const r = await http('POST', '/v1/tasks/send', {
      token: originSend(),
      body: {
        event_id,
        task_id: 'TASK-LOCAL-E2E',
        destination_endpoint_id: cfg.WORKER_ID,
        idempotency_key: 'restart-' + event_id.slice(0, 8),
        payload_version: '1',
        payload: { instruction: 'restart-recovery' },
      },
    });
    assert.equal(r.status, 200);
    // kill server
    start.kill('SIGTERM');
    await sleep(500);
    try { start.kill('SIGKILL'); } catch { /* */ }
    await sleep(300);
    // restart
    const start2 = spawn('node', [path.join(__dirname, 'server.cjs')], {
      env: { ...process.env, TESTENV_DATA_DIR: testData, TESTENV_EXECUTOR_MODE: 'MOCK', TESTENV_LEASE_SECONDS: '2' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // replace tracked process
    Object.assign(start, { kill: (...a) => start2.kill(...a), pid: start2.pid });
    const ready2 = await waitReady(8000);
    assert.ok(ready2);
    let final = null;
    for (let i = 0; i < 50; i++) {
      const s = await http('GET', '/v1/tasks/' + event_id, { token: originStatus() });
      final = s.json?.data;
      if (final && ['ack_received', 'failed'].includes(final.state)) break;
      await sleep(150);
    }
    assert.ok(final, 'missing final');
    // Either already acked before kill, or recovered after restart
    assert.ok(['ack_received', 'queued', 'leased', 'executed', 'failed'].includes(final.state));
    // If not terminal, wait more
    if (!['ack_received', 'failed'].includes(final.state)) {
      for (let i = 0; i < 40; i++) {
        const s = await http('GET', '/v1/tasks/' + event_id, { token: originStatus() });
        final = s.json?.data;
        if (final && ['ack_received', 'failed'].includes(final.state)) break;
        await sleep(150);
      }
    }
    assert.equal(final.state, 'ack_received');
    record('restart_recovery', 'PASS', { event_id, state: final.state, result_kind: final.result_kind });
  } catch (e) {
    record('restart_recovery', 'FAIL', String(e.message || e));
  }

  // --- 7 cost cap ---
  try {
    const store4 = createFileStore({ dataDir: testData, leaseSeconds: 30, defaultMaxAttempts: 5, defaultCostCapUsd: 0.01 });
    store4.createGrant({
      grant_id: 'grant-cost-test',
      task_id: 'TASK-COST',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-cost',
      max_attempts: 5,
      cost_cap_usd: 0.01,
      allowed_actions: ['send', 'receive', 'execute', 'ack'],
    });
    const eid = 'evt-cost-' + crypto.randomUUID().slice(0, 8);
    await store4.enqueue({
      event_id: eid,
      task_id: 'TASK-COST',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-cost',
      idempotency_key: 'cost-' + eid,
      payload_version: '1',
      payload_digest: sha({ c: 1 }),
      payload: { c: 1 },
    });
    store4.recordCost({ event_id: eid, attempt_id: 'a1', kind: 'MOCK', usd: 0.02 });
    const leased = await store4.lease({ destination_endpoint_id: 'worker-cost' });
    assert.equal(leased.length, 0);
    const ev = (await store4.get(eid));
    assert.equal(ev.state, 'failed');
    assert.equal(ev.last_error, 'cost_cap_exceeded');
    record('cost_cap', 'PASS', { event_id: eid, state: ev.state, last_error: ev.last_error });
  } catch (e) {
    record('cost_cap', 'FAIL', String(e.message || e));
  }

  // --- 8 reporting (view CLI) ---
  try {
    const view = spawnSync(process.execPath, [path.join(__dirname, 'view.cjs')], {
      env: { ...process.env, TESTENV_DATA_DIR: testData },
      encoding: 'utf8',
    });
    assert.equal(view.status, 0);
    const parsed = JSON.parse(view.stdout);
    assert.ok(parsed.totals);
    assert.ok(typeof parsed.totals.MOCK === 'number');
    assert.equal(parsed.totals.REAL, 0);
    assert.ok(parsed.note.includes('NOT_CONNECTED'));
    fs.writeFileSync(path.join(EVIDENCE, 'view-sample.json'), view.stdout);
    record('reporting', 'PASS', { totals: parsed.totals });
  } catch (e) {
    record('reporting', 'FAIL', String(e.message || e));
  }

  // --- E2E full loop: HTTP send → ack → exact result content match ---
  try {
    const instruction = 'full-e2e-merlin-visible';
    const payload = { instruction, goal: instruction, label: 'MOCK_LOOP' };
    const expectedResult = buildMockResult(payload);
    const event_id = crypto.randomUUID();
    const send = await http('POST', '/v1/tasks/send', {
      token: originSend(),
      body: {
        event_id,
        task_id: 'TASK-LOCAL-E2E',
        destination_endpoint_id: cfg.WORKER_ID,
        idempotency_key: 'e2e-exact-' + event_id.slice(0, 8),
        payload_version: '1',
        payload,
      },
    });
    assert.equal(send.status, 200, JSON.stringify(send.json));
    let final = null;
    for (let i = 0; i < 50; i++) {
      const s = await http('GET', '/v1/tasks/' + event_id, { token: originStatus() });
      final = s.json?.data;
      if (final && ['ack_received', 'failed', 'blocked'].includes(final.state)) break;
      await sleep(100);
    }
    assert.ok(final, 'missing final status');
    assert.equal(final.state, 'ack_received');
    assert.equal(final.lifecycle, 'done');
    assert.equal(final.result_kind, 'MOCK');
    assert.deepEqual(final.result, expectedResult);
    assert.equal(final.result.echo.instruction, instruction);
    assert.equal(final.payload_digest, sha(payload));

    // Also exercise submit CLI (exit 0 implies its own deepEqual passed)
    const sub = spawnSync(process.execPath, [path.join(__dirname, 'submit.cjs'), 'submit-cli-exact-check'], {
      env: { ...process.env, TESTENV_DATA_DIR: testData, TESTENV_PORT: String(cfg.PORT) },
      encoding: 'utf8',
      timeout: 20000,
    });
    fs.writeFileSync(path.join(EVIDENCE, 'e2e-submit.out'), sub.stdout + '\n' + sub.stderr);
    assert.equal(sub.status, 0, sub.stdout + sub.stderr);
    assert.ok(sub.stdout.includes('readback_exact_match'));
    assert.ok(sub.stdout.includes('"ok": true'));

    fs.writeFileSync(path.join(EVIDENCE, 'e2e-readback-exact.json'), JSON.stringify({
      event_id,
      instruction,
      expected: expectedResult,
      actual: final.result,
      match: true,
      lifecycle: final.lifecycle,
      submit_cli_exit: sub.status,
    }, null, 2));
    record('e2e_submit_ack_readback', 'PASS', {
      event_id,
      exact_match: true,
      instruction,
      output_sha256: final.result.output_sha256,
      lifecycle: final.lifecycle,
      submit_cli_exit: sub.status,
    });
  } catch (e) {
    record('e2e_submit_ack_readback', 'FAIL', String(e.message || e));
  }

  // --- Negative: tamper stored result → system verifyReadback must reject ---
  try {
    const dirM = path.join(testData, 'mismatch-neg');
    fs.mkdirSync(dirM, { recursive: true });
    const storeM = createFileStore({ dataDir: dirM, leaseSeconds: 30, defaultMaxAttempts: 3 });
    storeM.createGrant({
      grant_id: 'grant-mismatch-neg',
      task_id: 'TASK-MISMATCH-NEG',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-mismatch-neg',
      max_attempts: 3,
      cost_cap_usd: 1,
      allowed_actions: ['send', 'receive', 'execute', 'ack'],
    });
    const payload = { instruction: 'neg-mismatch-system', goal: 'neg-mismatch', label: 'MOCK_LOOP' };
    const eid = 'evt-mismatch-' + crypto.randomUUID().slice(0, 8);
    await storeM.enqueue({
      event_id: eid,
      task_id: 'TASK-MISMATCH-NEG',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-mismatch-neg',
      idempotency_key: 'mm-' + eid,
      payload_version: '1',
      payload_digest: sha(payload),
      payload,
    });
    const leased = await storeM.lease({ destination_endpoint_id: 'worker-mismatch-neg' });
    assert.equal(leased.length, 1);
    const attempt = leased[0].current_attempt_id;
    const good = buildMockResult(payload);
    storeM.stageResult({ event_id: eid, attempt_id: attempt, result: good });
    await storeM.markExecuted({
      event_id: eid,
      attempt_id: attempt,
      endpoint_id: 'worker-mismatch-neg',
      execution_evidence: 'result_kind=MOCK|mismatch-neg',
      receipt_evidence: 'MOCK_RECEIPT|mismatch',
      expected_output_sha256: good.output_sha256,
    });
    await storeM.ack({
      event_id: eid,
      attempt_id: attempt,
      endpoint_id: 'worker-mismatch-neg',
      channel: 'api',
      receipt_evidence: 'MOCK_RECEIPT|mismatch',
      payload_digest: sha(payload),
      payload_version: '1',
      expected_output_sha256: good.output_sha256,
    });
    // Tamper the durable result in the store (system must reject on readback).
    const snap = storeM.snapshot();
    snap.events[eid].result = Object.assign({}, snap.events[eid].result, {
      instruction: 'TAMPERED_BY_TEST',
      echo: Object.assign({}, payload, { instruction: 'TAMPERED_BY_TEST' }),
    });
    fs.writeFileSync(path.join(dirM, 'store.json'), JSON.stringify(snap, null, 2));
    let code = null;
    let msg = '';
    try {
      storeM.verifyReadback(eid);
    } catch (e) {
      code = e.code;
      msg = String(e.message || e);
    }
    assert.equal(code, 'EVENT_CONFLICT');
    assert.ok(msg.includes('readback_result_mismatch'), msg);
    const got = await storeM.get(eid);
    assert.notEqual(got.result_integrity, 'ok');
    let codeGet = null;
    try {
      await storeM.get(eid, { verifyReadback: true });
    } catch (e) {
      codeGet = e.code;
    }
    assert.equal(codeGet, 'EVENT_CONFLICT');
    record('e2e_readback_content_mismatch_negative', 'PASS', {
      event_id: eid,
      verify_code: code,
      verify_msg: msg,
      get_integrity: got.result_integrity,
      get_verify_code: codeGet,
    });
  } catch (e) {
    record('e2e_readback_content_mismatch_negative', 'FAIL', String(e.message || e));
  }

  // --- Negative: illegal state transitions (leased→ack skips execute) ---
  try {
    const storeN = createFileStore({ dataDir: testData, leaseSeconds: 30, defaultMaxAttempts: 3 });
    storeN.createGrant({
      grant_id: 'grant-neg-sm',
      task_id: 'TASK-NEG-SM',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-neg-sm',
      max_attempts: 3,
      cost_cap_usd: 1,
      allowed_actions: ['send', 'receive', 'execute', 'ack'],
    });
    const eid = 'evt-neg-sm-' + crypto.randomUUID().slice(0, 8);
    const payload = { instruction: 'skip-exec' };
    await storeN.enqueue({
      event_id: eid,
      task_id: 'TASK-NEG-SM',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-neg-sm',
      idempotency_key: 'neg-sm-' + eid,
      payload_version: '1',
      payload_digest: sha(payload),
      payload,
    });
    // queued → ack illegal
    let code1 = null;
    try {
      await storeN.ack({
        event_id: eid,
        attempt_id: 'no-attempt',
        endpoint_id: 'worker-neg-sm',
        channel: 'api',
        payload_digest: sha(payload),
        payload_version: '1',
        receipt_evidence: 'bad',
      });
    } catch (e) { code1 = e.code; }
    assert.equal(code1, 'EVENT_CONFLICT');

    const leased = await storeN.lease({ destination_endpoint_id: 'worker-neg-sm' });
    assert.equal(leased.length, 1);
    assert.equal(leased[0].lifecycle, 'running');
    const attempt = leased[0].current_attempt_id;

    // leased → ack illegal (the WEAK: skip execute)
    let code2 = null;
    let msg2 = null;
    try {
      await storeN.ack({
        event_id: eid,
        attempt_id: attempt,
        endpoint_id: 'worker-neg-sm',
        channel: 'api',
        payload_digest: sha(payload),
        payload_version: '1',
        receipt_evidence: 'skip-exec-ack',
      });
    } catch (e) { code2 = e.code; msg2 = e.message; }
    assert.equal(code2, 'EVENT_CONFLICT');
    const still = await storeN.get(eid);
    assert.equal(still.state, 'leased');
    assert.notEqual(still.state, 'ack_received');

    // queued/leased → markExecuted from wrong state: enqueue fresh and try execute without lease
    const eid2 = 'evt-neg-exec-' + crypto.randomUUID().slice(0, 8);
    await storeN.enqueue({
      event_id: eid2,
      task_id: 'TASK-NEG-SM',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-neg-sm',
      idempotency_key: 'neg-exec-' + eid2,
      payload_version: '1',
      payload_digest: sha(payload),
      payload,
    });
    let code3 = null;
    try {
      await storeN.markExecuted({
        event_id: eid2,
        attempt_id: 'x',
        endpoint_id: 'worker-neg-sm',
        execution_evidence: 'result_kind=MOCK|nope',
      });
    } catch (e) { code3 = e.code; }
    assert.equal(code3, 'EVENT_CONFLICT');

    // Legal path for contrast: execute then ack with staged result
    storeN.stageResult({
      event_id: eid,
      attempt_id: attempt,
      result: buildMockResult(payload),
    });
    await storeN.markExecuted({
      event_id: eid,
      attempt_id: attempt,
      endpoint_id: 'worker-neg-sm',
      execution_evidence: 'result_kind=MOCK|ok',
    });
    const verified = await storeN.get(eid);
    assert.equal(verified.state, 'executed');
    assert.equal(verified.lifecycle, 'verified');
    await storeN.ack({
      event_id: eid,
      attempt_id: attempt,
      endpoint_id: 'worker-neg-sm',
      channel: 'api',
      payload_digest: sha(payload),
      payload_version: '1',
      receipt_evidence: 'ok-ack',
    });
    const done = await storeN.get(eid);
    assert.equal(done.state, 'ack_received');
    assert.equal(done.lifecycle, 'done');
    assert.deepEqual(done.result, buildMockResult(payload));

    // executed → ack without result rejected (isolated destination; avoid lease race)
    storeN.createGrant({
      grant_id: 'grant-neg-nores',
      task_id: 'TASK-NEG-NORES',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-neg-nores',
      max_attempts: 3,
      cost_cap_usd: 1,
      allowed_actions: ['send', 'receive', 'execute', 'ack'],
    });
    const eid3 = 'evt-neg-nores-' + crypto.randomUUID().slice(0, 8);
    await storeN.enqueue({
      event_id: eid3,
      task_id: 'TASK-NEG-NORES',
      source_endpoint_id: cfg.ORIGIN_ID,
      destination_endpoint_id: 'worker-neg-nores',
      idempotency_key: 'neg-nores-' + eid3,
      payload_version: '1',
      payload_digest: sha(payload),
      payload,
    });
    const l3 = await storeN.lease({ destination_endpoint_id: 'worker-neg-nores' });
    assert.equal(l3.length, 1);
    assert.equal(l3[0].event_id, eid3);
    const a3 = l3[0].current_attempt_id;
    await storeN.markExecuted({
      event_id: eid3,
      attempt_id: a3,
      endpoint_id: 'worker-neg-nores',
      execution_evidence: 'result_kind=MOCK|no-stage',
    });
    let code4 = null;
    let msg4 = null;
    try {
      await storeN.ack({
        event_id: eid3,
        attempt_id: a3,
        endpoint_id: 'worker-neg-nores',
        channel: 'api',
        payload_digest: sha(payload),
        payload_version: '1',
        receipt_evidence: 'nores',
      });
    } catch (e) { code4 = e.code; msg4 = e.message; }
    assert.equal(code4, 'EVENT_CONFLICT');
    assert.ok(String(msg4).includes('ack_requires_execution_result') || String(msg4).includes('illegal_transition') || code4 === 'EVENT_CONFLICT');

    assert.ok(LEGAL_TRANSITIONS.leased.includes('executed'));
    assert.ok(!LEGAL_TRANSITIONS.leased.includes('ack_received'));
    assert.ok(!LEGAL_TRANSITIONS.queued.includes('ack_received'));

    record('state_machine_illegal_transition_negative', 'PASS', {
      queued_ack: code1,
      leased_ack_skip_execute: code2,
      leased_ack_msg: msg2,
      queued_execute: code3,
      executed_ack_without_result: code4,
      legal_done_lifecycle: done.lifecycle,
    });
  } catch (e) {
    record('state_machine_illegal_transition_negative', 'FAIL', String(e.message || e));
  }

  // --- OpenAI REAL path: explicitly NOT_RUN ---
  record('openai_real_executor', 'NOT_RUN', {
    reason: 'Merlin policy: read-only plan only; no key create, no model request, no billing, not wired to execution',
    env_OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET_NONEMPTY' : (process.env.OPENAI_API_KEY === '' ? 'SET_EMPTY' : 'UNSET'),
  });
  record('openai_paid_api_call', 'NOT_RUN', { reason: 'forbidden without approval' });
  record('supabase_wake', 'NOT_RUN', { reason: 'project xsgtpcutpnniomlrqazs INACTIVE; wake needs Merlin approval' });
  record('deploy_production', 'NOT_RUN', { reason: 'needs Merlin approval' });

  // MOCK vs REAL separation check
  try {
    const snap = store.snapshot();
    const reals = Object.values(snap.events).filter((e) => e.result_kind === 'REAL');
    assert.equal(reals.length, 0);
    const mocks = Object.values(snap.events).filter((e) => e.result_kind === 'MOCK');
    assert.ok(mocks.length >= 1);
    record('mock_real_separation', 'PASS', { MOCK: mocks.length, REAL: reals.length });
  } catch (e) {
    record('mock_real_separation', 'FAIL', String(e.message || e));
  }

  // cleanup
  try { start.kill('SIGTERM'); } catch { /* */ }
  await sleep(400);
  try { start.kill('SIGKILL'); } catch { /* */ }

  writeOut();
  const failed = results.filter((r) => r.status === 'FAIL');
  process.exit(failed.length ? 1 : 0);
}

function writeOut() {
  const tipPinPath = path.resolve(__dirname, '../evidence/inventory/testenv-commit-sha.txt');
  const tip_sha_file = fs.existsSync(tipPinPath) ? fs.readFileSync(tipPinPath, 'utf8').trim() : 'UNKNOWN';
  let tip_sha_live = 'UNKNOWN';
  try {
    tip_sha_live = require('node:child_process')
      .execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' })
      .trim();
  } catch { /* */ }
  const summary = {
    started_at_taipei: startedTaipei,
    finished_at_taipei: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) + ' Asia/Taipei',
    tip_sha_file,
    tip_sha_live,
    node: process.version,
    queue_wt_sha: 'a99f48a',
    pr86_fix_sha: fs.existsSync(path.resolve(__dirname, '../evidence/pr86/fix-sha.txt'))
      ? fs.readFileSync(path.resolve(__dirname, '../evidence/pr86/fix-sha.txt'), 'utf8').trim()
      : null,
    results,
    counts: {
      PASS: results.filter((r) => r.status === 'PASS').length,
      FAIL: results.filter((r) => r.status === 'FAIL').length,
      BLOCKED: results.filter((r) => r.status === 'BLOCKED').length,
      NOT_RUN: results.filter((r) => r.status === 'NOT_RUN').length,
    },
  };
  fs.writeFileSync(path.join(EVIDENCE, 'suite-summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary.counts, null, 2));
}

run().catch((e) => {
  console.error(e);
  record('suite_crash', 'FAIL', String(e.stack || e));
  writeOut();
  process.exit(1);
});
