import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorldLedger,rowsAtVersion,appendWorldLedger,LEGACY_KEY,JOURNAL_KEY} from '../world-verification-ledger.mjs';
const record=(id='v1',status='待驗證')=>({id,hypothesis:'假設 A',falsifier:'反例 B',
 createdOn:'2026-10-01',deadline:'2026-12-30',source:'',metric:'',status,createdAt:'2026-10-01T01:00:00Z'});
function store(fail=null){
 const data=new Map(),ops=[];return {data,ops,
  getItem(k){return data.has(k)?data.get(k):null},
  setItem(k,v){ops.push(['set',k]);if(k===fail)throw Error('QuotaExceededError');data.set(k,String(v));},
  removeItem(k){ops.push(['remove',k]);data.delete(k)}};
}
const put=(s,raw,action)=>appendWorldLedger(s,raw,{...action,reason:action.reason||'人工變更研究，不代表內容已被獨立證實'});
test('01 old v1 records load without writes',()=>{
 const s=store(),raw=JSON.stringify([record()]);s.data.set(LEGACY_KEY,raw);
 const got=readWorldLedger(s);assert.equal(got.ok,true);
 assert.equal(got.rows[0].id,'v1');assert.equal(got.rawV2,null);assert.equal(s.ops.length,0);
});
test('02 append status retains legacy v1 bytes and previous status',()=>{
 const s=store(),old=JSON.stringify([record()]);s.data.set(LEGACY_KEY,old);
 const a=put(s,null,{type:'status',recordId:'v1',status:'證據不足'});
 assert.equal(a.ok,true);assert.equal(a.rows[0].status,'證據不足');
 assert.equal(s.getItem(LEGACY_KEY),old);assert.equal(s.ops.length,1);
 assert.equal(rowsAtVersion(s,0).rows[0].status,'待驗證');
 assert.equal(rowsAtVersion(s,1).rows[0].status,'證據不足');
 assert.equal(a.event.before.status,'待驗證');assert.equal(a.event.after.status,'證據不足');
});
test('03 new row then revision adds two immutable versions',()=>{
 const s=store(),row=record('new');
 const a=put(s,null,{type:'create',row});
 const b=put(s,a.rawV2,{type:'status',recordId:'new',status:'假設被反例推翻（自評）'});
 assert.equal(a.ok,true);assert.equal(b.ok,true);
 assert.equal(b.events.length,2);assert.equal(b.events[1].previousEventId,b.events[0].eventId);
 assert.equal(rowsAtVersion(s,1).rows[0].status,'待驗證');
});
test('04 delete tombstones record without deleting journal history',()=>{
 const s=store(),a=put(s,null,{type:'create',row:record()});
 const b=put(s,a.rawV2,{type:'delete',recordId:'v1'});
 assert.equal(b.ok,true);assert.equal(b.rows.length,0);
 assert.equal(rowsAtVersion(s,1).rows.length,1);
 assert.equal(rowsAtVersion(s,2).rows.length,0);
});
test('05 import replaces visible rows but never legacy or old history',()=>{
 const s=store();s.data.set(LEGACY_KEY,JSON.stringify([record('old')]));
 const a=put(s,null,{type:'import',rows:[record('new')]});
 assert.equal(a.ok,true);assert.equal(a.rows[0].id,'new');
 assert.equal(rowsAtVersion(s,0).rows[0].id,'old');
 assert.equal(a.events[0].before[0].id,'old');
});
test('06 restoring old version makes an additional append event',()=>{
 const s=store();s.data.set(LEGACY_KEY,JSON.stringify([record('v1')]));
 const a=put(s,null,{type:'status',recordId:'v1',status:'證據不足'});
 const b=put(s,a.rawV2,{type:'restore',rows:rowsAtVersion(s,0).rows});
 assert.equal(b.ok,true);assert.equal(b.events.length,2);
 assert.equal(readWorldLedger(s).rows[0].status,'待驗證');
 assert.equal(rowsAtVersion(s,1).rows[0].status,'證據不足');
});
test('07 stale tab does not overwrite newer journal or baseline',()=>{
 const s=store(),a=put(s,null,{type:'create',row:record('a')});
 const b=put(s,null,{type:'create',row:record('b')});
 assert.equal(b.ok,false);assert.equal(b.reason,'stale_tab_conflict');
 assert.equal(readWorldLedger(s).rows[0].id,'a');
 assert.equal(a.events.length,1);
});
test('08 quota failure leaves original v1 and previous journal intact',()=>{
 const s=store(JOURNAL_KEY),v1=JSON.stringify([record()]);
 s.data.set(LEGACY_KEY,v1);
 const r=put(s,null,{type:'status',recordId:'v1',status:'證據不足'});
 assert.equal(r.ok,false);
 assert.equal(s.getItem(LEGACY_KEY),v1);assert.equal(s.getItem(JOURNAL_KEY),null);
});
test('09 corrupted old v1 blocks writes instead of silently erasing history',()=>{
 const s=store();s.data.set(LEGACY_KEY,'{corrupted json');
 const r=put(s,null,{type:'create',row:record()});
 assert.equal(r.ok,false);assert.equal(s.getItem(LEGACY_KEY),'{corrupted json');
 assert.equal(s.ops.length,0);
});
test('10 corrupted journal stops unsafe changes',()=>{
 const s=store();s.data.set(JOURNAL_KEY,'{{broken');
 assert.equal(readWorldLedger(s).reason,'journal_corrupt');
 assert.equal(put(s,'{{broken',{type:'create',row:record()}).ok,false);
});
test('11 baseline changed outside journal rejects inconsistent history',()=>{
 const s=store();s.data.set(LEGACY_KEY,JSON.stringify([record()]));
 const a=put(s,null,{type:'status',recordId:'v1',status:'證據不足'});
 s.data.set(LEGACY_KEY,JSON.stringify([record('external')]));
 assert.equal(a.ok,true);assert.equal(readWorldLedger(s).reason,'journal_invalid_or_base_changed');
});
test('12 duplicate research ids forbidden',()=>{
 const s=store(),a=put(s,null,{type:'create',row:record()});
 const b=put(s,a.rawV2,{type:'create',row:record()});
 assert.equal(b.ok,false);assert.match(b.reason,/invalid_transition/);
});
test('13 missing record update cannot be a successful version',()=>{
 const s=store();const r=put(s,null,{type:'status',recordId:'unknown',status:'證據不足'});
 assert.equal(r.ok,false);assert.equal(r.reason,'record_missing');
});
test('14 unsupported statuses are rejected before writing',()=>{
 const s=store(),a=put(s,null,{type:'create',row:record()});
 const b=put(s,a.rawV2,{type:'status',recordId:'v1',status:'verified-automatically'});
 assert.equal(b.ok,false);assert.equal(s.ops.length,1);
});
test('15 repaired session retains history across independent reads',()=>{
 const s=store(),a=put(s,null,{type:'create',row:record()});
 const b=put(s,a.rawV2,{type:'status',recordId:'v1',status:'證據不足'});
 const c=readWorldLedger(s);
 assert.equal(c.events.length,2);assert.equal(c.rows[0].status,'證據不足');
 assert.equal(rowsAtVersion(s,1).rows[0].status,'待驗證');
});
test('16 failure restores the exact prior ledger bytes',()=>{
 const s=store(),a=put(s,null,{type:'create',row:record()});
 const saved=s.getItem(JOURNAL_KEY);s.setItem=(k,v)=>{throw Error('write failed');};
 const b=put(s,a.rawV2,{type:'status',recordId:'v1',status:'證據不足'});
 assert.equal(b.ok,false);assert.equal(s.getItem(JOURNAL_KEY),saved);
});
test('17 empty baseline and version zero are legitimate',()=>{
 const s=store();assert.equal(rowsAtVersion(s,0).ok,true);
 assert.equal(rowsAtVersion(s,0).rows.length,0);
});
test('18 invalid rollback destination does not replace records',()=>{
 const s=store(),a=put(s,null,{type:'create',row:record()});
 const b=put(s,a.rawV2,{type:'restore',rows:[{bad:1}]});
 assert.equal(b.ok,false);assert.equal(readWorldLedger(s).rows.length,1);
});
