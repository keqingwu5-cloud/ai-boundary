"use strict";
/* R09: Negative recovery and authority tests using synthetic browser storage.
 * No real account data, Safari claims, or mainline deployment.
 */
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
test("R09 unknown authority marker blocks legacy saves instead of silently reviving old storage",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--enable-unsafe-swiftshader","--use-gl=angle"]});
 const context=await browser.newContext();
 await context.addInitScript(()=>localStorage.setItem("aiBrain.v1.persistence.authority","unexpected_migration_state"));
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(String(e)));
 try{
  await page.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});
  const before=await page.evaluate(()=>({raw:localStorage.getItem("aiBrain.v1"),
    nodes:window.AIBrain.getState().nodes.length,p:window.AIBrain.persistence()}));
  assert.equal(before.raw,null,"unknown authority must not seed localStorage");
  assert.equal(before.p.ready,false,"legacy writer is not authoritative");
  const attempted=await page.evaluate(()=>{
   const id=window.AIBrain.getState().nodes[0].id;
   window.AIBrain.setStatus(id,"researching");
   return {raw:localStorage.getItem("aiBrain.v1"),p:window.AIBrain.persistence()};
  });
  assert.equal(attempted.raw,null,"no write on unknown marker");
  assert.equal(attempted.p.ready,false);
  assert.equal(await page.locator("#brainPersistenceBanner").count(),1);
  assert.deepEqual(errors,[],"no uncaught exceptions");
  console.log("R09_UNKNOWN_AUTHORITY_FAIL_CLOSED_PASS");
 }finally{await context.close();await browser.close();}
});

test("R09 native IndexedDB synchronous put failure aborts safely; committed state survives reopen",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const context=await browser.newContext();
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(String(e)));
 try{
  await page.goto(ROOT+"/tests/fixtures/transactional-store.html",{waitUntil:"domcontentloaded"});
  const observed=await page.evaluate(async()=>{
   const api=await import("/transactional-brain-store.mjs");
   const db="r09-idb-failure-"+Date.now()+"-"+Math.random().toString(36).slice(2);
   const initial=await api.writeSnapshot(db,"brain",0,"main-A","undo-A");
   const originalPut=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){
    if(this.name==="snapshots")throw new DOMException("synthetic-quota","QuotaExceededError");
    return originalPut.apply(this,args);
   };
   let failed;
   try{failed=await api.writeSnapshot(db,"brain",1,"main-B","undo-B");}
   finally{IDBObjectStore.prototype.put=originalPut;}
   const post=await api.readSnapshot(db,"brain");
   const inaccessibleOpen=indexedDB.open;
   indexedDB.open=function(){throw new DOMException("denied","SecurityError");};
   let denied;
   try{denied=await api.readSnapshot(db,"brain");}
   finally{indexedDB.open=inaccessibleOpen;}
   const after=await api.readSnapshot(db,"brain");
   return {initial,failed,post,denied,after};
  });
  assert.equal(observed.initial.ok,true);
  assert.equal(observed.failed.ok,false,"put failure cannot be marked committed");
  assert.equal(observed.failed.reason,"transaction_aborted");
  assert.equal(observed.post.ok,true);
  assert.deepEqual(observed.post.snapshot,{key:"brain",revision:1,mainRaw:"main-A",undoRaw:"undo-A"});
  assert.equal(observed.denied.ok,false,"IDB unavailable returns a failure");
  assert.equal(observed.denied.reason,"database_open_failed");
  assert.deepEqual(observed.after.snapshot,observed.post.snapshot);
  assert.deepEqual(errors,[],"no unhandled quota exception from asynchronous IDB callback");
  console.log("R09_IDB_WRITE_FAILURE_ABORT_PASS revision=1 legacy_unchanged=1");
 }finally{await context.close();await browser.close();}
});
