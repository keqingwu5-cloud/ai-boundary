import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const get = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const app = get('app.js');

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

function runFullBoot(store) {
  const c = {
    localStorage: store,
    console,
    clearTimeout: () => {},
    setTimeout: (fn, ms) => { setTimeout(fn, ms || 0); return 1; },
    toast: () => {},
    flashSaved: () => {},
    lockedCompareWrite: async (opts) => {
      if (opts && opts.produce) {
        const val = await opts.produce();
        store.setItem(opts.key, val);
        if (opts.afterWrite) opts.afterWrite();
        return { ok: true, raw: val };
      }
      return { ok: false, reason: 'MOCK_FAIL' };
    }
  };
  vm.createContext(c);

  const validFn = extractBetween(app, 'function valid(s){', '/* R3-C01');
  const loadAndVars = extractBetween(app, 'let graphObservedRaw = null', '/* concept layer migration');
  const bootTail = extractBetween(app, 'let state = migrate(load() || seedState());', 'const listeners = {};');

  vm.runInContext(`
    const KEY = 'aiBrain.v1', UKEY = 'aiBrain.v1.undo';
    ${validFn}
    ${loadAndVars}
    function seedState(){ return { version:1, brains:[{id:'main'}], nodes:[], links:[], history:[] }; }
    function migrate(st){ return st; }
    ${bootTail}
    globalThis.bootResult = {
      reason: graphBootReason,
      blocked: graphWriterBlocked,
      raw: graphObservedRaw,
      queue: graphWriteQueue
    };
  `, c);
  return c.bootResult;
}

async function settle(result) {
  if (result && result.queue && typeof result.queue.then === 'function') {
    try { await result.queue; } catch(e){}
  }
  await new Promise(r => setTimeout(r, 80));
  await new Promise(r => setTimeout(r, 0));
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('PASS: ' + name);
  } catch (err) {
    console.error('FAIL: ' + name);
    console.error(err?.stack || err);
    process.exitCode = 1;
  }
}

await test('A01 NO_EXISTING_RECORD seeds', async () => {
  const s = new Store();
  const r = runFullBoot(s);
  await settle(r);
  assert.equal(r.reason, 'NO_EXISTING_RECORD');
  assert.equal(r.blocked, false);
});

await test('A02 bad JSON + undo preserved, no writes', async () => {
  const bad = '{"brains":[BROKEN';
  const undo = JSON.stringify([{id:'u1'},{id:'u2'}]);
  const s = new Store({'aiBrain.v1': bad, 'aiBrain.v1.undo': undo});
  const before = s.events.length;
  const r = runFullBoot(s);
  await settle(r);
  assert.equal(r.reason, 'EXISTING_INVALID');
  assert.equal(r.blocked, true);
  assert.equal(s.getItem('aiBrain.v1'), bad);
  assert.equal(s.getItem('aiBrain.v1.undo'), undo);
  assert.equal(s.events.length, before, 'expected zero writes after settle');
});

await test('A03 missing main + undo preserved, no writes', async () => {
  const bad = '{"brains":[],"nodes":[],"links":[],"history":[]}';
  const undo = '[{"ts":1}]';
  const s = new Store({'aiBrain.v1': bad, 'aiBrain.v1.undo': undo});
  const r = runFullBoot(s);
  await settle(r);
  assert.equal(r.reason, 'EXISTING_INVALID');
  assert.equal(r.blocked, true);
  assert.equal(s.getItem('aiBrain.v1'), bad);
  assert.equal(s.getItem('aiBrain.v1.undo'), undo);
  assert.equal(s.events.filter(e => e.op === 'setItem' || e.op === 'removeItem').length, 0);
});

await test('A04 READ_UNAVAILABLE leaves undo untouched', async () => {
  const undo = '[{"safe":true}]';
  const s = new Store({'aiBrain.v1.undo': undo});
  s.badReads = true;
  const r = runFullBoot(s);
  await settle(r);
  s.badReads = false;
  assert.equal(r.reason, 'READ_UNAVAILABLE');
  assert.equal(r.blocked, true);
  assert.equal(s.getItem('aiBrain.v1.undo'), undo);
  assert.equal(s.events.length, 0);
});

await test('A05 structural guards present', async () => {
  assert.ok(app.includes('if(!graphWritable()) return'));
  assert.ok(app.includes('graphWriterBlocked'));
});

await test('A06 download path present (full jsdom NOT_RUN)', async () => {
  assert.ok(app.includes('new Blob([graphObservedRaw]'));
  assert.ok(app.includes('ai-brain-original-unreadable.txt'));
  console.log('  A06 full jsdom click+byte compare = NOT_RUN; Safari=NOT_RUN');
});

await test('A07 BLOCKED_RECOVERY_PATH', async () => {
  assert.ok(app.includes('function importJSON'));
  console.log('  A07: BLOCKED_RECOVERY_PATH');
  console.log('  W001-B (not implemented): explicit restore with snapshot/readback.');
});

await test('A08 additive baseline note', async () => {
  console.log('  A08: existing r3 tests must remain green in CI.');
});

console.log(`\\nW001 tests: ${passed} passed`);
