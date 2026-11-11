// Full diagram fingerprint verification
// Fetches D01–D06 content from fixed BOT-A commit at runtime and compares sha256.
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const COMMIT_A = 'f6bea00f26a46e5e29b3b8a827fa6a07d90d8899';
const files = [
  'D01-system-overview.mmd',
  'D02-data-sources.mmd',
  'D03-event-flow.mmd',
  'D04-state-machine.mmd',
  'D05-stop-revoke.mmd',
  'D06-dependency.mmd'
];

// Expected hashes from sealed manifest (hardcoded for this candidate)
const expected = {
  'D01-system-overview.mmd': '6aca2ad04a743ba3c38fbebf8457f157fe923197ffe0b2bddace78b2e7836cf5',
  'D02-data-sources.mmd': '51074bef67549a1e63d6df81806202f4260b55063a58c6d8ae07aad2653f955e',
  'D03-event-flow.mmd': 'e88d8d25373d484627432b72e7b36734a21d672ba020a6337cd0eb1528d846f7',
  'D04-state-machine.mmd': '7c5ba613b862cbcdc52b2f777fe666f8b57d899b2be489f19dbeffa21f9faca5',
  'D05-stop-revoke.mmd': '16399b94425af29e757a5d00cb251e84830840fb4581a5a0d8ab4c0a3de8b473',
  'D06-dependency.mmd': '121f674f38bb2314ec829c856b86fd5fb34b9fe229f556e871c9cf726d08c875'
};

let fail = 0;
for (const file of files) {
  try {
    // Fetch raw content from GitHub at fixed commit (requires network; in isolation this may be mocked)
    const url = `https://raw.githubusercontent.com/keqingwu5-cloud/ai-boundary/${COMMIT_A}/docs/bot-a/${file}`;
    const content = execSync(`curl -fsSL "${url}"`, { encoding: 'utf8', timeout: 10000 });
    const actual = crypto.createHash('sha256').update(content).digest('hex');
    if (actual !== expected[file]) {
      console.error('FAIL: hash mismatch', file);
      fail++;
    } else {
      console.log('OK', file);
    }
  } catch (e) {
    console.error('FAIL: could not fetch', file, e.message);
    fail++;
  }
}
if (fail > 0) {
  console.error('fingerprint verification: FAIL');
  process.exit(1);
}
console.log('fingerprint verification: PASS (from fixed commit)');
console.log('EXIT=0');