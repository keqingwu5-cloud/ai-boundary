// Network namespace isolation test
// Fails if unshare cannot create a network namespace.
import { execSync } from 'node:child_process';

try {
  const out = execSync('unshare --net -- bash -c "echo inside_netns && cat /proc/net/dev | head -1"', { encoding: 'utf8', timeout: 5000 });
  if (!out.includes('inside_netns')) {
    console.error('FAIL: did not enter netns');
    process.exit(1);
  }
  console.log('netns isolation test: PASS');
  console.log('EXIT=0');
} catch (e) {
  console.error('FAIL: unshare --net failed:', e.message);
  process.exit(1);
}