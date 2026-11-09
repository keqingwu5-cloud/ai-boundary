import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldChessLineage} from '../world-chess-lineage.mjs';
const hash=s=>s.repeat(64);
const source={id:'A',revision:'r1',content_hash:hash('a'),available_at:'2026-11-08T12:00:00Z'};
const src2={id:'B',revision:'r1',content_hash:hash('b'),available_at:'2026-11-08T12:00:00Z'};
const board=()=>({id:'S0',revision:'r1',as_of:'2026-11-08T13:00:00Z',reference_frame:{scale:'organization',observer:'researcher'},source_refs:[source,src2],gap_refs:[{id:'G1',revision:'r1',state:'UNKNOWN'}]});
const result={id:'cmp:'+hash('c'),content_hash:hash('c'),authority:'none',evidence_certification:'UNVERIFIED',memory_approval:'NOT_APPROVED',real_ack:'NOT_VERIFIED'};
async function prepared(){const engine=createWorldChessLineage();const b=await engine.freezeBoard(board());assert.equal(b.status,'created');assert.equal((await engine.fork({boardId:b.id,branchId:'alpha',label:'counterfactual'})).status,'created');return {engine,b};}
test('T01 freezes board deterministically without asserting authority',async()=>{const {engine,b}=await prepared();assert.equal((await engine.freezeBoard(board())).status,'reused');assert.equal(engine.stats().authority,'none');assert.match(b.id,/^board:/);});
test('T02 identical result content produces distinct derivation events across branches',async()=>{const {engine,b}=await prepared();await engine.fork({boardId:b.id,branchId:'beta',label:'hypothesis'});const a=await engine.recordMove({branchId:'alpha',stepId:'m1',content:result,sourceRefs:['A']});const d=await engine.recordMove({branchId:'beta',stepId:'m1',content:result,sourceRefs:['A']});assert.equal(a.result_content_id,d.result_content_id);assert.notEqual(a.id,d.id);assert.equal(engine.compareBranches('alpha','beta').packet.authority,'none');});
test('T03 same branch new step preserves another event identity even with same content',async()=>{const {engine}=await prepared();const a=await engine.recordMove({branchId:'alpha',stepId:'m1',content:result});const b=await engine.recordMove({branchId:'alpha',stepId:'m2',content:result});assert.notEqual(a.id,b.id);assert.equal(engine.stats().events,2);});
test('T04 same step retries idempotently',async()=>{const {engine}=await prepared();const x={branchId:'alpha',stepId:'m1',content:result};const a=await engine.recordMove(x);const b=await engine.recordMove(x);assert.equal(b.status,'reused');assert.equal(b.id,a.id);assert.equal(engine.stats().events,1);});
test('T05 same step with altered content fails closed',async()=>{const {engine}=await prepared();await engine.recordMove({branchId:'alpha',stepId:'m1',content:result});assert.equal((await engine.recordMove({branchId:'alpha',stepId:'m1',content:{...result,content_hash:hash('d')}})).reason,'STEP_ID_REUSED_WITH_DIFFERENT_CONTENT');});
test('T06 cross-board comparison is rejected',async()=>{const {engine}=await prepared();const altered=board();altered.revision='r2';const id=(await engine.freezeBoard(altered)).id;await engine.fork({boardId:id,branchId:'gamma',label:'hypothesis'});assert.equal(engine.compareBranches('alpha','gamma').reason,'BASELINE_BOARD_MISMATCH');});
test('T07 future source cannot be used to make past baseline',async()=>{const e=createWorldChessLineage(),b=board();b.source_refs[0]={...source,available_at:'2026-11-09T00:00:00Z'};assert.equal((await e.freezeBoard(b)).reason,'SOURCE_OR_TIME_INVALID');});
test('T08 source time must have offset',async()=>{const e=createWorldChessLineage(),b=board();b.source_refs[0]={...source,available_at:'2026-11-08T12:00:00'};assert.equal((await e.freezeBoard(b)).reason,'SOURCE_OR_TIME_INVALID');});
test('T09 unknown gap is preserved, never converted to zero',async()=>{const {engine,b}=await prepared();const r=await engine.recordMove({branchId:'alpha',stepId:'m1',content:result,gapRefs:['G1']});const p=engine.readEvent(r.id).packet;assert.deepEqual(p.gap_refs,['G1']);assert.equal(p.actual_execution,'NOT_EXECUTED');});
test('T10 REDACTED blocks output without revealing names',async()=>{const e=createWorldChessLineage(),b=board();b.gap_refs[0]={...b.gap_refs[0],state:'REDACTED'};const r=await e.freezeBoard(b);assert.equal(r.reason,'ACCESS_DENIED_OR_UNAVAILABLE');assert.equal(r.packet,null);assert.equal(JSON.stringify(r).includes('G1'),false);});
test('T11 branch cannot attach a source outside frozen board',async()=>{const {engine}=await prepared();assert.equal((await engine.recordMove({branchId:'alpha',stepId:'m1',content:result,sourceRefs:['OUTSIDE']})).reason,'MOVE_REFERENCE_NOT_ON_BOARD');});
test('T12 forbidden promotion in result packet is rejected',async()=>{const {engine}=await prepared();assert.equal((await engine.recordMove({branchId:'alpha',stepId:'m1',content:{...result,memory_approval:'APPROVED'}})).reason,'MOVE_INVALID');});
test('T13 arbitrary capability and unrecognized result type rejected',async()=>{const {engine}=await prepared();assert.equal((await engine.recordMove({branchId:'alpha',stepId:'m1',content:{...result,capability:'admin'}})).reason,'MOVE_INVALID');});
test('T14 duplicate source identities rejected',async()=>{const e=createWorldChessLineage(),b=board();b.source_refs.push({...b.source_refs[0]});assert.equal((await e.freezeBoard(b)).reason,'SOURCE_OR_TIME_INVALID');});
test('T15 branch intervention cannot be treated as observed evidence',async()=>{const {engine,b}=await prepared();assert.equal((await engine.fork({boardId:b.id,branchId:'beta',label:'observed'})).reason,'BRANCH_INVALID');});
test('T16 caller cannot smuggle authority into board',async()=>{const e=createWorldChessLineage(),b=board();b.authority='approved';assert.equal((await e.freezeBoard(b)).reason,'BOARD_INVALID');});
test('T17 input change produces distinct board ID',async()=>{const e=createWorldChessLineage();const first=(await e.freezeBoard(board())).id;const b=board();b.source_refs[1]={...src2,revision:'r2'};const second=(await e.freezeBoard(b)).id;assert.notEqual(first,second);});
test('T18 bounded event history cannot silently overwrite',async()=>{const e=createWorldChessLineage({maxMoves:1});const b=(await e.freezeBoard(board())).id;await e.fork({boardId:b,branchId:'alpha',label:'hypothesis'});assert.equal((await e.recordMove({branchId:'alpha',stepId:'m1',content:result})).status,'recorded');assert.equal((await e.recordMove({branchId:'alpha',stepId:'m2',content:result})).reason,'MOVE_CAPACITY');});
test('T19 no source attestation implicit in successful event record',async()=>{const {engine}=await prepared();const x=await engine.recordMove({branchId:'alpha',stepId:'m1',content:result});const p=engine.readEvent(x.id).packet;assert.equal(p.authority,'none');assert.equal(p.real_ack,'NOT_VERIFIED');});

import {createCompositionEngine} from '../nary-composition.mjs';
test('T20 real V1.4 composition ID can be referenced independently in two simulated branches',async()=>{
  const low=createCompositionEngine();
  await low.registerSource({id:'NARY_A',revision:'r1',payload:{v:1}});
  await low.registerSource({id:'NARY_B',revision:'r1',payload:{v:2}});
  const res=await low.compose({inputIds:['NARY_A','NARY_B']});
  assert.equal(res.status,'created');
  const p=low.read(res.id).packet;
  const content={id:p.id,content_hash:p.content_hash,authority:p.authority,evidence_certification:p.evidence_certification,memory_approval:p.memory_approval,real_ack:p.real_ack};
  const {engine,b}=await prepared();
  await engine.fork({boardId:b.id,branchId:'beta',label:'counterfactual'});
  const a=await engine.recordMove({branchId:'alpha',stepId:'m1',content});
  const c=await engine.recordMove({branchId:'beta',stepId:'m1',content});
  assert.equal(a.status,'recorded');assert.equal(c.status,'recorded');
  assert.equal(a.result_content_id,c.result_content_id);assert.notEqual(a.id,c.id);
});

test('T21 future reference frame effective_at cannot leak into prior board',async()=>{const e=createWorldChessLineage(),b=board();b.reference_frame.effective_at='2026-11-09T00:00:00Z';assert.equal((await e.freezeBoard(b)).reason,'REFERENCE_FRAME_INVALID');});