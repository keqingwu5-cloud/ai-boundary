'use strict';
/**
 * Local isolated task API server.
 * Reuses queue-wt auth + HTTP + API; file-store for durability (no Docker/PG).
 * Executor: MOCK only. OpenAI REAL path not connected.
 */
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('./config.cjs');
const { createFileStore } = require('./file-store.cjs');
const { createHmacAuth } = require(path.join(cfg.QUEUE_WT, 'api/auth-adapter.cjs'));
const { createHttpServer } = require(path.join(cfg.QUEUE_WT, 'api/http-server.cjs'));
const { createPollingWorker } = require(path.join(cfg.QUEUE_WT, 'api/polling-worker-candidate.cjs'));
const { createApi } = require(path.join(cfg.QUEUE_WT, 'api/mainbrain-api.cjs'));
const { createMockExecutor, createRealExecutorStub } = require('./mock-executor.cjs');
const { mintToken } = require('./token.cjs');

fs.mkdirSync(cfg.DATA, { recursive: true });
const store = createFileStore({
  dataDir: cfg.DATA,
  leaseSeconds: cfg.LEASE_SECONDS,
  defaultMaxAttempts: cfg.MAX_ATTEMPTS,
  defaultCostCapUsd: cfg.COST_CAP_USD,
});

const keys = {
  [cfg.ORIGIN_ID]: cfg.ORIGIN_SECRET,
  [cfg.WORKER_ID]: cfg.WORKER_SECRET,
};
const authenticate = createHmacAuth({ keys, clock: () => Date.now() });
const api = createApi({ store, authenticate });

const server = createHttpServer({
  store,
  authenticate,
  logger: (x) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...x });
    fs.appendFileSync(path.join(cfg.DATA, 'server.log'), line + '\n');
  },
});

function workerTokenProvider(action) {
  const scopeMap = {
    receive: ['tasks:receive'],
    execute: ['tasks:execute', 'tasks:ack'],
    ack: ['tasks:ack'],
    fail: ['tasks:execute'],
  };
  const scopes = scopeMap[action] || ['tasks:receive', 'tasks:execute', 'tasks:ack'];
  return mintToken({ secret: cfg.WORKER_SECRET, endpoint_id: cfg.WORKER_ID, scopes });
}

// In-process authenticated client (avoids HTTP for worker loop reliability)
function createLocalClient() {
  const authHdr = async (action) => ({
    authorization: 'Bearer ' + (await workerTokenProvider(action)),
  });
  return {
    receive: async () => api.receive({ headers: await authHdr('receive'), body: {} }),
    execute: async (p) => api.execute({ headers: await authHdr('execute'), body: p }),
    ack: async (p) => api.ack({ headers: await authHdr('ack'), body: { ...p } }),
    fail: async (p) => api.fail({ headers: await authHdr('fail'), body: p }),
  };
}

if (cfg.EXECUTOR_MODE !== 'MOCK') {
  console.error('REFUSING to start: TESTENV_EXECUTOR_MODE must be MOCK (OpenAI REAL not authorized)');
  process.exit(2);
}
const performTask = createMockExecutor({ store, costPerMockUsd: 0 });
// Keep stub referenced so wiring docs stay honest; never invoke.
void createRealExecutorStub;

const client = createLocalClient();
const worker = createPollingWorker({
  client,
  performTask,
  intervalMs: 200,
  logger: (x) => fs.appendFileSync(path.join(cfg.DATA, 'worker.log'), JSON.stringify({ ts: new Date().toISOString(), ...x }) + '\n'),
});

const ac = new AbortController();
let listening = false;

function ensureBootstrapGrant() {
  const snap = store.snapshot();
  const existing = Object.values(snap.grants || {}).find(
    (g) => g.task_id === 'TASK-LOCAL-E2E' && !g.stopped && !g.revoked_at
  );
  if (existing) return existing;
  return store.createGrant({
    grant_id: 'grant-local-e2e-001',
    task_id: 'TASK-LOCAL-E2E',
    source_endpoint_id: cfg.ORIGIN_ID,
    destination_endpoint_id: cfg.WORKER_ID,
    allowed_actions: ['send', 'receive', 'execute', 'ack'],
    max_attempts: cfg.MAX_ATTEMPTS,
    cost_cap_usd: cfg.COST_CAP_USD,
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
}

server.listen(cfg.PORT, cfg.HOST, () => {
  listening = true;
  const grant = ensureBootstrapGrant();
  fs.writeFileSync(
    path.join(cfg.DATA, 'runtime.json'),
    JSON.stringify(
      {
        pid: process.pid,
        host: cfg.HOST,
        port: cfg.PORT,
        executor_mode: 'MOCK',
        openai: 'NOT_CONNECTED',
        grant_id: grant.grant_id,
        started_at_taipei: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) + ' Asia/Taipei',
        origin_id: cfg.ORIGIN_ID,
        worker_id: cfg.WORKER_ID,
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ ok: true, port: cfg.PORT, mode: 'MOCK', grant_id: grant.grant_id }));
  worker.runUntilStopped({ signal: ac.signal }).catch((e) => {
    if (e.name !== 'AbortError') {
      console.error('worker_error', e.message);
      process.exitCode = 1;
    }
  });
});

function shutdown(sig) {
  console.error('shutting_down', sig);
  ac.abort();
  if (listening) server.close();
  try { fs.unlinkSync(path.join(cfg.DATA, 'runtime.json')); } catch { /* */ }
  setTimeout(() => process.exit(0), 200);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { store, api, server, cfg };
