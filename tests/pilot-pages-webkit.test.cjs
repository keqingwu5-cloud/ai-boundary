'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {webkit}=require('playwright');

async function start(){
  const browser=await webkit.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:8845/preview/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='不完整但可追溯',{timeout:30000});
  return {browser,context,page,errors};
}
async function end(t){await t.context.close();await t.browser.close();}
test('01 WebKit simulated phone: preserve unknown and keep source provenance',async()=>{
  const t=await start();
  try {
    assert.equal(await t.page.locator('#x-value').innerText(),'10 MB');
    assert.equal(await t.page.locator('#y-value').innerText(),'保留空白');
    assert.match(await t.page.locator('#audit').innerText(),/UNKNOWN/);
    assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
    assert.deepEqual(t.errors,[]);
  }finally{await end(t);}
});
test('02 WebKit simulated phone: explicit C=0 works; blank C fails closed',async()=>{
  const t=await start();
  try {
    await t.page.locator('#state').selectOption('KNOWN');
    await t.page.locator('#c').fill('0');
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#y-value')?.textContent==='10 MB');
    assert.equal(await t.page.locator('#export').isEnabled(),true);
    await t.page.locator('#c').fill('');
    assert.equal(await t.page.locator('#export').isDisabled(),true);
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='輸入錯誤');
    assert.equal(await t.page.locator('#y-value').innerText(),'—');
    assert.deepEqual(t.errors,[]);
  }finally{await end(t);}
});
test('03 WebKit simulated phone: revision invalidates an old result',async()=>{
  const t=await start();
  try {
    await t.page.locator('#state').selectOption('KNOWN');
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#y-value')?.textContent==='12 MB');
    await t.page.locator('#a').fill('5');
    assert.equal(await t.page.locator('#export').isDisabled(),true);
    assert.equal(await t.page.locator('#x-value').innerText(),'—');
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#y-value')?.textContent==='13 MB');
    assert.deepEqual(t.errors,[]);
  }finally{await end(t);}
});
