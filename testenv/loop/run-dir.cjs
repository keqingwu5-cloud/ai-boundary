'use strict';
/**
 * Resolve (or create) a gitignored per-run output directory under testenv/runs/.
 * Reuse TESTENV_RUN_DIR when a parent (e.g. risk-tests) already opened one.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TESTENV_ROOT = path.resolve(__dirname, '..');
const RUNS_ROOT = path.join(TESTENV_ROOT, 'runs');

function repoGitCwd() {
  // Prefer the ai-boundary repo root (parent of testenv/); fall back to testenv/.
  const parent = path.resolve(TESTENV_ROOT, '..');
  const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: parent, encoding: 'utf8',
  });
  if (probe.status === 0) return (probe.stdout || '').trim() || parent;
  return TESTENV_ROOT;
}

function fullSha() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoGitCwd(), encoding: 'utf8',
  });
  return r.status === 0 ? (r.stdout || '').trim() : 'UNKNOWN';
}

function dirtyFlag() {
  const r = spawnSync('git', ['status', '--porcelain'], {
    cwd: repoGitCwd(), encoding: 'utf8',
  });
  if (r.status !== 0) return 'UNKNOWN';
  const out = (r.stdout || '').trim();
  // Ignore untracked runs/ noise when judging dirty for the manifest tip.
  const lines = out.split('\n').filter(Boolean).filter((l) => !/\s+testenv\/runs\//.test(l) && !/^\?\? testenv\/runs$/.test(l));
  return lines.length ? 'dirty' : 'clean';
}

function stampTaipei() {
  // YYYYMMDDTHHMMSS for directory names (Asia/Taipei wall clock).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}${g('month')}${g('day')}T${g('hour')}${g('minute')}${g('second')}`;
}

// Only direct children of testenv/runs may contain live output.
function ensureRunsRoot() {
  fs.mkdirSync(RUNS_ROOT, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(RUNS_ROOT);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('RUN_DIR_ROOT_UNSAFE');
  }
  return fs.realpathSync(RUNS_ROOT);
}

function verifyRunDir(input) {
  if (typeof input !== 'string' || !input.trim() ||
      input.split(/[\\/]/).includes('..')) {
    throw new Error('RUN_DIR_OUTSIDE_ROOT');
  }
  const rootReal = ensureRunsRoot();
  const candidate = path.resolve(input);
  const child = path.relative(RUNS_ROOT, candidate);
  if (!child || child === '.' || child === '..' ||
      child.startsWith('..' + path.sep) || path.isAbsolute(child) ||
      child.includes(path.sep)) {
    throw new Error('RUN_DIR_OUTSIDE_ROOT');
  }
  // An inherited run must already exist: risk-tests can reuse its own
  // child suite directory, but untrusted paths are never created.
  const stat = fs.lstatSync(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      fs.realpathSync(candidate) !== path.join(rootReal, child)) {
    throw new Error('RUN_DIR_SYMLINK_OR_NOT_DIRECTORY');
  }
  return candidate;
}

function resolveRunDir() {
  ensureRunsRoot();
  if (process.env.TESTENV_RUN_DIR) {
    return verifyRunDir(process.env.TESTENV_RUN_DIR);
  }
  const sha = fullSha();
  const short = sha === 'UNKNOWN' ? 'unknown' : sha.slice(0, 12);
  // mkdtemp uses atomic, exclusive directory creation with a random
  // suffix, preventing same-second / concurrent run name collisions.
  const dir = fs.mkdtempSync(path.join(RUNS_ROOT, stampTaipei() + '-' + short + '-'));
  verifyRunDir(dir);
  process.env.TESTENV_RUN_DIR = dir;
  return dir;
}

function writeManifest(runDir, {
  command,
  environment,
  counts,
  output_paths,
  scope, // 'local' | 'ci'
  extra,
} = {}) {
  runDir = verifyRunDir(runDir);
  const sha = fullSha();
  const manifest = {
    commit_sha: sha,
    dirty: dirtyFlag(),
    command: command || null,
    environment: environment || null,
    scope: scope || (process.env.TESTENV_CI_SKIP_R9 === '1' ? 'ci' : 'local'),
    counting_scope_note: {
      local: 'risk pack: 11 PASS / 1 BLOCKED / 1 NOT_RUN (R9 runs)',
      ci: 'risk pack: 10 PASS / 1 BLOCKED / 2 NOT_RUN (R9 skipped via TESTENV_CI_SKIP_R9)',
    },
    counts: counts || { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_RUN: 0 },
    output_paths: output_paths || [],
    written_at_taipei: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) + ' Asia/Taipei',
    run_dir: runDir,
    ...(extra || {}),
  };
  const p = path.join(runDir, 'manifest.json');
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + '\n');
  return { path: p, manifest };
}

module.exports = {
  TESTENV_ROOT,
  RUNS_ROOT,
  resolveRunDir,
  writeManifest,
  fullSha,
  dirtyFlag,
  repoGitCwd,
};
