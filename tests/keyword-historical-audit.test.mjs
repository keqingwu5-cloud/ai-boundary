import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCatalog,searchHistory,compareSourceSnapshots,assessEvidence,normalize,validateCatalog,NO_GO} from '../scripts/keyword-historical-audit.mjs';
const catalog=await loadCatalog();
const query=q=>searchHistory(catalog,q);
const ids=q=>query(q).results.map(x=>x.problem_id);
const HEAD_A='a'.repeat(40),HEAD_B='b'.repeat(40);
test('K01 catalog uses exact original 17 audited problem IDs',()=>{
 assert.equal(catalog.problems.length,17);
 assert.deepEqual(catalog.problems.map(x=>x.id),['FB-P0-01','FB-P0-02','FB-P0-03','FB-P0-04','FB-P0-05','FB-P0-06','FB-P0-07','FB-P0-08','FB-P0-09','FB-P1-10','FB-P1-11','FB-P1-12','FB-P1-13','FB-P1-14','FB-P1-15','FB-P1-16','FB-P2-17']);
 assert.equal(catalog.production_gate,'NO_GO');
});
test('K02 ACK resolves real handoff lineage issue 41 + 56',()=>{
 const result=query('ACK');assert.equal(result.results[0].problem_id,'FB-P0-01');
 assert.ok(result.results[0].refs.some(x=>x.kind==='issue'&&x.number===41));
 assert.ok(result.results[0].refs.some(x=>x.kind==='issue'&&x.number===56));
 assert.equal(result.real_ack,'NOT_VERIFIED');
});
test('K03 ACK matches case insensitive but not backup/BLACK',()=>{
 assert.ok(ids('ack').includes('FB-P0-01'));
 assert.ok(!ids('BACKUP').includes('FB-P0-01'));
 assert.ok(!ids('BLACKLIST').includes('FB-P0-01'));
});
test('K04 Chinese and Unicode GPT② normalize safely',()=>{
 assert.equal(normalize('  GPT②   '),'gpt2');
 assert.ok(ids('GPT②').includes('FB-P0-01'));
 assert.ok(ids('跨 AI').includes('FB-P0-01'));
 assert.ok(ids('記憶').includes('FB-P0-04'));
});
test('K05 exact ID is ranked first',()=>{
 assert.equal(query('FB-P0-01').results[0].problem_id,'FB-P0-01');
});
test('K06 explicit Issue #41 and #41 resolve index refs',()=>{
 assert.ok(ids('issue #41').includes('FB-P0-01'));
 assert.ok(ids('#41').includes('FB-P0-01'));
});
test('K07 PR #140 resolves release and integrator refs, never claims deployed',()=>{
 const o=query('PR #140');assert.ok(ids('PR #140').includes('FB-P0-08'));
 assert.equal(o.gate_lifting_permitted,false);assert.equal(o.decision,NO_GO);
});
test('K08 one keyword may map multiple distinct problems',()=>{
 const p=ids('3D');assert.ok(p.includes('FB-P0-05'));assert.ok(p.includes('FB-P1-14'));
});
test('K09 generic unknown keyword never creates fabricated match',()=>{
 const r=query('ZZQRBLAH-8877');assert.equal(r.match_count,0);assert.equal(r.decision,NO_GO);
});
test('K10 reject blank searches and bad pagination',()=>{
 assert.throws(()=>query(' \n '),/QUERY_REQUIRED/);
 assert.throws(()=>searchHistory(catalog,'ack',{limit:0}),/INVALID_LIMIT/);
});
test('K11 matching is deterministic and no duplicate issue/PR reference within a problem',()=>{
 const a=query('STOP'),b=query('stop');assert.deepEqual(a.results.map(x=>x.problem_id),b.results.map(x=>x.problem_id));
 for(const p of a.results){const keys=p.refs.map(x=>x.kind+x.number);assert.equal(keys.length,new Set(keys).size);}
});
test('K12 any CI PASS remains candidate-only without real ACK',()=>{
 const e=assessEvidence([{kind:'CI',head_sha:HEAD_A,run_id:12345,test_passed:true,original_job_log_checked:true}]);
 assert.equal(e.observations[0].scope,'PINNED_CI_ONLY');assert.equal(e.remote_ack,'NOT_VERIFIED');assert.equal(e.decision,NO_GO);
});
test('K13 fake CI string without original logs is claim-only',()=>{
 const e=assessEvidence([{kind:'CI',head_sha:HEAD_A,run_id:100,test_passed:true}]);
 assert.equal(e.observations[0].scope,'CLAIM_ONLY_OR_INCOMPLETE');
});
test('K14 issue comment claiming REVIEWED or ACK cannot lift status',()=>{
 const e=assessEvidence([{kind:'ISSUE_COMMENT',ack:'ACK_RECEIVED',approved:true},{kind:'REVIEW',reviewer:'BOT③',approved:true},{kind:'REMOTE_ACK',ack:true}]);
 assert.deepEqual(e.observations.map(x=>x.scope),['CLAIM_ONLY_OR_INCOMPLETE','CLAIM_ONLY_OR_INCOMPLETE','CLAIM_ONLY_OR_INCOMPLETE']);
 assert.equal(e.approval,'NOT_APPROVED');assert.equal(e.verified_reviewer,'NOT_VERIFIED');
});
test('K15 invalid direct evidence must reject, not invent',()=>{
 assert.throws(()=>assessEvidence([null]),/INVALID_EVIDENCE_ITEM/);
 assert.throws(()=>assessEvidence([{kind:'approval'}]),/INVALID_EVIDENCE_ITEM/);
});
test('K16 same-SHA unchanged source gives no update',()=>{
 const s=[{kind:'pr',number:140,head_sha:HEAD_A,state:'open'}];
 assert.deepEqual(compareSourceSnapshots(s,s).changes,[]);
});
test('K17 changed PR SHA causes stale recheck, not approved',()=>{
 const b=[{kind:'pr',number:140,head_sha:HEAD_A,state:'open'}];
 const a=[{kind:'pr',number:140,head_sha:HEAD_B,state:'open'}];
 const x=compareSourceSnapshots(b,a);assert.deepEqual(x.changes[0].changed_fields,['head_sha']);
 assert.equal(x.changes[0].decision,'STALE_RECHECK_REQUIRED');assert.equal(x.automatic_status_promotion,false);
});
test('K18 changed PR review/ACK claims still stale, not actual cross-AI proof',()=>{
 const b=[{kind:'pr',number:139,head_sha:HEAD_A,ack:'NOT_VERIFIED'}];
 const a=[{kind:'pr',number:139,head_sha:HEAD_A,ack:'ACK_RECEIVED',review:'APPROVED'}];
 const x=compareSourceSnapshots(b,a);assert.equal(x.changes.length,1);
 assert.equal(x.independent_ack_verified,false);assert.equal(x.decision,NO_GO);
});
test('K19 removed source not auto-closed, new source not auto-approved',()=>{
 const x=compareSourceSnapshots([{kind:'issue',number:41,state:'open'}],[{kind:'issue',number:56,state:'open'}]);
 assert.deepEqual(x.changes.map(z=>z.change).sort(),['NEW_SOURCE','SOURCE_NOT_IN_NEW_SNAPSHOT']);
});
test('K20 reject duplicate source and invalid SHA',()=>{
 assert.throws(()=>compareSourceSnapshots([{kind:'issue',number:41},{kind:'issue',number:41}],[]),/DUPLICATE_SOURCE/);
 assert.throws(()=>compareSourceSnapshots([{kind:'pr',number:140,head_sha:'wrong'}],[]),/INVALID_SOURCE_SHA/);
});
test('K21 duplicate problem IDs and invalid aliases are rejected',()=>{
 const bad=structuredClone(catalog);bad.problems.push(structuredClone(bad.problems[0]));
 assert.throws(()=>validateCatalog(bad),/DUPLICATE_PROBLEM_ID/);
 const dup=structuredClone(catalog);dup.problems[0].aliases.push('ACK');
 assert.throws(()=>validateCatalog(dup),/DUPLICATE_OR_EMPTY_ALIAS/);
});
test('K22 catalogue cannot assert trusted root or production READY',()=>{
 const c=structuredClone(catalog);c.production_gate='READY';
 assert.throws(()=>validateCatalog(c),/INVALID_CATALOG/);
});
test('K23 cross-domain claim references are explicitly related, not proven causal',()=>{
 const x=query('causes');assert.ok(x.results.every(z=>z.evidence==='INDEXED_HISTORICAL_CANDIDATE'));
 assert.ok(x.results.every(z=>z.gate!=='READY'));
});
test('K24 source test cannot grant independent review or answer unknown KGE-001 214 keywords',()=>{
 const x=query('KGE-001');assert.ok(x.results.some(z=>z.problem_id==='FB-P1-15'));
 assert.equal(x.source_is_independently_verified,false);
});
test('K25 prevent leading digits inside ACK tokens from falsely matching',()=>{
 assert.ok(!ids('xACK').includes('FB-P0-01'));
 assert.ok(!ids('ACKx').includes('FB-P0-01'));
});

test('K26 issue and PR typed references do not collapse into one another',()=>{
 assert.ok(!ids('PR #41').includes('FB-P0-01'));
 assert.ok(!ids('Issue #140').includes('FB-P0-08'));
 assert.ok(ids('PR #140').includes('FB-P0-08'));
 assert.ok(ids('Issue #41').includes('FB-P0-01'));
});