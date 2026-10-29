"use strict";
/* R16 real 3D UI: only synthetic legacy graph derived from seeded public graph.
 * Check source/undo exact bytes, lineage, unknown fields, IDB migration, edit/undo/reload.
 * Does not use actual user history or declare full historic corpus coverage.
 */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const ready=page=>page.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});
test("R16 unversioned 3D synthetic historical snapshot: preserve raw, node links and Undo through IDB roundtrip",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 try{
  await page.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(page);
  const original=await page.evaluate(()=>{
   const graph=window.AIBrain.getState(),historical=structuredClone(graph);
   delete historical.version;
   historical.nodes[0].title="歷史問題・🧠 R16";
   historical.nodes[0].legacyExternal={sourceId:"old-graph-001",lineage:"keep-unknown-metadata"};
   historical.history.push({ts:100,action:"historic-branch",payload:{nodeId:historical.nodes[0].id,reason:"nonlinear-review"}});
   for(const node of historical.nodes){delete node.concepts;delete node.processPattern;}
   const before=structuredClone(historical);
   before.nodes[0].title="上次保存的原始名稱 R16";
   before.version=1;
   const mainRaw="  "+JSON.stringify(historical,null,2)+"\n";
   const priorRaw=JSON.stringify(before);
   const undoRaw=JSON.stringify([priorRaw]);
   localStorage.setItem("aiBrain.v1",mainRaw);
   localStorage.setItem("aiBrain.v1.undo",undoRaw);
   return {mainRaw,undoRaw,nodeId:historical.nodes[0].id,count:historical.nodes.length,
    linkCount:historical.links.length,historyCount:historical.history.length,
    priorRaw};
  });
  await page.reload({waitUntil:"domcontentloaded"});await ready(page);
  const before=await page.evaluate(async()=>{
   const a=await import("/first-brain-idb-adapter.mjs");
   const v=a.inspectLegacy3D(localStorage);
   const rendered=window.AIBrain.getState();
   return {ok:v.ok,reason:v.reason,mainRaw:v.mainRaw,undoRaw:v.undoRaw,
    state:rendered,actualMain:localStorage.getItem("aiBrain.v1"),
    actualUndo:localStorage.getItem("aiBrain.v1.undo")};
  });
  assert.equal(before.ok,true,before.reason);
  assert.equal(before.mainRaw,original.mainRaw);
  assert.equal(before.actualMain,original.mainRaw,"legacy opening must not silently rewrite main bytes");
  assert.equal(before.actualUndo,original.undoRaw,"legacy opening must not silently rewrite undo bytes");
  assert.equal(before.state.nodes.length,original.count);
  assert.equal(before.state.links.length,original.linkCount);
  assert.equal(before.state.nodes[0].legacyExternal.sourceId,"old-graph-001");
  assert.ok(before.state.history.some(h=>h.action==="historic-branch"));
  await page.goto(ROOT+"/index.html?brainTx=1",{waitUntil:"domcontentloaded"});await ready(page);
  assert.equal((await page.evaluate(()=>window.AIBrain.persistence())).ready,false);
  const [dl]=await Promise.all([page.waitForEvent("download",{timeout:15000}),page.locator("#brainTxBackup").click()]);
  const backup=JSON.parse(fs.readFileSync(await dl.path(),"utf8"));
  assert.equal(backup.mainRaw,original.mainRaw);
  assert.equal(backup.undoRaw,original.undoRaw);
  page.once("dialog",d=>d.accept());
  await page.locator("#brainTxActivate").click();
  await page.waitForFunction("window.AIBrain?.persistence().ready===true",null,{timeout:30000});
  const staged=await page.evaluate(async()=>{
   const raw=await (await import("/transactional-brain-store.mjs")).readSnapshot(
    "aiBrain.firstBrain.transaction.r1","aiBrain.v1");
   return {raw,graph:window.AIBrain.getState(),rev:window.AIBrain.persistence().revision,
    legacyMain:localStorage.getItem("aiBrain.v1"),legacyUndo:localStorage.getItem("aiBrain.v1.undo")};
  });
  assert.equal(staged.rev,1);
  assert.equal(staged.raw.snapshot.mainRaw,original.mainRaw,"source raw bytes must survive transaction");
  assert.equal(staged.raw.snapshot.undoRaw,original.undoRaw);
  assert.equal(staged.legacyMain,original.mainRaw);
  assert.equal(staged.legacyUndo,original.undoRaw);
  assert.equal(staged.graph.nodes[0].legacyExternal.lineage,"keep-unknown-metadata");
  assert.equal(staged.graph.nodes.length,original.count);
  const changed=await page.evaluate(async id=>{
   window.AIBrain.setStatus(id,"researching");
   const accepted=await window.AIBrain.whenIdle();
   return {accepted,graph:window.AIBrain.getState(),rev:window.AIBrain.persistence().revision};
  },original.nodeId);
  assert.equal(changed.accepted,true);
  assert.equal(changed.rev,2);
  assert.equal(changed.graph.nodes[0].legacyExternal.sourceId,"old-graph-001");
  assert.equal(changed.graph.nodes.length,original.count);
  assert.equal(changed.graph.links.length,original.linkCount);
  assert.equal(await page.evaluate(()=>window.AIBrain.undo()),true);
  assert.equal((await page.evaluate(()=>window.AIBrain.persistence())).revision,3);
  await page.reload({waitUntil:"domcontentloaded"});await ready(page);
  const reloaded=await page.evaluate(()=>({
   graph:window.AIBrain.getState(),p:window.AIBrain.persistence(),
   raw:localStorage.getItem("aiBrain.v1"),undo:localStorage.getItem("aiBrain.v1.undo")
  }));
  assert.equal(reloaded.p.ready,true);
  assert.equal(reloaded.p.revision,3);
  assert.equal(reloaded.graph.nodes[0].legacyExternal.sourceId,"old-graph-001");
  assert.equal(reloaded.graph.nodes[0].title,"歷史問題・🧠 R16");
  assert.equal(reloaded.graph.links.length,original.linkCount);
  assert.equal(reloaded.raw,original.mainRaw);
  assert.equal(reloaded.undo,original.undoRaw);
  assert.deepEqual(errors,[]);
  console.log("FIRST_BRAIN_R16_HISTORICAL_ROUNDTRIP_PASS unversioned=1 source_bytes=1 undo_bytes=1 lineage=1 idb=1 undo=1 reload=1");
 }finally{await context.close();await browser.close();}
});
test("R16 corrupt historical graph is held without automatic repair or seeding its original bytes",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const ctx=await browser.newContext(),page=await ctx.newPage();
 try{
  await page.goto(ROOT+"/tests/fixtures/transactional-store.html",{waitUntil:"domcontentloaded"});
  const raw='{"version":999,"brains":[{"id":"main"}],"nodes":[],"links":[],"history":[]}';
  await page.evaluate(raw=>localStorage.setItem("aiBrain.v1",raw),raw);
  await page.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(page);
  const checked=await page.evaluate(async()=>{
   const a=await import("/first-brain-idb-adapter.mjs");
   const attempted=a.inspectLegacy3D(localStorage);
   return {attempted,raw:localStorage.getItem("aiBrain.v1"),
    initial:window.AIBrain.getState(),ready:window.AIBrain.persistence().ready};
  });
  assert.equal(checked.attempted.reason,"graph_unsupported_graph_version");
  assert.equal(checked.raw,raw,"invalid history must not be overwritten");
  assert.equal(checked.ready,false,"dangerous legacy store cannot be edited");
 }finally{await ctx.close();await browser.close();}
});
