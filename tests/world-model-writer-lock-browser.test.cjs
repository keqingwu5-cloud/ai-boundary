"use strict";
// R19 real Chromium/WebKit two tabs: a cooperative lock protects the world-model
// journal from new-version writes. This cannot stop obsolete unlocked scripts.
//
// BOUNDARY (explicit): these tests only prove that *new* UI/code paths which
// honour Web Locks + expectedRawV2 CAS are safe under the exercised conditions.
// Old scripts that skip the lock remain an explicit release Gate and stay
// BLOCKED / out of scope here — a green R19 does NOT claim they are covered.
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium,webkit}=require("playwright-core");
const WORLD_LOCK_BROWSER=process.env.WORLD_LOCK_BROWSER==="webkit"?"webkit":"chromium";
const launchWorldLockBrowser=()=>WORLD_LOCK_BROWSER==="webkit"
 ?webkit.launch({headless:true})
 :chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const ROOT="http://127.0.0.1:8765/world-model.html";
const JOURNAL_KEY="worldModel.verify.events.v2";
const ready=p=>p.waitForFunction("window.WorldVerifyHistory && document.body.dataset.ledgerReady==='1'",null,{timeout:45000});
const row=id=>({id,hypothesis:"合成研究 "+id,falsifier:"反例",createdOn:"2026-10-29",
 deadline:"2026-12-31",source:"",metric:"",status:"待驗證",createdAt:"2026-10-29T01:00:00Z"});
/** Wait until localStorage journal has at least \`minEvents\` events (no fixed sleep). */
const waitJournalEventCount=(page,minEvents,timeout=5000)=>page.waitForFunction(
 ({key,min})=>{
  try{
   const raw=localStorage.getItem(key);
   if(!raw)return false;
   const j=JSON.parse(raw);
   return Array.isArray(j.events)&&j.events.length>=min;
  }catch(_){return false;}
 },
 {key:JOURNAL_KEY,min:minEvents},
 {timeout}
);
/** Full ledger fingerprint: event IDs, version chain, content — not mere counts. */
const readFingerprint=async page=>page.evaluate(async({key})=>{
 const m=await import("/world-verification-ledger.mjs");
 const s=m.readWorldLedger(localStorage);
 const raw=localStorage.getItem(key);
 let rawSha256=null;
 if(raw!=null&&globalThis.crypto?.subtle){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
  rawSha256=[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
 }
 const events=(s.events||[]).map(e=>({
  version:e.version,
  eventId:e.eventId,
  previousEventId:e.previousEventId??null,
  type:e.type,
  recordId:e.recordId,
  reason:e.reason,
  afterId:e.after?.id??null,
  afterHypothesis:e.after?.hypothesis??null
 }));
 return {
  ok:s.ok,
  reason:s.reason,
  eventsLen:events.length,
  rowIds:(s.rows||[]).map(r=>r.id),
  versions:events.map(e=>e.version),
  eventIds:events.map(e=>e.eventId),
  previousEventIds:events.map(e=>e.previousEventId),
  recordIds:events.map(e=>e.recordId),
  reasons:events.map(e=>e.reason),
  afterHypotheses:events.map(e=>e.afterHypothesis),
  events,
  rawSha256,
  rawLen:raw==null?0:raw.length
 };
},{key:JOURNAL_KEY});
const assertSameFingerprint=(label,x,y)=>{
 assert.equal(x.ok,true,label+" ok");
 assert.equal(y.ok,true,label+" peer ok");
 assert.deepEqual(x.versions,y.versions,label+" version chain");
 assert.deepEqual(x.eventIds,y.eventIds,label+" event IDs");
 assert.deepEqual(x.previousEventIds,y.previousEventIds,label+" previousEventId chain");
 assert.deepEqual(x.recordIds,y.recordIds,label+" recordIds");
 assert.deepEqual(x.reasons,y.reasons,label+" reasons");
 assert.deepEqual(x.afterHypotheses,y.afterHypotheses,label+" afterHypotheses");
 assert.deepEqual(x.rowIds,y.rowIds,label+" rowIds");
 assert.equal(x.rawSha256,y.rawSha256,label+" rawSha256");
};
test("R19 real two-tab Web Lock: concurrent journal write denied, stale tab blocked",async()=>{
 const browser=await launchWorldLockBrowser();
 const ctx=await browser.newContext(),a=await ctx.newPage(),b=await ctx.newPage(),errors=[];
 [a,b].forEach(p=>p.on("pageerror",x=>errors.push(String(x))));
 try{
  await Promise.all([a.goto(ROOT,{waitUntil:"domcontentloaded"}),b.goto(ROOT,{waitUntil:"domcontentloaded"})]);
  await Promise.all([ready(a),ready(b)]);
  const hold=await a.evaluate(()=>{
   if(!navigator.locks?.request)return {ok:false};
   let release;
   window.r19Held=new Promise(resolve=>{release=resolve;});
   window.r19Release=release;
   navigator.locks.request("worldModel.verify.events.v2.writer",()=>{window.r19Locked=true;return window.r19Held;});
   return {ok:true};
  });
  assert.equal(hold.ok,true);
  await a.waitForFunction("window.r19Locked===true");
  const busy=await b.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"busy B"}),row("r19-b"));
  assert.equal(busy,false);
  assert.equal(await b.evaluate(()=>localStorage.getItem("worldModel.verify.events.v2")),null);
  assert.match(await b.locator("#worldHistoryStatus").innerText(),/journal_write_busy/);
  await a.evaluate(()=>window.r19Release());
  const first=await a.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"A saves after lock"}),row("r19-a"));
  assert.equal(first,true);
  const stale=await b.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"B stale"}),row("r19-b"));
  assert.equal(stale,false);
  assert.equal((await b.evaluate(()=>window.WorldVerifyHistory.view().rows)).length,1);
  await b.reload({waitUntil:"domcontentloaded"});await ready(b);
  const resumed=await b.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"B fresh after reload"}),row("r19-b"));
  assert.equal(resumed,true);
  // Cross-tab localStorage visibility can lag on WebKit: wait for event count, never fixed sleep.
  await waitJournalEventCount(a,2);
  const state=await a.evaluate(async()=>{
   const m=await import("/world-verification-ledger.mjs");
   return m.readWorldLedger(localStorage);
  });
  assert.equal(state.events.length,2);
  assert.deepEqual(state.rows.map(x=>x.id),["r19-a","r19-b"]);
  assert.deepEqual(errors,[]);
  console.log("WORLD_MODEL_R19_COOPERATIVE_LOCK_PASS engine="+WORLD_LOCK_BROWSER+" busy=1 stale=1 reload=1 history=2");
 }finally{await ctx.close();await browser.close();}
});
test("R19 browser missing Web Locks must not fall back to unsafe journal writes",async()=>{
 const browser=await launchWorldLockBrowser();
 const ctx=await browser.newContext(),page=await ctx.newPage();
 try{
  await page.addInitScript(()=>Object.defineProperty(navigator,"locks",{value:undefined,configurable:true}));
  await page.goto(ROOT,{waitUntil:"domcontentloaded"});await ready(page);
  const ok=await page.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"no lock provider"}),row("no-lock"));
  assert.equal(ok,false);
  assert.equal(await page.evaluate(()=>localStorage.getItem("worldModel.verify.events.v2")),null);
  assert.match(await page.locator("#worldHistoryStatus").innerText(),/web_locks_unavailable/);
  console.log("WORLD_MODEL_R19_LOCK_UNAVAILABLE_FAIL_CLOSED_PASS engine="+WORLD_LOCK_BROWSER);
 }finally{await ctx.close();await browser.close();}
});
/**
 * R19-stale-writer
 * 1) B loads first and remembers old journal version/snapshot (in-memory rawV2).
 * 2) A writes event A; confirm saved (fingerprint on A).
 * 3) B, without reload, writes with old expectedRawV2: MUST be rejected; A not overwritten.
 *    If product accepts the stale write → FAIL (do not weaken).
 * 4) After B reloads, write event B succeeds; A and B both exist.
 * Acceptance: event IDs, version chain, content equal across A, B, fresh C (not counts only).
 * BOUNDARY: lock-honouring new code only; unlocked legacy writers stay BLOCKED.
 */
test("R19-stale-writer: remembered snapshot rejected; reload then both events",async()=>{
 const browser=await launchWorldLockBrowser();
 const ctx=await browser.newContext();
 const b=await ctx.newPage(),a=await ctx.newPage(),errors=[];
 [a,b].forEach(p=>p.on("pageerror",x=>errors.push(String(x))));
 try{
  await b.goto(ROOT,{waitUntil:"domcontentloaded"});await ready(b);
  const remembered=await b.evaluate(async()=>{
   const m=await import("/world-verification-ledger.mjs");
   const s=m.readWorldLedger(localStorage);
   window.__r19Remembered={rawV2:s.rawV2,eventsLen:s.events.length,rowIds:s.rows.map(r=>r.id)};
   return window.__r19Remembered;
  });
  assert.equal(remembered.rawV2,null,"B must remember empty rawV2");
  assert.equal(remembered.eventsLen,0);
  assert.deepEqual(remembered.rowIds,[]);

  await a.goto(ROOT,{waitUntil:"domcontentloaded"});await ready(a);
  const aOk=await a.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"R19-stale-writer event A"}),row("evt-a"));
  assert.equal(aOk,true,"A write must succeed");
  await waitJournalEventCount(a,1);
  const fpA1=await readFingerprint(a);
  assert.equal(fpA1.eventsLen,1);
  assert.deepEqual(fpA1.versions,[1]);
  assert.deepEqual(fpA1.recordIds,["evt-a"]);
  assert.deepEqual(fpA1.rowIds,["evt-a"]);
  assert.equal(fpA1.events[0].afterHypothesis,"合成研究 evt-a");
  assert.equal(fpA1.events[0].previousEventId,null);
  assert.ok(fpA1.eventIds[0]&&fpA1.rawSha256);

  await waitJournalEventCount(b,1);
  const bMem=await b.evaluate(()=>window.__r19Remembered);
  assert.equal(bMem.rawV2,null,"B in-memory remembered rawV2 must stay null (no reload)");

  const bStaleOk=await b.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"R19-stale-writer event B stale"}),row("evt-b"));
  if(bStaleOk!==false){
   const fpAfterBad=await readFingerprint(a);
   console.error("R19_STALE_WRITER_FAIL stale_write_accepted",JSON.stringify({
    bStaleOk,fpAfterBad,remembered,engine:WORLD_LOCK_BROWSER
   }));
   assert.equal(bStaleOk,false,
    "FAIL: stale write succeeded (product did not reject). "+
    "eventsLen="+fpAfterBad.eventsLen+" rowIds="+JSON.stringify(fpAfterBad.rowIds)+
    " eventIds="+JSON.stringify(fpAfterBad.eventIds));
  }
  assert.match(await b.locator("#worldHistoryStatus").innerText(),/stale_tab_conflict/);
  const fpA_afterStale=await readFingerprint(a);
  assertSameFingerprint("A vs post-stale-attempt A",fpA1,fpA_afterStale);
  const cProbe=await ctx.newPage();
  await cProbe.goto(ROOT,{waitUntil:"domcontentloaded"});await ready(cProbe);
  await waitJournalEventCount(cProbe,1);
  const fpC1=await readFingerprint(cProbe);
  assertSameFingerprint("A vs C after stale reject",fpA1,fpC1);
  await cProbe.close();

  await b.reload({waitUntil:"domcontentloaded"});await ready(b);
  const bFreshOk=await b.evaluate(r=>window.WorldVerifyHistory.append({
   type:"create",row:r,reason:"R19-stale-writer event B after reload"}),row("evt-b"));
  assert.equal(bFreshOk,true,"B after reload must succeed");
  await waitJournalEventCount(a,2);
  await waitJournalEventCount(b,2);
  const fpA2=await readFingerprint(a);
  const fpB2=await readFingerprint(b);
  const c=await ctx.newPage();
  await c.goto(ROOT,{waitUntil:"domcontentloaded"});await ready(c);
  await waitJournalEventCount(c,2);
  const fpC2=await readFingerprint(c);
  assert.equal(fpA2.eventsLen,2);
  assert.deepEqual(fpA2.versions,[1,2],"version chain 1→2");
  assert.deepEqual(fpA2.recordIds,["evt-a","evt-b"]);
  assert.deepEqual(fpA2.rowIds,["evt-a","evt-b"]);
  assert.equal(fpA2.events[0].previousEventId,null);
  assert.equal(fpA2.events[1].previousEventId,fpA2.events[0].eventId,"previousEventId links v2→v1");
  assert.equal(fpA2.events[0].afterHypothesis,"合成研究 evt-a");
  assert.equal(fpA2.events[1].afterHypothesis,"合成研究 evt-b");
  assert.equal(fpA2.reasons[0],"R19-stale-writer event A");
  assert.equal(fpA2.reasons[1],"R19-stale-writer event B after reload");
  assert.equal(fpA2.eventIds[0],fpA1.eventIds[0],"event A id stable");
  assert.notEqual(fpA2.eventIds[1],fpA1.eventIds[0]);
  assertSameFingerprint("A vs B final",fpA2,fpB2);
  assertSameFingerprint("A vs C final",fpA2,fpC2);
  assert.deepEqual(errors,[]);
  console.log("WORLD_MODEL_R19_STALE_WRITER_PASS engine="+WORLD_LOCK_BROWSER+
   " rejected=1 reload=1 events=2 sha="+fpA2.rawSha256+
   " BOUNDARY=lock_honouring_new_code_only old_unlocked_BLOCKED");
 }finally{await ctx.close();await browser.close();}
});
