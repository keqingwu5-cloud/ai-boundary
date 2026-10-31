'use strict';
/** CLI viewer so Merlin can read results without manual copy-paste. */
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('./config.cjs');
const { createFileStore } = require('./file-store.cjs');

const store = createFileStore({ dataDir: cfg.DATA });
const snap = store.snapshot();
const filter = process.argv[2] || 'all'; // all | ack_received | failed | MOCK | REAL
const events = Object.values(snap.events || {});
const rows = events.filter((e) => {
  if (filter === 'all') return true;
  if (filter === 'MOCK' || filter === 'REAL') return e.result_kind === filter;
  return e.state === filter;
});
const runtime = fs.existsSync(path.join(cfg.DATA, 'runtime.json'))
  ? JSON.parse(fs.readFileSync(path.join(cfg.DATA, 'runtime.json'), 'utf8'))
  : null;

const out = {
  viewed_at_taipei: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) + ' Asia/Taipei',
  runtime,
  totals: {
    events: events.length,
    ack_received: events.filter((e) => e.state === 'ack_received').length,
    failed: events.filter((e) => e.state === 'failed').length,
    MOCK: events.filter((e) => e.result_kind === 'MOCK').length,
    REAL: events.filter((e) => e.result_kind === 'REAL').length,
    total_cost_usd: snap.meta?.total_cost_usd ?? 0,
  },
  note: 'REAL executor NOT_CONNECTED; OpenAI requests NOT_RUN',
  events: rows.map((e) => ({
    event_id: e.event_id,
    task_id: e.task_id,
    state: e.state,
    lifecycle: e.lifecycle || null,
    result_kind: e.result_kind,
    attempt_count: e.attempt_count,
    payload: e.payload,
    result: e.result || null,
    last_error: e.last_error,
    updated_at: e.updated_at,
  })),
  recent_logs: (snap.logs || []).slice(-20),
};
console.log(JSON.stringify(out, null, 2));
