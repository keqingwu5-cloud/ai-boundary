// Mount namespace isolation test
// Fails if unshare cannot create a mount namespace.
import { execSync } from 'node:child_process';

try {
  const out = execSync('unshare --mount -- bash -c "echo inside_mountns"', { encoding: 'utf8', timeout: 5000 });
  if (!out.includes('inside_mountns')) {
    console.error('FAIL: did not enter mount ns');
    process.exit(1);
  }
  console.log('mount ns isolation test: PASS');
  console.log('EXIT=0');
} catch (e) {
  console.error('FAIL: unshare --mount failed:', e.message);
  process.exit(1);
}