"use strict";
// Actual 3D First Brain page + new transactional adapter, no legacy writes/migration.
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const MODULE="/first-brain-idb-adapter.mjs";
const ready=p=>p.waitForFunction("window.AIBrain && document.body.dataset.ready === '1'",null,{timeout:45000});
test("R03-05 real first-brain 3D graph: explicit staging, concurrent candidate edit, legacy preserved",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const ctx=await browser.newContext();
 const a=await ctx.newPage(),b=await ctx.newPage();
 const errors=[];a.on("pageerror",e=>errors.push(String(e)));b.on("pageerror",e=>errors.push(String(e)));
 const db="first-brain-isolated-"+Date.now()+"-"+Math.random().toString(36).slice(2);
 const call=(p,fn,args)=>p.evaluate(async({fn,args,mod})=>{
  const api=await import(mod);
  if(fn==="inspect")return api.inspectLegacy3D(localStorage);
  if(fn==="stage")return api.stageLegacy3D(args.db,localStorage,{confirmed:args.confirmed});
  if(fn==="read")return api.readTransactional3D(args.db);
  if(fn==="commit"){
   const snapshot=await api.readTransactional3D(args.db);
   if(!snapshot.ok)return snapshot;
   const original=JSON.stringify(snapshot.graph);
   snapshot.graph.nodes[0].title=args.title;
   return api.commitTransactional3D(args.db,args.expectedRevision,snapshot.graph,
    [...snapshot.undo,original].slice(-12));
  }
  if(fn==="bad"){
   const badStorage={getItem:key=>key===api.MAIN_KEY?args.raw:'[]'};
   return api.inspectLegacy3D(badStorage);
  }
  throw Error("bad test call");
 },{fn,args,mod:MODULE});
 try{
  await a.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(a);
  await b.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(b);
  const baseline=await a.evaluate(()=>({main:localStorage.getItem("aiBrain.v1"),
    undo:localStorage.getItem("aiBrain.v1.undo"),graph:window.AIBrain.getState()}));
  assert.ok(baseline.main&&baseline.graph.nodes.length>100,"real existing 3D state");
  const inspect=await call(a,"inspect",{});
  assert.equal(inspect.ok,true,"existing graph is validated, not transformed");
  assert.equal(inspect.mainRaw,baseline.main,"identical legacy bytes");
  assert.equal((await call(a,"stage",{db,confirmed:false})).reason,"explicit_confirmation_required");
  const notYet=await call(a,"read",{db});
  assert.equal(notYet.reason,"transactional_snapshot_missing","no staging without consent");
  assert.equal((await call(a,"bad",{raw:"{broken"})).reason,"graph_json_invalid");
  assert.equal((await call(a,"bad",{raw:JSON.stringify({...baseline.graph,version:999})})).reason,
    "graph_unsupported_graph_version","reject explicitly future version");
  const staged=await call(a,"stage",{db,confirmed:true});
  assert.equal(staged.ok,true);
  assert.equal(staged.revision,1);
  assert.equal((await call(b,"stage",{db,confirmed:true})).reason,"transactional_snapshot_exists",
    "second staging cannot replace live transactional copy");
  const [sa,sb]=await Promise.all([call(a,"read",{db}),call(b,"read",{db})]);
  assert.ok(sa.ok&&sb.ok);
  assert.equal(sa.mainRaw,baseline.main);
  assert.deepEqual(sa.graph.nodes.map(n=>n.id),baseline.graph.nodes.map(n=>n.id),
    "actual First Brain graph and IDs preserved");
  assert.equal(sa.revision,1);
  const results=await Promise.all([
   call(a,"commit",{db,expectedRevision:1,title:"R03-3D-A"}),
   call(b,"commit",{db,expectedRevision:1,title:"R03-3D-B"})
  ]);
  assert.equal(results.filter(r=>r.ok).length,1,"only one genuine 3D graph edit commits");
  assert.equal(results.filter(r=>r.reason==="stale_revision").length,1,
    "losing tab explicitly rejected");
  const after=await call(b,"read",{db});
  assert.equal(after.revision,2);
  assert.ok(["R03-3D-A","R03-3D-B"].includes(after.graph.nodes[0].title));
  assert.equal(after.undo.length,1);
  assert.equal(JSON.parse(after.undo[0]).nodes[0].title,baseline.graph.nodes[0].title);
  assert.equal((await call(a,"commit",{db,expectedRevision:1,title:"R03-STALE"})).reason,
    "stale_revision");
  const retained=await a.evaluate(()=>({main:localStorage.getItem("aiBrain.v1"),
    undo:localStorage.getItem("aiBrain.v1.undo")}));
  assert.equal(retained.main,baseline.main,"legacy First Brain authoritative UI remains unchanged");
  assert.equal(retained.undo,baseline.undo,"legacy Undo bytes untouched");
  await b.reload({waitUntil:"domcontentloaded"});await ready(b);
  assert.equal((await call(b,"read",{db})).graph.nodes[0].title,after.graph.nodes[0].title);
  assert.equal(await b.evaluate(()=>window.AIBrain.getState().nodes[0].title),
    baseline.graph.nodes[0].title,"UI still uses legacy authority: NO false deployment claim");
  assert.equal(errors.length,0,errors.join("|"));
  console.log("R03_FIRST_BRAIN_IDB_ADAPTER_PASS real3D=1 concurrent_edits=2 committed=1 stale=1 undo=1 legacy_preserved=1");
 }finally{await ctx.close();await browser.close();}
});

test("First Brain staging refuses changed backup bytes and detects a late legacy edit",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const ctx=await browser.newContext(),page=await ctx.newPage();
 const db="backup-change-isolated-"+Date.now()+"-"+Math.random().toString(36).slice(2);
 const db2=db+"-late";
 try{
  await page.goto(ROOT+"/tests/fixtures/transactional-store.html",{waitUntil:"domcontentloaded"});
  const result=await page.evaluate(async({db,db2})=>{
   const a=await import("/first-brain-idb-adapter.mjs");
   const original={version:1,brains:[{id:"main",parentBrainId:null}],nodes:[
    {id:"n1",title:"before",brainId:"main",parentId:null,pos:[0,0,0]}],links:[],history:[]};
   const changed={...original,nodes:[{...original.nodes[0],title:"another-tab-updated"}]};
   const mainRaw=JSON.stringify(original),newRaw=JSON.stringify(changed);
   localStorage.setItem(a.MAIN_KEY,mainRaw);
   localStorage.setItem(a.UNDO_KEY,"[]");
   const downloaded={mainRaw,undoRaw:"[]"};
   localStorage.setItem(a.MAIN_KEY,newRaw);
   const stale=await a.stageLegacy3D(db,localStorage,{
    confirmed:true,expectedMainRaw:downloaded.mainRaw,expectedUndoRaw:downloaded.undoRaw
   });
   const unchangedDb=await a.readTransactional3D(db);
   localStorage.setItem(a.MAIN_KEY,mainRaw);
   localStorage.setItem(a.UNDO_KEY,JSON.stringify([mainRaw]));
   const undoStale=await a.stageLegacy3D(db,localStorage,{
    confirmed:true,expectedMainRaw:downloaded.mainRaw,expectedUndoRaw:downloaded.undoRaw
   });
   localStorage.setItem(a.UNDO_KEY,"[]");
   const put=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){
    if(this.name==="snapshots")localStorage.setItem(a.MAIN_KEY,newRaw);
    return put.apply(this,args);
   };
   let late;
   try{
    late=await a.stageLegacy3D(db2,localStorage,{
      confirmed:true,expectedMainRaw:mainRaw,expectedUndoRaw:"[]"
    });
   }finally{IDBObjectStore.prototype.put=put;}
   const copy=await a.readTransactional3D(db2);
   return {stale,unchangedDb,undoStale,late,copy,now:localStorage.getItem(a.MAIN_KEY),
    authority:localStorage.getItem("aiBrain.v1.persistence.authority"),mainRaw,newRaw};
  },{db,db2});
  assert.equal(result.stale.reason,"legacy_source_changed_since_backup");
  assert.equal(result.unchangedDb.reason,"transactional_snapshot_missing");
  assert.equal(result.undoStale.reason,"legacy_undo_changed_since_backup");
  assert.equal(result.late.reason,"legacy_source_changed_during_stage");
  assert.equal(result.copy.ok,true,"staged earlier bytes remain safely available for review");
  assert.equal(result.copy.mainRaw,result.mainRaw);
  assert.equal(result.now,result.newRaw,"external edit remains untouched");
  assert.equal(result.authority,null,"staging test never claims a completed cutover");
  console.log("FIRST_BRAIN_LEGACY_BACKUP_MATCH_GATE_PASS changed_main=1 changed_undo=1 during_stage=1");
 }finally{await ctx.close();await browser.close();}
});
