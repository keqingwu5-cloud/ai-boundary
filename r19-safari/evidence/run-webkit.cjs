"use strict";
const path = require("path");
const fs = require("fs");
// Force the pw install that has webkit-2215
const pwRoot = "/workspace/f05/pw/node_modules/playwright-core";
const { webkit, devices } = require(pwRoot);
const ROOT = process.env.R19_ROOT || "http://127.0.0.1:8766/index.html";
const N = Number(process.env.R19_N || 100);
const MODE = process.env.R19_MODE || "desktop";
const outDir = process.env.R19_OUT || path.join(__dirname);

async function runOnce(label, contextOptions) {
  console.log("launch", label, "exe=", webkit.executablePath());
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext(contextOptions || {});
  const page = await ctx.newPage();
  const consoleLines = [];
  page.on("console", (m) => consoleLines.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => consoleLines.push("pageerror: " + String(e)));
  await page.goto(ROOT, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction("window.__r19Ready === true", null, { timeout: 30000 });
  const result = await page.evaluate(async (n) => window.__r19Run(n), N);
  await browser.close();
  const file = path.join(outDir, "result-" + label + ".json");
  fs.writeFileSync(file, JSON.stringify({ label, N, result, consoleLines: consoleLines.slice(-50) }, null, 2));
  const sigs = (result.failureSignatures || []).map((f) => f.sig);
  const uniq = [...new Set(sigs)];
  console.log(JSON.stringify({ label, pass: result.pass, fail: result.fail, rate: result.rate, uniqSigs: uniq, out: file }));
  return result;
}

(async () => {
  if (MODE === "desktop" || MODE === "both") {
    await runOnce("webkit-desktop", {});
  }
  if (MODE === "iphone" || MODE === "both") {
    const iphone = devices["iPhone 13"] || devices["iPhone 12"] || devices["iPhone 11"];
    if (!iphone) throw new Error("no iPhone device descriptor in this playwright");
    await runOnce("webkit-iphone", { ...iphone });
  }
})().catch((e) => { console.error(e); process.exit(1); });
