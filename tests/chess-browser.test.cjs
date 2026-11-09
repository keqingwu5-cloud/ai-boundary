const test=require('node:test');
const assert=require('node:assert/strict');
const {webkit}=require('playwright');
const BASE=process.env.PILOT_BASE_URL||'http://127.0.0.1:8847';
async function withPage(run){const browser=await webkit.launch({headless:true});try{const page=await browser.newPage({viewport:{width:390,height:844}});const remote=[];page.on('request',req=>{if(new URL(req.url()).origin!==new URL(BASE).origin)remote.push(req.url());});await page.goto(`${BASE}/preview/chess.html`);await run(page);assert.deepEqual(remote,[],'the isolated preview must not fetch external resources');}finally{await browser.close();}}

test('WB01 WebKit chess demo exposes distinct derivations but one shared content',async()=>withPage(async page=>{
  await page.waitForFunction(()=>document.getElementById('status')?.textContent.includes('隔離測試完成'),{},{timeout:10000});
  assert.equal(await page.locator('#branches li').count(),2);
  const lines=await page.locator('#branches li').allTextContents();
  assert.ok(lines.every(x=>x.includes('move:')));assert.notEqual(lines[0],lines[1]);
  assert.match(await page.locator('#result').textContent(),/10 MB.*cmp:/);
  assert.match(await page.locator('#audit').textContent(),/NOT_APPROVED/);
}));

test('WB02 changed source invalidates previous evidence before next run',async()=>withPage(async page=>{
  await page.waitForFunction(()=>document.getElementById('status')?.textContent.includes('隔離測試完成'),{},{timeout:10000});
  const before=await page.locator('#board').textContent();
  await page.locator('#a').fill('5');
  assert.match(await page.locator('#status').textContent(),/輸入已改變/);
  assert.equal(await page.locator('#board').textContent(),'—');
  assert.equal(await page.locator('#branches li').count(),0);
  await page.locator('#run').click();
  await page.waitForFunction(()=>document.getElementById('status')?.textContent.includes('隔離測試完成'),{},{timeout:10000});
  assert.notEqual(await page.locator('#board').textContent(),before);
}));

test('WB03 empty numeric fields do not silently convert to zero',async()=>withPage(async page=>{
  await page.waitForFunction(()=>document.getElementById('status')?.textContent.includes('隔離測試完成'),{},{timeout:10000});
  await page.locator('#a').fill('');await page.locator('#run').click();
  await page.waitForFunction(()=>document.getElementById('status')?.textContent.includes('安全拒絕'),{},{timeout:10000});
  assert.equal(await page.locator('#result').textContent(),'—');
  assert.equal(await page.locator('#branches li').count(),0);
}));