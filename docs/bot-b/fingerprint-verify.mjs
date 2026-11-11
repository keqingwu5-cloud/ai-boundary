// Full diagram fingerprint verification (SYNTHETIC)
// Compares sha256 of D01–D06 against VERSION_MANIFEST
import fs from 'node:fs';
import crypto from 'node:crypto';

const manifestPath = 'docs/bot-a/VERSION_MANIFEST.txt';
if (!fs.existsSync(manifestPath)) {
  console.error('FAIL: manifest not found');
  process.exit(1);
}
const manifest = fs.readFileSync(manifestPath, 'utf8');
const lines = manifest.split('\n').filter(l => l.includes('sha256:'));
let fail = 0;
for (const line of lines) {
  const [file, hashPart] = line.split(/\s+/);
  const expected = hashPart.replace('sha256:', '');
  const filePath = 'docs/bot-a/' + file;
  if (!fs.existsSync(filePath)) {
    console.error('FAIL: missing', filePath);
    fail++;
    continue;
  }
  const content = fs.readFileSync(filePath);
  const actual = crypto.createHash('sha256').update(content).digest('hex');
  if (actual !== expected) {
    console.error('FAIL: hash mismatch', file);
    fail++;
  } else {
    console.log('OK', file);
  }
}
if (fail > 0) {
  console.error('fingerprint verification: FAIL');
  process.exit(1);
}
console.log('fingerprint verification: PASS');
console.log('EXIT=0');