/**
 * R3 protected-source regression: uses actual checked-out functions.
 * PASS = a candidate rejects deterministic stale/overlapping writes.
 * Not an independently reviewed browser / Safari / legacy-tab migration test.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { lockedCompareWrite } from '../r3-writer-guard.mjs';

const getSource=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const between=(src,a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
  if(i<0||j<i)throw Error('SOURCE_EXTRACT_INVALID '+a);return src.slice(i,j);};
class Store {
  constructor(init={}){this.data=new Map(Object.entries(init));this.events=[];}
  getItem(k){return this.data.has(k)?this.data.get(k):null;}
  setItem(k,v){this.data.set(k,String(v));this.events.push([k,String(v)]);}
}
class Locks {
  constructor(){this.taken=new Set();}
  async request(name,opts,fn){
    assert.equal(opts.mode,'exclusive');assert.equal(opts.ifAvailable,true);
    if(this.taken.has(name))return await fn(null);
    this.taken.add(name);
    try{return await fn({name});}
    finally{this.taken.delete(name);}
  }
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{resolve,promise};}
const sourceApp=getSource('app.js'),sourceMemory=getSource('memory.js');
assert(sourceApp.includes("import { lockedCompareWrite } from './r3-writer-guard.mjs'"));
assert(sourceMemory.includes('async function withVaultWriter(work){'));
assert(sourceMemory.includes('await withVaultWriter(async()=>{'));
assert(sourceMemory.includes('if(stored()!==previous)throw Error("還原確認期間其他分頁已更動記憶庫；拒絕覆蓋。")'));

function graphTab(storage,locks,state){
  const fragment=between(sourceApp,'let saveT = 0;','\nsave(true);');
  const c={localStorage:storage,lockedCompareWrite,navigator:{locks},
    graphObservedRaw:storage.getItem('aiBrain.v1'), graphBootReason:'EXISTING_VALID',
    undoStack:[],state,clearTimeout:()=>{},setTimeout:()=>{throw Error('unexpected timer');},
    flashSaved:()=>{},toast:()=>{}};
  vm.createContext(c);
  vm.runInContext(
    "const KEY='aiBrain.v1', UKEY='aiBrain.v1.undo';\n"+
    fragment+"\nglobalThis.runSave=()=>save(true);"+
    "\nglobalThis.whenSaved=()=>graphWriteQueue;"+
    "\nglobalThis.isBlocked=()=>graphWriterBlocked;",c);
  return c;
}
function vaultTab(storage,locks,hold){
  const fragment=between(sourceMemory,'/* R3: same cooperative Web Lock','function showLocked(){');
  const c={localStorage:storage,navigator:{locks},
    stored:()=>storage.getItem('aiBoundary.privateMemory.v1'),
    encryptCurrent:()=>hold.promise,utc:()=> 'SYNTHETIC_T1',migrateMeta:()=>false};
  vm.createContext(c);
  vm.runInContext(
    "const STORE='aiBoundary.privateMemory.v1';"+
    "let observedEnvelope='SYNTHETIC_V0';"+
    "let state={vaultId:'SYNTHETIC_VAULT',revision:0,updatedAt:'SYNTHETIC_T0'};"+
    fragment+"\nglobalThis.runPersist=()=>persist();",c);
  return c;
}
let pass=0;
async function test(name,fn){try{await fn();pass++;console.log('PASS '+name);}
 catch(e){console.error('FAIL '+name+': '+(e?.stack||e));process.exitCode=1;}}
await test('GRAPH_STALE_WRITER now refuses tab B overwrite',async()=>{
  const storage=new Store({'aiBrain.v1':JSON.stringify({nodes:['seed'],history:[]})}),locks=new Locks();
  const A=graphTab(storage,locks,{nodes:['seed','A'],history:[]});
  const B=graphTab(storage,locks,{nodes:['seed','B'],history:[]});
  A.runSave();await A.whenSaved();
  B.runSave();await B.whenSaved();
  assert.equal(B.isBlocked(),true);
  const nodes=JSON.parse(storage.getItem('aiBrain.v1')).nodes;
  assert.deepEqual(nodes,['seed','A']);
  assert.equal(storage.events.filter(x=>x[0]==='aiBrain.v1').length,1);
});
await test('GRAPH guard fails closed with unavailable Web Locks',async()=>{
  const original=JSON.stringify({nodes:['seed'],history:[]}),storage=new Store({'aiBrain.v1':original});
  const A=graphTab(storage,null,{nodes:['seed','A'],history:[]});
  A.runSave();await A.whenSaved();
  assert.equal(A.isBlocked(),true);
  assert.equal(storage.getItem('aiBrain.v1'),original);
});
await test('GRAPH guard rejects external mutation during awaited produce',async()=>{
  const storage=new Store({x:'V0'}),locks=new Locks(),hold=deferred();
  const promise=lockedCompareWrite({storage,locks,key:'x',expectedRaw:'V0',
    lockName:'x.writer',produce:()=>hold.promise});
  // A legacy writer ignores our lock; post-await stale check must still reject.
  storage.setItem('x','LEGACY_V1');
  hold.resolve('CANDIDATE_V1');
  const out=await promise;
  assert.equal(out.ok,false);assert.equal(out.reason,'STALE_WRITER');
  assert.equal(storage.getItem('x'),'LEGACY_V1');
});
await test('VAULT async cross-tab collision refuses B before overwrite',async()=>{
  const storage=new Store({'aiBoundary.privateMemory.v1':'SYNTHETIC_V0'}),locks=new Locks();
  const hA=deferred(),hB=deferred();
  const A=vaultTab(storage,locks,hA),B=vaultTab(storage,locks,hB);
  const pA=A.runPersist();const pB=B.runPersist();
  await assert.rejects(pB,/writer_busy/);
  hA.resolve('CIPHER_A');
  await pA;
  assert.equal(storage.getItem('aiBoundary.privateMemory.v1'),'CIPHER_A');
  assert.equal(storage.events.filter(x=>x[0]==='aiBoundary.privateMemory.v1').length,1);
});
await test('VAULT after completion stale tab B cannot overwrite A',async()=>{
  const storage=new Store({'aiBoundary.privateMemory.v1':'SYNTHETIC_V0'}),locks=new Locks();
  const ha=deferred(),hb=deferred();
  const A=vaultTab(storage,locks,ha),B=vaultTab(storage,locks,hb);
  const pa=A.runPersist();ha.resolve('CIPHER_A');await pa;
  const pb=B.runPersist();
  await assert.rejects(pb,/其他分頁已修改記憶庫/);
  assert.equal(storage.getItem('aiBoundary.privateMemory.v1'),'CIPHER_A');
});
await test('VAULT cannot write with missing Web Locks',async()=>{
  const storage=new Store({'aiBoundary.privateMemory.v1':'SYNTHETIC_V0'});
  const hold=deferred(),A=vaultTab(storage,null,hold);
  await assert.rejects(A.runPersist(),/writer_lock_unavailable/);
  assert.equal(storage.getItem('aiBoundary.privateMemory.v1'),'SYNTHETIC_V0');
});
await test('VAULT legacy mutation during encryption is detected',async()=>{
  const storage=new Store({'aiBoundary.privateMemory.v1':'SYNTHETIC_V0'}),locks=new Locks(),hold=deferred();
  const A=vaultTab(storage,locks,hold);
  const pa=A.runPersist();
  storage.setItem('aiBoundary.privateMemory.v1','LEGACY_CIPHER');
  hold.resolve('NEW_CIPHER');
  await assert.rejects(pa,/加密期間其他分頁已更動資料/);
  assert.equal(storage.getItem('aiBoundary.privateMemory.v1'),'LEGACY_CIPHER');
});
await test('RESTORE uses the same Web Lock as persist (source contract)',()=>{
  assert(sourceMemory.includes('await withVaultWriter(async()=>{'));
  assert(sourceMemory.includes('if(stored()!==previous)throw Error("還原確認期間其他分頁已更動記憶庫；拒絕覆蓋。")'));
});
console.log('R3_PROTECTION_SUMMARY: '+pass+'/8 PASS (CANDIDATE ONLY, LEGACY WRITER NOT RETIRED, HOLD)');
if(pass!==8)process.exitCode=1;
