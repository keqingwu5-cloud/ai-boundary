"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {webcrypto}=require("node:crypto");
const src=fs.readFileSync(path.join(__dirname,"../memory.js"),"utf8");
const start=src.indexOf("async function encryptSnapshot("),end=src.indexOf("\nasync function persist()",start);
if(start<0||end<start)throw Error("candidate stage functions missing");
const candidate=src.slice(start,end);
function runtime(){
 let raw="EXISTING_ENCRYPTED_VAULT",fail=false;
 const localStorage={getItem:()=>raw,setItem:(_,v)=>{if(fail)throw Error("QuotaExceededError");raw=v;}};
 const ctx={crypto:webcrypto,encoder:new TextEncoder(),FORMAT:"ai-boundary.encrypted-memory.v1",ROUNDS:260000,STORE:"synthetic-memory",localStorage,b64:b=>Buffer.from(b).toString("base64"),stored:()=>raw,uid:()=>"SYNTHETIC-ID",utc:()=>"2026-10-23T00:00:00Z",migrateMeta:o=>{if(o.vaultId&&Number.isSafeInteger(o.revision)&&o.revision>=0)return false;o.vaultId="SYNTHETIC-ID";o.revision=0;o.updatedAt=o.updatedAt||o.createdAt;return true;}};
 vm.createContext(ctx);vm.runInContext(candidate+"\nthis.api={encryptSnapshot,stageBackupRestore,commitStagedBackup};",ctx);
 return {api:ctx.api,ctx,get:()=>raw,write:v=>{raw=v;},fail:v=>{fail=v;}};
}
async function credentials(){const salt=webcrypto.getRandomValues(new Uint8Array(16)),material=await webcrypto.subtle.importKey("raw",new TextEncoder().encode("synthetic-password-not-user-data"),"PBKDF2",false,["deriveKey"]);const key=await webcrypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:260000},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);return {key,salt};}
async function decrypt(raw,key){const e=JSON.parse(raw),b=await webcrypto.subtle.decrypt({name:"AES-GCM",iv:Buffer.from(e.iv,"base64")},key,Buffer.from(e.payload,"base64"));return JSON.parse(new TextDecoder().decode(b));}
const legacy=()=>({schema:"ai-boundary.memory.v1",createdAt:"2026-10-22T00:00:00Z",memories:[{id:"M",versions:[{number:1,content:"歷史"}]}],candidates:[{id:"C",status:"pending"}],audit:[]});
test("real AES-GCM synthetic legacy backup stages before touching prior encrypted vault",async()=>{
 const app=runtime(),{key,salt}=await credentials(),v=legacy(),backup=await app.api.encryptSnapshot(v,key,salt);
 const staged=await app.api.stageBackupRestore(backup,{data:v,key,salt});
 assert.equal(app.get(),"EXISTING_ENCRYPTED_VAULT");assert.equal(v.vaultId,undefined);
 const restored=await decrypt(staged.raw,key);assert.equal(restored.vaultId,"SYNTHETIC-ID");assert.equal(restored.memories[0].versions[0].content,"歷史");assert.equal(restored.candidates[0].status,"pending");
 app.api.commitStagedBackup(staged,"EXISTING_ENCRYPTED_VAULT");assert.equal((await decrypt(app.get(),key)).revision,0);
});
test("already-migrated backups retain identical ciphertext",async()=>{
 const app=runtime(),{key,salt}=await credentials(),v={...legacy(),vaultId:"V",revision:2},backup=await app.api.encryptSnapshot(v,key,salt);
 assert.equal((await app.api.stageBackupRestore(backup,{data:v,key,salt})).raw,backup);
});
test("failed migration cannot overwrite old vault",async()=>{
 const app=runtime(),{key,salt}=await credentials();app.ctx.migrateMeta=()=>{throw Error("injected_migration_error")};
 await assert.rejects(()=>app.api.stageBackupRestore("BACKUP",{data:legacy(),key,salt}),/injected_migration_error/);assert.equal(app.get(),"EXISTING_ENCRYPTED_VAULT");
});
test("failed precommit encryption cannot overwrite old vault",async()=>{
 const app=runtime(),{key,salt}=await credentials();app.ctx.crypto={getRandomValues:webcrypto.getRandomValues.bind(webcrypto),subtle:{encrypt:async()=>{throw Error("injected_encrypt_error")}}};
 await assert.rejects(()=>app.api.stageBackupRestore("BACKUP",{data:legacy(),key,salt}),/injected_encrypt_error/);assert.equal(app.get(),"EXISTING_ENCRYPTED_VAULT");
});
test("quota exception rejects commit without changing current state",async()=>{
 const app=runtime(),{key,salt}=await credentials(),staged=await app.api.stageBackupRestore("BACKUP",{data:legacy(),key,salt});app.fail(true);
 assert.throws(()=>app.api.commitStagedBackup(staged,"EXISTING_ENCRYPTED_VAULT"),/QuotaExceededError/);assert.equal(app.get(),"EXISTING_ENCRYPTED_VAULT");
});
test("other-tab change after staging refuses stale replacement",async()=>{
 const app=runtime(),{key,salt}=await credentials(),staged=await app.api.stageBackupRestore("BACKUP",{data:legacy(),key,salt});app.write("OTHER_TAB");
 assert.throws(()=>app.api.commitStagedBackup(staged,"EXISTING_ENCRYPTED_VAULT"),/其他分頁/);assert.equal(app.get(),"OTHER_TAB");
});
test("handler only reports intact previous vault before commit",()=>{
 assert.match(src,/let committed=false;/);assert.match(src,/const staged=await stageBackupRestore\(raw,decoded\)/);
 assert.match(src,/commitStagedBackup\(staged,previous\)/);
 assert.match(src,/committed\?"備份已寫入但畫面更新失敗/);
});
