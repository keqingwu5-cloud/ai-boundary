"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium}=require("playwright-core");
const root="http://127.0.0.1:8765";
test("real Chromium: 3D import-save-reload-undo-reset-failure and Feed",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:850}});
 const page=await context.newPage(),errs=[];
 page.on("pageerror",err=>errs.push(String(err)));
 async function ready(){
  await page.waitForFunction("window.AIBrain && document.body.dataset.ready === '1'",null,{timeout:45000});
 }
 try {
  await page.goto(root+"/index.html",{waitUntil:"domcontentloaded",timeout:45000});
  await ready();
  const before=await page.evaluate(()=>window.AIBrain.getState());
  assert.ok(before.nodes.length>0,"real brain has seed nodes");
  const id=before.nodes[0].id;
  const malformed=JSON.parse(JSON.stringify(before));
  malformed.nodes.push({...malformed.nodes[0],id:"synthetic-orphan",parentId:"no-such-parent"});
  assert.equal(await page.evaluate(s=>window.AIBrain.importJSON(s),malformed),false,"invalid parent rejected");
  assert.equal(await page.evaluate(()=>window.AIBrain.getState().nodes.length),before.nodes.length);
  const valid=JSON.parse(JSON.stringify(before));
  valid.nodes[0].title="CHROME_ROUNDTRIP_IMPORTED";
  assert.equal(await page.evaluate(s=>window.AIBrain.importJSON(s),valid),true,"real import succeeds");
  await page.reload({waitUntil:"domcontentloaded"});
  await ready();
  assert.equal(await page.evaluate(()=>window.AIBrain.getState().nodes[0].title),"CHROME_ROUNDTRIP_IMPORTED","reloaded imported title");
  assert.equal(await page.evaluate(()=>window.AIBrain.undo()),true,"undo after reload");
  assert.equal(await page.evaluate(()=>window.AIBrain.getState().nodes[0].title),before.nodes[0].title,"undo title restored");
  await page.evaluate(id=>window.AIBrain.setStatus(id,"researching"),id);
  assert.equal(await page.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).status,id),"researching","mutation saved");
  await page.reload({waitUntil:"domcontentloaded"});
  await ready();
  assert.equal(await page.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).status,id),"researching","mutation survives reload");
  assert.equal(await page.evaluate(()=>window.AIBrain.reset()),true,"reset successful");
  assert.equal(await page.evaluate(()=>window.AIBrain.undo()),true,"reset undo");
  assert.equal(await page.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).status,id),"researching","undo reset restored");
  // Intercept a real browser Storage API call, rather than stubbing the import function.
  const failure=await page.evaluate(id=>{
    const before=JSON.stringify(window.AIBrain.getState());
    const proto=Storage.prototype,orig=proto.setItem;
    proto.setItem=function(k,v){
      if(k==="aiBrain.v1")throw new DOMException("Quota exceeded","QuotaExceededError");
      return orig.call(this,k,v);
    };
    try {
      window.AIBrain.setStatus(id,"resolved");
      return {unchanged:JSON.stringify(window.AIBrain.getState())===before,
              stored:JSON.parse(localStorage.getItem("aiBrain.v1")).nodes.find(n=>n.id===id).status};
    }finally{proto.setItem=orig}
  },id);
  assert.equal(failure.unchanged,true,"failed storage mutation does not change in-memory state");
  assert.equal(failure.stored,"researching","failed storage mutation does not change disk");
  const [download]=await Promise.all([page.waitForEvent("download",{timeout:20000}),page.evaluate(()=>window.AIBrain.exportJSON())]);
  const exportObject=JSON.parse(fs.readFileSync(await download.path(),"utf8"));
  assert.equal(exportObject.nodes.find(n=>n.id===id).status,"researching","export contains restored state");
  await page.goto(root+"/feed.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction("window.AIFeed && document.body.dataset.ready === '1'",null,{timeout:45000});
  const feed=await page.evaluate(()=>({ids:window.AIFeed.list(),current:window.AIFeed.current()}));
  assert.ok(feed.ids.includes(id),"Feed sees imported brain node ID");
  assert.equal(errs.length,0,"no uncaught page errors: "+errs.slice(0,4).join("|"));
  console.log("CHROMIUM_SMOKE_PASS node="+id+" total="+before.nodes.length+" feed_count="+feed.ids.length);
 }finally{
  await context.close();await browser.close();
 }
});

test("real Chromium: invalid saved snapshot is preserved and exportable",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1200,height:800}});
 const raw='{"brains":[{"id":"main"}],"nodes":[null],"links":[],"history":[]}';
 await context.addInitScript(({saved})=>{localStorage.setItem("aiBrain.v1",saved);},{saved:raw});
 const page=await context.newPage();
 try{
  await page.goto(root+"/index.html",{waitUntil:"domcontentloaded",timeout:45000});
  await page.waitForFunction("window.AIBrain && document.body.dataset.ready === '1'",null,{timeout:45000});
  assert.equal(await page.evaluate(()=>localStorage.getItem("aiBrain.v1")),raw);
  assert.equal(await page.locator("#brainRecoveryWarning").count(),1,"recovery warning visible");
  assert.equal(await page.evaluate(()=>window.AIBrain.reset()),false,"reset blocked");
  assert.equal(await page.evaluate(()=>window.AIBrain.importJSON(window.AIBrain.getState())),false,"import blocked");
  assert.equal(await page.evaluate(()=>localStorage.getItem("aiBrain.v1")),raw,"old raw still intact");
  const [download]=await Promise.all([
    page.waitForEvent("download",{timeout:20000}),
    page.locator("#brainRecoveryWarning button").click()
  ]);
  assert.equal(fs.readFileSync(await download.path(),"utf8"),raw,"downloaded original bytes");
  console.log("CHROMIUM_CORRUPT_STATE_PROTECTED");
 }finally{await context.close();await browser.close();}
});

test("real Chromium: two browser tabs reject stale writes and recover on reload",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 const context=await browser.newContext({viewport:{width:1180,height:770}});
 const pageA=await context.newPage(),pageB=await context.newPage();
 const ready=p=>p.waitForFunction("window.AIBrain && document.body.dataset.ready === '1'",null,{timeout:45000});
 try{
  await pageA.goto(root+"/index.html",{waitUntil:"domcontentloaded"});await ready(pageA);
  await pageB.goto(root+"/index.html",{waitUntil:"domcontentloaded"});await ready(pageB);
  const id=await pageA.evaluate(()=>window.AIBrain.getState().nodes[0].id);
  await pageA.evaluate(id=>window.AIBrain.setStatus(id,"researching"),id);
  assert.equal(await pageA.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).status,id),"researching");
  await pageB.waitForFunction("!!document.querySelector('#brainConcurrentWarning')",null,{timeout:12000});
  await pageB.evaluate(id=>window.AIBrain.setStatus(id,"resolved"),id);
  assert.equal(await pageB.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).status,id),"open","old tab state restored after refused write");
  assert.equal(await pageA.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).status,id),"researching");
  assert.equal(await pageB.evaluate(id=>JSON.parse(localStorage.getItem('aiBrain.v1')).nodes.find(n=>n.id===id).status,id),"researching","newer persisted state preserved");
  await pageB.reload({waitUntil:"domcontentloaded"});await ready(pageB);
  assert.equal(await pageB.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).status,id),"researching");
  await pageB.evaluate(id=>window.AIBrain.setStatus(id,"resolved"),id);
  assert.equal(await pageB.evaluate(id=>window.AIBrain.getState().nodes.find(n=>n.id===id).status,id),"resolved");
  await pageA.waitForFunction("!!document.querySelector('#brainConcurrentWarning')",null,{timeout:12000});
  console.log("CHROMIUM_MULTI_TAB_CONFLICT_GUARD_PASS");
 }finally{await context.close();await browser.close();}
});
test("real Chromium: emulated phone and tablet load brain and Feed",async()=>{
 const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--disable-dev-shm-usage"]});
 try{
  for(const spec of [{name:"phone",width:390,height:844},{name:"tablet",width:820,height:1180}]){
   const ctx=await browser.newContext({viewport:{width:spec.width,height:spec.height},hasTouch:true,isMobile:true,deviceScaleFactor:2});
   const page=await ctx.newPage(),errors=[];
   page.on("pageerror",err=>errors.push(String(err)));
   try{
    await page.goto(root+"/index.html",{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForFunction("window.AIBrain && document.body.dataset.ready === '1'",null,{timeout:45000});
    const info=await page.evaluate(()=>({node:window.AIBrain.getState().nodes[0].id,count:window.AIBrain.getState().nodes.length,overflow:document.documentElement.scrollWidth-window.innerWidth,canvas:!!document.querySelector('canvas')}));
    assert.ok(info.count>100&&info.canvas,spec.name+" 3D visible");
    assert.ok(info.overflow<=8,spec.name+" horizontal page overflow="+info.overflow);
    await page.goto(root+"/feed.html#node="+encodeURIComponent(info.node),{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForFunction("window.AIFeed && document.body.dataset.ready === '1'",null,{timeout:45000});
    const feed=await page.evaluate(()=>({ids:window.AIFeed.list(),overflow:document.documentElement.scrollWidth-window.innerWidth}));
    assert.ok(feed.ids.includes(info.node),spec.name+" Feed keeps node ID");
    assert.ok(feed.overflow<=8,spec.name+" Feed horizontal overflow="+feed.overflow);
    assert.equal(errors.length,0,spec.name+" errors "+errors.slice(0,3).join(";"));
    console.log("CHROMIUM_EMULATED_"+spec.name.toUpperCase()+"_PASS nodes="+info.count);
   }finally{await ctx.close();}
  }
 }finally{await browser.close();}
});
