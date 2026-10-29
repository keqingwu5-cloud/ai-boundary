"use strict";
// R19 real Chromium two tabs: a cooperative lock protects the world-model
// journal from new-version writes. This cannot stop obsolete unlocked scripts.
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright-core");
const ROOT="http://127.0.0.1:8765/world-model.html";
const ready=p=>p.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady==='1'",null,{timeout:45000});
const row=id=>({id,hypothesis:"合成研究 "+id,falsifier:"反例",createdOn:"2026-10-29",
 deadline:"2026-12-31",source:"",metric:"",status:"待驗證",createdAt:"2026-10-29T01:00:00Z"});
test("R19 real two-tab Web Lock: concurrent journal write denied, stale tab blocked",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
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
  const state=await a.evaluate(async()=>{
   const m=await import("/world-verification-ledger.mjs");
   return m.readWorldLedger(localStorage);
  });
  assert.equal(state.events.length,2);
  assert.deepEqual(state.rows.map(x=>x.id),["r19-a","r19-b"]);
  assert.deepEqual(errors,[]);
  console.log("WORLD_MODEL_R19_COOPERATIVE_LOCK_PASS busy=1 stale=1 reload=1 history=2");
 }finally{await ctx.close();await browser.close();}
});
test("R19 browser missing Web Locks must not fall back to unsafe journal writes",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const ctx=await browser.newContext(),page=await ctx.newPage();
 try{
  await page.addInitScript(()=>Object.defineProperty(navigator,"locks",{value:undefined,configurable:true}));
  await page.goto(ROOT,{waitUntil:"domcontentloaded"});await ready(page);
  const ok=await page.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"no lock provider"}),row("no-lock"));
  assert.equal(ok,false);
  assert.equal(await page.evaluate(()=>localStorage.getItem("worldModel.verify.events.v2")),null);
  assert.match(await page.locator("#worldHistoryStatus").innerText(),/web_locks_unavailable/);
  console.log("WORLD_MODEL_R19_LOCK_UNAVAILABLE_FAIL_CLOSED_PASS");
 }finally{await ctx.close();await browser.close();}
});
