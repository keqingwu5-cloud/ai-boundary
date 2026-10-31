'use strict';
const path = require('node:path');
const ROOT = path.resolve(__dirname);
const DATA = process.env.TESTENV_DATA_DIR || path.join(ROOT, 'data');
const PORT = Number(process.env.TESTENV_PORT || 18765);
const HOST = process.env.TESTENV_HOST || '127.0.0.1';
// Synthetic local secrets for isolated test only — NOT production keys.
const ORIGIN_SECRET = process.env.TESTENV_ORIGIN_SECRET || 'testenv-origin-secret-32bytes-min!!';
const WORKER_SECRET = process.env.TESTENV_WORKER_SECRET || 'testenv-worker-secret-32bytes-min!!';
const ORIGIN_ID = process.env.TESTENV_ORIGIN_ID || 'origin-local';
const WORKER_ID = process.env.TESTENV_WORKER_ID || 'worker-mock';
const EXECUTOR_MODE = process.env.TESTENV_EXECUTOR_MODE || 'MOCK'; // MOCK only in this env
const COST_CAP_USD = Number(process.env.TESTENV_COST_CAP_USD || '0.05');
const MAX_ATTEMPTS = Number(process.env.TESTENV_MAX_ATTEMPTS || '3');
const LEASE_SECONDS = Number(process.env.TESTENV_LEASE_SECONDS || '30');
const QUEUE_WT = path.resolve(__dirname, '../queue-wt');
module.exports = {
  ROOT, DATA, PORT, HOST, ORIGIN_SECRET, WORKER_SECRET, ORIGIN_ID, WORKER_ID,
  EXECUTOR_MODE, COST_CAP_USD, MAX_ATTEMPTS, LEASE_SECONDS, QUEUE_WT,
};
