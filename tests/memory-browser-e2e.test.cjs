"use strict";
/* Real Chromium E2E on localhost with synthetic data. No secrets, production vault,
 * deployment, external APIs, or automated approval. */
const test=require("node:test");
const assert=require("node:assert/strict");
const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"..");
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8"};
const allowed=new Set(["memory.html","memory.js","memory-controls-core.js","memory-workflow-core.js","memory-impact-core.js","launcher.html","launcher.js"]);
const PASS="synthetic-passphrase-never-user-data-1234";
function startServer(serveRoot=root){
 const hits=[];
 const server=http.createServer((req,res)=>{
   const file=decodeURIComponent((req.url||"").split("?")[0]).replace(/^\//,"");
   hits.push(file);
   if(!allowed.has(file)){res.writeHead(404);res.end("not found");return;}
   try{
     const bytes=fs.readFileSync(path.join(serveRoot,file));
     res.writeHead(200,{"Content-Type":types[path.extname(file)]||"text/plain","Cache-Control":"no-store"});
     res.end(bytes);
   }catch(err){res.writeHead(404);res.end("missing");}
 });
 return {server,hits};
}
const unlocked=page=>page.waitForFunction(()=>document.getElementById("workspace")?.hidden===false);
const pending=(page,n)=>page.waitForFunction(n=>document.getElementById("countPending")?.textContent===String(n),n);
async function submit(page,question,content,originId,direction="aligned"){
 await page.locator('[data-tab="propose"]').click();
 await page.locator("#eventType").selectOption("new_question");
 await page.locator("#originSourceId").fill(originId);
 await page.locator("#directionRelation").selectOption(direction);
 await page.locator("#question").fill(question);
 await page.locator("#purpose").fill("合成資料用例：不可將候選自動轉權威");
 await page.locator("#content").fill(content);
 await page.locator("#reason").fill("隔離 E2E 操作驗證");
 await page.locator("#previewMemoryImpact").click();
 const impact=await page.locator("#memoryImpactPreview").innerText();
 assert.match(impact,/預演/);
 await page.locator('#candidateForm button[type="submit"]').click();
 return impact;
}
async function downloadJSON(page){
 const [download]=await Promise.all([page.waitForEvent("download"),page.locator("#saveBackupTop").click()]);
 return fs.readFileSync(await download.path(),"utf8");
}
test("full real browser loop: controls, candidate, human approval, AES backup, corrupt rejection, restore, reload", {timeout:120000}, async()=>{
 const {server,hits}=startServer();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin="http://127.0.0.1:"+server.address().port;
 let browser;
 try{
   browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
   const context=await browser.newContext({acceptDownloads:true});
   const page=await context.newPage();
   const errors=[];
   page.on("pageerror",e=>errors.push(e.message));
   page.on("dialog",async d=>{
     if(d.type()==="prompt"){
       await d.accept(d.message().includes("確認覆蓋")?"確認覆蓋":PASS);
     }else await d.accept();
   });
   await page.goto(origin+"/memory.html",{waitUntil:"domcontentloaded"});
   assert.equal(await page.locator("#lockedState").isVisible(),true);
   await page.locator("#passphrase").fill(PASS);
   await page.locator("#confirmPassphrase").fill(PASS);
   await page.locator("#unlockButton").click();
   await unlocked(page);
   await page.locator('[data-tab="controls"]').click();
   await page.locator("#memoryControlReason").fill("使用者方向首次設定（合成資料）");
   await page.locator("#memoryDirectionEditor").fill("廣度探索：保存來源、保留反證");
   await page.locator("#saveMemoryDirection").click();
   await page.waitForFunction(()=>document.getElementById("memoryDirectionVersion")?.textContent.includes("版本 1"));
   await page.locator("#memoryControlReason").fill("候選必須人工核准");
   await page.locator("#memoryThresholdEditor").fill("候選來源需核對；不得自動核准");
   await page.locator("#saveMemoryThreshold").click();
   await page.waitForFunction(()=>document.getElementById("memoryThresholdVersion")?.textContent.includes("版本 1"));
   assert.match(await page.locator("#memoryDirectionVersion").innerText(),/版本 1/);
   const msg=await submit(page,"E2E 合成問題 A","E2E SYNTHETIC ANSWER A","E2E-SOURCE-A","divergent_keep");
   assert.match(msg,/DIVERGENT_BUT_PRESERVED/);
   await pending(page,1);
   assert.equal(await page.locator("#countMemories").innerText(),"0");
   await page.locator('[data-tab="review"]').click();
   await page.getByRole("button",{name:"核准並保留版本"}).first().click();
   await page.waitForFunction(()=>document.getElementById("countMemories")?.textContent==="1");
   await pending(page,0);
   const first=await downloadJSON(page);
   const envelope=JSON.parse(first);
   assert.equal(envelope.format,"ai-boundary.encrypted-memory.v1");
   assert.equal(envelope.cipher,"AES-256-GCM");
   assert.equal(first.includes("E2E SYNTHETIC ANSWER A"),false);
   await submit(page,"E2E 合成問題 B","SECOND_SYNTHETIC_CANDIDATE","E2E-SOURCE-B");
   await pending(page,1);
   const newer=await downloadJSON(page);
   assert.notEqual(newer,first);
   const before=await page.evaluate(()=>localStorage.getItem("aiBoundary.privateMemory.v1"));
   await page.locator("#backupInput").setInputFiles({name:"corrupted.json",mimeType:"application/json",buffer:Buffer.from('{"format":"invalid"}')});
   await page.waitForFunction(()=>document.getElementById("feedback")?.textContent.includes("還原失敗"));
   assert.equal(await page.evaluate(()=>localStorage.getItem("aiBoundary.privateMemory.v1")),before);
   await page.locator("#backupInput").setInputFiles({name:"prior-encrypted.json",mimeType:"application/json",buffer:Buffer.from(first)});
   await pending(page,0);
   assert.equal(await page.locator("#countMemories").innerText(),"1");
   await page.reload({waitUntil:"domcontentloaded"});
   assert.equal(await page.locator("#lockedState").isVisible(),true);
   await page.locator("#passphrase").fill(PASS);
   await page.locator("#unlockButton").click();
   await unlocked(page);
   assert.equal(await page.locator("#countMemories").innerText(),"1");
   assert.equal(await page.locator("#countPending").innerText(),"0");
   await page.locator('[data-tab="controls"]').click();
   assert.match(await page.locator("#memoryDirectionEditor").inputValue(),/廣度探索/);
   assert.match(await page.locator("#memoryThresholdEditor").inputValue(),/不得自動核准/);
   assert.equal(errors.length,0,"browser JS errors: "+errors.join(" | "));
   const unexpected=hits.filter(x=>!allowed.has(x)&&x!=="favicon.ico");
   assert.deepEqual(unexpected,[],"unexpected relative resources");
   await context.close();
 } finally{
   if(browser)await browser.close();
   await new Promise(resolve=>server.close(resolve));
 }
});
test("security observation: another page on the SAME origin can access ciphertext; release remains BLOCKED", {timeout:60000}, async()=>{
 const {server}=startServer();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
   browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
   const context=await browser.newContext();
   const page=await context.newPage();
   const origin="http://127.0.0.1:"+server.address().port;
   await page.goto(origin+"/memory.html");
   await page.evaluate(()=>localStorage.setItem("aiBoundary.privateMemory.v1","SYNTHETIC_CIPHERTEXT_ONLY"));
   await page.goto(origin+"/launcher.html",{waitUntil:"domcontentloaded"});
   const exposed=await page.evaluate(()=>localStorage.getItem("aiBoundary.privateMemory.v1"));
   assert.equal(exposed,"SYNTHETIC_CIPHERTEXT_ONLY",
     "This reproduces same-origin localStorage accessibility and is a production-release blocker, not a security PASS.");
   await context.close();
 }finally{
   if(browser)await browser.close();
   await new Promise(resolve=>server.close(resolve));
 }
});

test("same browser on a DISTINCT origin cannot read the vault ciphertext", {timeout:60000}, async()=>{
 const first=startServer(),second=startServer();
 await new Promise(resolve=>first.server.listen(0,"127.0.0.1",resolve));
 await new Promise(resolve=>second.server.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
   browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
   const context=await browser.newContext();
   const page=await context.newPage();
   await page.goto("http://127.0.0.1:"+first.server.address().port+"/memory.html");
   await page.evaluate(()=>localStorage.setItem("aiBoundary.privateMemory.v1","SYNTHETIC_CIPHERTEXT_ONLY"));
   await page.goto("http://127.0.0.1:"+second.server.address().port+"/launcher.html",{waitUntil:"domcontentloaded"});
   assert.equal(await page.evaluate(()=>localStorage.getItem("aiBoundary.privateMemory.v1")),null);
   await context.close();
 }finally{
   if(browser)await browser.close();
   await new Promise(resolve=>first.server.close(resolve));
   await new Promise(resolve=>second.server.close(resolve));
 }
});
test("two tabs: stale memory-direction edit is rejected without overwriting the first tab", {timeout:80000}, async()=>{
 const {server}=startServer();
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
   browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
   const context=await browser.newContext();
   const origin="http://127.0.0.1:"+server.address().port;
   const first=await context.newPage();
   first.on("dialog",d=>d.accept());
   await first.goto(origin+"/memory.html");
   await first.locator("#passphrase").fill(PASS);
   await first.locator("#confirmPassphrase").fill(PASS);
   await first.locator("#unlockButton").click();await unlocked(first);
   const second=await context.newPage();
   second.on("dialog",d=>d.accept());
   await second.goto(origin+"/memory.html");
   await second.locator("#passphrase").fill(PASS);
   await second.locator("#unlockButton").click();await unlocked(second);
   await first.locator('[data-tab="controls"]').click();
   await first.locator("#memoryControlReason").fill("頁面一更改方向");
   await first.locator("#memoryDirectionEditor").fill("新版本由頁面一保存");
   await first.locator("#saveMemoryDirection").click();
   await first.waitForFunction(()=>document.getElementById("memoryDirectionVersion")?.textContent.includes("版本 1"));
   const validCipher=await first.evaluate(()=>localStorage.getItem("aiBoundary.privateMemory.v1"));
   await second.locator('[data-tab="controls"]').click();
   await second.locator("#memoryControlReason").fill("頁面二的過時修改");
   await second.locator("#memoryDirectionEditor").fill("試圖覆蓋的舊快照");
   await second.locator("#saveMemoryDirection").click();
   await second.waitForFunction(()=>document.getElementById("feedback")?.textContent.includes("其他分頁"));
   assert.equal(await second.evaluate(()=>localStorage.getItem("aiBoundary.privateMemory.v1")),validCipher);
   await second.reload();
   await second.locator("#passphrase").fill(PASS);
   await second.locator("#unlockButton").click();await unlocked(second);
   await second.locator('[data-tab="controls"]').click();
   assert.equal(await second.locator("#memoryDirectionEditor").inputValue(),"新版本由頁面一保存");
   await context.close();
 }finally{
   if(browser)await browser.close();
   await new Promise(resolve=>server.close(resolve));
 }
});

test("dedicated-origin candidate bundle keeps a usable vault while public-platform origin cannot read it", {timeout:100000}, async()=>{
 const os=require("node:os"),cp=require("node:child_process");
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"synthetic-memory-isolated-origin-"));
 const folder=path.join(tmp,"bundle");
 cp.execFileSync(process.execPath,[path.join(root,"scripts/package-memory-v1.cjs"),"--out",folder]);
 const privateSite=startServer(folder),publicSite=startServer(root);
 await new Promise(resolve=>privateSite.server.listen(0,"127.0.0.1",resolve));
 await new Promise(resolve=>publicSite.server.listen(0,"127.0.0.1",resolve));
 let browser;
 try{
   browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
   const context=await browser.newContext();
   const page=await context.newPage();
   const privateUrl="http://127.0.0.1:"+privateSite.server.address().port;
   const publicUrl="http://127.0.0.1:"+publicSite.server.address().port;
   await page.goto(privateUrl+"/memory.html");
   await page.locator("#passphrase").fill(PASS);
   await page.locator("#confirmPassphrase").fill(PASS);
   await page.locator("#unlockButton").click();await unlocked(page);
   const privateCipher=await page.evaluate(()=>localStorage.getItem("aiBoundary.privateMemory.v1"));
   assert.ok(privateCipher&&privateCipher.includes('"AES-256-GCM"'));
   await page.goto(publicUrl+"/launcher.html",{waitUntil:"domcontentloaded"});
   assert.equal(await page.evaluate(()=>localStorage.getItem("aiBoundary.privateMemory.v1")),null);
   await page.goto(privateUrl+"/memory.html",{waitUntil:"domcontentloaded"});
   await page.locator("#passphrase").fill(PASS);
   await page.locator("#unlockButton").click();await unlocked(page);
   assert.equal(await page.evaluate(()=>localStorage.getItem("aiBoundary.privateMemory.v1")),privateCipher);
   await context.close();
 }finally{
   if(browser)await browser.close();
   await new Promise(resolve=>privateSite.server.close(resolve));
   await new Promise(resolve=>publicSite.server.close(resolve));
   fs.rmSync(tmp,{recursive:true,force:true});
 }
});
