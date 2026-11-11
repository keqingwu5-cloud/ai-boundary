// STOP flag persistence test (SYNTHETIC)
// Demonstrates: STOP sets a flag; restart does not self-restore
import fs from 'node:fs';

const FLAG = '/tmp/stop.flag';
function isStopped() { return fs.existsSync(FLAG); }
function setStop() { fs.writeFileSync(FLAG, 'STOP'); }
function clear() { try { fs.unlinkSync(FLAG); } catch(e){} }

clear();
console.log('before:', isStopped());
setStop();
console.log('after set:', isStopped());
// simulate restart: flag remains
console.log('after restart (flag still exists):', isStopped());
if (!isStopped()) {
  console.error('FAIL: STOP did not persist');
  process.exit(1);
}
clear();
console.log('STOP flag test: PASS');
console.log('EXIT=0');