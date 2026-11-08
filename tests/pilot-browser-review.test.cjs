'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const BASE='http://127.0.0.1:8765';
async function open(viewport={width:1150,height:820}){
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport,acceptDownloads:true});
  const requests=[];
  await context.route('**/*',async route=>{
    const url=route.request().url();
    if(!url.startsWith(BASE+'/')){requests.push(url);await route.abort();return;}
    await route.continue();
  });
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(BASE+'/preview/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent==='不完整但可追溯',{timeout:15000});
  return {browser,context,page,requests,errors};
}
async function close(t){await t.context.close();await t.browser.close();}
test('01 blank A is rejected, never converted into zero and never exported',async()=>{
  const t=await open();try{
    await t.page.locator('#a').fill('');
    assert.equal(await t.page.locator('#export').isDisabled(),true);
    assert.equal(await t.page.locator('#x-value').innerText(),'—');
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='輸入錯誤');
    assert.match(await t.page.locator('#status-note').innerText(),/留空/);
    assert.equal(await t.page.locator('#y-value').innerText(),'—');
    assert.equal(await t.page.locator('#export').isDisabled(),true);
    assert.deepEqual(t.errors,[]);
  }finally{await close(t);}
});
test('02 blank known C is rejected but explicitly entered zero is valid',async()=>{
  const t=await open();try{
    await t.page.locator('#state').selectOption('KNOWN');
    await t.page.locator('#c').fill('');
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='輸入錯誤');
    assert.match(await t.page.locator('#status-note').innerText(),/留空不是 0/);
    assert.equal(await t.page.locator('#export').isDisabled(),true);
    await t.page.locator('#c').fill('0');
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#y-value')?.textContent==='10 MB');
    assert.equal(await t.page.locator('#export').isEnabled(),true);
    assert.deepEqual(t.errors,[]);
  }finally{await close(t);}
});
test('03 editing a completed result immediately invalidates evidence and clears stale output',async()=>{
  const t=await open();try{
    await t.page.locator('#state').selectOption('KNOWN');
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#y-value')?.textContent==='12 MB');
    assert.equal(await t.page.locator('#export').isEnabled(),true);
    await t.page.locator('#b').fill('8');
    assert.equal(await t.page.locator('#export').isDisabled(),true);
    assert.equal(await t.page.locator('#x-value').innerText(),'—');
    assert.equal(await t.page.locator('#source-count').innerText(),'0');
    assert.match(await t.page.locator('#status').innerText(),/資料已修改/);
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#y-value')?.textContent==='14 MB');
    assert.deepEqual(t.errors,[]);
  }finally{await close(t);}
});
test('04 unknown and intentionally open remain incomplete, not zero',async()=>{
  const t=await open();try{
    await t.page.locator('#state').selectOption('INTENTIONALLY_OPEN');
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#y-value')?.textContent==='保留空白');
    assert.match(await t.page.locator('#audit').innerText(),/INTENTIONALLY_OPEN/);
    await t.page.locator('#state').selectOption('UNKNOWN');
    await t.page.locator('#run').click();
    await t.page.waitForFunction(()=>document.querySelector('#audit')?.textContent?.includes('"UNKNOWN"'));
    assert.equal(await t.page.locator('#y-value').innerText(),'保留空白');
    assert.deepEqual(t.errors,[]);
  }finally{await close(t);}
});
test('05 mobile preview makes only local asset requests',async()=>{
  const t=await open({width:390,height:844});try{
    assert.deepEqual(t.requests,[],'No external network requests allowed');
    assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
    assert.match(await t.page.locator('body').innerText(),/請勿輸入私人或敏感資訊/);
    assert.deepEqual(t.errors,[]);
  }finally{await close(t);}
});
