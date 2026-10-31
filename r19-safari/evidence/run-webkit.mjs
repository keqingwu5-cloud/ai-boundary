import { webkit, devices } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.R19_ROOT || 'http://127.0.0.1:8766/index.html';
const N = Number(process.env.R19_N || 100);
const MODE = process.env.R19_MODE || 'desktop'; // desktop | iphone
const outDir = process.env.R19_OUT || path.resolve('evidence');

async function runOnce(label, contextOptions) {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(m.type() + ': ' + m.text()));
  page.on('pageerror', (e) => consoleLines.push('pageerror: ' + String(e)));
  await page.goto(ROOT, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__r19Ready === true', null, { timeout: 30000 });
  const result = await page.evaluate(async (n) => window.__r19Run(n), N);
  await browser.close();
  const file = path.join(outDir, `result-${label}.json`);
  fs.writeFileSync(file, JSON.stringify({ label, N, result, consoleLines: consoleLines.slice(-40) }, null, 2));
  console.log(JSON.stringify({
    label,
    pass: result.pass,
    fail: result.fail,
    rate: result.rate,
    sigs: (result.failureSignatures || []).map((f) => f.sig),
    out: file
  }));
  return result;
}

const iphone = devices['iPhone 13'] || devices['iPhone 12'] || null;
if (MODE === 'desktop' || MODE === 'both') {
  await runOnce('webkit-desktop', { /* default desktop */ });
}
if (MODE === 'iphone' || MODE === 'both') {
  if (!iphone) throw new Error('no iPhone device descriptor');
  await runOnce('webkit-iphone', {
    ...iphone,
    // keep webkit engine; device descriptor sets UA + viewport
  });
}
