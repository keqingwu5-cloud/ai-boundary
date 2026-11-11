// Verify evidence manifest against filesystem
import fs from 'node:fs';

const manifestPath = 'docs/bot-b/evidence-manifest.json';
if (!fs.existsSync(manifestPath)) {
  console.error('FAIL: manifest missing');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let fail = 0;
for (const check of manifest.checks) {
  if (!fs.existsSync(check.file)) {
    console.error('FAIL: missing', check.file);
    fail++;
  } else {
    console.log('OK', check.name);
  }
}
if (fail > 0) {
  console.error('manifest verification: FAIL');
  process.exit(1);
}
console.log('manifest verification: PASS');
console.log('EXIT=0');