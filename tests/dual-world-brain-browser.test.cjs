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

test("06 existing world-model status edit loses old state: known version-chain GAP",()=>withBrowser(async(page,errs)=>{
 await page.goto(root+"/world-model.html",{waitUntil:"domcontentloaded"});await readyWorld(page);
 await page.locator("#verifyHypothesis").fill("合成假設：X 必然導致 Y");
 await page.locator("#verifyFalsifier").fill("若 X 發生而 Y 未發生則推翻");
 await page.locator("#verifyDate").fill("2026-03-01");
 await page.locator("#verifyDeadline").fill("2026-12-31");
 await page.locator("#verifyForm button[type=submit]").click();
 const first=await page.evaluate(()=>JSON.parse(localStorage.getItem("worldModel.verify.v1")));
 assert.equal(first.length,1);assert.equal(first[0].status,"待驗證");
 await page.locator("#verifyList select").selectOption("證據不足");
 const second=await page.evaluate(()=>JSON.parse(localStorage.getItem("worldModel.verify.v1")));
 assert.equal(second.length,1);assert.equal(second[0].id,first[0].id);
 assert.equal(second[0].status,"證據不足");
 assert.equal(Object.hasOwn(second[0],"events"),false);
 assert.equal(Object.hasOwn(second[0],"versions"),false);
 assert.equal(errs.length,0,errs.join(";"));
 console.log("WORLD_MODEL_VERSION_HISTORY_GAP_CONFIRMED (current v1 mutates status; gate remains BLOCKED)");
}));
