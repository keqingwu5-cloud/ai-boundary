"use strict";
/* Contract tests run the ACTUAL candidate memory.js write functions via VM.
 * Same origin / two tabs / synthetic encrypted values only; no browser claim. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const src=fs.readFileSync(path.resolve(__dirname,"../memory.js"),"utf8");
const start=src.indexOf("async function withVaultWriteLock(work){");
const end=src.indexOf("\nfunction showLocked(){",start);
if(start<0||end<=start)throw Error("candidate lock implementation not found");
const implemented=src.slice(start,end);
function locking(){
 let tail=Promise.resolve();
 const names=[];
 return {names,request(name,opts,fn){
   names.push(name);
   assert.equal(opts.mode,"exclusive");
   const result=tail.then(()=>fn());
   tail=result.then(()=>{},()=>{});
   return result;
 }};
}
function tabs({lockManager,firstEncrypt,secondEncrypt}){
 let raw="AUTHENTICATED_OLD_SYNTHETIC_ENVELOPE";
 const localStorage={
   getItem:()=>raw,
   setItem:(key,value)=>{assert.equal(key,"aiBoundary.privateMemory.v1");raw=value;}
 };
 const make=(encryptCurrent,locks=lockManager)=>{
   const context={navigator:locks?{locks}:{},STORE:"aiBoundary.privateMemory.v1",
     observedEnvelope:raw,state:{vaultId:"VAULT-SYNTH",revision:0,updatedAt:"old"},
     utc:()=>"2026-10-23T05:00:00.000Z",
     migrateMeta:()=>false,encryptCurrent,
     stored:()=>raw,localStorage
   };
   vm.createContext(context);
   vm.runInContext(implemented+"\nthis.persistCandidate=persist;this.withWriteLock=withVaultWriteLock;this.commitBackup=commitStagedBackup;",context);
   return context;
 };
 return {first:make(firstEncrypt),second:make(secondEncrypt),stored:()=>raw,localStorage,make};
}
test("same-origin exclusive lock serializes AES encrypt and commit and rejects stale second tab",async()=>{
 const lockManager=locking();
 let releaseFirst,startFirst;
 const firstStarted=new Promise(resolve=>startFirst=resolve);
 const firstHeld=new Promise(resolve=>releaseFirst=resolve);
 let secondEncryptCalls=0;
 const {first,second,stored}=tabs({lockManager,
   firstEncrypt:async()=>{startFirst();await firstHeld;return "SYNTHETIC_FIRST_ENCRYPTED";},
   secondEncrypt:async()=>{secondEncryptCalls++;return "SYNTHETIC_SECOND_ENCRYPTED";}
 });
 const a=first.persistCandidate();
 await firstStarted;
 const b=second.persistCandidate();
 assert.equal(secondEncryptCalls,0,"B cannot encrypt before entering exclusive lock");
 assert.equal(stored(),"AUTHENTICATED_OLD_SYNTHETIC_ENVELOPE");
 releaseFirst();
 await a;
 await assert.rejects(b,/其他分頁已修改記憶庫/);
 assert.equal(secondEncryptCalls,0,"stale writer must reject inside lock before encrypt");
 assert.equal(stored(),"SYNTHETIC_FIRST_ENCRYPTED");
 assert.equal(first.state.revision,1);
 assert.equal(second.state.revision,0);
 assert.deepEqual(lockManager.names,[
   "aiBoundary.privateMemory.v1:exclusive-write",
   "aiBoundary.privateMemory.v1:exclusive-write"
 ]);
});
test("backup commit and candidate persist use same lock; later stale write cannot overwrite restore",async()=>{
 const lockManager=locking();
 let releaseRestore,restoreEntered;
 const entered=new Promise(resolve=>restoreEntered=resolve);
 const gate=new Promise(resolve=>releaseRestore=resolve);
 const {first,second,stored}=tabs({lockManager,
   firstEncrypt:async()=>{throw Error("restore should not encrypt");},
   secondEncrypt:async()=>{throw Error("stale write must not encrypt");}
 });
 const restore=first.withWriteLock(async()=>{
   restoreEntered();
   await gate;
   first.commitBackup({raw:"SYNTHETIC_RESTORED_BACKUP"},"AUTHENTICATED_OLD_SYNTHETIC_ENVELOPE");
 });
 await entered;
 const stale=second.persistCandidate();
 releaseRestore();
 await restore;
 await assert.rejects(stale,/其他分頁已修改記憶庫/);
 assert.equal(stored(),"SYNTHETIC_RESTORED_BACKUP");
 assert.match(src,/await withVaultWriteLock\(\(\)=>commitStagedBackup\(staged,previous\)\)/,
   "real restore event handler must actually call the locking function");
});
test("unsupported Web Locks denies mutation without touching ciphertext",async()=>{
 const lockManager=locking();
 const {first,stored,make}=tabs({lockManager,
  firstEncrypt:async()=>"SHOULD_NOT_WRITE",
  secondEncrypt:async()=>"SHOULD_NOT_WRITE"
 });
 const noLock=make(async()=>"SHOULD_NOT_WRITE",null);
 await assert.rejects(noLock.persistCandidate(),/跨分頁寫入鎖/);
 await assert.rejects(noLock.withWriteLock(()=>noLock.commitBackup({raw:"EVIL"},stored())),/跨分頁寫入鎖/);
 assert.equal(stored(),"AUTHENTICATED_OLD_SYNTHETIC_ENVELOPE");
 assert.equal(noLock.state.revision,0);
});
test("encryption failure releases lock and rolls back revision without overwriting ciphertext",async()=>{
 const lockManager=locking();
 const {first,stored}=tabs({lockManager,
  firstEncrypt:async()=>{throw Error("SYNTHETIC_ENCRYPTION_FAILURE");},
  secondEncrypt:async()=>"SYNTHETIC_NEXT_OK"
 });
 await assert.rejects(first.persistCandidate(),/SYNTHETIC_ENCRYPTION_FAILURE/);
 assert.equal(stored(),"AUTHENTICATED_OLD_SYNTHETIC_ENVELOPE");
 assert.equal(first.state.revision,0);
 const second=first.persistCandidate();
 await assert.rejects(second,/SYNTHETIC_ENCRYPTION_FAILURE/);
});
