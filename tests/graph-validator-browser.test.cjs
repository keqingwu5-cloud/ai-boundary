"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
test('real 3D Chrome: future schema and brain ancestry cycles are rejected without overwriting graph',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--disable-dev-shm-usage']});
 const ctx=await browser.newContext({viewport:{width:1250,height:850}});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction("window.AIBrain && document.body.dataset.ready === '1'",null,{timeout:45000});
  const data=await page.evaluate(()=>JSON.parse(JSON.stringify(window.AIBrain.getState())));
  const raw=await page.evaluate(()=>localStorage.getItem('aiBrain.v1'));
  const future=structuredClone(data);future.version=999;
  assert.equal(await page.evaluate(x=>window.AIBrain.importJSON(x),future),false,'unknown future schema blocked');
  assert.equal(await page.evaluate(()=>localStorage.getItem('aiBrain.v1')),raw,'future schema never persisted');
  const cyclic=structuredClone(data);cyclic.brains[0].parentBrainId='main';
  assert.equal(await page.evaluate(x=>window.AIBrain.importJSON(x),cyclic),false,'main brain ancestry cycle blocked');
  assert.equal(await page.evaluate(()=>localStorage.getItem('aiBrain.v1')),raw,'cycle never persisted');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.AIBrain.getState())),JSON.stringify(data));
  assert.equal(errors.length,0,errors.join(';'));
  console.log('GRAPH_FUTURE_SCHEMA_AND_BRAIN_CYCLE_BROWSER_REJECTED');
 }finally{await ctx.close();await browser.close();}
});
