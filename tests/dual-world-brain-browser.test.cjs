"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright-core");
const root="http://127.0.0.1:8765";
async function withBrowser(fn,width=1250,height=850){
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const ctx=await browser.newContext({viewport:{width,height},acceptDownloads:true});
 const page=await ctx.newPage();const errs=[];page.on("pageerror",x=>errs.push(String(x)));
 try{await fn(page,errs);}finally{await ctx.close();await browser.close();}
}
const readyWorld=p=>p.waitForFunction("window.DualSystemResearchAudit && document.body.dataset.dualAuditReady === '1'",null,{timeout:45000});
const readyBrain=p=>p.waitForFunction("window.AIBrain && document.body.dataset.ready === '1'",null,{timeout:45000});
test("01 world model synthetic chain passes without inventing First Brain source",()=>withBrowser(async(page,errs)=>{
 await page.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await readyWorld(page);
 const out=await page.evaluate(()=>window.DualSystemResearchAudit.last);
 assert.equal(out.world,"PASS");assert.equal(out.brain,"NOT_TESTED");assert.equal(out.integration,"NOT_TESTED");
 assert.deepEqual(out.fixture,["evt:h1","evt:o1","evt:r1","evt:b1","evt:c1"]);
 assert.deepEqual(out.historical.recordedEventIds,[]);
 assert.deepEqual(out.historical.retrospectivelyAvailableEvidenceIds,["evt:o1"]);
 assert.equal(await page.locator("#dualEventTimeline li").count(),5);
 assert.match(await page.locator("#auditResult").innerText(),/12\/12 項通過/);
 assert.equal(errs.length,0,errs.join(";"));
 console.log("DUAL_WORLD_MODEL_SYNTHETIC_PASS");
}));
test("02 one node tests First Brain and world model separately without writing source",()=>withBrowser(async(page,errs)=>{
 await page.goto(root+"/index.html",{waitUntil:"domcontentloaded"});await readyBrain(page);
 const id=await page.evaluate(()=>window.AIBrain.getState().nodes[0].id);
 const original=await page.evaluate(()=>({brain:localStorage.getItem("aiBrain.v1"),world:localStorage.getItem("worldModel.verify.v1")}));
 await page.goto(root+"/world-model.html?node="+encodeURIComponent(id),{waitUntil:"domcontentloaded"});await readyWorld(page);
 const out=await page.evaluate(()=>window.DualSystemResearchAudit.last);
 assert.equal(out.brain,"PASS");assert.equal(out.world,"PASS");assert.equal(out.integration,"PASS");
 await page.locator("#runDualAudit").click();
 assert.equal(await page.locator("#dualEventTimeline li").count(),5);
 assert.deepEqual(await page.evaluate(()=>({brain:localStorage.getItem("aiBrain.v1"),world:localStorage.getItem("worldModel.verify.v1")})),original);
 assert.equal(errs.length,0,errs.join(";"));
 console.log("DUAL_BRAIN_AND_WORLD_PASS id="+id);
}));
test("03 broken First Brain ID does not count as world model failure",()=>withBrowser(async(page,errs)=>{
 await page.goto(root+"/index.html",{waitUntil:"domcontentloaded"});await readyBrain(page);
 await page.goto(root+"/world-model.html?node=n_missing",{waitUntil:"domcontentloaded"});await readyWorld(page);
 const out=await page.evaluate(()=>window.DualSystemResearchAudit.last);
 assert.equal(out.brain,"FAIL");assert.equal(out.world,"PASS");
 assert.equal(out.integration,"FAIL");assert.match(await page.locator("#dualBrainResult").innerText(),/未通過/);
 assert.equal(errs.length,0,errs.join(";"));
 console.log("DUAL_BRAIN_MISSING_ISOLATED_PASS");
}));
test("04 financial calculator uses bounded hypothetical costs not real gains",()=>withBrowser(async(page,errs)=>{
 await page.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await readyWorld(page);
 const set=async(id,value)=>{await page.locator("#"+id).fill(String(value));await page.locator("#"+id).dispatchEvent("input");};
 await set("capital",100000);await set("allocation",30);await set("change",8);await set("cost",0.4);
 assert.match(await page.locator("#pnl").innerText(),/2,280/);
 assert.equal((await page.locator("#roi").innerText()).trim(),"2.28%");
 await set("change",-100);await set("cost",0);
 assert.match(await page.locator("#pnl").innerText(),/30,000/);
 await set("allocation",0);
 assert.match(await page.locator("#pnl").innerText(),/NT\$ 0/);
 assert.equal(errs.length,0,errs.join(";"));
 console.log("DUAL_FINANCE_BOUNDARIES_PASS");
}));
test("05 mobile viewport can read both results and audit timeline",()=>withBrowser(async(page,errs)=>{
 await page.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await readyWorld(page);
 assert.equal(await page.locator("#dual-system-diagnostics").isVisible(),true);
 const scroll=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth}));
 assert.ok(scroll.scroll<=scroll.inner+8,"unexpected horizontal page overflow "+JSON.stringify(scroll));
 assert.equal(await page.locator("#dualWorldResult").innerText(),"PASS（合成與程式）");
 assert.equal(errs.length,0,errs.join(";"));
 console.log("DUAL_WORLD_MOBILE_EMULATED_PASS");
},390,844));

test("06 new world-model v2 status edit preserves complete prior history",()=>withBrowser(async(page,errs)=>{
 await page.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await readyWorld(page);
 await page.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady === '1'");
 await page.locator("details:has(#verifyForm) > summary").click();
 await page.locator("#verifyHypothesis").fill("合成假設：X 必然導致 Y");
 await page.locator("#verifyFalsifier").fill("若 X 發生而 Y 未發生則推翻");
 await page.locator("#verifyDate").fill("2026-03-01");
 await page.locator("#verifyDeadline").fill("2026-12-31");
 await page.locator("#verifyForm button[type=submit]").click();
 await page.waitForFunction("window.WorldVerifyHistory.view().events.length===1");
 const first=await page.evaluate(()=>window.WorldVerifyHistory.view());
 assert.equal(first.ok,true);assert.equal(first.rows.length,1);
 assert.equal(first.rows[0].status,"待驗證");assert.equal(first.events.length,1);
 await page.locator("details:has(#verifyList) > summary").click();
 await page.locator("#verifyList select").selectOption("證據不足");
 await page.waitForFunction("window.WorldVerifyHistory.view().events.length===2");
 const second=await page.evaluate(()=>window.WorldVerifyHistory.view());
 assert.equal(second.ok,true);assert.equal(second.rows[0].status,"證據不足");
 assert.equal(second.events.length,2);
 assert.equal(second.events[1].before.status,"待驗證");
 assert.equal(second.events[1].after.status,"證據不足");
 assert.equal(await page.evaluate(()=>localStorage.getItem("worldModel.verify.v1")),null,"v1 never overwritten");
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady === '1'");
 assert.equal(await page.evaluate(()=>window.WorldVerifyHistory.view().events.length),2);
 assert.equal(await page.evaluate(()=>window.WorldVerifyHistory.at(1).rows[0].status),"待驗證");
 assert.equal(await page.evaluate(()=>window.WorldVerifyHistory.at(2).rows[0].status),"證據不足");
 assert.equal(errs.length,0,errs.join(";"));
 console.log("WORLD_MODEL_VERSION_HISTORY_FIXED_AND_RELOADED");
}));
test("07 legacy v1 remains untouched after v2 edit and version rollback",()=>withBrowser(async(page,errs)=>{
 await page.addInitScript(()=>{
  if(sessionStorage.getItem("v1seeded"))return;sessionStorage.setItem("v1seeded","yes");
  localStorage.setItem("worldModel.verify.v1",JSON.stringify([{
    id:"legacy1",hypothesis:"舊假設",falsifier:"舊反例",createdOn:"2026-04-01",
    deadline:"2026-12-31",source:"",metric:"",status:"待驗證"
  }]));
 });
 await page.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await readyWorld(page);
 await page.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady === '1'");
 const initial=await page.evaluate(()=>localStorage.getItem("worldModel.verify.v1"));
 await page.locator("details:has(#verifyList) > summary").click();
 await page.locator("#verifyList select").selectOption("證據不足");
 await page.waitForFunction("window.WorldVerifyHistory.view().rows[0].status==='證據不足'");
 assert.equal(await page.evaluate(()=>window.WorldVerifyHistory.view().rows[0].status),"證據不足");
 assert.equal(await page.evaluate(()=>localStorage.getItem("worldModel.verify.v1")),initial);
 await page.locator("#worldHistoryPanel > summary").click();
 page.once("dialog",d=>d.accept());
 await page.locator("#worldHistoryVersionZero").click();
 await page.waitForFunction("window.WorldVerifyHistory.view().events.length===2");
 const after=await page.evaluate(()=>window.WorldVerifyHistory.view());
 assert.equal(after.rows[0].status,"待驗證");
 assert.equal(after.events.length,2);
 assert.equal(after.events[1].type,"restore");
 assert.equal(await page.evaluate(()=>localStorage.getItem("worldModel.verify.v1")),initial);
 assert.equal(errs.length,0,errs.join(";"));
 console.log("WORLD_MODEL_LEGACY_RESTORE_PASS");
}));
test("08 corrupt v1 blocks edits and retains original damaged bytes",()=>withBrowser(async(page,errs)=>{
 await page.addInitScript(()=>localStorage.setItem("worldModel.verify.v1","{bad v1"));
 await page.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await readyWorld(page);
 await page.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady === '1'");
 assert.equal(await page.evaluate(()=>window.WorldVerifyHistory.view().reason),"legacy_corrupt");
 const result=await page.evaluate(()=>window.WorldVerifyHistory.append({
   type:"create",row:{id:"v1",hypothesis:"new",falsifier:"bad",createdOn:"2026-10-01",
   deadline:"2026-12-31",status:"待驗證"},reason:"test"}));
 assert.equal(result,false);
 assert.equal(await page.evaluate(()=>localStorage.getItem("worldModel.verify.v1")),"{bad v1");
 assert.equal(await page.evaluate(()=>localStorage.getItem("worldModel.verify.events.v2")),null);
 assert.equal(errs.length,0,errs.join(";"));
 console.log("WORLD_MODEL_CORRUPT_V1_PRESERVED");
}));
test("09 two tabs reject stale history edits instead of replacing events",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const context=await browser.newContext();
 const a=await context.newPage(),b=await context.newPage();
 const ready=p=>p.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady === '1'",null,{timeout:45000});
 const row=id=>({id,hypothesis:"hyp",falsifier:"falsifier",createdOn:"2026-10-01",deadline:"2026-12-31",status:"待驗證"});
 try{
  await a.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await ready(a);
  await b.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await ready(b);
  assert.equal(await a.evaluate(r=>window.WorldVerifyHistory.append({type:"create",row:r,reason:"A creates"}),row("a")),true);
  // Test the advertised stale-state guard only *after* B sees the other-tab event.
  // An unobserved truly concurrent write remains an open race on localStorage.
  await b.waitForFunction(()=>document.querySelector('#worldHistoryStatus')?.textContent?.includes('其他分頁已修改研究'),null,{timeout:15000});
  assert.equal(await b.evaluate(r=>window.WorldVerifyHistory.append({type:"create",row:r,reason:"B old tab"}),row("b")),false);
  assert.equal(await a.evaluate(()=>window.WorldVerifyHistory.view().rows[0].id),"a");
  await b.reload({waitUntil:"domcontentloaded"});await ready(b);
  assert.equal(await b.evaluate(r=>window.WorldVerifyHistory.append({type:"create",row:r,reason:"B after reload"}),row("b")),true);
  const ledger=await b.evaluate(()=>window.WorldVerifyHistory.view());
  assert.equal(ledger.events.length,2);assert.deepEqual(ledger.rows.map(x=>x.id),["a","b"]);
  console.log("WORLD_MODEL_STALE_TAB_REFUSED");
 }finally{await context.close();await browser.close();}
});

test("10 delete from list, restore as new event, then export full backup",()=>withBrowser(async(page,errs)=>{
 await page.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await readyWorld(page);
 await page.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady === '1'");
 const row={id:"hyp-del",hypothesis:"合成舊假設",falsifier:"反例",
   createdOn:"2026-10-01",deadline:"2026-11-01",status:"待驗證"};
 assert.equal(await page.evaluate(r=>window.WorldVerifyHistory.append({type:"create",row:r,reason:"合成測試"}),row),true);
 await page.locator("details:has(#verifyList) > summary").click();
 page.once("dialog",d=>d.accept());
 await page.locator("#verifyList button").click();
 const deleted=await page.evaluate(()=>window.WorldVerifyHistory.view());
 assert.equal(deleted.rows.length,0);assert.equal(deleted.events.length,2);
 assert.equal(deleted.events[1].type,"delete");
 await page.locator("#worldHistoryPanel > summary").click();
 page.once("dialog",d=>d.accept());
 await page.locator("#worldHistoryList button").last().click();
 const restored=await page.evaluate(()=>window.WorldVerifyHistory.view());
 assert.equal(restored.rows[0].id,"hyp-del");
 assert.equal(restored.events.length,3);assert.equal(restored.events.at(-1).type,"restore");
 const [download]=await Promise.all([
  page.waitForEvent("download",{timeout:20000}),
  page.locator("#worldHistoryExport").click()
 ]);
 const backup=JSON.parse(require("node:fs").readFileSync(await download.path(),"utf8"));
 assert.equal(backup.legacyRaw,null);
 assert.equal(JSON.parse(backup.ledgerRaw).events.length,3);
 assert.equal(errs.length,0,errs.join(";"));
 console.log("WORLD_MODEL_DELETE_RESTORE_BACKUP_PASS");
}));
test("11 import old compatible JSON into version history without touching original v1",()=>withBrowser(async(page,errs)=>{
 await page.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await readyWorld(page);
 await page.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady === '1'");
 const data={schema:"worldModel.verify.v1",records:[{
  id:"external1",hypothesis:"合成匯入假設",falsifier:"合成反例",createdOn:"2026-01-01",
  deadline:"2026-12-31",source:"",metric:"",status:"待驗證"
 }]};
 await page.locator("details:has(#verifyList) > summary").click();
 page.once("dialog",d=>d.accept());
 await page.locator("#verifyImport").setInputFiles({
  name:"test-export.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data),"utf8")
 });
 await page.waitForFunction("window.WorldVerifyHistory?.view().events.length === 1");
 const now=await page.evaluate(()=>window.WorldVerifyHistory.view());
 assert.equal(now.ok,true);assert.equal(now.rows.length,1);assert.equal(now.events[0].type,"import");
 assert.equal(now.rows[0].hypothesis,"合成匯入假設");
 assert.equal(await page.evaluate(()=>localStorage.getItem("worldModel.verify.v1")),null);
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady === '1'");
 assert.equal(await page.evaluate(()=>window.WorldVerifyHistory.view().rows[0].hypothesis),"合成匯入假設");
 assert.equal(errs.length,0,errs.join(";"));
 console.log("WORLD_MODEL_IMPORT_HISTORY_RELOAD_PASS");
}));
test("12 real browser quota injection does not report a successful journal write",()=>withBrowser(async(page,errs)=>{
 await page.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await readyWorld(page);
 await page.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady === '1'");
 const outcome=await page.evaluate(async()=>{
  const previous=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){
   if(k==="worldModel.verify.events.v2")throw new DOMException("full","QuotaExceededError");
   return previous.call(this,k,v);
  };
  try{
   const success=await window.WorldVerifyHistory.append({
    type:"create",row:{id:"quota",hypothesis:"合成",falsifier:"反例",
      createdOn:"2026-10-01",deadline:"2026-12-31",status:"待驗證"},
    reason:"配額測試"});
   return {success,legacy:localStorage.getItem("worldModel.verify.v1"),
     journal:localStorage.getItem("worldModel.verify.events.v2")};
  }finally{Storage.prototype.setItem=previous;}
 });
 assert.equal(outcome.success,false);
 assert.equal(outcome.legacy,null);assert.equal(outcome.journal,null);
 assert.match(await page.locator("#worldHistoryStatus").innerText(),/storage_write_failed/);
 assert.equal(errs.length,0,errs.join(";"));
 console.log("WORLD_MODEL_QUOTA_NEGATIVE_PASS");
}));
