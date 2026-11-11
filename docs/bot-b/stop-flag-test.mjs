// STOP flag persistence test (SYNTHETIC)
// Limitation: uses local filesystem flag; does not prove cross-process restart isolation.
// Demonstrates: STOP sets a flag; same-process "restart" sees it.
import fs from 'node:fs';

const FLAG = '/tmp/stop.flag';
function isStopped() { return fs.existsSync(FLAG); }
function setStop() { fs.writeFileSync(FLAG, 'STOP'); }
function clear() { try { fs.unlinkSync(FLAG); } catch(e){} }

clear();
console.log('before:', isStopped());
setStop();
console.log('after set:', isStopped());
console.log('after simulated restart (same process, flag remains):', isStopped());
if (!isStopped()) {
  console.error('FAIL: STOP did not persist within process');
  process.exit(1);
}
clear();
console.log('STOP flag test: PASS (local only)');
console.log('LIMITATION: not cross-process restart proof');
console.log('EXIT=0');