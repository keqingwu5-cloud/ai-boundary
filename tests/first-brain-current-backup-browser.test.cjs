"use strict";
/* R21 true 3D export: the latest IDB graph+Undo are exported only by click.
 * Verify a SHA-256 envelope, reject byte/metadata tampering and stale tabs,
 * and never create a backup from the pre-cutover legacy source.
 * This browser test uses synthetic public seed data, no personal history.
 */
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {chromium,webkit}=require("playwright-core");
const ROOT="http://127.0.0.1:8765";
const engine=process.env.R21_BROWSER==="webkit"?"webkit":"chromium";
const launch=()=>engine==="webkit"
 ?webkit.launch({headless:true})
 :chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const ready=p=>p.waitForFunction("window.AIBrain && document.body.dataset.ready==='1'",null,{timeout:45000});

test("R21 verified current IDB backup: main and Undo raw, revision and digest, zero automatic restoration",async()=>{
 const browser=await launch(),ctx=await browser.newContext({acceptDownloads:true});
 const old=await ctx.newPage(),tx=await ctx.newPage(),errors=[];
 for(const p of [old,tx])p.on("pageerror",e=>errors.push(String(e)));
 try{
  await old.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded"});await ready(old);
  const original=await old.evaluate(()=>({
   mainRaw:localStorage.getItem("aiBrain.v1"),
   undoRaw:localStorage.getItem("aiBrain.v1.undo")
  }));
  assert.ok(original.mainRaw);
  await tx.goto(ROOT+"/index.html?brainTx=1",{waitUntil:"domcontentloaded"});await ready(tx);
  assert.equal(await tx.locator("#brainTxCurrentBackup").count(),0,
   "no active transaction: never expose a fake current backup");
  const [legacyBackup]=await Promise.all([
   tx.waitForEvent("download",{timeout:15000}),tx.locator("#brainTxBackup").click()
  ]);
  assert.equal(JSON.parse(fs.readFileSync(await legacyBackup.path(),"utf8")).mainRaw,original.mainRaw);
  tx.once("dialog",dialog=>dialog.accept());
  await tx.locator("#brainTxActivate").click();
  await tx.waitForFunction("window.AIBrain?.persistence().ready===true",null,{timeout:30000});
  const changed=await tx.evaluate(async()=>{
   const before=window.AIBrain.getState(),first=before.nodes[0],
    desired=first.status==="researching"?"resolved":"researching";
   window.AIBrain.setStatus(first.id,desired);
   const success=await window.AIBrain.whenIdle();
   return {success,revision:window.AIBrain.persistence().revision,nodeId:first.id,
    desired,legacyRaw:localStorage.getItem("aiBrain.v1")};
  });
  assert.equal(changed.success,true);assert.equal(changed.revision,2);
  assert.equal(changed.legacyRaw,original.mainRaw,"original legacy content remains unchanged");
  assert.equal(await tx.locator("#brainTxCurrentBackup").count(),1);
  const [download]=await Promise.all([
   tx.waitForEvent("download",{timeout:15000}),
   tx.locator("#brainTxCurrentBackup").click()
  ]);
  const backup=JSON.parse(fs.readFileSync(await download.path(),"utf8"));
  assert.match(download.suggestedFilename(),/revision-2-verified\.json$/);
  assert.equal(backup.schema,"first-brain.transactional.backup.v1");
  assert.equal(backup.revision,2);
  assert.equal(backup.key,"aiBrain.v1");
  assert.equal(backup.legacyFence.version,1);
  assert.equal(JSON.parse(backup.mainRaw).nodes[0].status,changed.desired);
  assert.notEqual(backup.mainRaw,original.mainRaw,"current IDB backup must not be pre-cutover legacy");
  const verified=await tx.evaluate(async envelope=>{
   const api=await import("/first-brain-transactional-backup.mjs");
   const good=await api.verifyTransactionalBackup(envelope);
   const damageMain=structuredClone(envelope);
   const graph=JSON.parse(damageMain.mainRaw);graph.nodes[0].title+=" forged";
   damageMain.mainRaw=JSON.stringify(graph);
   const badMain=await api.verifyTransactionalBackup(damageMain);
   const damageUndo=structuredClone(envelope);damageUndo.undoRaw="[]";
   const badUndo=await api.verifyTransactionalBackup(damageUndo);
   const meta=structuredClone(envelope);meta.revision=99;
   const badRevision=await api.verifyTransactionalBackup(meta);
   const future=structuredClone(envelope);future.schema="not-a-brain";
   const badSchema=await api.verifyTransactionalBackup(future);
   const direct=await (await import("/transactional-brain-store.mjs"))
    .readSnapshot("aiBrain.firstBrain.transaction.r1","aiBrain.v1");
   return {good,badMain,badUndo,badRevision,badSchema,
    source:direct.snapshot,
    legacy:localStorage.getItem("aiBrain.v1")};
  },backup);
  assert.equal(verified.good.reason,"backup_bytes_verified");
  assert.equal(verified.good.ok,true);
  assert.equal(verified.badMain.reason,"backup_digest_mismatch");
  assert.equal(verified.badUndo.reason,"backup_digest_mismatch");
  assert.equal(verified.badRevision.reason,"backup_digest_mismatch");
  assert.equal(verified.badSchema.reason,"backup_format_invalid");
  assert.equal(verified.source.mainRaw,backup.mainRaw);
  assert.equal(verified.source.undoRaw,backup.undoRaw);
  assert.equal(verified.source.revision,backup.revision);
  assert.equal(verified.legacy,original.mainRaw);
  const noFallback=await tx.evaluate(async()=>{
   const api=await import("/first-brain-transactional-backup.mjs");
   const id="aiBrain.firstBrain.transaction.r1";
   const stale=await api.exportVerifiedTransactionalBackup(id,localStorage,{expectedRevision:1});
   const auth=localStorage.getItem("aiBrain.v1.persistence.authority");
   localStorage.setItem("aiBrain.v1.persistence.authority","unexpected_authority");
   const blocked=await api.exportVerifiedTransactionalBackup(id,localStorage,{expectedRevision:2});
   localStorage.setItem("aiBrain.v1.persistence.authority",auth);
   return {stale,blocked};
  });
  assert.equal(noFallback.stale.reason,"stale_revision");
  assert.equal(noFallback.blocked.reason,"transactional_authority_not_active");
  assert.deepEqual(errors,[]);
  console.log("FIRST_BRAIN_R21_VERIFIED_CURRENT_BACKUP_PASS engine="+engine+
   " revision=2 main=1 undo=1 sha256=1 tamper_rejected=1 stale_rejected=1 legacy_unchanged=1");
 }finally{await ctx.close();await browser.close();}
});

test("R21 no IDB authority and missing snapshot: no fabricated latest backup",async()=>{
 const browser=await launch(),ctx=await browser.newContext();
 const page=await ctx.newPage();
 try{
  await page.goto(ROOT+"/tests/fixtures/transactional-store.html",{waitUntil:"domcontentloaded"});
  const observed=await page.evaluate(async()=>{
   const api=await import("/first-brain-transactional-backup.mjs");
   const db="r21-missing-backup";
   const missingMarker=await api.exportVerifiedTransactionalBackup(db,localStorage,{expectedRevision:1});
   localStorage.setItem("aiBrain.v1.persistence.authority","idb");
   const missingSnapshot=await api.exportVerifiedTransactionalBackup(db,localStorage,{expectedRevision:1});
   return {missingMarker,missingSnapshot,legacy:localStorage.getItem("aiBrain.v1")};
  });
  assert.equal(observed.missingMarker.reason,"transactional_authority_not_active");
  assert.equal(observed.missingSnapshot.reason,"transactional_snapshot_missing");
  assert.equal(observed.legacy,null,"no silent seed or automatic historical import");
  console.log("FIRST_BRAIN_R21_MISSING_SNAPSHOT_NO_BACKUP_PASS engine="+engine);
 }finally{await ctx.close();await browser.close();}
});
