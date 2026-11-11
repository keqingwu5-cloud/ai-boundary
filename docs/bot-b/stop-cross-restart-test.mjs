// STOP cross-restart verification (SYNTHETIC)
// Writes flag to a persistent path; a new process observes it after "restart".
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const FLAG = '/tmp/stop-restart.flag';
try { fs.unlinkSync(FLAG); } catch(e) {}

// Simulate "before restart": set flag
fs.writeFileSync(FLAG, 'STOP');

// Simulate "after restart": new process checks
const out = execSync(`node -e "console.log(require('fs').existsSync('${FLAG}') ? 'STILL_STOPPED' : 'CLEARED')"` , { encoding: 'utf8' });
if (!out.includes('STILL_STOPPED')) {
  console.error('FAIL: STOP did not survive simulated restart');
  process.exit(1);
}
try { fs.unlinkSync(FLAG); } catch(e) {}
console.log('STOP cross-restart test: PASS (simulated)');
console.log('NOTE: real host reboot not tested');
console.log('EXIT=0');