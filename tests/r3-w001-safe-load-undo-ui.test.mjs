import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const get = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = get('app.js');

const counts = { PASS: 0, FAIL: 0, NOT_RUN: 0, BLOCKED: 0 };

class Store {
  constructor(data = {}) {
    this.map = new Map(Object.entries(data));
    this.events = [];
    this.badReads = false;
  }
  getItem(key) {
    if (this.badReads) throw Error('storage_access_denied');
    return this.map.get(key) ?? null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
    this.events.push({ op: 'setItem', key, value: String(value) });
  }
  removeItem(key) {
    this.map.delete(key);
    this.events.push({ op: 'removeItem', key });
  }
}

function extractBetween(src, startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  const j = src.indexOf(endMarker, i + startMarker.length);
  if (i < 0 || j < i) throw new Error('marker not found: ' + startMarker);
  return src.slice(i, j);
}

function runFullBoot(store, opts = {}) {
  const toasts = [];
  const flashes = [];
  const c = {
    localStorage: store,
    console,
    clearTimeout: () => {},
    setTimeout: (fn, ms) => { setTimeout(fn, ms || 0); return 1; },
    toast: (msg) => { toasts.push(String(msg)); },
    flashSaved: () => { flashes.push(true); },
    lockedCompareWrite: async (o) => {
      if (opts.failWrite) {
        if (opts.failWrite === 'afterWrite') {
          const val = o && o.produce ? await o.produce() : '{}';
          store.setItem(o.key, val);
          throw new Error('afterWrite_forced_fail');
        }
        return { ok: false, reason: 'FORCED_FAIL' };
      }
      if (o && o.produce) {
        const val = await o.produce();
        store.setItem(o.key, val);
        if (o.afterWrite) o.afterWrite();
        return { ok: true, raw: val };
      }
      return { ok: false, reason: 'MOCK_FAIL' };
    }
  };
  vm.createContext(c);

  const validFn = extractBetween(app, 'function valid(s){', '/* R3-C01');
  const loadAndVars = extractBetween(app, 'let graphObservedRaw = null', '/* concept layer migration');
  const bootTail = extractBetween(app, 'let state = migrate(load() || seedState());', 'const listeners = {};');
  // Also extract mutate / resetAll / save for post-boot calls
  const mutateFn = extractBetween(app, 'function mutate(action, payload, fn){', 'const N = id =>');
  const resetFn = extractBetween(app, 'function resetAll(){', 'function importJSON');

  vm.runInContext(`
    const KEY = 'aiBrain.v1', UKEY = 'aiBrain.v1.undo';
    ${validFn}
    ${loadAndVars}
    function seedState(){ return { version:1, brains:[{id:'main'}], nodes:[], links:[], history:[] }; }
    function migrate(st){ return st; }
    ${bootTail}
    ${mutateFn}
    ${resetFn}
    globalThis.bootResult = {
      reason: graphBootReason,
      blocked: graphWriterBlocked,
      raw: graphObservedRaw,
      queue: graphWriteQueue
    };
    globalThis.tryMutate = () => mutate('add', {}, () => { state.nodes.push({id:'SHOULD_NOT_APPEAR'}); });
    globalThis.tryReset = () => resetAll();
    globalThis.trySave = () => save(true);
  `, c);
  return { result: c.bootResult, toasts, flashes, store, ctx: c };
}

async function settle(result) {
  if (result && result.queue && typeof result.queue.then === 'function') {
    try { await result.queue; } catch(e){}
  }
  await new Promise(r => setTimeout(r, 80));
}

async function test(name, fn) {
  try {
    const status = await fn();
    if (status === 'NOT_RUN') { counts.NOT_RUN++; console.log('NOT_RUN: ' + name); }
    else if (status === 'BLOCKED') { counts.BLOCKED++; console.log('BLOCKED: ' + name); }
    else { counts.PASS++; console.log('PASS: ' + name); }
  } catch (err) {
    counts.FAIL++;
    console.error('FAIL: ' + name);
    console.error(err?.stack || err);
    process.exitCode = 1;
  }
}

await test('A01 NO_EXISTING_RECORD + compact undo array seeds, preserves undo, shows prompt, writer not locked', async () => {
  // App-produced format: compact JSON array, <=12 entries
  const undo = JSON.stringify([{id:'u1',ts:1},{id:'u2',ts:2},{id:'u3',ts:3}]);
  const s = new Store({ 'aiBrain.v1.undo': undo });
  const { result, toasts } = runFullBoot(s);
  await settle(result);
  assert.equal(result.reason, 'NO_EXISTING_RECORD');
  assert.equal(result.blocked, false, 'writer must not be locked');
  const seeded = s.getItem('aiBrain.v1');
  assert.ok(seeded, 'seed must be written');
  const parsed = JSON.parse(seeded);
  assert.ok(parsed && Array.isArray(parsed.brains) && parsed.brains.some(b => b.id === 'main'), 'seeded state must be valid');
  assert.equal(s.getItem('aiBrain.v1.undo'), undo, 'undo bytes must be unchanged');
  assert.ok(toasts.includes('舊歷史尚未核對'), 'must show the exact prompt');
  const errorToasts = toasts.filter(t => /TypeError|slice is not a function|異常|失敗/i.test(t));
  assert.equal(errorToasts.length, 0, 'no error toasts');
});

await test('A01-reverse forced write failure makes positive A01 conditions fail', async () => {
  const undo = JSON.stringify([{id:'u1',ts:1},{id:'u2',ts:2}]);
  const s = new Store({ 'aiBrain.v1.undo': undo });
  const { result } = runFullBoot(s, { failWrite: true });
  await settle(result);
  // Positive A01 conditions must NOT hold
  const seeded = s.getItem('aiBrain.v1');
  let seedOk = false;
  if (seeded) {
    try {
      const p = JSON.parse(seeded);
      seedOk = !!(p && Array.isArray(p.brains) && p.brains.some(b => b.id === 'main'));
    } catch(e) { seedOk = false; }
  }
  assert.equal(seedOk, false, 'seed must not be validly written when write is forced to fail');
  assert.equal(!!seeded, false, 'no seed key should be present');
  assert.equal(s.getItem('aiBrain.v1.undo'), undo, 'undo must still be untouched');
  console.log('  A01-reverse: real boot with failing writer → positive A01 conditions do not hold');
});

await test('A02 bad JSON + undo preserved, zero events', async () => {
  const bad = '{"brains":[BROKEN';
  const undo = '[{"id":"u1"}]';
  const s = new Store({ 'aiBrain.v1': bad, 'aiBrain.v1.undo': undo });
  const before = s.events.length;
  const { result } = runFullBoot(s);
  await settle(result);
  assert.equal(result.reason, 'EXISTING_INVALID');
  assert.equal(result.blocked, true);
  assert.equal(s.getItem('aiBrain.v1'), bad);
  assert.equal(s.getItem('aiBrain.v1.undo'), undo);
  assert.equal(s.events.filter(e => e.op === 'setItem' || e.op === 'removeItem').length, 0);
  assert.equal(s.events.length, before);
});

await test('A03 missing main + undo preserved, zero events', async () => {
  const bad = '{"brains":[],"nodes":[],"links":[],"history":[]}';
  const undo = '[{"ts":1}]';
  const s = new Store({ 'aiBrain.v1': bad, 'aiBrain.v1.undo': undo });
  const { result } = runFullBoot(s);
  await settle(result);
  assert.equal(result.reason, 'EXISTING_INVALID');
  assert.equal(s.getItem('aiBrain.v1'), bad);
  assert.equal(s.getItem('aiBrain.v1.undo'), undo);
  assert.equal(s.events.filter(e => e.op === 'setItem' || e.op === 'removeItem').length, 0);
});

await test('A04 READ_UNAVAILABLE leaves undo untouched, zero events', async () => {
  const undo = '[{"safe":true}]';
  const s = new Store({ 'aiBrain.v1.undo': undo });
  s.badReads = true;
  const { result } = runFullBoot(s);
  await settle(result);
  s.badReads = false;
  assert.equal(result.reason, 'READ_UNAVAILABLE');
  assert.equal(result.blocked, true);
  assert.equal(s.getItem('aiBrain.v1.undo'), undo);
  assert.equal(s.events.filter(e => e.op === 'setItem' || e.op === 'removeItem').length, 0);
});

await test('A05 post-boot mutate/reset/save are blocked', async () => {
  const bad = '{"bad';
  const s = new Store({ 'aiBrain.v1': bad });
  const { result, flashes, toasts, ctx } = runFullBoot(s);
  await settle(result);
  const before = s.events.length;
  const m = ctx.tryMutate();
  const r = ctx.tryReset();
  ctx.trySave();
  await settle(result);
  assert.equal(m, false);
  assert.equal(s.events.length, before);
  assert.equal(flashes.length, 0);
  const success = toasts.filter(t => /已確認儲存|完成儲存|saved/i.test(t));
  assert.equal(success.length, 0);
});

await test('A06 real graphRawBackup handler downloads exact bytes', async () => {
  const original = '{"unreadable":true,"raw":1}';
  const s = new Store({ 'aiBrain.v1': original });
  const { result } = runFullBoot(s);
  await settle(result);
  assert.equal(result.raw, original);

  const handlerSrc = extractBetween(app,
    "const rawExport = document.getElementById('graphRawBackup');",
    "showGraphWriteStatus();\n");

  let capturedBlob = null;
  const fakeA = { click(){}, remove(){}, href:'', download:'' };
  const btn = {
    addEventListener(ev, fn) { if (ev === 'click') this._fn = fn; },
    click() { if (this._fn) this._fn(); }
  };
  const fakeDoc = {
    getElementById(id) { return id === 'graphRawBackup' ? btn : null; },
    createElement() { return fakeA; },
    body: { appendChild() {} }
  };
  const c = {
    document: fakeDoc,
    Blob: class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
    URL: { createObjectURL(b) { capturedBlob = b; return 'blob:fake'; }, revokeObjectURL() {} },
    setTimeout: (fn) => { fn(); return 1; },
    graphObservedRaw: original,
    graphBootReason: 'EXISTING_INVALID'
  };
  vm.createContext(c);
  vm.runInContext(handlerSrc, c);
  btn.click();

  assert.ok(capturedBlob !== null, 'Blob must be created');
  const got = capturedBlob.parts ? capturedBlob.parts[0] : String(capturedBlob);
  assert.equal(got, original);
  assert.equal(fakeA.download, 'ai-brain-original-unreadable.txt');

  // Counter-example
  capturedBlob = null;
  fakeA.download = '';
  const btn2 = { addEventListener(ev, fn){ if(ev==='click') this._fn=fn; }, click(){ if(this._fn) this._fn(); } };
  const c2 = { ...c, graphBootReason: 'EXISTING_VALID', document: { getElementById(id){ return id==='graphRawBackup'?btn2:null; }, createElement(){ return fakeA; }, body:{ appendChild(){} } } };
  vm.createContext(c2);
  vm.runInContext(handlerSrc, c2);
  btn2.click();
  assert.equal(capturedBlob, null);

  console.log('  A06: real handler byte match OK (Safari=NOT_RUN)');
});

await test('A06-Safari', async () => {
  console.log('  A06 Safari real-device: NOT_RUN');
  return 'NOT_RUN';
});

await test('A07 BLOCKED_RECOVERY_PATH', async () => {
  console.log('  A07: BLOCKED_RECOVERY_PATH (W001-B)');
  return 'BLOCKED';
});

await test('A08 three #158 regressions exit 0', async () => {
  const { spawnSync } = await import('node:child_process');
  const tests = [
    'tests/r3-rootcause-userflow.test.mjs',
    'tests/r3-protected-writers.test.mjs',
    'tests/r3-vault-restore-stages.test.mjs'
  ];
  for (const t of tests) {
    const r = spawnSync('node', [t], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
    console.log(`  ${t}: exit=${r.status}`);
    assert.equal(r.status, 0, t + ' must exit 0');
  }
});

console.log(`\\nSUMMARY: PASS=${counts.PASS} FAIL=${counts.FAIL} NOT_RUN=${counts.NOT_RUN} BLOCKED=${counts.BLOCKED}`);
