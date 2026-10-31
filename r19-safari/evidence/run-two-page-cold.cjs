"use strict";
/** New browser context per trial — closer to full-suite R19 process model. */
const path = require("path");
const fs = require("fs");
const { webkit, devices } = require("/workspace/f05/pw/node_modules/playwright-core");
const BASE = process.env.R19_BASE || "http://127.0.0.1:8766";
const N = Number(process.env.R19_N || 50);
const LABEL = process.env.R19_LABEL || "webkit-cold";
const outDir = process.env.R19_OUT || __dirname;
const contextOpts = process.env.R19_IPHONE === "1"
  ? { ...(devices["iPhone 13"] || devices["iPhone 12"] || {}) }
  : {};

const call = (page, cmd, extra = {}) =>
  page.evaluate(({ cmd, extra }) => window.__r19.dispatch(cmd, extra), { cmd, extra });

async function oneTrial(browser, i) {
  const ctx = await browser.newContext(contextOpts);
  try {
    const a = await ctx.newPage();
    const b = await ctx.newPage();
    await Promise.all([
      a.goto(BASE + "/writer-frame.html", { waitUntil: "domcontentloaded" }),
      b.goto(BASE + "/writer-frame.html", { waitUntil: "domcontentloaded" }),
    ]);
    await Promise.all([
      a.waitForFunction("window.__r19"),
      b.waitForFunction("window.__r19"),
    ]);
    await call(a, "clear");
    await call(b, "clear");
    await call(a, "resetSnapshot");
    await call(b, "resetSnapshot");
    const hold = await call(a, "holdLock");
    if (!hold?.ok) return { ok: false, sig: "HOLD_LOCK_FAIL", detail: hold };
    for (let k = 0; k < 50; k++) {
      if ((await call(a, "probe")).holdLocked) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const busy = await call(b, "append", { rowId: "busy-" + i, reason: "busy B" });
    if (busy?.ok !== false || busy.reason !== "journal_write_busy") {
      await call(a, "releaseLock");
      return { ok: false, sig: "BUSY_EXPECT_DENIED", detail: busy };
    }
    await call(a, "releaseLock");
    const first = await call(a, "append", { rowId: "a-" + i, reason: "A saves after lock" });
    if (first?.ok !== true) return { ok: false, sig: "A_WRITE_FAIL", detail: first };
    const stale = await call(b, "append", { rowId: "b-" + i, reason: "B stale" });
    if (stale?.ok !== false) return { ok: false, sig: "L109_true_ne_false", detail: stale };
    return { ok: true, rejectReason: stale.reason };
  } finally {
    await ctx.close();
  }
}

(async () => {
  console.log("cold-context N", N, LABEL);
  const browser = await webkit.launch({ headless: true });
  let pass = 0, fail = 0;
  const failures = [];
  for (let i = 1; i <= N; i++) {
    let r;
    try { r = await oneTrial(browser, i); }
    catch (e) { r = { ok: false, sig: "EXCEPTION:" + e.message }; }
    if (r.ok) pass++;
    else { fail++; failures.push({ trial: i, sig: r.sig, detail: r.detail || null }); }
    if (i % 10 === 0) console.log("progress", i, "pass", pass, "fail", fail);
  }
  await browser.close();
  const result = { label: LABEL, mode: "cold-context-per-trial", N, pass, fail,
    rate: fail / (pass + fail), uniqSigs: [...new Set(failures.map((f) => f.sig))],
    failureSignatures: failures.slice(0, 40),
    productCommit: "bbf381a6cad340af830d09da55e98ad752ac9a78" };
  const file = path.join(outDir, "result-" + LABEL + ".json");
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ out: file, pass, fail, rate: result.rate, uniqSigs: result.uniqSigs }));
  if (fail === 0) process.exitCode = 2;
})().catch((e) => { console.error(e); process.exit(1); });
