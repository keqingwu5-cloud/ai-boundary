import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";

// R11 regression: watching a test file is not proof the CI job actually runs it.
// This would have caught the missing learning browser test in the first green run.
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
test("Every monitored browser test has an explicit executable entry in its browser CI job",()=>{
 const yaml=readFileSync(resolve(root,".github/workflows/brain-import-integrity.yml"),"utf8");
 const paths=yaml.split("\n").filter(x=>/^      - tests\/[^\s]+\.test\.cjs$/.test(x))
  .map(x=>x.trim().slice(2));
 const browserTests=paths.filter(x=>x.includes("browser"));
 const run=yaml.split("\n").find(x=>/^\s+run: node --test tests\/brain-browser-smoke/.test(x));
 const webkitRun=yaml.split("\n").find(x=>/^\s+run: (?:[A-Z0-9_]+=\w+ )*node --test tests\/first-brain-webkit-browser/.test(x));
 assert.ok(run,"Chromium test command is missing");
 assert.ok(webkitRun,"WebKit test command is missing");
 assert.ok(webkitRun.includes("WORLD_LOCK_BROWSER=webkit"),"WebKit world-lock browser selection is missing");
 assert.ok(webkitRun.split(/\s+/).includes("tests/world-model-writer-lock-browser.test.cjs"),"R19 WebKit cross-tab test must really run");
 assert.ok(webkitRun.includes("R20_BROWSER=webkit"),"R20 WebKit eviction engine selection missing");
 assert.ok(webkitRun.split(/\s+/).includes("tests/first-brain-eviction-browser.test.cjs"),"R20 WebKit eviction test must really run");
 assert.ok(webkitRun.includes("R21_BROWSER=webkit"),"R21 WebKit backup engine selection missing");
 assert.ok(webkitRun.split(/\s+/).includes("tests/first-brain-current-backup-browser.test.cjs"),"R21 WebKit verified backup browser test must really run");
 assert.ok(webkitRun.includes("R22_BROWSER=webkit"),"R22 WebKit recovery rehearsal selection missing");
 assert.ok(webkitRun.split(/\s+/).includes("tests/first-brain-recovery-rehearsal-browser.test.cjs"),"R22 WebKit rehearsal browser test must really run");
 assert.ok(webkitRun.includes("R23_BROWSER=webkit"),"R23 WebKit concurrent rehearsal selector missing");
 assert.ok(webkitRun.split(/\s+/).includes("tests/first-brain-rehearsal-conflicts-browser.test.cjs"),"R23 WebKit conflict browser test must really run");
 assert.ok(browserTests.length>=6,"browser test discovery unexpectedly shrank");
 for(const file of browserTests){
  const cmd=file.includes("webkit")?webkitRun:run;
  assert.ok(cmd.split(/\s+/).includes(file),"watched but never executed by its browser job: "+file);
 }
 assert.ok(paths.includes("tests/first-brain-learning-browser.test.cjs"));
 assert.equal(browserTests.length,new Set(browserTests).size,"duplicate tracked browser tests");
});
