"use strict";
/* R13 desktop WebKit on Linux is NOT Safari/iOS hardware certification.
 * It tests IndexedDB transactional candidate on an independent browser engine.
 */
const test=require("node:test"),assert=require("node:assert/strict");
const {webkit}=require("playwright-core");
const URL="http://127.0.0.1:8765/tests/fixtures/transactional-store.html";
const graph=(name,version)=>({version,brains:[{id:"main",parentBrainId:null}],nodes:[
 {id:"firstbrain-node",brainId:"main",parentId:null,pos:[0,0,0],title:name}],links:[],history:[]});
test("R13 WebKit two-tab IDB single-authority, unchanged legacy, migration and abort",async()=>{
 const browser=await webkit.launch({headless:true});
 const ctx=await browser.newContext();
 const a=await ctx.newPage(),b=await ctx.newPage(),errors=[];
 for(const page of [a,b])page.on("pageerror",e=>errors.push(String(e)));
 try{
  await Promise.all([a.goto(URL),b.goto(URL)]);
  const name="first-brain-webkit-"+Date.now()+"-"+Math.random().toString(36).slice(2);
  const initial=JSON.stringify(graph("legacy-v1",1));
  const snapshot=await a.evaluate(async({db,raw})=>{
    const adapter=await import("/first-brain-idb-adapter.mjs");
    localStorage.setItem(adapter.MAIN_KEY,raw);localStorage.setItem(adapter.UNDO_KEY,"[]");
    const preview=adapter.inspectLegacy3D(localStorage);
    const denied=await adapter.stageLegacy3D(db,localStorage,{confirmed:false});
    const copied=await adapter.stageLegacy3D(db,localStorage,{
      confirmed:true,expectedMainRaw:raw,expectedUndoRaw:"[]"
    });
    const read=await adapter.readTransactional3D(db);
    return {preview:preview.ok,denied:denied.reason,copied:copied.ok,read,
      unchanged:localStorage.getItem(adapter.MAIN_KEY)===raw};
  },{db:name,raw:initial});
  assert.equal(snapshot.preview,true);
  assert.equal(snapshot.denied,"explicit_confirmation_required");
  assert.equal(snapshot.copied,true);
  assert.equal(snapshot.read.revision,1);
  assert.equal(snapshot.read.mainRaw,initial,"legacy bytes kept");
  assert.equal(snapshot.unchanged,true);
  const commit=(page,tag)=>page.evaluate(async({db,tag})=>{
    const adapter=await import("/first-brain-idb-adapter.mjs");
    const g={version:1,brains:[{id:"main",parentBrainId:null}],nodes:[
      {id:"firstbrain-node",brainId:"main",parentId:null,pos:[0,0,0],title:tag}],links:[],history:[]};
    return adapter.commitTransactional3D(db,1,g,[]);
  },{db:name,tag});
  const results=await Promise.all([commit(a,"webkit-A"),commit(b,"webkit-B")]);
  assert.equal(results.filter(x=>x.ok).length,1);
  assert.equal(results.filter(x=>x.reason==="stale_revision").length,1);
  const after=await b.evaluate(async db=>(await import("/first-brain-idb-adapter.mjs")).readTransactional3D(db),name);
  assert.equal(after.revision,2);
  assert.ok(["webkit-A","webkit-B"].includes(after.graph.nodes[0].title));
  await b.reload({waitUntil:"domcontentloaded"});
  const reread=await b.evaluate(async db=>(await import("/first-brain-idb-adapter.mjs")).readTransactional3D(db),name);
  assert.equal(reread.revision,2);
  assert.equal(reread.mainRaw,after.mainRaw);
  // A synthetic legacy versionless graph should still validate as source,
  // without adding a version field or silently rewriting bytes.
  const versionless=JSON.stringify(graph("legacy-unversioned",undefined));
  const check=await a.evaluate(async raw=>{
    const a=await import("/first-brain-idb-adapter.mjs");
    localStorage.setItem(a.MAIN_KEY,raw);
    return a.inspectLegacy3D(localStorage);
  },versionless);
  assert.equal(check.ok,true);
  assert.equal(check.mainRaw,versionless);
  assert.deepEqual(errors,[]);
  console.log("FIRST_BRAIN_DESKTOP_WEBKIT_TRANSACTION_PASS 2tabs=1 CAS=1 v1=1 unversioned=1 legacy_bytes=1 reload=1");
 }finally{await ctx.close();await browser.close();}
});
