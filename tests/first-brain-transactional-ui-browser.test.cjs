"use strict";
// Real 3D UI opt-in transactional flow. Synthetic seeded browser data only.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const waitReady=page=>page.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});
test("First Brain 3D user UI: backup -> enable IDB -> edit/import/undo/reset -> two tabs",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const ctx=await browser.newContext({acceptDownloads:true});
 const legacy=await ctx.newPage(),a=await ctx.newPage(),b=await ctx.newPage();
 const errs=[];for(const p of [legacy,a,b])p.on("pageerror",e=>errs.push(String(e)));
 try{
  await legacy.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await waitReady(legacy);
  const original=await legacy.evaluate(()=>({main:localStorage.getItem("aiBrain.v1"),undo:localStorage.getItem("aiBrain.v1.undo"),graph:window.AIBrain.getState()}));
  assert.ok(original.main&&original.graph.nodes.length>100);
  await a.goto(ROOT+"/index.html?brainTx=1",{waitUntil:"domcontentloaded"});await waitReady(a);
  assert.deepEqual(await a.evaluate(()=>window.AIBrain.persistence()),{
   mode:"transactional",ready:false,revision:0,pending:false,reason:"transactional_snapshot_missing"});
  const id=original.graph.nodes[0].id;
  await a.evaluate(id=>window.AIBrain.setStatus(id,"researching"),id);
  assert.equal(await a.evaluate(()=>localStorage.getItem("aiBrain.v1")),original.main,"disabled transactional mode does not write");
  assert.equal(await a.locator("#brainTxActivate").isEnabled(),false);
  const [download]=await Promise.all([a.waitForEvent("download",{timeout:20000}),a.locator("#brainTxBackup").click()]);
  const raw=JSON.parse(fs.readFileSync(await download.path(),"utf8"));
  assert.equal(raw.mainRaw,original.main);
  assert.equal(raw.undoRaw,original.undo);
  assert.equal(await a.locator("#brainTxActivate").isEnabled(),true);
  a.once("dialog",d=>d.accept());
  await a.locator("#brainTxActivate").click();
  await a.waitForFunction("window.AIBrain?.persistence().ready===true",null,{timeout:25000});
  const state=await a.evaluate(()=>window.AIBrain.persistence());
  assert.equal(state.mode,"transactional");
  assert.equal(state.revision,1);
  assert.equal(await a.evaluate(()=>localStorage.getItem("aiBrain.v1.persistence.authority")),"idb");
  assert.equal(await a.evaluate(()=>localStorage.getItem("aiBrain.v1")),original.main);
  // Original legacy tab loaded before the authority cutover must refuse writes.
  await legacy.evaluate(id=>window.AIBrain.setStatus(id,"resolved"),id);
  assert.equal(await legacy.evaluate(()=>localStorage.getItem("aiBrain.v1")),original.main);
  assert.equal(await legacy.evaluate(()=>window.AIBrain.getState().nodes[0].status),original.graph.nodes[0].status);
  const first=await a.evaluate(async id=>{
   window.AIBrain.setStatus(id,"researching");
   const success=await window.AIBrain.whenIdle();
   return {success,p:window.AIBrain.persistence(),status:window.AIBrain.getState().nodes[0].status};
  },id);
  assert.equal(first.success,true);
  assert.equal(first.status,"researching");
  assert.equal(first.p.revision,2);
  assert.equal(await a.evaluate(()=>localStorage.getItem("aiBrain.v1")),original.main,"legacy unchanged after IDB edit");
  await b.goto(ROOT+"/index.html?brainTx=1",{waitUntil:"domcontentloaded"});await waitReady(b);
  assert.equal((await b.evaluate(()=>window.AIBrain.persistence())).revision,2);
  const stale=await Promise.all([
   a.evaluate(async id=>{window.AIBrain.setStatus(id,"resolved");return window.AIBrain.whenIdle();},id),
   b.evaluate(async id=>{window.AIBrain.setStatus(id,"open");return window.AIBrain.whenIdle();},id)
  ]);
  assert.equal(stale.filter(Boolean).length,1,"two real 3D tabs cannot both commit expected revision");
  const revision3=await a.evaluate(()=>window.AIBrain.persistence().revision);
  const revision3b=await b.evaluate(()=>window.AIBrain.persistence().revision);
  assert.ok([revision3,revision3b].includes(3));
  await a.reload({waitUntil:"domcontentloaded"});await waitReady(a);
  assert.equal((await a.evaluate(()=>window.AIBrain.persistence())).revision,3);
  const imported=await a.evaluate(async()=>{
   const graph=window.AIBrain.getState();
   graph.nodes[0].title="IDB_IMPORT_E2E";
   const result=await window.AIBrain.importJSON(graph);
   return {result,title:window.AIBrain.getState().nodes[0].title};
  });
  assert.deepEqual(imported,{result:true,title:"IDB_IMPORT_E2E"});
  assert.equal(await a.evaluate(()=>window.AIBrain.undo()),true,"real undo commits transaction");
  assert.equal(await a.evaluate(()=>window.AIBrain.reset()),true,"real reset commits transaction");
  assert.equal(await a.evaluate(()=>window.AIBrain.undo()),true,"reset restored through transaction");
  await a.reload({waitUntil:"domcontentloaded"});await waitReady(a);
  const finished=await a.evaluate(()=>({p:window.AIBrain.persistence(),state:window.AIBrain.getState(),
     main:localStorage.getItem("aiBrain.v1"),undo:localStorage.getItem("aiBrain.v1.undo")}));
  assert.ok(finished.p.revision>=7);
  assert.notEqual(finished.state.nodes[0].title,"IDB_IMPORT_E2E");
  assert.equal(finished.main,original.main);
  assert.equal(finished.undo,original.undo);
  assert.deepEqual(errs,[],"no page exceptions");
  console.log("FIRST_BRAIN_TX_UI_ROUNDTRIP_PASS native3D=1 old_tab_blocked=1 competing_tabs=2 import=1 undo=2 reset=1 legacy_bytes_unchanged=1");
 }finally{await ctx.close();await browser.close();}
});
