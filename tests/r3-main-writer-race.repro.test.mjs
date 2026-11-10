/**
 * R3: deterministic reproduction of three *existing* main-branch writer risks.
 * IMPORTANT: passing here means KNOWN RISK REPRODUCED, not bug fixed.
 * Reads verbatim function bodies from the checked-out repo; invokes them only
 * against synthetic in-memory localStorage and tab contexts, never user data.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const MAIN_HEAD = 'd2ec331ea4fa68d5a2713f12f5d4706b8effb21a';
const EXPECTED = Object.freeze({
  'app.js': 'function save(now = false){',
  'memory.js': 'async function persist(){',
  'world-model.html': 'function getVerifyRows(){'
});
function source(path) {
  const s = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  if (!s.includes(EXPECTED[path])) throw Error('SOURCE_DRIFT_' + path);
  return s;
}
function between(text, begin, end) {
  const a = text.indexOf(begin);
  if (a < 0) throw Error('SOURCE_BEGIN_NOT_FOUND:' + begin);
  const b = text.indexOf(end, a + begin.length);
  if (b < 0 || b <= a) throw Error('SOURCE_END_NOT_FOUND:' + end);
  return text.slice(a, b);
}
class SyntheticStorage {
  constructor(items = {}) { this.m = new Map(Object.entries(items)); this.events = []; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); this.events.push({key:k,value:String(v)}); }
  removeItem(k) { this.m.delete(k); }
}
function appTab(storage, state) {
  // Execute the exact main app.js save() body, with synthetic per-tab state.
  const fragment = between(source('app.js'), 'function save(now = false){', 'const listeners = {};');
  const c = {
    state, undoStack:[], localStorage:storage,
    clearTimeout:()=>{}, setTimeout:()=>{throw Error('Unexpected async timer');},
    flashSaved:()=>{}, toast:()=>{}
  };
  vm.createContext(c);
  vm.runInContext(
    "const KEY='aiBrain.v1', UKEY='aiBrain.v1.undo'; let saveT=0;\n" +
    fragment + "\nglobalThis.runSave=()=>save(true);", c);
  return c;
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve=r; });
  return {promise, resolve};
}
function vaultTab(storage, ciphertextReady) {
  // Execute the exact main memory.js persist() body. Cryptography is replaced
  // with a deferred synthetic ciphertext to control the interleaving.
  const fragment = between(source('memory.js'), 'async function persist(){', 'function showLocked(){');
  const c = {
    localStorage:storage,
    stored:()=>storage.getItem('aiBoundary.privateMemory.v1'),
    encryptCurrent:()=>ciphertextReady.promise,
    utc:()=> 'SYNTHETIC_UTC',
    migrateMeta:()=>false
  };
  vm.createContext(c);
  vm.runInContext(
    "const STORE='aiBoundary.privateMemory.v1';\n" +
    "let observedEnvelope='SYNTHETIC_V0';\n" +
    "let state={vaultId:'SYNTHETIC_VAULT',revision:0,updatedAt:'SYNTHETIC_T0'};\n" +
    fragment + "\nglobalThis.runPersist=()=>persist();\n", c);
  return c;
}
async function reproduceGraphLostUpdate() {
  const initial = {nodes:['seed'],history:[]};
  const storage = new SyntheticStorage({'aiBrain.v1':JSON.stringify(initial)});
  const tabA=appTab(storage,{...initial,nodes:['seed','A']});
  const tabB=appTab(storage,{...initial,nodes:['seed','B']});
  tabA.runSave();
  assert(JSON.parse(storage.getItem('aiBrain.v1')).nodes.includes('A'));
  tabB.runSave(); // B holds stale initial snapshot.
  const final = JSON.parse(storage.getItem('aiBrain.v1'));
  assert(final.nodes.includes('B'));
  assert(!final.nodes.includes('A'));
  assert.equal(storage.events.filter(e=>e.key==='aiBrain.v1').length,2);
  return 'stale second tab silently replaced first tab change';
}
async function reproduceVaultAwaitRace() {
  const storage = new SyntheticStorage({
    'aiBoundary.privateMemory.v1':'SYNTHETIC_V0'
  });
  const holdA=deferred(), holdB=deferred();
  const tabA=vaultTab(storage,holdA);
  const tabB=vaultTab(storage,holdB);
  // Both pass the source code's stored() != observedEnvelope check before await.
  const pendingA=tabA.runPersist();
  const pendingB=tabB.runPersist();
  holdA.resolve('SYNTHETIC_CIPHERTEXT_A');
  await pendingA;
  assert.equal(storage.getItem('aiBoundary.privateMemory.v1'),'SYNTHETIC_CIPHERTEXT_A');
  holdB.resolve('SYNTHETIC_CIPHERTEXT_B');
  await pendingB;
  assert.equal(storage.getItem('aiBoundary.privateMemory.v1'),'SYNTHETIC_CIPHERTEXT_B');
  return 'two tabs both passed pre-await comparison; later completion overwrote first ciphertext';
}
async function reproduceWorldHistoryOverwrite() {
  const storage=new SyntheticStorage();
  const fragment=between(source('world-model.html'),
    'function getVerifyRows(){','function verifiedRender(){');
  const c={localStorage:storage};vm.createContext(c);
  vm.runInContext("const VERIFY_KEY='worldModel.verify.v1';\n" +
    fragment + "\nglobalThis.readRows=getVerifyRows;globalThis.saveRows=saveVerifyRows;",c);
  const original=[{id:'case-1',hypothesis:'PREDICTION_ORIGINAL',status:'待驗證'}];
  const altered=[{id:'case-1',hypothesis:'PREDICTION_ORIGINAL',status:'假設被反例推翻（自評）'}];
  assert.equal(c.saveRows(original),true);
  assert.equal(c.saveRows(altered),true);
  const now=JSON.stringify(c.readRows());
  assert(now.includes('假設被反例推翻（自評）'));
  assert(!now.includes('待驗證'));
  assert.equal(storage.events.filter(e=>e.key==='worldModel.verify.v1').length,2);
  assert.equal(storage.m.size,1);
  return 'current v1 record has only the latest row; no version event retained in this key';
}
async function run() {
  const scenarios=[
    ['GRAPH_STALE_WRITER',reproduceGraphLostUpdate],
    ['ENCRYPTED_VAULT_ASYNC_RACE',reproduceVaultAwaitRace],
    ['WORLD_MODEL_MUTABLE_HISTORY',reproduceWorldHistoryOverwrite]
  ];
  const results=[];
  for(const [id,fn] of scenarios) {
    try {
      const detail=await fn();
      results.push({id,status:'KNOWN_RISK_REPRODUCED',detail});
      console.log('KNOWN_RISK_REPRODUCED: '+id+' — '+detail);
    } catch(err) {
      console.error('REPRO_FAILED: '+id+' — '+String(err?.stack||err));
      process.exitCode=1;
      results.push({id,status:'REPRO_FAILED'});
    }
  }
  const found=results.filter(r=>r.status==='KNOWN_RISK_REPRODUCED').length;
  console.log('R3_SUMMARY: '+found+'/'+scenarios.length+
    ' known-risk cases reproduced at main baseline '+MAIN_HEAD+
    ' (NOT FIXED; NO REAL DATA; NOT AN INDEPENDENT BOT REVIEW)');
  if(found!==scenarios.length)process.exitCode=1;
}
await run();
