// BOT-B minimal re-runnable test (SYNTHETIC)
// References BOT-A f6bea00
import { execSync } from 'node:child_process';
try {
  const out = execSync('node ../bot-a-blueprints/synthetic-inner-drive.mjs', { encoding: 'utf8' });
  if (!out.includes('EXIT=0') && !out.includes('"evidence_level": "SYNTHETIC"')) {
    throw new Error('unexpected output');
  }
  console.log('BOT-B min test: PASS (synthetic)');
  console.log('EXIT=0');
} catch (e) {
  console.error('BOT-B min test: FAIL');
  console.error(e.message);
  process.exit(1);
}
