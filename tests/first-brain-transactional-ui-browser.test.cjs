"use strict";
// Real 3D UI opt-in transactional flow. Synthetic seeded browser data only.
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const waitReady=page=>page.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});
test("First Brain 3D user UI: backup -> enable IDB -> edit/import/undo/reset -> two tabs",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const ctx=await browser.newContext({acceptDownloads:true});
 const legacy=await ctx.newPage(),a=await ctx.newPage(),b=await ctx.newPage(),feed=await ctx.newPage(),world=await ctx.newPage();
 const errs=[];for(const p of [legacy,a,b,feed,world])p.on("pageerror",e=>errs.push(String(e)));
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
  // Real First Brain operations beyond persistence: grow -> branch -> subbrain
  // -> merge -> concept. Each must survive its own transaction.
  const grown=await a.evaluate(async()=>{
    const id=window.AIBrain.addQuestion({title:"IDB_SYNTHETIC_NEW_QUESTION",type:"其他",extensions:[]});
    const ok=await window.AIBrain.whenIdle();
    return {id,ok,present:window.AIBrain.getState().nodes.some(n=>n.id===id)};
  });
  assert.equal(grown.ok,true);assert.equal(grown.present,true);
  const branched=await a.evaluate(async id=>{
    const ids=window.AIBrain.splitNode(id,[{title:"IDB_SYNTHETIC_BRANCH",type:"其他"}]);
    const ok=await window.AIBrain.whenIdle();
    return {ids,ok,present:ids.every(child=>window.AIBrain.getState().nodes.some(n=>n.id===child))};
  },grown.id);
  assert.equal(branched.ok,true);assert.equal(branched.present,true);
  const sub=await a.evaluate(async id=>{
    const brainId=window.AIBrain.makeSubBrain(id);
    const ok=await window.AIBrain.whenIdle();
    return {brainId,ok,present:window.AIBrain.getState().brains.some(b=>b.id===brainId)};
  },grown.id);
  assert.equal(sub.ok,true);assert.equal(sub.present,true);
  const merged=await a.evaluate(async id=>{
    window.AIBrain.mergeBrain(id);
    const ok=await window.AIBrain.whenIdle();
    return {ok,removed:!window.AIBrain.getState().brains.some(b=>b.id===id)};
  },sub.brainId);
  assert.equal(merged.ok,true);assert.equal(merged.removed,true);
  const conceptual=await a.evaluate(async id=>{
    const accepted=window.AIBrain.addConcept(id,"合成推理");
    const ok=await window.AIBrain.whenIdle();
    return {accepted,ok,concept:window.AIBrain.getState().nodes.find(n=>n.id===id)?.concepts};
  },grown.id);
  assert.equal(conceptual.accepted,true);assert.equal(conceptual.ok,true);
  assert.ok(conceptual.concept.includes("合成推理"));
  const badSchema=await a.evaluate(async()=>{
    const graph=window.AIBrain.getState();
    graph.version=999;
    const version=window.AIBrain.persistence().revision;
    const accepted=window.AIBrain.importJSON(graph);
    return {accepted,unchanged:version===window.AIBrain.persistence().revision};
  });
  assert.deepEqual(badSchema,{accepted:false,unchanged:true});
  const imported=await a.evaluate(async()=>{
   const graph=window.AIBrain.getState();
   graph.nodes[0].title="IDB_IMPORT_E2E";
   const result=await window.AIBrain.importJSON(graph);
   return {result,title:window.AIBrain.getState().nodes[0].title};
  });
  assert.deepEqual(imported,{result:true,title:"IDB_IMPORT_E2E"});
  // The actual existing Feed and world-model read-only source must follow
  // the active First Brain IDB authority, never its preserved legacy bytes.
  await feed.goto(ROOT+"/feed.html#node="+encodeURIComponent(id),{waitUntil:"domcontentloaded"});
  await feed.waitForFunction("window.AIFeed && document.body.dataset.ready==='1'",null,{timeout:45000});
  const linkedFeed=await feed.evaluate(id=>({source:window.AIFeed.authority(),node:window.AIFeed.getNode(id)}),id);
  assert.equal(linkedFeed.source.source,"idb");
  assert.equal(linkedFeed.node.title,"IDB_IMPORT_E2E");
  await world.goto(ROOT+"/world-model.html?node="+encodeURIComponent(id),{waitUntil:"domcontentloaded"});
  await world.waitForFunction("document.body.dataset.researchLink==='linked' && document.body.dataset.dualAuditReady==='1'",null,{timeout:45000});
  assert.equal(await world.evaluate(()=>window.BrainResearchLink.sourceNodeId),id);
  assert.match(await world.locator("#researchNodeTitle").innerText(),/IDB_IMPORT_E2E/);
  assert.match(await world.locator("#researchToBrain").getAttribute("href"),/brainTx=1/);
  assert.equal(await a.evaluate(()=>window.AIBrain.undo()),true,"real undo commits transaction");
  // Existing open Feed updates after transaction broadcast.
  await feed.waitForFunction(id=>window.AIFeed.getNode(id)?.title!=="IDB_IMPORT_E2E",id,{timeout:15000});
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
  console.log("FIRST_BRAIN_TX_UI_ROUNDTRIP_PASS native3D=1 old_tab_blocked=1 competing_tabs=2 grow=1 branch=1 subbrain=1 merge=1 concept=1 import=1 undo=2 reset=1 feed_linked=1 world_source_linked=1 legacy_bytes_unchanged=1");
 }finally{await ctx.close();await browser.close();}
});
