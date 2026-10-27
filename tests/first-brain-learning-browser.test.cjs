"use strict";
// R11 browser E2E: experience journal is part of the existing First Brain graph,
// not a separate AI memory service or automatic truth authority.
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const ready=page=>page.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});
test("First Brain learns from both failed and successful observations without unverified rule promotion",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const ctx=await browser.newContext({acceptDownloads:true}),page=await ctx.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 try{
  await page.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(page);
  const id=await page.evaluate(()=>window.AIBrain.getState().nodes[0].id);
  await page.evaluate(id=>window.AIBrain.select(id),id);
  await page.locator("#learnPanel summary").click();
  const send=async input=>{
   await page.locator("#learningForm [name=outcome]").selectOption(input.outcome);
   for(const name of ["conditions","observation","rootCause","lesson","evidence"]){
    await page.locator("#learningForm [name="+name+"]").fill(input[name]||"");
   }
   await page.locator("#learningForm button[type=submit]").click();
   await page.waitForFunction(id=>(window.AIBrain.getState().nodes.find(n=>n.id===id)?.learningRecords||[]).length>0,id);
  };
  await send({outcome:"failed",conditions:"R11 舊版匯入",observation:"合成版本衝突",rootCause:"驗證器差異",
    lesson:"先保留來源版本並比較",evidence:"CI-R11-neg-001"});
  let l=await page.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).learningRecords,id);
  assert.equal(l.length,1);assert.equal(l[0].stage,"observed");
  assert.deepEqual(await page.evaluate(()=>window.AIBrain.findLearningLessons("R11 舊版匯入")),[],
    "an observation alone must not be treated as a trusted rule");
  page.once("dialog",d=>d.accept());
  await page.locator("[data-learning-review]").click();
  await page.waitForFunction(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).learningRecords[0].stage==="person_reviewed",id);
  await page.locator("#learningFindForm [name=conditions]").fill("R11 舊版匯入");
  await page.locator("#learningFindForm button[type=submit]").click();
  assert.match(await page.locator("#learningMatches").innerText(),/先保留來源版本並比較/);
  assert.equal((await page.evaluate(()=>window.AIBrain.findLearningLessons("完全不同條件"))).length,0);
  await page.reload({waitUntil:"domcontentloaded"});await ready(page);
  l=await page.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).learningRecords,id);
  assert.equal(l.length,1);assert.equal(l[0].stage,"person_reviewed");
  const originalRaw=await page.evaluate(()=>localStorage.getItem("aiBrain.v1"));
  // Switch by explicit backup and confirmation into the real 3D transactional mode.
  await page.goto(ROOT+"/index.html?brainTx=1",{waitUntil:"domcontentloaded"});await ready(page);
  const [download]=await Promise.all([page.waitForEvent("download"),page.locator("#brainTxBackup").click()]);
  assert.ok(download.suggestedFilename().includes("legacy"));
  page.once("dialog",d=>d.accept());
  await page.locator("#brainTxActivate").click();
  await page.waitForFunction("window.AIBrain?.persistence().ready===true",null,{timeout:30000});
  l=await page.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).learningRecords,id);
  assert.equal(l.length,1,"reviewed legacy knowledge staged byte-for-byte");
  const idbVersion=await page.evaluate(()=>window.AIBrain.persistence().revision);
  await page.evaluate(id=>window.AIBrain.select(id),id);
  await page.locator("#learnPanel summary").click();
  await send({outcome:"worked",conditions:"R11 修復已通過",observation:"Node 回歸全部通過",
    lesson:"保存負例及提交版本",evidence:"CI-R11-pos-002"});
  await page.waitForFunction(id=>(window.AIBrain.getState().nodes.find(n=>n.id===id).learningRecords||[]).length===2,id);
  assert.equal(await page.evaluate(()=>window.AIBrain.persistence().revision),idbVersion+1);
  assert.equal((await page.evaluate(()=>window.AIBrain.findLearningLessons("R11 修復已通過"))).length,0,
    "positive feedback also cannot auto-promote without review");
  const outcome=await page.evaluate(()=>window.AIBrain.undo());
  assert.equal(await Promise.resolve(outcome),true);
  assert.equal((await page.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).learningRecords.length,id)),1);
  await page.reload({waitUntil:"domcontentloaded"});await ready(page);
  assert.equal((await page.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).learningRecords.length,id)),1);
  assert.equal(await page.evaluate(()=>localStorage.getItem("aiBrain.v1")),originalRaw,
    "original legacy bytes remain untouched even after learning and undo");
  assert.deepEqual(errors,[]);
  console.log("FIRST_BRAIN_LEARNING_FEEDBACK_PASS legacy_record=1 evidence_review=1 exact_match=1 idb_roundtrip=1 undo=1 no_false_truth=1");
 }finally{await ctx.close();await browser.close();}
});
