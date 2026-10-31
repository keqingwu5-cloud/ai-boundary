"use strict";
/* Deterministic PRE-FIX reproduction using the persist() function body copied
 * from PR #59 head 1fc442a86db62b0651e13859a0536d4705da3c88 (2026-10-23).
 * This is a synthetic VM reproduction, NOT a production/browser incident.
 * Keep it to demonstrate why the Web Locks guard may not be removed. */
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const originalPersist=`async function persist(){
 if(stored()!==observedEnvelope)throw Error("其他分頁已修改記憶庫，已停止寫入避免覆蓋。請先備份並重新開啟頁面。");
 if(!state.vaultId)migrateMeta(state);
 const r=state.revision,t=state.updatedAt;
 state.revision=r+1;state.updatedAt=utc();
 try{const value=await encryptCurrent();localStorage.setItem(STORE,value);observedEnvelope=value;}
 catch(e){state.revision=r;state.updatedAt=t;throw e;}
}`;
test("PRE-FIX TOCTOU reproduction: two tabs both preflight before AES then last writer destroys first update",async()=>{
 let raw="BASE_ENCRYPTED_SYNTHETIC_VAULT";
 let releaseA,releaseB,startA,startB;
 const startedA=new Promise(resolve=>startA=resolve);
 const startedB=new Promise(resolve=>startB=resolve);
 const heldA=new Promise(resolve=>releaseA=resolve);
 const heldB=new Promise(resolve=>releaseB=resolve);
 const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
 function tab(onStart,gate,ciphertext){
   const ctx={stored:()=>raw,observedEnvelope:raw,
     state:{vaultId:"SYNTHETIC",revision:0,updatedAt:"T0"},
     migrateMeta:()=>false,utc:()=>"T1",STORE:"vault",
     encryptCurrent:async()=>{onStart();await gate;return ciphertext;},localStorage:storage};
   vm.createContext(ctx);
   vm.runInContext(originalPersist+"\nthis.write=persist;",ctx);
   return ctx;
 }
 const a=tab(startA,heldA,"ENCRYPTED_A_UPDATE");
 const b=tab(startB,heldB,"ENCRYPTED_B_STALE_UPDATE");
 const first=a.write(),second=b.write();
 await Promise.all([startedA,startedB]);
 assert.equal(raw,"BASE_ENCRYPTED_SYNTHETIC_VAULT",
   "both old preflights passed before either encryption resolved");
 releaseA();await first;
 assert.equal(raw,"ENCRYPTED_A_UPDATE");
 releaseB();await second;
 assert.equal(raw,"ENCRYPTED_B_STALE_UPDATE",
   "old implementation overwrote A with B without detecting a stale snapshot");
 assert.equal(a.state.revision,1);
 assert.equal(b.state.revision,1);
});
