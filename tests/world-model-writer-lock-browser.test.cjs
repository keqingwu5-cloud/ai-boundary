"use strict";
// R19 real Chromium two tabs: a cooperative lock protects the world-model
// journal from new-version writes. This cannot stop obsolete unlocked scripts.
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium,webkit}=require("playwright-core");
const WORLD_LOCK_BROWSER=process.env.WORLD_LOCK_BROWSER==="webkit"?"webkit":"chromium";
const launchWorldLockBrowser=()=>WORLD_LOCK_BROWSER==="webkit"
 ?webkit.launch({headless:true})
 :chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const ROOT="http://127.0.0.1:8765/world-model.html";
const ready=p=>p.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady==='1'",null,{timeout:45000});
const row=id=>({id,hypothesis:"合成研究 "+id,falsifier:"反例",createdOn:"2026-10-29",
 deadline:"2026-12-31",source:"",metric:"",status:"待驗證",createdAt:"2026-10-29T01:00:00Z"});
test("R19 real two-tab Web Lock: concurrent journal write denied, stale tab blocked",async()=>{
 const browser=await launchWorldLockBrowser();
 const ctx=await browser.newContext(),a=await ctx.newPage(),b=await ctx.newPage(),errors=[];
 [a,b].forEach(p=>p.on("pageerror",x=>errors.push(String(x))));
 try{
  await Promise.all([a.goto(ROOT,{waitUntil:"domcontentloaded"}),b.goto(ROOT,{waitUntil:"domcontentloaded"})]);
  await Promise.all([ready(a),ready(b)]);
  const hold=await a.evaluate(()=>{
   if(!navigator.locks?.request)return {ok:false};
   let release;
   window.r19Held=new Promise(resolve=>{release=resolve;});
   window.r19Release=release;
   navigator.locks.request("worldModel.verify.events.v2.writer",()=>{window.r19Locked=true;return window.r19Held;});
   return {ok:true};
  });
  assert.equal(hold.ok,true);
  await a.waitForFunction("window.r19Locked===true");
  const busy=await b.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"busy B"}),row("r19-b"));
  assert.equal(busy,false);
  assert.equal(await b.evaluate(()=>localStorage.getItem("worldModel.verify.events.v2")),null);
  assert.match(await b.locator("#worldHistoryStatus").innerText(),/journal_write_busy/);
  await a.evaluate(()=>window.r19Release());
  const first=await a.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"A saves after lock"}),row("r19-a"));
  assert.equal(first,true);
  const stale=await b.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"B stale"}),row("r19-b"));
  assert.equal(stale,false);
  assert.equal((await b.evaluate(()=>window.WorldVerifyHistory.view().rows)).length,1);
  await b.reload({waitUntil:"domcontentloaded"});await ready(b);
  const resumed=await b.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"B fresh after reload"}),row("r19-b"));
  assert.equal(resumed,true);
  // R19 diagnostic: a successful B write must be visible to the *writing*
  // tab before making any claim about A's cross-process storage propagation.
  // The old assertion only read A immediately, so it could not distinguish
  // delayed visibility from durable loss or a stale-writer integrity defect.
  const views=await Promise.all([a,b].map(p=>p.evaluate(async()=>{
   const m=await import("/world-verification-ledger.mjs");
   const s=m.readWorldLedger(localStorage);
   return {ok:s.ok,reason:s.reason,eventCount:s.events.length,
    ids:s.rows.map(x=>x.id),rawV2:s.rawV2};
  })));
  console.log("WORLD_MODEL_R19_TWO_TAB_READBACK engine="+WORLD_LOCK_BROWSER+
   " observer="+views[0].eventCount+" writer="+views[1].eventCount+
   " rawEqual="+(views[0].rawV2===views[1].rawV2));
  assert.equal(views[1].ok,true,"writing tab must read its committed journal");
  assert.equal(views[1].eventCount,2,"B acknowledged a commit but did not retain both events");
  assert.deepEqual(views[1].ids,["r19-a","r19-b"]);

  // Critical fail-closed check: A still holds its pre-B snapshot, regardless
  // of when its localStorage cache receives B's storage update. It MUST NOT
  // replace B's journal event. This cannot be waived by merely reloading A.
  const staleFromA=await a.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"A stale after B commit"}),row("r19-a-unexpected"));
  console.log("WORLD_MODEL_R19_STALE_A_WRITE engine="+WORLD_LOCK_BROWSER+
   " allowed="+staleFromA+" observerWasBehind="+(views[0].eventCount<2));
  assert.equal(staleFromA,false,
   "R19 integrity failure: stale A writer overwrote/competed with B's committed journal");

  // Re-read from both pages after explicit reload, rather than silently
  // treating eventual WebKit visibility as atomic localStorage consistency.
  await a.reload({waitUntil:"domcontentloaded"});await ready(a);
  const state=await a.evaluate(async()=>{
   const m=await import("/world-verification-ledger.mjs");
   return m.readWorldLedger(localStorage);
  });
  assert.equal(state.ok,true,"reloaded observer cannot read journal");
  assert.equal(state.events.length,2,"two committed events did not survive observer reload");
  assert.deepEqual(state.rows.map(x=>x.id),["r19-a","r19-b"]);
  assert.deepEqual(errors,[]);
  console.log("WORLD_MODEL_R19_COOPERATIVE_LOCK_PASS engine="+WORLD_LOCK_BROWSER+
   " busy=1 stale=1 reload=1 history=2 writerReadback=1 staleARejected=1");
 }finally{await ctx.close();await browser.close();}
});
test("R19 browser missing Web Locks must not fall back to unsafe journal writes",async()=>{
 const browser=await launchWorldLockBrowser();
 const ctx=await browser.newContext(),page=await ctx.newPage();
 try{
  await page.addInitScript(()=>Object.defineProperty(navigator,"locks",{value:undefined,configurable:true}));
  await page.goto(ROOT,{waitUntil:"domcontentloaded"});await ready(page);
  const ok=await page.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"no lock provider"}),row("no-lock"));
  assert.equal(ok,false);
  assert.equal(await page.evaluate(()=>localStorage.getItem("worldModel.verify.events.v2")),null);
  assert.match(await page.locator("#worldHistoryStatus").innerText(),/web_locks_unavailable/);
  console.log("WORLD_MODEL_R19_LOCK_UNAVAILABLE_FAIL_CLOSED_PASS engine="+WORLD_LOCK_BROWSER);
 }finally{await ctx.close();await browser.close();}
});
