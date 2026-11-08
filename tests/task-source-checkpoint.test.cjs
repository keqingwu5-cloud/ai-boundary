'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {FORMAT,makeScope,readCheckpoint,advanceCheckpoint}=require('../api/task-source-checkpoint.cjs');
const good=(body='review #105')=>({
  complete:true,errors:[],unresolved:[],read:[41],
  records:[{kind:'issue',issue:41,url:'https://github.com/a/b/issues/41',body,version:'v1'}]
});
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'firstbrain-cursor-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return path.join(root,'state','cursor.json');
}
const args=file=>({repository:'a/b',issue:41,checkpointFile:file});
test('first successful read creates a compact baseline checkpoint',t=>{
  const file=fixture(t);
  const result=advanceCheckpoint({...args(file),snapshot:good(),now:'2026-11-07T00:00:00Z'});
  assert.equal(result.summary.state,'BASELINE');
  assert.equal(result.checkpoint_status,'ABSENT_CACHE_MISS_OR_FIRST_RUN');
  assert.equal(result.checkpoint_written,true);
  const raw=fs.readFileSync(file,'utf8'),data=JSON.parse(raw);
  assert.equal(data.format,FORMAT);
  assert.equal(data.scope,makeScope('a/b',41));
  assert.match(data.source_digest,/^[a-f0-9]{64}$/);
  assert.equal(data.record_count,1);
  assert.ok(!raw.includes('review #105'));assert.ok(!raw.includes('NOT_VERIFIED'));
});
test('next invocation uses restored checkpoint, reports no-update and avoids rewriting it',t=>{
  const file=fixture(t);
  advanceCheckpoint({...args(file),snapshot:good(),now:'2026-11-07T00:00:00Z'});
  const before=fs.readFileSync(file,'utf8');
  const result=advanceCheckpoint({...args(file),snapshot:good(),now:'2026-11-07T02:00:00Z'});
  assert.equal(result.checkpoint_status,'RESTORED_VALID');
  assert.equal(result.summary.state,'NO_UPDATE');assert.equal(result.checkpoint_written,false);
  assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('new public content advances checkpoint to new digest',t=>{
  const file=fixture(t);
  const original=advanceCheckpoint({...args(file),snapshot:good()});
  const newer=advanceCheckpoint({...args(file),snapshot:good('review #106')});
  assert.equal(newer.summary.state,'CONTENT_CHANGED');assert.equal(newer.checkpoint_written,true);
  assert.notEqual(original.summary.source_digest,newer.summary.source_digest);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).source_digest,newer.summary.source_digest);
});
test('source failure does not overwrite last successful checkpoint',t=>{
  const file=fixture(t);advanceCheckpoint({...args(file),snapshot:good()});
  const before=fs.readFileSync(file,'utf8');
  const damaged={...good(),complete:false,errors:[{stage:'read',error:'github_http_403'}]};
  const out=advanceCheckpoint({...args(file),snapshot:damaged});
  assert.equal(out.summary.state,'MONITOR_UNHEALTHY');assert.equal(out.checkpoint_written,false);
  assert.equal(fs.readFileSync(file,'utf8'),before);
});
test('cursor for another issue or repository cannot be reused',t=>{
  const file=fixture(t);advanceCheckpoint({...args(file),snapshot:good()});
  assert.throws(()=>advanceCheckpoint({...args(file),issue:33,snapshot:good()}),/checkpoint_invalid_or_wrong_scope/);
  assert.throws(()=>advanceCheckpoint({...args(file),repository:'c/d',snapshot:good()}),/checkpoint_invalid_or_wrong_scope/);
});
test('corrupt JSON fails closed without resetting or overwriting',t=>{
  const file=fixture(t);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'{not-json');
  assert.throws(()=>advanceCheckpoint({...args(file),snapshot:good()}),/checkpoint_unreadable/);
  assert.equal(fs.readFileSync(file,'utf8'),'{not-json');
});
test('invalid digest fails closed and preserves original file',t=>{
  const file=fixture(t);advanceCheckpoint({...args(file),snapshot:good()});
  const record=JSON.parse(fs.readFileSync(file,'utf8'));record.source_digest='not-a-hash';
  fs.writeFileSync(file,JSON.stringify(record));
  assert.throws(()=>advanceCheckpoint({...args(file),snapshot:good()}),/checkpoint_invalid_or_wrong_scope/);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).source_digest,'not-a-hash');
});
test('unchanged record order and version field do not trigger a new checkpoint',t=>{
  const file=fixture(t);advanceCheckpoint({...args(file),snapshot:good()});
  const next=good();next.records[0].version='v2';
  assert.equal(advanceCheckpoint({...args(file),snapshot:next}).summary.state,'NO_UPDATE');
});
test('zero matching tasks is a healthy baseline and remains no-update',t=>{
  const file=fixture(t),empty={complete:true,errors:[],unresolved:[],read:[],records:[]};
  assert.equal(advanceCheckpoint({...args(file),snapshot:empty}).summary.state,'BASELINE');
  assert.equal(advanceCheckpoint({...args(file),snapshot:empty}).summary.state,'NO_UPDATE');
});
test('bad scope and issue fail before filesystem access',t=>{
  const file=fixture(t);
  assert.throws(()=>advanceCheckpoint({...args(file),repository:'invalid',snapshot:good()}),/invalid_repository/);
  assert.throws(()=>advanceCheckpoint({...args(file),issue:-1,snapshot:good()}),/invalid_issue/);
  assert.equal(fs.existsSync(file),false);
});
test('invalid time prevents advance without mutating prior checkpoint',t=>{
  const file=fixture(t);advanceCheckpoint({...args(file),snapshot:good()});
  const before=fs.readFileSync(file,'utf8');
  assert.throws(()=>advanceCheckpoint({...args(file),snapshot:good('changed'),now:'invalid date'}),/invalid_clock/);
  assert.equal(fs.readFileSync(file,'utf8'),before);
});
