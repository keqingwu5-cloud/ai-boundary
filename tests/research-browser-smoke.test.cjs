"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright-core');
const root='http://127.0.0.1:8765';
async function launch(){
 return chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--disable-dev-shm-usage']});
}
const readyBrain=p=>p.waitForFunction("window.AIBrain && document.body.dataset.ready === '1'",null,{timeout:45000});
const readyFeed=p=>p.waitForFunction("window.AIFeed && document.body.dataset.ready === '1'",null,{timeout:45000});
const readyWorld=p=>p.waitForFunction("window.BrainResearchLink && document.body.dataset.researchLink",null,{timeout:45000});
test('01 3D selected node -> world reference -> same 3D and Feed ID, no mutation',async()=>{
 const browser=await launch(),ctx=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:850}});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(root+'/index.html',{waitUntil:'domcontentloaded'});await readyBrain(page);
  const original=await page.evaluate(()=>localStorage.getItem('aiBrain.v1'));
  const id=await page.evaluate(()=>window.AIBrain.getState().nodes[0].id);
  await page.evaluate(id=>window.AIBrain.select(id),id);
  const href=await page.locator('#bWorldModel').getAttribute('href');
  assert.equal(href,'./world-model.html?node='+id);
  await page.locator('#bWorldModel').click();await readyWorld(page);
  const status=await page.evaluate(()=>window.BrainResearchLink);
  assert.equal(status.status,'linked');
  assert.equal(status.sourceNodeId,id);
  assert.equal(status.exportReference.node_id,id);
  assert.equal(await page.locator('#researchToBrain').getAttribute('href'),'./index.html#node='+id);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
  const content=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(content.research_reference.node_id,id,'exported study names actual node');
  assert.equal(content.research_reference.link_status,'local_read_only_unverified');
  assert.equal(await page.evaluate(()=>localStorage.getItem('aiBrain.v1')),original,'study did not mutate brain');
  await page.locator('#researchToFeed').click();await readyFeed(page);
  await page.waitForFunction(id=>window.AIFeed.current()===id,id);
  assert.equal(await page.evaluate(()=>window.AIFeed.current()),id);
  assert.equal(await page.locator('#toWorldModel').getAttribute('href'),'./world-model.html?node='+id);
  assert.equal(errors.length,0,'uncaught browser exceptions: '+errors.slice(0,4).join('|'));
  console.log('RESEARCH_BRIDGE_ROUNDTRIP_PASS id='+id);
 }finally{await ctx.close();await browser.close();}
});
test('02 missing or malformed IDs remain explicitly unlinked',async()=>{
 const browser=await launch(),ctx=await browser.newContext({viewport:{width:1200,height:840}});
 const page=await ctx.newPage();
 try{
  await page.goto(root+'/index.html',{waitUntil:'domcontentloaded'});await readyBrain(page);
  await page.goto(root+'/world-model.html?node=n_does_not_exist',{waitUntil:'domcontentloaded'});
  await readyWorld(page);
  assert.equal(await page.evaluate(()=>window.BrainResearchLink.status),'missing');
  assert.equal(await page.locator('#researchToBrain').getAttribute('href'),'./index.html');
  assert.equal(await page.evaluate(()=>window.BrainResearchLink.exportReference),null);
  await page.goto(root+'/world-model.html',{waitUntil:'domcontentloaded'});
  await readyWorld(page);
  assert.equal(await page.evaluate(()=>window.BrainResearchLink.status),'no_source');
  await page.goto(root+'/world-model.html?node=%3Cscript%3E',{waitUntil:'domcontentloaded'});
  await readyWorld(page);
  assert.equal(await page.evaluate(()=>window.BrainResearchLink.sourceNodeId),null);
  assert.equal(await page.evaluate(()=>window.BrainResearchLink.status),'invalid');
  console.log('RESEARCH_BRIDGE_MISSING_SOURCE_PASS');
 }finally{await ctx.close();await browser.close();}
});
test('03 central hub opens standalone world model with honest state',async()=>{
 const browser=await launch(),ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const page=await ctx.newPage();
 try{
  await page.goto(root+'/mainbrain.html',{waitUntil:'domcontentloaded'});
  const research=page.locator('section[aria-label="研究流程導覽"]');
  assert.equal(await research.count(),1);
  await research.locator('a[href="./world-model.html"]').click();
  await readyWorld(page);
  assert.equal(await page.evaluate(()=>window.BrainResearchLink.status),'no_source');
  assert.ok(await page.locator('#researchLinkStatus').isVisible());
  console.log('RESEARCH_BRIDGE_HUB_PASS');
 }finally{await ctx.close();await browser.close();}
});
