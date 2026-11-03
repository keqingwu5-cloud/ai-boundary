import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorldLedger,rowsAtVersion,appendWorldLedger,appendWorldLedgerLocked,WORLD_LEDGER_WRITE_LOCK,LEGACY_KEY,JOURNAL_KEY} from '../world-verification-ledger.mjs';
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

test('19 KNOWN LIMIT: delayed cross-tab visibility can overwrite a concurrent journal',()=>{
 const shared=new Map(),localA=new Map(),localB=new Map();
 function lagged(local){
  return {getItem(k){return local.has(k)?local.get(k):null},
   setItem(k,v){const raw=String(v);shared.set(k,raw);local.set(k,raw);},
   removeItem(k){shared.delete(k);local.delete(k);}};
 }
 const a=lagged(localA),b=lagged(localB);
 const first=appendWorldLedger(a,null,{type:'create',row:record('A'),reason:'A'});
 const second=appendWorldLedger(b,null,{type:'create',row:record('B'),reason:'B'});
 assert.equal(first.ok,true);assert.equal(second.ok,true,
  'second tab still thinks the shared journal is empty');
 const persisted=JSON.parse(shared.get(JOURNAL_KEY));
 assert.equal(persisted.events.length,1);
 assert.equal(persisted.events[0].after.id,'B');
 assert.equal(persisted.events.some(x=>x.after?.id==='A'),false);
 console.log('KNOWN_CROSS_TAB_RACE_UNPROTECTED: localStorage not atomic CAS; BLOCKED for concurrent same-time edits');
});


test('R19 no Web Locks = no world journal write, even when legacy code allows it',async()=>{
 const s=store(),action={type:'create',row:record('safe'),reason:'synthetic'};
 const r=await appendWorldLedgerLocked(s,null,action,null);
 assert.equal(r.ok,false);
 assert.equal(r.reason,'web_locks_unavailable');
 assert.equal(s.getItem(JOURNAL_KEY),null);
 assert.deepEqual(s.ops,[]);
});
test('R19 held exclusive Web Lock refuses concurrent writer before touching localStorage',async()=>{
 const s=store(),action={type:'create',row:record('locked'),reason:'synthetic'};
 const occupied={request:async(name,opts,fn)=>{
  assert.equal(name,WORLD_LEDGER_WRITE_LOCK);
  assert.equal(opts.mode,'exclusive');
  assert.equal(opts.ifAvailable,true);
  return fn(null);
 }};
 const r=await appendWorldLedgerLocked(s,null,action,occupied);
 assert.equal(r.reason,'journal_write_busy');
 assert.equal(r.ok,false);
 assert.equal(s.getItem(JOURNAL_KEY),null);
});
test('R19 cooperative writer holds an exclusive lock then validates stale snapshot',async()=>{
 const s=store(),names=[],lockManager={
  async request(name,opts,fn){
   names.push(name);
   assert.equal(opts.mode,'exclusive');assert.equal(opts.ifAvailable,true);
   return fn({name});
  }
 };
 const a=await appendWorldLedgerLocked(s,null,{type:'create',row:record('A'),reason:'A'},lockManager);
 assert.equal(a.ok,true);
 const old=await appendWorldLedgerLocked(s,null,{type:'create',row:record('B'),reason:'stale'},lockManager);
 assert.equal(old.ok,false);assert.equal(old.reason,'stale_tab_conflict');
 const journal=readWorldLedger(s);
 assert.equal(journal.events.length,1);
 assert.equal(journal.rows[0].id,'A');
 assert.deepEqual(names,[WORLD_LEDGER_WRITE_LOCK,WORLD_LEDGER_WRITE_LOCK]);
 const b=await appendWorldLedgerLocked(s,a.rawV2,{type:'create',row:record('B'),reason:'fresh'},lockManager);
 assert.equal(b.ok,true);
 assert.deepEqual(readWorldLedger(s).rows.map(x=>x.id),['A','B']);
});
test('R19 Web Locks callback errors cannot silently downgrade into unlocked fallback',async()=>{
 const s=store(),thrower={request:async()=>{throw Error('unsupported browser restriction')}};
 const r=await appendWorldLedgerLocked(s,null,{type:'create',row:record('x'),reason:'synthetic'},thrower);
 assert.equal(r.ok,false);assert.equal(r.reason,'journal_lock_failed');
 assert.equal(s.getItem(JOURNAL_KEY),null);
});
