// STOP cross-process verification (SYNTHETIC)
// Process A sets the flag; Process B (new node invocation) observes it.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const FLAG = '/tmp/stop-cross.flag';
try { fs.unlinkSync(FLAG); } catch(e) {}

// Process A: set the flag
execSync(`node -e "require('fs').writeFileSync('${FLAG}', 'STOP')"`);

// Process B: new process checks the flag
const out = execSync(`node -e "console.log(require('fs').existsSync('${FLAG}') ? 'STOPPED' : 'NOT_STOPPED')"` , { encoding: 'utf8' });
if (!out.includes('STOPPED')) {
  console.error('FAIL: cross-process STOP not observed');
  process.exit(1);
}
try { fs.unlinkSync(FLAG); } catch(e) {}
console.log('STOP cross-process test: PASS');
console.log('EXIT=0');