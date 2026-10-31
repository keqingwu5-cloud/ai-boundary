"use strict";
const path = require("path");
const fs = require("fs");
const { webkit, devices } = require("/workspace/f05/pw/node_modules/playwright-core");
const BASE = process.env.R19_BASE || "http://127.0.0.1:8766";
const N = Number(process.env.R19_N || 100);
const LABEL = process.env.R19_LABEL || "product-shell";
const outDir = process.env.R19_OUT || __dirname;
const contextOpts = process.env.R19_IPHONE === "1"
  ? { ...(devices["iPhone 13"] || devices["iPhone 12"] || {}) }
  : {};
const row = (id) => ({
  id, hypothesis: "合成研究 " + id, falsifier: "反例",
  createdOn: "2026-10-29", deadline: "2026-12-31",
  source: "", metric: "", status: "待驗證", createdAt: "2026-10-29T01:00:00Z"
});
const ready = (p) => p.waitForFunction("window.__r19Shell && window.__r19Shell.ready()", null, { timeout: 45000 });

async function oneTrial(a, b, i) {
  await a.evaluate(async () => { await window.__r19Shell.clear(); });
  await Promise.all([a.reload({ waitUntil: "domcontentloaded" }), b.reload({ waitUntil: "domcontentloaded" })]);
  await Promise.all([ready(a), ready(b)]);

  const hold = await a.evaluate(() => window.__r19Shell.holdLock());
  if (!hold?.ok) return { ok: false, sig: "HOLD_LOCK_FAIL" };
  await a.waitForFunction("window.r19Locked===true");
  const busy = await b.evaluate((r) => window.__r19Shell.append({ type: "create", row: r, reason: "busy B" }), row("busy-" + i));
  if (busy !== false) {
    await a.evaluate(() => window.__r19Shell.releaseLock());
    return { ok: false, sig: "BUSY_EXPECT_DENIED", detail: busy };
  }
  await a.evaluate(() => window.__r19Shell.releaseLock());
  const first = await a.evaluate((r) => window.__r19Shell.append({ type: "create", row: r, reason: "A saves after lock" }), row("a-" + i));
  if (first !== true) return { ok: false, sig: "A_WRITE_FAIL", detail: first };
  const stale = await b.evaluate((r) => window.__r19Shell.append({ type: "create", row: r, reason: "B stale" }), row("b-" + i));
  if (stale !== false) return { ok: false, sig: "L109_true_ne_false", detail: { stale } };
  return { ok: true };
}

(async () => {
  console.log("product-shell N", N, LABEL, "iphone", process.env.R19_IPHONE || "0");
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext(contextOpts);
  const a = await ctx.newPage(), b = await ctx.newPage();
  await Promise.all([
    a.goto(BASE + "/product-shell.html", { waitUntil: "domcontentloaded" }),
    b.goto(BASE + "/product-shell.html", { waitUntil: "domcontentloaded" }),
  ]);
  await Promise.all([ready(a), ready(b)]);
  let pass = 0, fail = 0; const failures = [];
  for (let i = 1; i <= N; i++) {
    let r;
    try { r = await oneTrial(a, b, i); }
    catch (e) { r = { ok: false, sig: "EXCEPTION:" + e.message }; }
    if (r.ok) pass++; else { fail++; failures.push({ trial: i, sig: r.sig, detail: r.detail || null }); }
    if (i % 20 === 0) console.log("progress", i, "pass", pass, "fail", fail);
  }
  const ua = await a.evaluate(() => navigator.userAgent);
  await browser.close();
  const result = {
    label: LABEL, mode: "product-shell-two-pages", productCommit: "bbf381a6cad340af830d09da55e98ad752ac9a78",
    N, pass, fail, rate: fail / (pass + fail), uniqSigs: [...new Set(failures.map((f) => f.sig))],
    failureSignatures: failures.slice(0, 40), userAgent: ua
  };
  const file = path.join(outDir, "result-" + LABEL + ".json");
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ out: file, pass, fail, rate: result.rate, uniqSigs: result.uniqSigs }));
  if (fail === 0) process.exitCode = 2;
})().catch((e) => { console.error(e); process.exit(1); });
