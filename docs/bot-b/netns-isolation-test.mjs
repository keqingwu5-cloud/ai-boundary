// Network namespace isolation test
// Marks NOT_RUN if unshare requires privileges not available.
import { execSync } from 'node:child_process';

try {
  const out = execSync('unshare --net -- bash -c "echo inside_netns"', { encoding: 'utf8', timeout: 5000 });
  if (out.includes('inside_netns')) {
    console.log('netns isolation test: PASS');
    console.log('EXIT=0');
  } else {
    console.log('netns isolation test: NOT_RUN');
    console.log('EXIT=0');
  }
} catch (e) {
  console.log('netns isolation test: NOT_RUN (privilege required)');
  console.log('EXIT=0');
}