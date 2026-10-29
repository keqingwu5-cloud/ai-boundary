"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const ready=p=>p.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});
const launch=()=>chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});

test("First Brain IDB unavailable: readonly preview, no legacy write or false success",async()=>{
 const browser=await launch(),ctx=await browser.newContext();
 const page=await ctx.newPage(),errs=[];
 page.on("pageerror",e=>errs.push(String(e)));
 await ctx.addInitScript(()=>{
  const original=IDBFactory.prototype.open;
  IDBFactory.prototype.open=function(){throw new DOMException("synthetic IDB denied","SecurityError");};
  // keep original on this realm only; each browser test has a fresh context
  Object.defineProperty(window,"__firstBrainIdbDeniedTest",{value:!!original});
 });
 try{
  await page.goto(ROOT+"/index.html?brainTx=1",{waitUntil:"domcontentloaded"});await ready(page);
  const prior=await page.evaluate(()=>({raw:localStorage.getItem("aiBrain.v1"),
      state:window.AIBrain.getState(),p:window.AIBrain.persistence()}));
  assert.equal(prior.p.ready,false);
  assert.equal(prior.p.reason,"database_open_failed");
  const id=prior.state.nodes[0].id;
  await page.evaluate(id=>window.AIBrain.setStatus(id,"researching"),id);
  const after=await page.evaluate(()=>({raw:localStorage.getItem("aiBrain.v1"),
    state:window.AIBrain.getState(),p:window.AIBrain.persistence(),
    banner:document.querySelector("#brainPersistenceBanner")?.textContent}));
  assert.equal(after.raw,prior.raw);
  assert.equal(after.state.nodes[0].status,prior.state.nodes[0].status);
  assert.equal(after.p.ready,false);
  assert.match(after.banner,/未啟用/);
  assert.deepEqual(errs,[]);
  console.log("FIRST_BRAIN_IDB_UNAVAILABLE_READONLY_PASS");
 }finally{await ctx.close();await browser.close();}
});

test("First Brain IDB transaction abort: no false commit, no data loss, reload stable",async()=>{
 const browser=await launch(),ctx=await browser.newContext({acceptDownloads:true});
 const page=await ctx.newPage(),legacy=await ctx.newPage(),errs=[];
 page.on("pageerror",e=>errs.push(String(e)));
 legacy.on("pageerror",e=>errs.push(String(e)));
 try{
  // A first-ever ?brainTx=1 view intentionally does NOT seed localStorage.
  // Seed the historical legacy page first, as real migrations require.
  await legacy.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(legacy);
  assert.ok(await legacy.evaluate(()=>localStorage.getItem("aiBrain.v1")));
  await page.goto(ROOT+"/index.html?brainTx=1",{waitUntil:"domcontentloaded"});await ready(page);
  const rawBefore=await page.evaluate(()=>localStorage.getItem("aiBrain.v1"));
  const [download]=await Promise.all([
   page.waitForEvent("download",{timeout:15000}),page.locator("#brainTxBackup").click()
  ]);
  const backup=JSON.parse(fs.readFileSync(await download.path(),"utf8"));
  assert.equal(backup.mainRaw,rawBefore);
  page.once("dialog",d=>d.accept());
  await page.locator("#brainTxActivate").click();
  await page.waitForFunction("window.AIBrain?.persistence().ready===true",null,{timeout:30000});
  const snapshot=await page.evaluate(()=>({graph:window.AIBrain.getState(),
    revision:window.AIBrain.persistence().revision,raw:localStorage.getItem("aiBrain.v1")}));
  const result=await page.evaluate(async()=>{
   const original=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(value){
    const req=original.call(this,value);
    // Genuine IDBTransaction abort: the put and its revision must not commit.
    if(this.name==="snapshots")this.transaction.abort();
    return req;
   };
   try{
    window.AIBrain.setStatus(window.AIBrain.getState().nodes[0].id,"researching");
    const success=await window.AIBrain.whenIdle();
    return {success,state:window.AIBrain.getState(),p:window.AIBrain.persistence(),
      persistedLegacy:localStorage.getItem("aiBrain.v1"),
      toast:document.querySelector("#toast")?.textContent};
   }finally{IDBObjectStore.prototype.put=original;}
  });
  assert.equal(result.success,false,"aborted native transaction must never claim success");
  assert.equal(result.p.revision,snapshot.revision);
  assert.equal(result.state.nodes[0].status,snapshot.graph.nodes[0].status);
  assert.equal(result.persistedLegacy,snapshot.raw);
  assert.match(result.toast,/交易未完成|交易失敗/);
  await page.reload({waitUntil:"domcontentloaded"});await ready(page);
  const readback=await page.evaluate(()=>({state:window.AIBrain.getState(),revision:window.AIBrain.persistence().revision}));
  assert.equal(readback.revision,snapshot.revision);
  assert.equal(readback.state.nodes[0].status,snapshot.graph.nodes[0].status);
  assert.deepEqual(errs,[],"no browser pageerrors");
  console.log("FIRST_BRAIN_IDB_NATIVE_ABORT_ROLLBACK_PASS revision_unchanged=1 legacy_unchanged=1");
 }finally{await ctx.close();await browser.close();}
});
