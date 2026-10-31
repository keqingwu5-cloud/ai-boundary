"use strict";
/** Drives world-model-r19.html (product + bridge) with the same trial as run-wm.cjs. */
const path = require("path");
const fs = require("fs");
const { webkit, devices } = require("/workspace/f05/pw/node_modules/playwright-core");
const BASE = process.env.R19_BASE || "http://127.0.0.1:8766";
const N = Number(process.env.R19_N || 100);
const LABEL = process.env.R19_LABEL || "r19-bridge";
const outDir = process.env.R19_OUT || __dirname;
const contextOpts = process.env.R19_IPHONE === "1"
  ? { ...(devices["iPhone 13"] || devices["iPhone 12"] || {}) }
  : {};
const ROOT = BASE + "/world-model-r19.html";
const JOURNAL = "worldModel.verify.events.v2";
const ready = (p) => p.waitForFunction(
  "window.WorldVerifyHistory && document.body.dataset.ledgerReady==='1' && window.__r19 && document.body.dataset.r19Ready==='1'",
  null, { timeout: 45000 });
const row = (id) => ({
  id, hypothesis: "合成研究 " + id, falsifier: "反例",
  createdOn: "2026-10-29", deadline: "2026-12-31",
  source: "", metric: "", status: "待驗證", createdAt: "2026-10-29T01:00:00Z"
});

async function oneTrial(a, b, i) {
  await a.evaluate((k) => {
    localStorage.removeItem(k);
    localStorage.removeItem("worldModel.verify.v1");
  }, JOURNAL);
  await Promise.all([a.reload({ waitUntil: "domcontentloaded" }), b.reload({ waitUntil: "domcontentloaded" })]);
  await Promise.all([ready(a), ready(b)]);

  const hold = await a.evaluate(() => window.__r19.holdLock());
  if (!hold || !hold.ok) return { ok: false, sig: "HOLD_LOCK_FAIL", detail: hold };
  const busy = await b.evaluate((r) => window.WorldVerifyHistory.append({
    type: "create", row: r, reason: "busy B" }), row("busy-" + i));
  if (busy !== false) {
    await a.evaluate(() => window.__r19.releaseLock());
    return { ok: false, sig: "BUSY_EXPECT_DENIED", detail: busy };
  }
  await a.evaluate(() => window.__r19.releaseLock());
  const first = await a.evaluate((r) => window.WorldVerifyHistory.append({
    type: "create", row: r, reason: "A saves after lock" }), row("a-" + i));
  if (first !== true) return { ok: false, sig: "A_WRITE_FAIL", detail: first };
  const stale = await b.evaluate((r) => window.WorldVerifyHistory.append({
    type: "create", row: r, reason: "B stale" }), row("b-" + i));
  if (stale !== false) return { ok: false, sig: "L109_true_ne_false", detail: { stale } };
  return { ok: true };
}

(async () => {
  console.log("bridge N", N, LABEL, "iphone", process.env.R19_IPHONE || "0", ROOT);
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext(contextOpts);
  const a = await ctx.newPage(), b = await ctx.newPage();
  await Promise.all([
    a.goto(ROOT + "?role=A", { waitUntil: "domcontentloaded" }),
    b.goto(ROOT + "?role=B", { waitUntil: "domcontentloaded" })
  ]);
  await Promise.all([ready(a), ready(b)]);
  let pass = 0, fail = 0; const failures = [];
  for (let i = 1; i <= N; i++) {
    let r;
    try { r = await oneTrial(a, b, i); }
    catch (e) { r = { ok: false, sig: "EXCEPTION:" + e.message }; }
    if (r.ok) pass++; else { fail++; failures.push({ trial: i, sig: r.sig, detail: r.detail || null }); }
    if (i % 25 === 0) console.log("progress", i, "pass", pass, "fail", fail);
  }
  const ua = await a.evaluate(() => navigator.userAgent);
  await browser.close();
  const result = {
    label: LABEL, mode: "world-model-r19-two-top-level-pages",
    productCommit: "bbf381a6cad340af830d09da55e98ad752ac9a78",
    N, pass, fail, rate: (pass + fail) ? fail / (pass + fail) : null,
    uniqSigs: [...new Set(failures.map((f) => f.sig))],
    failureSignatures: failures.slice(0, 50), userAgent: ua
  };
  const file = path.join(outDir, "result-" + LABEL + ".json");
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ out: file, pass, fail, rate: result.rate, uniqSigs: result.uniqSigs }));
  if (fail === 0) process.exitCode = 2;
})().catch((e) => { console.error(e); process.exit(1); });
