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
 const webkitRun=yaml.split("\n").find(x=>/^\s+run: (?:R17_BROWSER=webkit )?node --test tests\/first-brain-webkit-browser/.test(x));
 assert.ok(run,"Chromium test command is missing");
 assert.ok(webkitRun,"WebKit test command is missing");
 assert.ok(browserTests.length>=6,"browser test discovery unexpectedly shrank");
 for(const file of browserTests){
  const cmd=file.includes("webkit")?webkitRun:run;
  assert.ok(cmd.split(/\s+/).includes(file),"watched but never executed by its browser job: "+file);
 }
 assert.ok(paths.includes("tests/first-brain-learning-browser.test.cjs"));
 assert.equal(browserTests.length,new Set(browserTests).size,"duplicate tracked browser tests");
});
