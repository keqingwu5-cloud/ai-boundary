// BOT-B minimal re-runnable test (SYNTHETIC)
// References BOT-A fixed commit f6bea00
import { execSync } from 'node:child_process';
import fs from 'node:fs';

let notRun = 0;
let passed = 0;

function run(cmd, label) {
  try {
    const out = execSync(cmd, { encoding: 'utf8' });
    if (out.includes('NOT_RUN')) {
      console.log(label + ': NOT_RUN');
      notRun++;
    } else if (out.includes('EXIT=0')) {
      console.log(label + ': PASS');
      passed++;
    } else {
      console.error('FAIL:', label);
      process.exit(1);
    }
    return out;
  } catch (e) {
    console.error('FAIL:', label, e.message);
    process.exit(1);
  }
}

// 1. Synthetic harness (must contain evidence_level)
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
run('OFFLINE=1 node docs/bot-b/fingerprint-verify.mjs', 'fingerprint');

// 6. Network block (in-process)
run('node docs/bot-b/network-block-test.mjs', 'network');

// 7. Kernel netns isolation
run('node docs/bot-b/netns-isolation-test.mjs', 'netns');

// 8. Mount namespace isolation
run('node docs/bot-b/mount-ns-test.mjs', 'mount');

// 9. F05 gap detection
run('node docs/bot-b/f05-gap-detection-test.mjs', 'f05-gap');

// 10. Manifest verification
run('node docs/bot-b/verify-manifest.mjs', 'manifest');

console.log('SUMMARY: PASS=' + passed + ' NOT_RUN=' + notRun);
if (notRun > 0) {
  console.log('NOTE: NOT_RUN items present; CI green does not mean full acceptance');
  process.exit(2);
}
console.log('EXIT=0');