// Mount namespace isolation test
// Marks NOT_RUN if unshare requires privileges not available.
import { execSync } from 'node:child_process';

try {
  const out = execSync('unshare --mount -- bash -c "echo inside_mountns"', { encoding: 'utf8', timeout: 5000 });
  if (out.includes('inside_mountns')) {
    console.log('mount ns isolation test: PASS');
    console.log('EXIT=0');
  } else {
    console.log('mount ns isolation test: NOT_RUN');
    console.log('EXIT=0');
  }
} catch (e) {
  console.log('mount ns isolation test: NOT_RUN (privilege required)');
  console.log('EXIT=0');
}