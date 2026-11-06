'use strict';
const assert=require('node:assert/strict');const {test}=require('node:test');const {discover,locate}=require('../api/task-locator-candidate.cjs');
const issues={41:{url:'issue/41',body:'P0-6 check #33 and #32'},33:{url:'issue/33',body:'GPT2 report #41'},32:{url:'issue/32',body:'handoff'}};
const comments={41:[{id:1,url:'comment/1',body:'Cross AI task locator P0-6 #33'},{id:1,url:'comment/1',body:'duplicate'}],33:[{id:2,url:'comment/2',body:'report exists'}],32:[]};
test('discovers linked report and stops cycles',()=>{const r=discover({seeds:[41],fetchIssue:n=>issues[n],fetchComments:n=>comments[n]});assert.deepEqual(r.visited,[41,33,32]);assert.equal(r.complete,true);assert.equal(locate(r,['report']).matches.length,2);});
test('does not claim completeness on unreadable source',()=>{const r=discover({seeds:[41],fetchIssue:n=>issues[n],fetchComments:n=>n===33?null:comments[n]});assert.equal(r.complete,false);assert.equal(r.errors[0].issue,33);});
test('does not claim completeness when budget exhausted',()=>{const r=discover({seeds:[41],fetchIssue:n=>issues[n],fetchComments:n=>comments[n],maxNodes:1});assert.equal(r.complete,false);assert.ok(r.unresolved.length>0);});
test('preserves source URL and text',()=>{const r=discover({seeds:[41],fetchIssue:n=>issues[n],fetchComments:n=>comments[n]});assert.ok(r.records.some(x=>x.url==='comment/2'&&x.body==='report exists'));});
