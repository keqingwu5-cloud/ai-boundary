'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const core=require('../tcvl-traceback-core.js');
const t=n=>'2026-10-'+String(n).padStart(2,'0')+'T00:00:00.000Z';
const base={schema:core.SCHEMA,records:[
 {id:'E1',type:'evidence',createdAt:t(1),recordedAt:t(1),source:{claimedActor:'GPT1',verified:false}},
 {id:'C1',type:'claim',createdAt:t(1),recordedAt:t(1)},
 {id:'M1',type:'memory',createdAt:t(2),recordedAt:t(2)},
 {id:'T1',type:'task',createdAt:t(2),recordedAt:t(2)},
 {id:'Z1',type:'task',createdAt:t(2),recordedAt:t(2)},
 {id:'E2',type:'evidence',createdAt:t(4),recordedAt:t(4)}
],events:[
 {id:'a',recordId:'C1',kind:'submitted',happenedAt:t(1),recordedAt:t(1)},
 {id:'b',recordId:'C1',kind:'approved',happenedAt:t(2),recordedAt:t(2)},
 {id:'c',recordId:'C1',kind:'rejected',happenedAt:t(3),recordedAt:t(5)},
 {id:'d',recordId:'M1',kind:'suspended',happenedAt:t(3),recordedAt:t(3)}
],edges:[
 {from:'C1',to:'E1',type:'depends_on',recordedAt:t(1)},
 {from:'M1',to:'C1',type:'depends_on',recordedAt:t(2)},
 {from:'T1',to:'M1',type:'depends_on',recordedAt:t(2)},
 {from:'Z1',to:'E1',type:'related_to',recordedAt:t(2)}
]};
const cloned=o=>structuredClone(o);
test('schema and references are validated',()=>assert.deepEqual(core.validateHistory(base),[]));
test('missing dependent record rejects before replay',()=>{const x=cloned(base);x.edges.push({from:'ghost',to:'C1',type:'depends_on',recordedAt:t(2)});assert.match(core.validateHistory(x).join(','),/edge_invalid/);assert.throws(()=>core.replayAt(x,t(6)));});
test('duplicated event IDs are not silently accepted',()=>{const x=cloned(base);x.events.push({...x.events[0]});assert.ok(core.validateHistory(x).length>0);});
test('as-of replay excludes events recorded only later even if occurrence was earlier',()=>{const s=core.replayAt(base,t(4));assert.equal(s.records.find(r=>r.id==='C1').latest.kind,'approved');assert.equal(s.events.length,3);});
test('late-imported record cannot leak backwards into earlier snapshot',()=>{const x=cloned(base);x.records.push({id:'LATE',type:'evidence',createdAt:t(1),recordedAt:t(5)});assert.ok(!core.replayAt(x,t(4)).records.some(r=>r.id==='LATE'));assert.ok(core.replayAt(x,t(6)).records.some(r=>r.id==='LATE'));});
test('missing recorded-at timestamp is rejected',()=>{const x=cloned(base);delete x.records[0].recordedAt;assert.ok(core.validateHistory(x).includes('record_invalid'));});
test('as-of replay includes delayed report after its recording time',()=>assert.equal(core.replayAt(base,t(6)).records.find(r=>r.id==='C1').latest.kind,'rejected'));
test('original scenario remains unchanged after replay',()=>{const x=cloned(base);core.replayAt(base,t(6));assert.deepEqual(base,x);});
test('reverse impact traces direct and indirect dependencies',()=>{const result=core.impactOf(base,'E1',t(6));assert.deepEqual(result.affected.map(x=>x.id),['C1','M1','T1']);assert.ok(result.unaffected.includes('Z1'));});
test('related_to edge does not propagate impact',()=>{const result=core.impactOf(base,'E1',t(6));assert.ok(!result.affected.some(x=>x.id==='Z1'));});
test('suspended record is reported paused, not automatically invalidated',()=>{const result=core.impactOf(base,'E1',t(6));assert.equal(result.affected.find(x=>x.id==='M1').status,'paused');assert.equal(result.affected.find(x=>x.id==='C1').status,'needs_review');});
test('impact cannot read evidence that did not exist at cutoff',()=>assert.throws(()=>core.impactOf(base,'E2',t(2)),/不存在/));
test('three passes mean human review, never automatic approval',()=>{const x=core.tripleCheck({direction:{outcome:'pass',reason:'目標符合'},evidence:{outcome:'pass',reason:'有支持'},variations:{outcome:'pass',reason:'重現'}});assert.equal(x.decision,'eligible_for_human_review');assert.equal(x.canAutoApprove,false);});
test('three tests preserve explanations and return to the right role',()=>{const x=core.tripleCheck({direction:{outcome:'pass',reason:'方向一致'},evidence:{outcome:'fail',reason:'來源不明'},variations:{outcome:'unknown',reason:'樣本不足'}});assert.equal(x.decision,'return_for_revision');assert.deepEqual(x.returnTargets,['GPT2','BOT3']);assert.equal(x.details[1].reason,'來源不明');});
test('invalid test result takes precedence over fail and cannot be treated as claim false',()=>{const x=core.tripleCheck({direction:{outcome:'fail',reason:'偏離方向'},evidence:{outcome:'pass',reason:'來源足夠'},variations:{outcome:'invalid',reason:'測試環境錯誤'}});assert.equal(x.decision,'test_invalid');});
test('reuse of rejected record requires original decision to be recorded by cutoff',()=>{const p={reusesRecordId:'C1',purpose:'重測',originalRejectionReason:'證據不足',newEvidenceIds:['E2'],remainingCounterEvidenceIds:[],retestScope:'不同尺度',responsibleActor:'GPT1'};assert.equal(core.reviewRejectedReuse(base,p,t(4)).decision,'invalid_reference');assert.equal(core.reviewRejectedReuse(base,p,t(6)).decision,'eligible_for_recheck');});
test('rejected reuse without fresh evidence stays hold, preserves reason',()=>{const p={reusesRecordId:'C1',purpose:'重測',originalRejectionReason:'來源不足',newEvidenceIds:[],remainingCounterEvidenceIds:[],retestScope:'重測',responsibleActor:'GPT2'};const r=core.reviewRejectedReuse(base,p,t(6));assert.equal(r.decision,'hold_for_repair');assert.ok(r.reasons[0].includes('新證據'));});
test('same run conditions can compare outcome improvement',()=>{const a={caseId:'Q1',protocolId:'P1',datasetCutoff:t(1),outcome:'fail'};assert.equal(core.compareRetests(a,{...a,outcome:'pass'}).change,'improved');});
test('changed data cutoff cannot claim improvement',()=>{const a={caseId:'Q1',protocolId:'P1',datasetCutoff:t(1),outcome:'fail'};assert.equal(core.compareRetests(a,{...a,datasetCutoff:t(2),outcome:'pass'}).comparable,false);});
test('unknown outcome cannot claim improvement',()=>{const a={caseId:'Q1',protocolId:'P1',datasetCutoff:t(1),outcome:'unknown'};assert.equal(core.compareRetests(a,{...a,outcome:'pass'}).change,'undetermined');});
test('every data movement requires source destination version checksum and validation',()=>{const m={id:'I1',recordId:'C1',direction:'export',from:'vault',to:'manual',happenedAt:t(1),recordedAt:t(2),version:'1',checksum:'abc',validationResult:'manual'};assert.equal(core.validateMovement(m).valid,true);assert.equal(core.validateMovement({...m,to:''}).valid,false);});
