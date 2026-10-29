"use strict";
// R20 isolated disaster scenario: after an ACTIVE IDB authority has newer
// edits, erase the entire transaction database. The preserved pre-cutover
// localStorage must NOT be promoted into a replacement graph/Undo history.
// Synthetic 3D data only. Runs in Chromium and desktop Linux WebKit.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium,webkit}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const engine=process.env.R20_BROWSER==="webkit"?"webkit":"chromium";
const launch=()=>engine==="webkit"
 ?webkit.launch({headless:true})
 :chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const ready=p=>p.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});

test("R20 evicted active IDB: old legacy bytes cannot silently become authoritative again",async()=>{
 const browser=await launch(),ctx=await browser.newContext({acceptDownloads:true});
 const old=await ctx.newPage(),tx=await ctx.newPage(),feed=await ctx.newPage(),errors=[];
 for(const p of [old,tx,feed])p.on("pageerror",e=>errors.push(String(e)));
 try{
  await old.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(old);
  const mainBefore=await old.evaluate(()=>localStorage.getItem("aiBrain.v1"));
  assert.ok(mainBefore);
  await tx.goto(ROOT+"/index.html?brainTx=1",{waitUntil:"domcontentloaded"});await ready(tx);
  const [backup]=await Promise.all([tx.waitForEvent("download",{timeout:15000}),tx.locator("#brainTxBackup").click()]);
  assert.equal(JSON.parse(fs.readFileSync(await backup.path(),"utf8")).mainRaw,mainBefore);
  tx.once("dialog",d=>d.accept());
  await tx.locator("#brainTxActivate").click();
  await tx.waitForFunction("window.AIBrain?.persistence().ready===true",null,{timeout:30000});
  const changed=await tx.evaluate(async()=>{
   const node=window.AIBrain.getState().nodes[0],original=node.status,
    desired=original==="researching"?"resolved":"researching";
   window.AIBrain.setStatus(node.id,desired);
   const ok=await window.AIBrain.whenIdle();
   return {ok,original,desired,revision:window.AIBrain.persistence().revision,
     now:window.AIBrain.getState().nodes[0].status};
  });
  assert.equal(changed.ok,true);
  assert.equal(changed.now,changed.desired);
  assert.equal(changed.revision,2,"must have a newer revision not present in the legacy backup");
  const deleted=await tx.evaluate(async()=>{
   const db="aiBrain.firstBrain.transaction.r1";
   const prior=await (await import("/transactional-brain-store.mjs")).readSnapshot(db,"aiBrain.v1");
   const deleted=await new Promise(resolve=>{
    const req=indexedDB.deleteDatabase(db);
    req.onsuccess=()=>resolve({ok:true});
    req.onerror=()=>resolve({ok:false,reason:"delete_failed"});
    req.onblocked=()=>resolve({ok:false,reason:"delete_blocked"});
   });
   return {deleted,priorRevision:prior.snapshot?.revision};
  });
  assert.equal(deleted.priorRevision,2);
  assert.equal(deleted.deleted.ok,true,"synthetic eviction must actually erase IDB");
  await tx.reload({waitUntil:"domcontentloaded"});await ready(tx);
  const missing=await tx.evaluate(()=>({
   p:window.AIBrain.persistence(),
   banner:document.querySelector("#brainPersistenceBanner")?.textContent,
   authority:localStorage.getItem("aiBrain.v1.persistence.authority"),
   raw:localStorage.getItem("aiBrain.v1")
  }));
  assert.equal(missing.p.ready,false);
  assert.equal(missing.p.reason,"transactional_snapshot_missing");
  assert.equal(missing.authority,"idb");
  assert.equal(missing.raw,mainBefore);
  assert.match(missing.banner,/遺失/);
  const blocked=await tx.evaluate(()=>{
   const before=window.AIBrain.getState();
   window.AIBrain.setStatus(before.nodes[0].id,"researching");
   return {before,after:window.AIBrain.getState()};
  });
  assert.deepEqual(blocked.after,blocked.before,"read-only must not show a fake saved change");
  const [otherBackup]=await Promise.all([tx.waitForEvent("download",{timeout:15000}),tx.locator("#brainTxBackup").click()]);
  assert.equal(JSON.parse(fs.readFileSync(await otherBackup.path(),"utf8")).mainRaw,mainBefore);
  assert.equal(await tx.locator("#brainTxActivate").isDisabled(),true,
   "reusing the old backup must not reactivate an evicted active transaction");
  // Bypass only the DOM disabled attribute to prove the click handler itself
  // also rejects an unsafe restage; this is a negative test, not user guidance.
  await tx.locator("#brainTxActivate").evaluate(e=>e.disabled=false);
  tx.once("dialog",d=>d.accept());
  await tx.locator("#brainTxActivate").click();
  await tx.waitForFunction("document.getElementById('toast')?.textContent.includes('transactional_snapshot_missing')",{timeout:15000});
  const after=await tx.evaluate(async()=>{
   const snap=await (await import("/transactional-brain-store.mjs"))
    .readSnapshot("aiBrain.firstBrain.transaction.r1","aiBrain.v1");
   return {snapshot:snap.snapshot,authority:localStorage.getItem("aiBrain.v1.persistence.authority"),
    raw:localStorage.getItem("aiBrain.v1"),p:window.AIBrain.persistence()};
  });
  assert.equal(after.snapshot,null,"handler must not recreate the obsolete legacy snapshot");
  assert.equal(after.authority,"idb");
  assert.equal(after.raw,mainBefore);
  assert.equal(after.p.ready,false);
  await feed.goto(ROOT+"/feed.html",{waitUntil:"domcontentloaded"});
  await feed.waitForFunction("window.AIFeed && document.body.dataset.ready==='1'",null,{timeout:45000});
  const authority=await feed.evaluate(()=>window.AIFeed.authority());
  assert.equal(authority.source,"blocked");
  assert.equal(authority.error,"transactional_snapshot_missing");
  assert.deepEqual(errors,[]);
  console.log("FIRST_BRAIN_R20_IDB_EVICTION_FAIL_CLOSED_PASS engine="+engine+
   " older_snapshot_not_restaged=1 feed_blocked=1 old_bytes_preserved=1");
 }finally{await ctx.close();await browser.close();}
});
