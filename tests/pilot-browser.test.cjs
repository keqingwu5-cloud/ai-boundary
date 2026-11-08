'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const URL='http://127.0.0.1:8765/preview/index.html';

async function setup(viewport={width:1180,height:850}){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport,acceptDownloads:true});
 await context.addInitScript(()=>{
  window.__pilotViolations=[];
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){window.__pilotViolations.push('storage:'+k);throw Error('PILOT_STORAGE_BLOCKED');};
  const originalOpen=indexedDB.open.bind(indexedDB);
  indexedDB.open=function(){window.__pilotViolations.push('indexedDB');throw Error('PILOT_IDB_BLOCKED');};
  window.__pilotOriginalStorage=!!original;
  window.__pilotOriginalIndexedDB=!!originalOpen;
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(URL,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.getElementById('status')?.textContent==='不完整但可追溯',{timeout:15000});
 return {browser,context,page,errors};
}
test('01 Chromium: actual V1.6 preview handles unknown, known and restricted C',async()=>{
 const t=await setup();try{
  assert.equal(await t.page.locator('#x-value').innerText(),'10 MB');
  assert.equal(await t.page.locator('#y-value').innerText(),'保留空白');
  await t.page.locator('#state').selectOption('KNOWN');await t.page.locator('#run').click();
  await t.page.waitForFunction(()=>document.getElementById('y-value')?.textContent==='12 MB');
  await t.page.locator('#state').selectOption('REDACTED');await t.page.locator('#run').click();
  await t.page.waitForFunction(()=>document.getElementById('y-value')?.textContent==='禁止使用');
  assert.deepEqual(await t.page.evaluate(()=>window.__pilotViolations),[]);
  assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();await t.browser.close();}
});
test('02 Chromium: downloadable evidence remains marked synthetic and unapproved',async()=>{
 const t=await setup();try{
  const [file]=await Promise.all([t.page.waitForEvent('download'),t.page.locator('#export').click()]);
  const fs=require('node:fs'); const data=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
  assert.equal(data.schema,'firstbrain.isolated-pilot.v0.1');
  assert.equal(data.result.audit.scope,'SYNTHETIC_SESSION_ONLY');
  assert.equal(data.result.audit.persisted,false);
  assert.equal(data.result.audit.remote_ack,'NOT_VERIFIED');
  assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();await t.browser.close();}
});
test('03 Chromium: mobile viewport and no external requests',async()=>{
 const t=await setup({width:390,height:844});try{
  assert.equal(await t.page.locator('#source-count').innerText(),'3');
  assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
  assert.deepEqual(await t.page.evaluate(()=>window.__pilotViolations),[]);
  assert.deepEqual(t.errors,[]);
 }finally{await t.context.close();await t.browser.close();}
});