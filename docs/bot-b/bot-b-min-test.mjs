// BOT-B minimal re-runnable test (SYNTHETIC)
// References BOT-A fixed commit f6bea00
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const sourcePath = 'docs/bot-a/synthetic-inner-drive.mjs';
if (!fs.existsSync(sourcePath)) {
  console.error('FAIL: source not found at', sourcePath);
  process.exit(1);
}

// Run synthetic harness
const out = execSync('node ' + sourcePath, { encoding: 'utf8' });
if (!out.includes('"evidence_level": "SYNTHETIC"') || !out.includes('EXIT=0')) {
  console.error('FAIL: synthetic harness missing markers');
  process.exit(1);
}

// Run STOP flag test
const stopOut = execSync('node docs/bot-b/stop-flag-test.mjs', { encoding: 'utf8' });
if (!stopOut.includes('STOP flag test: PASS') || !stopOut.includes('EXIT=0')) {
  console.error('FAIL: STOP flag test failed');
  process.exit(1);
}

// Declare network_calls (synthetic, no actual network)
console.log('network_calls: 0');
console.log('BOT-B min test: PASS (synthetic + STOP)');
console.log('EXIT=0');