import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(resolve(base,'docs/first-brain-r18-release-gates.json'),'utf8'));
const requiredBlockers=['independentReview','physicalAppleSafari','realHistoryDataset',
 'uncooperativeOldWriterCompleteQuiescence','worldModelCrossTabAtomicJournal',
 'releasePermissionAndRollback'];
test('R18 static audit: complete stacked PR chain with unique SHA references',()=>{
 assert.equal(manifest.schema,'first-brain-r18-release-gates/v1');
 assert.equal(manifest.repository,'keqingwu5-cloud/ai-boundary');
 assert.deepEqual(manifest.upstreamInOrder,[68,71,72,74,75]);
 assert.deepEqual(manifest.pullRequests.map(p=>p.number),manifest.upstreamInOrder);
 assert.equal(manifest.pullRequests[0].base,'main');
 assert.equal(new Set(manifest.pullRequests.map(p=>p.head)).size,5);
 assert.equal(new Set(manifest.pullRequests.map(p=>p.headSha)).size,5);
 for(let i=0;i<manifest.pullRequests.length;i++){
  const p=manifest.pullRequests[i];
  assert.match(p.headSha,/^[a-f0-9]{40}$/);
  assert.equal(p.base,i===0?'main':manifest.pullRequests[i-1].head,
    'missing explicit upstream dependency for PR #'+p.number);
  assert.ok(Number.isInteger(p.ciRun)&&p.ciRun>0);
 }
 assert.equal(manifest.aggregateDiffFromMain.commitCount,173);
 assert.equal(manifest.aggregateDiffFromMain.filesChanged,50);
});
test('R18 safety contract: green CI must never automatically authorize merge or deployment',()=>{
 assert.equal(manifest.readiness,'blocked');
 assert.equal(manifest.mainMergeAuthorized,false);
 assert.equal(manifest.deploymentAuthorized,false);
 assert.ok(manifest.pullRequests.every(p=>p.ci==='success'&&p.draft===true&&p.approvals===0));
 for(const key of requiredBlockers){
  assert.deepEqual(manifest.gates[key],{status:'blocked',evidence:null},
    'cannot silently mark a Gate as passed without separate evidence: '+key);
 }
 assert.equal(manifest.gates.stackedDependencyOrder.status,'passed');
 assert.equal(manifest.gates.headCI.status,'passed_at_audited_shas');
 const notes=manifest.notes.join(' ');
 assert.match(notes,/CI PASS is not independent reviewer/);
 assert.match(notes,/non-atomic localStorage/);
});
