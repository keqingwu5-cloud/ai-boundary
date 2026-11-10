import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../memory.js',import.meta.url),'utf8');
const start=source.indexOf('$("backupInput").addEventListener("change",async e=>{');
const end=source.indexOf('/* GPT① memory handoff',start);
if(start<0||end<start)throw Error('RESTORE_HANDLER_SOURCE_NOT_FOUND');
const handler=source.slice(start,end);
const STORE='aiBoundary.privateMemory.v1';
async function attempt(mode){
  const raw='SYNTHETIC_ENCRYPTED_BACKUP';
  const events=[],records=new Map(), flags={locked:false,opened:false};
  const storage={
    setItem:(k,v)=>{records.set(k,String(v));events.push({op:'set',key:k});},
    getItem:k=>records.get(k)??null
  };
  const c={
    localStorage:storage,
    readEnvelope:()=>({format:'SYNTHETIC'}),
    decryptEnvelope:async()=>{
      if(mode==='DECRYPT_FAIL')throw Error('SYNTHETIC_INVALID_PASSWORD');
      return {key:'SYNTHETIC_KEY',salt:'SYNTHETIC_SALT',data:{vaultId:'SYNTHETIC_VAULT',revision:0}};
    },
    withVaultWriter:async work=>work(),
    migrateMeta:()=>mode==='MIGRATION_FAIL',
    persist:async()=>{throw Error('SYNTHETIC_MIGRATION_FAILURE');},
    showLocked:()=>{flags.locked=true;},
    showOpen:()=>{flags.opened=true;},
    feedback:message=>events.push({op:'feedback',message}),
    prompt:()=> 'SYNTHETIC_PASSWORD',
    confirm:()=>true,
    stored:()=>storage.getItem(STORE),
    console:{error:()=>{}},
    $:()=>({addEventListener:(kind,fn)=>{c.onImport=fn;}}),
    exportJSON:()=>{},
  };
  vm.createContext(c);
  vm.runInContext(
    "const STORE='aiBoundary.privateMemory.v1';"+
    "let key=null,salt=null,state=null,observedEnvelope=null,lastBackupEnvelope=null;"+
    "let writeChain=Promise.resolve();"+
    handler,c);
  assert.equal(typeof c.onImport,'function');
  await c.onImport({target:{files:[{size:100,text:async()=>raw}],value:'backup.json'}});
  return {raw:storage.getItem(STORE),events,flags};
}
let passed=0;
async function test(name,fn){
  try{await fn();passed++;console.log('PASS: '+name);}
  catch(e){console.error('FAIL: '+name+' '+(e?.stack||e));process.exitCode=1;}
}
await test('bad backup decrypt fails before any ciphertext overwrite',async()=>{
  const r=await attempt('DECRYPT_FAIL');
  assert.equal(r.raw,null);
  assert.equal(r.flags.locked,false);
  assert(!r.events.some(x=>x.op==='set'));
  assert(r.events.some(x=>x.message?.includes('尚未確認寫入備份密文')));
});
await test('ciphertext written then migration failure reports post-write stage',async()=>{
  const r=await attempt('MIGRATION_FAIL');
  assert.equal(r.raw,'SYNTHETIC_ENCRYPTED_BACKUP');
  assert.equal(r.flags.locked,true);
  assert.equal(r.flags.opened,false);
  assert(r.events.some(x=>x.message?.includes('MIGRATION_FAILED_AFTER_WRITE')));
  assert(!r.events.some(x=>x.message?.includes('原本記憶庫未更動')));
});
await test('full restore success reports success without pretending versions were merged',async()=>{
  const r=await attempt('COMPLETE');
  assert.equal(r.raw,'SYNTHETIC_ENCRYPTED_BACKUP');
  assert.equal(r.flags.opened,true);
  assert.equal(r.flags.locked,false);
  assert(r.events.some(x=>x.message?.includes('尚未合併不同版本')));
});
console.log('R3_RESTORE_STAGE_SUMMARY: '+passed+'/3 PASS (synthetic vault only; no real secrets, no Safari)');
if(passed!==3)process.exitCode=1;
