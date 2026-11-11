// Full diagram fingerprint verification
// Supports online (fetch from fixed commit) and offline (local cache) modes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const COMMIT_A = 'f6bea00f26a46e5e29b3b8a827fa6a07d90d8899';
const CACHE = 'docs/bot-b/fingerprint-cache.txt';
const files = [
  'D01-system-overview.mmd',
  'D02-data-sources.mmd',
  'D03-event-flow.mmd',
  'D04-state-machine.mmd',
  'D05-stop-revoke.mmd',
  'D06-dependency.mmd'
];

function loadExpected() {
  const expected = {};
  if (fs.existsSync(CACHE)) {
    const lines = fs.readFileSync(CACHE, 'utf8').split('\n');
    for (const line of lines) {
      const [file, hash] = line.trim().split(/\s+/);
      if (file && hash) expected[file] = hash;
    }
  }
  return expected;
}

const expected = loadExpected();
let fail = 0;
const mode = process.env.OFFLINE === '1' ? 'offline' : 'online';

for (const file of files) {
  try {
    let content;
    if (mode === 'offline') {
      const local = 'docs/bot-a/' + file;
      if (!fs.existsSync(local)) throw new Error('local missing');
      content = fs.readFileSync(local);
    } else {
      const url = `https://raw.githubusercontent.com/keqingwu5-cloud/ai-boundary/${COMMIT_A}/docs/bot-a/${file}`;
      content = execSync(`curl -fsSL "${url}"`, { encoding: 'buffer', timeout: 10000 });
    }
    const actual = crypto.createHash('sha256').update(content).digest('hex');
    if (actual !== expected[file]) {
      console.error('FAIL: hash mismatch', file);
      fail++;
    } else {
      console.log('OK', file);
    }
  } catch (e) {
    console.error('FAIL:', file, e.message);
    fail++;
  }
}
if (fail > 0) {
  console.error('fingerprint verification: FAIL');
  process.exit(1);
}
console.log('fingerprint verification: PASS (' + mode + ')');
console.log('EXIT=0');