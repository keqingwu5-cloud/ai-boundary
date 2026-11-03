"use strict";
/* R22: genuine Chromium and desktop WebKit recovery rehearsal using a R21
 * synthetic backup. No production import, authority switch, or restore UI.
 */
const test=require("node:test"),assert=require("node:assert/strict");
const {chromium,webkit}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const engine=process.env.R22_BROWSER==="webkit"?"webkit":"chromium";
const launch=()=>engine==="webkit"?webkit.launch({headless:true})
 :chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const ready=p=>p.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});
const sourceDB="aiBrain.firstBrain.transaction.r1";
test("R22 verified backup replays only in disposable namespace, newer live IDB never overwritten",async()=>{
 const browser=await launch(),ctx=await browser.newContext({acceptDownloads:true});
 const old=await ctx.newPage(),tx=await ctx.newPage(),errors=[];
 [old,tx].forEach(p=>p.on("pageerror",e=>errors.push(String(e))));
 try{
  await old.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(old);
  const legacy=await old.evaluate(()=>localStorage.getItem("aiBrain.v1"));
  assert.ok(legacy);
  await tx.goto(ROOT+"/index.html?brainTx=1",{waitUntil:"domcontentloaded"});await ready(tx);
  const [initial]=await Promise.all([tx.waitForEvent("download",{timeout:15000}),tx.locator("#brainTxBackup").click()]);
  assert.ok(initial);
  tx.once("dialog",d=>d.accept());
  await tx.locator("#brainTxActivate").click();
  await tx.waitForFunction("window.AIBrain?.persistence().ready===true",null,{timeout:30000});
  const envelope=await tx.evaluate(async()=>{
   const node=window.AIBrain.getState().nodes[0],id=node.id;
   window.AIBrain.setStatus(id,node.status==="researching"?"resolved":"researching");
   const wrote=await window.AIBrain.whenIdle();
   const b=await (await import("/first-brain-transactional-backup.mjs"))
    .exportVerifiedTransactionalBackup("aiBrain.firstBrain.transaction.r1",localStorage,
      {expectedRevision:window.AIBrain.persistence().revision});
   return {ok:wrote,revision:window.AIBrain.persistence().revision,backup:b.backup,reason:b.reason};
  });
  assert.equal(envelope.ok,true);
  assert.equal(envelope.revision,2);
  assert.equal(envelope.reason,"verified_current_snapshot");
  assert.ok(envelope.backup);
  const result=await tx.evaluate(async backup=>{
   const mod=await import("/first-brain-recovery-rehearsal.mjs");
   const store=await import("/transactional-brain-store.mjs");
   const id=mod.newRecoveryRehearsalId(),name=mod.recoveryRehearsalName(id);
   const missingConfirmation=await mod.stageRecoveryRehearsal(backup,id);
   const stage=await mod.stageRecoveryRehearsal(backup,id,{confirmed:true});
   const verified=await mod.verifyRecoveryRehearsal(backup,id);
   const exact=await store.readSnapshot(name,"aiBrain.v1");
   const duplicate=await mod.stageRecoveryRehearsal(backup,id,{confirmed:true});
   return {id,name,missingConfirmation,stage,verified,exact,duplicate};
  },envelope.backup);
  assert.equal(result.name,"first-brain-r22-rehearsal-"+result.id);
  assert.equal(result.missingConfirmation.reason,"explicit_confirmation_required");
  assert.equal(result.stage.reason,"isolated_rehearsal_verified");
  assert.equal(result.stage.sourceRevision,2);
  assert.equal(result.stage.stagedRevision,1,"staged revision is local, not source revision");
  assert.equal(result.verified.reason,"isolated_roundtrip_matches");
  assert.equal(result.exact.snapshot.mainRaw,envelope.backup.mainRaw);
  assert.equal(result.exact.snapshot.undoRaw,envelope.backup.undoRaw);
  assert.equal(result.exact.snapshot.rehearsal.sourceRevision,2);
  assert.equal(result.exact.snapshot.rehearsal.sourceDigest,envelope.backup.sha256.payload);
  assert.equal(result.duplicate.reason,"rehearsal_already_exists");
  const newer=await tx.evaluate(async()=>{
   const node=window.AIBrain.getState().nodes[0],id=node.id;
   window.AIBrain.setStatus(id,node.status==="resolved"?"researching":"resolved");
   const wrote=await window.AIBrain.whenIdle();
   const snapshot=await (await import("/transactional-brain-store.mjs"))
    .readSnapshot("aiBrain.firstBrain.transaction.r1","aiBrain.v1");
   return {wrote,revision:window.AIBrain.persistence().revision,
    snapshot:snapshot.snapshot,legacy:localStorage.getItem("aiBrain.v1"),
    authority:localStorage.getItem("aiBrain.v1.persistence.authority")};
  });
  assert.equal(newer.wrote,true);
  assert.equal(newer.revision,3);
  assert.notEqual(newer.snapshot.mainRaw,envelope.backup.mainRaw);
  assert.equal(newer.legacy,legacy);
  assert.equal(newer.authority,"idb");
  const unchanged=await tx.evaluate(async ({id,backup})=>{
   const mod=await import("/first-brain-recovery-rehearsal.mjs");
   const store=await import("/transactional-brain-store.mjs");
   const restage=await mod.stageRecoveryRehearsal(backup,id,{confirmed:true});
   const same=await mod.verifyRecoveryRehearsal(backup,id);
   const isolated=await store.readSnapshot(mod.recoveryRehearsalName(id),"aiBrain.v1");
   const current=await store.readSnapshot("aiBrain.firstBrain.transaction.r1","aiBrain.v1");
   return {restage,same,isolated:isolated.snapshot,current:current.snapshot};
  },{id:result.id,backup:envelope.backup});
  assert.equal(unchanged.restage.reason,"rehearsal_already_exists");
  assert.equal(unchanged.same.ok,true);
  assert.equal(unchanged.isolated.mainRaw,envelope.backup.mainRaw);
  assert.equal(unchanged.isolated.undoRaw,envelope.backup.undoRaw);
  assert.equal(unchanged.current.revision,3);
  assert.equal(unchanged.current.mainRaw,newer.snapshot.mainRaw);
  assert.equal(unchanged.current.undoRaw,newer.snapshot.undoRaw);
  const disposed=await tx.evaluate(async ({id,backup})=>{
   const mod=await import("/first-brain-recovery-rehearsal.mjs");
   const no=await mod.discardRecoveryRehearsal(id);
   const yes=await mod.discardRecoveryRehearsal(id,{confirmed:true});
   const missing=await mod.verifyRecoveryRehearsal(backup,id);
   const curr=await (await import("/transactional-brain-store.mjs"))
    .readSnapshot("aiBrain.firstBrain.transaction.r1","aiBrain.v1");
   return {no,yes,missing,current:curr.snapshot};
  },{id:result.id,backup:envelope.backup});
  assert.equal(disposed.no.reason,"explicit_confirmation_required");
  assert.equal(disposed.yes.reason,"isolated_rehearsal_deleted");
  assert.equal(disposed.missing.reason,"rehearsal_missing");
  assert.equal(disposed.current.revision,3,"disposal cannot erase live authority");
  assert.equal(disposed.current.mainRaw,newer.snapshot.mainRaw);
  assert.deepEqual(errors,[]);
  console.log("FIRST_BRAIN_R22_DISPOSABLE_RECOVERY_PASS engine="+engine+
   " main_exact=1 undo_exact=1 provenance=1 newer_live_protected=1 no_promotion=1 cleanup=1");
 }finally{await ctx.close();await browser.close();}
});
test("R22 corrupt, wrong ID, and occupied higher revision all fail closed without main database writes",async()=>{
 const browser=await launch(),ctx=await browser.newContext(),page=await ctx.newPage();
 try{
  await page.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(page);
  const results=await page.evaluate(async()=>{
   const rehearsal=await import("/first-brain-recovery-rehearsal.mjs");
   const store=await import("/transactional-brain-store.mjs");
   const bad=await rehearsal.stageRecoveryRehearsal({schema:"unknown"},"invalid",
    {confirmed:true});
   const id=rehearsal.newRecoveryRehearsalId();
   const altered=await rehearsal.stageRecoveryRehearsal({schema:"unknown"},id,
    {confirmed:true});
   const name=rehearsal.recoveryRehearsalName(id);
   const before=await store.readSnapshot("aiBrain.firstBrain.transaction.r1","aiBrain.v1");
   const existing=await store.writeSnapshot(name,"aiBrain.v1",0,"existing","[]");
   const newer=await store.writeSnapshot(name,"aiBrain.v1",1,"newer","[]");
   const after=await store.readSnapshot(name,"aiBrain.v1");
   // A digest-valid synthetic backup must not overwrite a pre-existing
   // higher revision in this isolated namespace, even when confirmed.
   const graph=JSON.stringify(window.AIBrain.getState()),undo="[]";
   const sha=async raw=>{
    const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
   };
   const backup={schema:"first-brain.transactional.backup.v1",key:"aiBrain.v1",
    revision:1,exportedAt:new Date().toISOString(),mainRaw:graph,undoRaw:undo,
    legacyFence:{version:1,mainSha:"a".repeat(64),undoSha:"b".repeat(64)}};
   const payload=JSON.stringify({schema:backup.schema,key:backup.key,
    revision:backup.revision,exportedAt:backup.exportedAt,
    mainRaw:backup.mainRaw,undoRaw:backup.undoRaw,legacyFence:backup.legacyFence});
   backup.sha256={mainRaw:await sha(graph),undoRaw:await sha(undo),
    payload:await sha(payload)};
   const valid=await (await import("/first-brain-transactional-backup.mjs"))
    .verifyTransactionalBackup(backup);
   const denied=await rehearsal.stageRecoveryRehearsal(backup,id,{confirmed:true});
   const existingAfter=await store.readSnapshot(name,"aiBrain.v1");
   const cleaned=await rehearsal.discardRecoveryRehearsal(id,{confirmed:true});
   const live=await store.readSnapshot("aiBrain.firstBrain.transaction.r1","aiBrain.v1");
   return {bad,altered,before,existing,newer,after,valid,denied,
    existingAfter,cleaned,live};
  });
  assert.equal(results.bad.reason,"invalid_rehearsal_id");
  assert.equal(results.altered.reason,"backup_format_invalid");
  assert.equal(results.existing.ok,true);
  assert.equal(results.newer.ok,true);
  assert.equal(results.after.snapshot.revision,2);
  assert.equal(results.after.snapshot.mainRaw,"newer");
  assert.equal(results.valid.ok,true,"synthetic backup must be structurally valid");
  assert.equal(results.denied.reason,"rehearsal_already_exists",
   "even a correctly verified backup cannot replace a higher revision");
  assert.equal(results.existingAfter.snapshot.revision,2);
  assert.equal(results.existingAfter.snapshot.mainRaw,"newer");
  assert.equal(results.cleaned.ok,true);
  assert.equal(results.before.snapshot,results.live.snapshot);
  console.log("FIRST_BRAIN_R22_NEGATIVE_REHEARSAL_PASS engine="+engine+
   " bad_backup=1 invalid_id=1 higher_version_preserved=1 live_untouched=1");
 }finally{await ctx.close();await browser.close();}
});
