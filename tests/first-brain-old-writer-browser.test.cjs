"use strict";
/* R15: real old-tab direct localStorage write, bypassing modern authority marker.
 * This validates DETECTION and fail-closed behavior, not prevention of old code.
 * Synthetic 3D seed only; no actual private user files.
 */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const ready=p=>p.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});
test("R15 obsolete writer diverges after IDB cutover: never silently commit or serve stale brain",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const ctx=await browser.newContext({acceptDownloads:true});
 const old=await ctx.newPage(),tx=await ctx.newPage(),feed=await ctx.newPage(),errors=[];
 for(const p of [old,tx,feed])p.on("pageerror",e=>errors.push(String(e)));
 try{
  await old.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(old);
  const before=await old.evaluate(()=>({
   mainRaw:localStorage.getItem("aiBrain.v1"),undoRaw:localStorage.getItem("aiBrain.v1.undo"),
   graph:window.AIBrain.getState()
  }));
  assert.ok(before.mainRaw&&before.graph.nodes.length>100);
  await tx.goto(ROOT+"/index.html?brainTx=1",{waitUntil:"domcontentloaded"});await ready(tx);
  const [dl]=await Promise.all([tx.waitForEvent("download",{timeout:15000}),tx.locator("#brainTxBackup").click()]);
  assert.equal(JSON.parse(fs.readFileSync(await dl.path(),"utf8")).mainRaw,before.mainRaw);
  tx.once("dialog",d=>d.accept());
  await tx.locator("#brainTxActivate").click();
  await tx.waitForFunction("window.AIBrain?.persistence().ready===true",null,{timeout:30000});
  const originalTx=await tx.evaluate(()=>window.AIBrain.getState());
  assert.equal((await tx.evaluate(()=>window.AIBrain.persistence())).revision,1);
  // Real older code may ignore the idb marker. Simulate exactly that primitive,
  // not the updated app's guarded mutation functions.
  const foreign=await old.evaluate(()=>{
   const key="aiBrain.v1";
   const obj=JSON.parse(localStorage.getItem(key));
   obj.nodes[0].title="UNCOOPERATIVE_OLD_WRITER_R15";
   const raw=JSON.stringify(obj);
   localStorage.setItem(key,raw);
   return {raw,authority:localStorage.getItem("aiBrain.v1.persistence.authority")};
  });
  assert.equal(foreign.authority,"idb");
  await tx.waitForFunction("window.AIBrain?.persistence().ready===false",null,{timeout:15000});
  const state=await tx.evaluate(async()=>{
   const status=window.AIBrain.persistence();
   const before=window.AIBrain.getState();
   const id=before.nodes[0].id;
   window.AIBrain.setStatus(id,"researching");
   const accepted=await window.AIBrain.whenIdle();
   const stored=await (await import("/transactional-brain-store.mjs")).readSnapshot(
     "aiBrain.firstBrain.transaction.r1","aiBrain.v1");
   const authoritative=await (await import("/first-brain-idb-adapter.mjs")).readTransactional3D(
     "aiBrain.firstBrain.transaction.r1");
   return {status,before,after:window.AIBrain.getState(),accepted,stored,authoritative};
  });
  assert.equal(state.status.ready,false);
  assert.equal(state.status.reason,"legacy_writer_detected");
  assert.equal(state.accepted,false,"UI must reject edits after old code wrote");
  assert.deepEqual(state.after,state.before,"no unsaved in-memory edit");
  assert.equal(state.stored.snapshot.revision,1,"IDB graph unchanged");
  assert.equal(state.stored.snapshot.mainRaw,before.mainRaw,"original safe transaction retained");
  assert.equal(state.authoritative.reason,"legacy_writer_detected");
  assert.equal(state.stored.snapshot.legacyFence.version,1);
  await feed.goto(ROOT+"/feed.html",{waitUntil:"domcontentloaded"});
  await feed.waitForFunction("window.AIFeed && document.body.dataset.ready==='1'",null,{timeout:45000});
  assert.equal((await feed.evaluate(()=>window.AIFeed.authority())).source,"blocked");
  assert.equal((await feed.evaluate(()=>window.AIFeed.authority())).error,"legacy_writer_detected");
  // A reload cannot silently unfreeze a conflict or fall back to old data.
  await tx.reload({waitUntil:"domcontentloaded"});await ready(tx);
  const reopened=await tx.evaluate(()=>window.AIBrain.persistence());
  assert.equal(reopened.ready,false);
  assert.equal(reopened.reason,"legacy_writer_detected");
  assert.equal(await tx.evaluate(()=>localStorage.getItem("aiBrain.v1")),foreign.raw,
   "old writer bytes preserved for manual reconciliation");
  assert.deepEqual(errors,[]);
  console.log("FIRST_BRAIN_R15_OBSOLETE_WRITER_DETECTED_PASS legacy_write=1 idb_frozen=1 feed_blocked=1 reload_blocked=1 no_data_overwrite=1");
 }finally{await ctx.close();await browser.close();}
});
