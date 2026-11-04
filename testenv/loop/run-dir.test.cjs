'use strict';
// Negative tests: local, no services, secrets, cloud, or production data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { RUNS_ROOT, resolveRunDir, writeManifest } = require('./run-dir.cjs');

function withoutInheritedRun(fn) {
  const old = process.env.TESTENV_RUN_DIR;
  try {
    delete process.env.TESTENV_RUN_DIR;
    return fn();
  } finally {
    if (old === undefined) delete process.env.TESTENV_RUN_DIR;
    else process.env.TESTENV_RUN_DIR = old;
  }
}

test('fresh runs never collide; inherited run can be intentionally reused', () => {
  const dirs = withoutInheritedRun(() => {
    const a = resolveRunDir();
    delete process.env.TESTENV_RUN_DIR;
    const b = resolveRunDir();
    assert.notEqual(a, b);
    assert.equal(path.dirname(a), RUNS_ROOT);
    assert.equal(path.dirname(b), RUNS_ROOT);
    process.env.TESTENV_RUN_DIR = a;
    assert.equal(resolveRunDir(), a);
    const saved = writeManifest(a, { command: 'synthetic-run-test', scope: 'ci' });
    assert.equal(saved.manifest.run_dir, a);
    assert.ok(fs.existsSync(path.join(a, 'manifest.json')));
    return [a, b];
  });
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

test('parallel processes use separate run paths, never one shared manifest', async () => {
  const modulePath = path.join(__dirname, 'run-dir.cjs');
  const env = { ...process.env };
  delete env.TESTENV_RUN_DIR;
  const script = 'process.stdout.write(require(process.argv[1]).resolveRunDir())';
  const launch = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script, modulePath], { env });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) :
      reject(new Error('run child failed: ' + stderr)));
  });
  const dirs = await Promise.all(Array.from({ length: 6 }, launch));
  try {
    assert.equal(new Set(dirs).size, dirs.length);
    for (const dir of dirs) {
      assert.equal(path.dirname(dir), RUNS_ROOT);
      assert.ok(fs.statSync(dir).isDirectory());
    }
  } finally {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('external, nested, traversal and nonexisting inherited paths fail closed', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'f05-outside-'));
  try {
    for (const unsafe of [
      path.join(__dirname, '../evidence'),
      outside,
      path.join(RUNS_ROOT, 'child', 'nested'),
      path.join(RUNS_ROOT, 'missing-inherited-' + process.pid),
      path.join(RUNS_ROOT, '..', 'evidence'),
    ]) {
      const old = process.env.TESTENV_RUN_DIR;
      try {
        process.env.TESTENV_RUN_DIR = unsafe;
        assert.throws(() => resolveRunDir(), /RUN_DIR_OUTSIDE_ROOT|ENOENT/);
        assert.throws(() => writeManifest(unsafe, { scope: 'ci' }),
          /RUN_DIR_OUTSIDE_ROOT|ENOENT/);
      } finally {
        if (old === undefined) delete process.env.TESTENV_RUN_DIR;
        else process.env.TESTENV_RUN_DIR = old;
      }
    }
    assert.equal(fs.existsSync(path.join(outside, 'manifest.json')), false);
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('inherited symlink under runs cannot redirect saved evidence', () => {
  fs.mkdirSync(RUNS_ROOT, { recursive: true });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'f05-link-target-'));
  const link = path.join(RUNS_ROOT, 'unsafe-link-' + process.pid);
  try {
    fs.symlinkSync(outside, link, 'dir');
    const old = process.env.TESTENV_RUN_DIR;
    try {
      process.env.TESTENV_RUN_DIR = link;
      assert.throws(() => resolveRunDir(), /RUN_DIR_SYMLINK_OR_NOT_DIRECTORY/);
      assert.throws(() => writeManifest(link), /RUN_DIR_SYMLINK_OR_NOT_DIRECTORY/);
      assert.equal(fs.existsSync(path.join(outside, 'manifest.json')), false);
    } finally {
      if (old === undefined) delete process.env.TESTENV_RUN_DIR;
      else process.env.TESTENV_RUN_DIR = old;
    }
  } finally {
    if (fs.existsSync(link)) fs.unlinkSync(link);
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
