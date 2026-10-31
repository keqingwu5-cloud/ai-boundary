'use strict';
/** Origin-side: mint token, POST send, poll status until terminal; exact result match. */
const crypto = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const cfg = require('./config.cjs');
const { mintToken } = require('./token.cjs');
const { sha } = require(path.join(cfg.QUEUE_WT, 'api/mainbrain-api.cjs'));
const { buildMockResult } = require('./mock-executor.cjs');

async function main() {
  const instruction = process.argv.slice(2).join(' ') || 'local-e2e-ping';
  const event_id = crypto.randomUUID();
  const idempotency_key = 'idem-' + crypto.createHash('sha256').update(instruction + '|' + Date.now()).digest('hex').slice(0, 24);
  const payload = { instruction, goal: instruction, label: 'MOCK_LOOP' };
  const expected = buildMockResult(payload);
  const body = {
    event_id,
    task_id: 'TASK-LOCAL-E2E',
    destination_endpoint_id: cfg.WORKER_ID,
    idempotency_key,
    payload_version: '1',
    payload,
  };
  const token = mintToken({
    secret: cfg.ORIGIN_SECRET,
    endpoint_id: cfg.ORIGIN_ID,
    scopes: ['tasks:send', 'tasks:status'],
  });
  const base = `http://${cfg.HOST}:${cfg.PORT}`;
  const sendRes = await fetch(base + '/v1/tasks/send', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const sendJson = await sendRes.json();
  if (!sendRes.ok) {
    console.error(JSON.stringify({ step: 'send', status: sendRes.status, ...sendJson }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    step: 'send',
    ok: true,
    event_id,
    state: sendJson.data?.state,
    payload_digest: sha(payload),
    expected_result: expected,
  }, null, 2));

  const statusToken = mintToken({
    secret: cfg.ORIGIN_SECRET,
    endpoint_id: cfg.ORIGIN_ID,
    scopes: ['tasks:status'],
  });
  const deadline = Date.now() + 15000;
  let last = null;
  while (Date.now() < deadline) {
    const r = await fetch(base + '/v1/tasks/' + event_id, {
      headers: { authorization: 'Bearer ' + statusToken },
    });
    last = await r.json();
    const st = last?.data?.state;
    if (['ack_received', 'failed', 'blocked'].includes(st)) break;
    await new Promise((x) => setTimeout(x, 150));
  }
  const ev = last?.data || null;
  console.log(JSON.stringify({ step: 'status', event: ev || last }, null, 2));
  if (!ev || ev.state !== 'ack_received') process.exit(2);
  try {
    assert.deepEqual(ev.result, expected);
  } catch (e) {
    console.error(JSON.stringify({
      step: 'readback_exact_match',
      ok: false,
      expected,
      actual: ev.result,
      message: String(e.message || e),
    }, null, 2));
    process.exit(3);
  }
  console.log(JSON.stringify({
    step: 'readback_exact_match',
    ok: true,
    event_id,
    lifecycle: ev.lifecycle,
    result: ev.result,
  }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
