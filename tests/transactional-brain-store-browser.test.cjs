"use strict";
/* R03-05 candidate only: native Chromium IndexedDB concurrency/abort tests.
 * No user files, network backends, migrations, or real mainline writes.
 */
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const PAGE=ROOT+"/tests/fixtures/transactional-store.html";
test("R03-05 IndexedDB atomic compare-and-swap: two tabs, undo pair, abort, reload",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const context=await browser.newContext();
 const a=await context.newPage(),b=await context.newPage();
 const errors=[];
 a.on("pageerror",e=>errors.push("A:"+String(e)));
 b.on("pageerror",e=>errors.push("B:"+String(e)));
 const db="r03-p0-isolated-"+Date.now()+"-"+Math.random().toString(36).slice(2);
 const read=p=>p.evaluate(async dbName=>(await import("/transactional-brain-store.mjs")).readSnapshot(dbName,"brain"),db);
 const save=(p,revision,mark)=>p.evaluate(async args=>{
  const mod=await import("/transactional-brain-store.mjs");
  return mod.writeSnapshot(args.db,"brain",args.revision,args.mainRaw,args.undoRaw);
 },{db,revision,mainRaw:JSON.stringify({owner:mark,kind:"main"}),undoRaw:JSON.stringify({owner:mark,kind:"undo"})});
 try{
  await Promise.all([a.goto(PAGE),b.goto(PAGE)]);
  await a.evaluate(()=>{
   localStorage.setItem("aiBrain.v1","legacy-main-exact-bytes");
   localStorage.setItem("aiBrain.v1.undo","legacy-undo-exact-bytes");
  });
  const initial=await Promise.all([read(a),read(b)]);
  assert.ok(initial.every(x=>x.ok&&x.snapshot===null),"no implicit migration or initialization writes");
  // Both stale writers compete for revision 0. IndexedDB serializes the transactions.
  const first=await Promise.all([save(a,0,"A1"),save(b,0,"B1")]);
  assert.equal(first.filter(x=>x.ok).length,1,"exactly one first writer succeeds: "+JSON.stringify(first));
  assert.equal(first.filter(x=>x.reason==="stale_revision").length,1);
  const afterFirst=await read(a);
  assert.equal(afterFirst.ok,true);
  assert.equal(afterFirst.snapshot.revision,1);
  const owner1=JSON.parse(afterFirst.snapshot.mainRaw).owner;
  assert.equal(JSON.parse(afterFirst.snapshot.undoRaw).owner,owner1,"main and undo atomic pair");
  assert.ok(["A1","B1"].includes(owner1));
  // Second competition, on a known revision, must again produce exactly one winner.
  const second=await Promise.all([save(a,1,"A2"),save(b,1,"B2")]);
  assert.equal(second.filter(x=>x.ok).length,1,"exactly one second writer succeeds");
  const afterSecond=await read(b);
  assert.equal(afterSecond.snapshot.revision,2);
  const owner2=JSON.parse(afterSecond.snapshot.mainRaw).owner;
  assert.equal(JSON.parse(afterSecond.snapshot.undoRaw).owner,owner2);
  assert.ok(["A2","B2"].includes(owner2));
  const stale=await save(a,1,"STALE");
  assert.equal(stale.reason,"stale_revision");
  assert.equal((await read(a)).snapshot.mainRaw,afterSecond.snapshot.mainRaw);
  // Simulate a browser storage transaction aborted after put, not a mock.
  const abort=await a.evaluate(async databaseName=>{
   const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open(databaseName,1);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
   });
   return await new Promise(resolve=>{
    const tx=db.transaction("snapshots","readwrite");
    tx.onabort=()=>{db.close();resolve("aborted");};
    tx.oncomplete=()=>{db.close();resolve("committed-unexpectedly");};
    tx.objectStore("snapshots").put({key:"brain",revision:999,mainRaw:"BAD",undoRaw:"BAD"});
    tx.abort();
   });
  },db);
  assert.equal(abort,"aborted");
  const afterAbort=await read(a);
  assert.deepEqual(afterAbort.snapshot,afterSecond.snapshot,"abort leaves complete prior snapshot");
  await b.reload({waitUntil:"domcontentloaded"});
  assert.deepEqual((await read(b)).snapshot,afterSecond.snapshot,"persist across real page reload");
  assert.deepEqual(await a.evaluate(()=>({
   main:localStorage.getItem("aiBrain.v1"),undo:localStorage.getItem("aiBrain.v1.undo")
  })),{main:"legacy-main-exact-bytes",undo:"legacy-undo-exact-bytes"},"old data never auto-overwritten");
  assert.deepEqual(errors,[],"no page errors");
  console.log("R03_IDB_TRANSACTION_CANDIDATE_PASS two_tabs=2 collisions=2 aborted=1 revision=2 legacy_bytes_preserved=1");
 }finally{
  await context.close();
  await browser.close();
 }
});
