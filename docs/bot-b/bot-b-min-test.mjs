// BOT-B minimal re-runnable test (SYNTHETIC)
// References BOT-A fixed commit f6bea00
import { execSync } from 'node:child_process';
import fs from 'node:fs';

function run(cmd, label) {
  const out = execSync(cmd, { encoding: 'utf8' });
  if (!out.includes('EXIT=0')) {
    console.error('FAIL:', label);
    process.exit(1);
  }
  return out;
}

// 1. Synthetic harness
if (!fs.existsSync('docs/bot-a/synthetic-inner-drive.mjs')) {
  console.error('FAIL: source not found');
  process.exit(1);
}
const syn = run('node docs/bot-a/synthetic-inner-drive.mjs', 'synthetic');
if (!syn.includes('"evidence_level": "SYNTHETIC"')) {
  console.error('FAIL: missing evidence_level');
  process.exit(1);
}

// 2. STOP local
run('node docs/bot-b/stop-flag-test.mjs', 'STOP');

// 3. STOP cross-process
run('node docs/bot-b/stop-cross-process-test.mjs', 'STOP-cross');

// 4. STOP cross-restart (simulated)
run('node docs/bot-b/stop-cross-restart-test.mjs', 'STOP-restart');

// 5. Fingerprint verification
run('node docs/bot-b/fingerprint-verify.mjs', 'fingerprint');

// 6. Network block (in-process)
run('node docs/bot-b/network-block-test.mjs', 'network');

// 7. Kernel netns isolation
run('node docs/bot-b/netns-isolation-test.mjs', 'netns');

// 8. Mount namespace isolation
run('node docs/bot-b/mount-ns-test.mjs', 'mount');

# 9. Manifest verification
run('node docs/bot-b/verify-manifest.mjs', 'manifest');

console.log('BOT-B min test: PASS (all isolation checks)');
console.log('EXIT=0');