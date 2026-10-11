// scripts/bump_version.sh 必須是冪等的：只取代版本字串，從不插入第二份版本檢查 <script> 或 importmap。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'feed.html'];
function sandbox() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-'));
  fs.mkdirSync(path.join(d, 'scripts'));
  fs.copyFileSync(path.join(ROOT, 'scripts/bump_version.sh'), path.join(d, 'scripts/bump_version.sh'));
  for (const f of [...PAGES, 'version.json']) fs.copyFileSync(path.join(ROOT, f), path.join(d, f));
  return d;
}
const run = (d, v) => spawnSync('bash', [path.join(d, 'scripts/bump_version.sh'), v], { encoding:'utf8' });
const count = (s, re) => (s.match(re) || []).length;
const tokens = s => [...s.matchAll(/(?:\.(?:js|css|json|mjs)\?v=|window\.__V=")([0-9A-Za-z._-]+)/g)].map(m => m[1]);

test('repo 裡每頁剛好一份版本檢查 <script>、最多一份 importmap', () => {
  for (const f of PAGES) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.equal(count(s, /window\.__V="/g), 1, f + ' window.__V');
    assert.ok(count(s, /<script type="importmap">/g) <= 1, f + ' importmap');
  }
});

test('跑兩次：每頁還是剛好一份，所有版本字串都換成最後那次', () => {
  const d = sandbox();
  const before = Object.fromEntries(PAGES.map(f => [f, fs.readFileSync(path.join(d, f), 'utf8')]));
  assert.equal(run(d, '20990101000001').status, 0);
  assert.equal(run(d, '20990101000002').status, 0);
  for (const f of PAGES) {
    const s = fs.readFileSync(path.join(d, f), 'utf8');
    assert.equal(count(s, /window\.__V="/g), 1, f);
    assert.equal(count(s, /<script type="importmap">/g), count(before[f], /<script type="importmap">/g), f);
    assert.equal(s.split('\n').length, before[f].split('\n').length, f + ' 行數不變');
    const t = tokens(s); assert.ok(t.length > 0); assert.deepEqual([...new Set(t)], ['20990101000002'], f);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'version.json'), 'utf8')).v, '20990101000002');
  // 同一個版本再跑一次：檔案完全不變
  const snap = PAGES.map(f => fs.readFileSync(path.join(d, f), 'utf8'));
  assert.equal(run(d, '20990101000002').status, 0);
  assert.deepEqual(PAGES.map(f => fs.readFileSync(path.join(d, f), 'utf8')), snap);
});

test('main 那種非純數字版本（20261012openness01）整段換掉，不留尾巴', () => {
  const d = sandbox();
  for (const f of PAGES) { const p = path.join(d, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/(\?v=|window\.__V=")[0-9A-Za-z._-]+/g, '$120261012openness01')); }
  assert.equal(run(d, '20990101000003').status, 0);
  for (const f of PAGES) { const s = fs.readFileSync(path.join(d, f), 'utf8'); assert.ok(!s.includes('openness01'), f); assert.deepEqual([...new Set(tokens(s))], ['20990101000003']); }
});

test('已經重複的頁面：報錯、不改任何檔案', () => {
  const d = sandbox(); const p = path.join(d, 'index.html');
  const s = fs.readFileSync(p, 'utf8'); const line = s.split('\n').find(l => l.includes('window.__V="'));
  fs.writeFileSync(p, s.replace(line, line + '\n' + line));
  const dup = fs.readFileSync(p, 'utf8'); const vj = fs.readFileSync(path.join(d, 'version.json'), 'utf8');
  const r = run(d, '20990101000004');
  assert.notEqual(r.status, 0); assert.match(r.stderr, /window\.__V/);
  assert.equal(fs.readFileSync(p, 'utf8'), dup); assert.equal(fs.readFileSync(path.join(d, 'version.json'), 'utf8'), vj);
});
