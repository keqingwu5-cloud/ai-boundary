// BOT-B minimal re-runnable test (SYNTHETIC)
// References BOT-A fixed commit f6bea00
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const sourcePath = 'docs/bot-a/synthetic-inner-drive.mjs';
if (!fs.existsSync(sourcePath)) {
  console.error('FAIL: source not found at', sourcePath);
  process.exit(1);
}
try {
  const out = execSync('node ' + sourcePath, { encoding: 'utf8' });
  // Stronger assertion: must contain both markers and exit 0
  if (!out.includes('"evidence_level": "SYNTHETIC"') || !out.includes('EXIT=0')) {
    console.error('FAIL: missing required markers');
    process.exit(1);
  }
  console.log('BOT-B min test: PASS (synthetic)');
  console.log('EXIT=0');
} catch (e) {
  console.error('BOT-B min test: FAIL');
  console.error(e.message);
  process.exit(1);
}