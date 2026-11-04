'use strict';
/**
 * Fail if any tracked file under testenv/evidence/ was modified in the worktree.
 * Tracked evidence is a fixed sample set; live output belongs in testenv/runs/.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../..');

function git(args) {
  return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

const diff = git(['diff', '--name-only', '--', 'testenv/evidence']);
const diffCached = git(['diff', '--cached', '--name-only', '--', 'testenv/evidence']);
const status = git(['status', '--porcelain', '--', 'testenv/evidence']);

if (diff.status !== 0 || diffCached.status !== 0 || status.status !== 0) {
  console.error('check-evidence-clean: git failed');
  process.exit(2);
}

const dirty = new Set(
  []
    .concat((diff.stdout || '').split('\n'))
    .concat((diffCached.stdout || '').split('\n'))
    .concat(
      (status.stdout || '')
        .split('\n')
        .map((l) => l.replace(/^[ MADRCU?!]{1,2} /, '').trim())
    )
    .map((s) => s.trim())
    .filter(Boolean)
);

if (dirty.size) {
  console.error('FAIL: tracked testenv/evidence/ files were modified (must stay fixed samples):');
  for (const f of [...dirty].sort()) console.error('  - ' + f);
  console.error('Write run output to testenv/runs/<timestamp>-<sha>/ instead.');
  process.exit(1);
}

console.log('PASS: tracked testenv/evidence/ is clean (fixed samples untouched).');
process.exit(0);
