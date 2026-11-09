import test from 'node:test';
import assert from 'node:assert/strict';
import {runChessPreview} from '../preview/chess-core.mjs';

test('C01 actual typed quantity result is shared by both branch events',async()=>{const r=await runChessPreview({a:4,b:6});assert.equal(r.ok,true);assert.equal(r.x.value,'10 MB');assert.equal(r.branches.length,2);assert.notEqual(r.branches[0].event_id,r.branches[1].event_id);assert.equal(r.comparison.authority,'none');});
test('C02 source changes invalidate board identity',async()=>{const a=await runChessPreview({a:4,b:6}),b=await runChessPreview({a:4,b:7});assert.notEqual(a.board_id,b.board_id);});
test('C03 gap state is not converted to zero',async()=>{const r=await runChessPreview({a:4,b:6,cState:'UNKNOWN'});assert.equal(r.gap_state,'UNKNOWN');assert.equal(r.audit.actual_execution,'NOT_EXECUTED');});
test('C04 gaps determine new frozen baseline',async()=>{const a=await runChessPreview({cState:'UNKNOWN'}),b=await runChessPreview({cState:'MISSING'});assert.notEqual(a.board_id,b.board_id);});
test('C05 explicit zero is accepted',async()=>{const r=await runChessPreview({a:0,b:0});assert.equal(r.ok,true);assert.equal(r.x.value,'0 MB');});
test('C06 empty string cannot be numeric zero',async()=>{const r=await runChessPreview({a:'',b:6});assert.equal(r.ok,false);});
test('C07 fractional input denied',async()=>{const r=await runChessPreview({a:.5,b:6});assert.equal(r.reason,'INTEGER_RANGE_REQUIRED');});
test('C08 out-of-bounds input denied',async()=>{const r=await runChessPreview({a:1_000_001,b:6});assert.equal(r.ok,false);});
test('C09 inaccessible REDACTED state denied',async()=>{const r=await runChessPreview({cState:'REDACTED'});assert.equal(r.ok,false);assert.equal(JSON.stringify(r).includes('content_hash'),false);});
test('C10 no authority, execution or memory approval',async()=>{const r=await runChessPreview();assert.deepEqual([r.audit.authority,r.audit.memory_approval,r.audit.real_ack,r.audit.persisted],['none','NOT_APPROVED','NOT_VERIFIED',false]);});