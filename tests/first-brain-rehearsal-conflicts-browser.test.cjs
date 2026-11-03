"use strict";
/* R23: adversarial stress of the R22 disposable restore staging only.
 * Synthetic public seed graph; no production DB names or private history.
 * Run same cases in true Chromium and Linux desktop WebKit.
 */
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium,webkit}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const engine=process.env.R23_BROWSER==="webkit"?"webkit":"chromium";
const launch=()=>engine==="webkit"?webkit.launch({headless:true})
 :chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const ready=p=>p.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});
async function syntheticBackup(page){
 return page.evaluate(async()=>{
  const mainRaw=JSON.stringify(window.AIBrain.getState()),undoRaw=JSON.stringify([mainRaw]);
  const digest=async raw=>{
   const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
   return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
  };
  // Fence values here are explicit synthetic fixtures, not authentic legacy
  // storage attestations; this exercises only disposable R22 semantics.
  const e={schema:"first-brain.transactional.backup.v1",key:"aiBrain.v1",
   revision:7,exportedAt:new Date().toISOString(),mainRaw,undoRaw,
   legacyFence:{version:1,mainSha:"a".repeat(64),undoSha:"b".repeat(64)}};
  const payload=JSON.stringify({schema:e.schema,key:e.key,revision:e.revision,
   exportedAt:e.exportedAt,mainRaw:e.mainRaw,undoRaw:e.undoRaw,legacyFence:e.legacyFence});
  e.sha256={mainRaw:await digest(mainRaw),undoRaw:await digest(undoRaw),
   payload:await digest(payload)};
  const checked=await (await import("/first-brain-transactional-backup.mjs"))
   .verifyTransactionalBackup(e);
  return {backup:e,checked};
 });
}
async function newId(page){
 return page.evaluate(async()=>{
  const api=await import("/first-brain-recovery-rehearsal.mjs");
  return api.newRecoveryRehearsalId();
 });
}
async function createEmptyRehearsal(page,id){
 return page.evaluate(async id=>{
  const api=await import("/first-brain-recovery-rehearsal.mjs");
  const name=api.recoveryRehearsalName(id);
  return new Promise(resolve=>{
   const req=indexedDB.open(name,1);
   req.onupgradeneeded=()=>{
    if(!req.result.objectStoreNames.contains("snapshots"))
      req.result.createObjectStore("snapshots",{keyPath:"key"});
   };
   req.onsuccess=()=>{req.result.close();resolve({ok:true});};
   req.onerror=()=>resolve({ok:false,reason:"precreate_failed"});
  });
 },id);
}
test("R23 two concurrent tabs: exactly one disposable stage wins, reload verifies and corrupt stage fails closed",async()=>{
 const browser=await launch(),ctx=await browser.newContext();
 const a=await ctx.newPage(),b=await ctx.newPage(),errors=[];
 a.on("pageerror",e=>errors.push(String(e)));
 b.on("pageerror",e=>errors.push(String(e)));
 try{
  await Promise.all([a.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"}),
   b.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"})]);
  await Promise.all([ready(a),ready(b)]);
  const {backup,checked}=await syntheticBackup(a);
  assert.equal(checked.ok,true);
  const id=await newId(a);
  assert.equal((await createEmptyRehearsal(a,id)).ok,true);
  const initialRaw=await a.evaluate(()=>localStorage.getItem("aiBrain.v1"));
  const results=await Promise.all([a,b].map(page=>page.evaluate(async ({id,backup})=>{
   const api=await import("/first-brain-recovery-rehearsal.mjs");
   return api.stageRecoveryRehearsal(backup,id,{confirmed:true});
  },{id,backup})));
  assert.equal(results.filter(x=>x.ok).length,1,
   "two same-ID concurrent writes must not both report success");
  assert.equal(results.filter(x=>x.reason==="rehearsal_already_exists").length,1,
   "loser should be explicit conflict, not silently succeed");
  const fromB=await b.evaluate(async ({id,backup})=>{
   const api=await import("/first-brain-recovery-rehearsal.mjs");
   return api.verifyRecoveryRehearsal(backup,id);
  },{id,backup});
  assert.equal(fromB.reason,"isolated_roundtrip_matches");
  await a.close();
  await b.reload({waitUntil:"domcontentloaded"});await ready(b);
  const afterReload=await b.evaluate(async ({id,backup})=>{
   const api=await import("/first-brain-recovery-rehearsal.mjs");
   return api.verifyRecoveryRehearsal(backup,id);
  },{id,backup});
  assert.equal(afterReload.ok,true,"disposable stored bytes survive browser tab restart");
  const altered=await b.evaluate(async ({id,backup})=>{
   const api=await import("/first-brain-recovery-rehearsal.mjs");
   const name=api.recoveryRehearsalName(id);
   const db=await new Promise((resolve,reject)=>{
    const q=indexedDB.open(name,1);q.onsuccess=()=>resolve(q.result);
    q.onerror=()=>reject(new Error("open failed"));
   });
   const changed=await new Promise(resolve=>{
    const tx=db.transaction("snapshots","readwrite");
    const store=tx.objectStore("snapshots"),get=store.get("aiBrain.v1");
    get.onsuccess=()=>{
     const row=get.result;
     row.undoRaw="[]"; // corrupt only the isolated synthetic Undo.
     store.put(row);
    };
    tx.oncomplete=()=>resolve({ok:true});
    tx.onabort=()=>resolve({ok:false});
   });
   db.close();
   const bad=await api.verifyRecoveryRehearsal(backup,id);
   const again=await api.stageRecoveryRehearsal(backup,id,{confirmed:true});
   const cleared=await api.discardRecoveryRehearsal(id,{confirmed:true});
   const absent=await api.verifyRecoveryRehearsal(backup,id);
   return {changed,bad,again,cleared,absent,legacy:localStorage.getItem("aiBrain.v1")};
  },{id,backup});
  assert.equal(altered.changed.ok,true);
  assert.equal(altered.bad.reason,"rehearsal_does_not_match_backup");
  assert.equal(altered.again.reason,"rehearsal_already_exists",
   "a damaged existing rehearsal must not be silently repaired");
  assert.equal(altered.cleared.ok,true);
  assert.equal(altered.absent.reason,"rehearsal_missing",
   "verifying deleted rehearsal cannot re-create an empty database");
  assert.equal(altered.legacy,initialRaw);
  assert.deepEqual(errors,[]);
  console.log("FIRST_BRAIN_R23_CROSS_TAB_REHEARSAL_PASS engine="+engine+
   " one_winner=1 durable_reload=1 corrupted_undo_blocked=1 no_autorepair=1 cleanup=1");
 }finally{await ctx.close();await browser.close();}
});
test("R23 interrupted transaction: abort leaves no half-written rehearsal and explicit retry works",async()=>{
 const browser=await launch(),ctx=await browser.newContext(),page=await ctx.newPage();
 try{
  await page.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(page);
  const {backup,checked}=await syntheticBackup(page);
  assert.equal(checked.ok,true);
  const id=await newId(page);
  assert.equal((await createEmptyRehearsal(page,id)).ok,true);
  const results=await page.evaluate(async ({backup,id})=>{
   const api=await import("/first-brain-recovery-rehearsal.mjs");
   const store=await import("/transactional-brain-store.mjs");
   const name=api.recoveryRehearsalName(id);
   const opened=await new Promise((resolve,reject)=>{
    const req=indexedDB.open(name,1);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(new Error("open failed"));
   });
   const aborted=await new Promise(resolve=>{
    const tx=opened.transaction("snapshots","readwrite");
    tx.objectStore("snapshots").put({key:"aiBrain.v1",revision:1,
     mainRaw:"partial",undoRaw:"[]"});
    tx.abort();
    tx.onabort=()=>resolve(true);
    tx.oncomplete=()=>resolve(false);
   });
   opened.close();
   const empty=await store.readSnapshot(name,"aiBrain.v1");
   const precheck=await api.verifyRecoveryRehearsal(backup,id);
   const stage=await api.stageRecoveryRehearsal(backup,id,{confirmed:true});
   const valid=await api.verifyRecoveryRehearsal(backup,id);
   const cleanup=await api.discardRecoveryRehearsal(id,{confirmed:true});
   return {aborted,empty,precheck,stage,valid,cleanup,
    authority:localStorage.getItem("aiBrain.v1.persistence.authority")};
  },{backup,id});
  assert.equal(results.aborted,true);
  assert.equal(results.empty.snapshot,null,"abort must not leak graph without Undo");
  assert.equal(results.precheck.reason,"rehearsal_snapshot_missing");
  assert.equal(results.stage.reason,"isolated_rehearsal_verified");
  assert.equal(results.valid.ok,true);
  assert.equal(results.cleanup.ok,true);
  assert.notEqual(results.authority,"idb","isolated retry never activates production authority");
  console.log("FIRST_BRAIN_R23_ABORT_RETRY_PASS engine="+engine+
   " aborted_staging_empty=1 explicit_retry=1 no_authority_activation=1");
 }finally{await ctx.close();await browser.close();}
});
