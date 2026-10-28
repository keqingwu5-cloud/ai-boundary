"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium,webkit}=require("playwright-core");
const browserEngine=process.env.R17_BROWSER==="webkit"?"webkit":"chromium";
test("R17 isolated device probe: explicit synthetic writes, rollback, reopen, report, cleanup",async()=>{
 const browser=browserEngine==="webkit"
  ?await webkit.launch({headless:true})
  :await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 try{
  await page.goto("http://127.0.0.1:8765/tests/fixtures/transactional-store.html");
  const originals=await page.evaluate(()=>{
   localStorage.setItem("aiBrain.v1","R17_UNTOUCHED_MAIN");
   localStorage.setItem("aiBrain.v1.undo","R17_UNTOUCHED_UNDO");
   localStorage.setItem("aiBrain.v1.persistence.authority","R17_UNTOUCHED_AUTHORITY");
   return {main:localStorage.getItem("aiBrain.v1"),undo:localStorage.getItem("aiBrain.v1.undo"),
     authority:localStorage.getItem("aiBrain.v1.persistence.authority")};
  });
  await page.goto("http://127.0.0.1:8765/tests/fixtures/first-brain-device-diagnostics.html");
  assert.equal(await page.locator("#startResult").innerText(),"尚未執行");
  assert.equal(new URL(page.url()).hash,"","no automatic IDB probe run");
  const prior=await page.evaluate(async()=>{
   const probe=await import("/first-brain-device-probe.mjs");
   return probe.verifyProbe("not-a-safe-id");
  });
  assert.equal(prior.reason,"invalid_probe_id");
  await page.locator("#start").click();
  await page.waitForFunction("location.hash.startsWith('#r17=') && document.getElementById('startResult').textContent.includes('atomic_graph_undo_and_abort_verified')",null,{timeout:20000});
  const originalUrl=page.url(),firstId=new URL(originalUrl).hash.slice(5);
  assert.match(firstId,/^[a-f0-9]{32}$/);
  const before=await page.evaluate(()=>{
   return {main:localStorage.getItem("aiBrain.v1"),undo:localStorage.getItem("aiBrain.v1.undo"),
     authority:localStorage.getItem("aiBrain.v1.persistence.authority")};
  });
  assert.deepEqual(before,originals,"synthetic probe must not touch real brain keys");
  await page.locator("#verify").click();
  await page.waitForFunction("document.getElementById('verifyResult').textContent.includes('synthetic_graph_undo_match')");
  await page.reload({waitUntil:"domcontentloaded"});
  assert.equal(page.url(),originalUrl);
  await page.locator("#verify").click();
  await page.waitForFunction("document.getElementById('verifyResult').textContent.includes('synthetic_graph_undo_match')");
  await page.locator("#background").check();
  await page.locator("#reopen").check();
  await page.locator("#device").fill("synthetic CI browser - NOT iOS hardware");
  await page.locator("#hints").click();
  await page.waitForFunction("document.getElementById('hintsResult').textContent.includes('persistent')");
  const [download]=await Promise.all([
    page.waitForEvent("download",{timeout:15000}),page.locator("#export").click()
  ]);
  const report=JSON.parse(fs.readFileSync(await download.path(),"utf8"));
  assert.equal(report.schema,"first-brain-r17-device-manual-v1");
  assert.equal(report.recheck.ok,true);
  assert.equal(report.manuallyReported.reopen,true);
  assert.equal(report.reviewerAcknowledged,false);
  assert.equal(report.realFirstBrainDataTested,false);
  assert.equal(report.deviceNote,"synthetic CI browser - NOT iOS hardware");
  await page.locator("#clear").click();
  await page.waitForFunction("document.getElementById('clearResult').textContent.includes('isolated_probe_deleted')");
  assert.equal(new URL(page.url()).hash,"");
  const deleted=await page.evaluate(async id=>{
   const probe=await import("/first-brain-device-probe.mjs");
   return probe.verifyProbe(id);
  },firstId);
  assert.equal(deleted.reason,"probe_not_found","verifying a deleted probe must not recreate it");
  const after=await page.evaluate(()=>({
   main:localStorage.getItem("aiBrain.v1"),undo:localStorage.getItem("aiBrain.v1.undo"),
   authority:localStorage.getItem("aiBrain.v1.persistence.authority")}));
  assert.deepEqual(after,originals,"no legacy, Undo or authority mutation even after cleanup");
  assert.deepEqual(errors,[]);
  console.log("R17_ISOLATED_DEVICE_PROBE_PASS engine="+browserEngine+
   " opt_in=1 rollback=1 reload=1 export=1 no_main_brain_touch=1 cleanup=1");
 }finally{await context.close();await browser.close();}
});
