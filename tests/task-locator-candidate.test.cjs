'use strict';
const assert=require('node:assert/strict');const {test}=require('node:test');const {discover,locate}=require('../api/task-locator-candidate.cjs');
const issues={41:{url:'issue/41',body:'P0-6 check #33 and #32',comments:1,updated_at:'v1'},33:{url:'issue/33',body:'GPT2 report #41',comments:1,updated_at:'v1'},32:{url:'issue/32',body:'handoff',comments:0,updated_at:'v1'},55:{url:'issue/55',body:'unlinked P0-6 source',comments:0,updated_at:'v1'}};
const comments={41:[{id:1,url:'comment/1',body:'Cross AI task locator P0-6 #33'}],33:[{id:2,url:'comment/2',body:'report exists'}],32:[],55:[]};
const fetchIssue=n=>issues[n],fetchComments=n=>({items:comments[n],complete:true});
test('linked discovery and cycles',()=>{const r=discover({seeds:[41],fetchIssue,fetchComments});assert.deepEqual(r.read,[41,33,32]);assert.equal(r.complete,true);assert.equal(locate(r,['report']).matches.length,2);});
test('unreadable source fails closed',()=>{const r=discover({seeds:[41],fetchIssue,fetchComments:n=>n===33?null:fetchComments(n)});assert.equal(r.complete,false);assert.ok(!r.read.includes(33));});
test('bounded traversal incomplete',()=>{const r=discover({seeds:[41],fetchIssue,fetchComments,maxNodes:1});assert.equal(r.complete,false);});
test('preserves provenance',()=>{const r=discover({seeds:[41],fetchIssue,fetchComments});assert.ok(r.records.some(x=>x.url==='comment/2'&&x.body==='report exists'));});
test('truncated comment pages fail closed',()=>{const r=discover({seeds:[33],fetchIssue,fetchComments:()=>({items:[],complete:true})});assert.equal(r.complete,false);assert.equal(r.errors[0].error,'incomplete_source');});
test('search discovers unlinked relevant issue',()=>{const r=discover({query:'P0-6',searchIssues:()=>({items:[{number:55}],complete:true}),fetchIssue,fetchComments});assert.equal(r.complete,true);assert.ok(r.read.includes(55));});
test('partial search fails closed',()=>{const r=discover({seeds:[41],query:'P0-6',searchIssues:()=>({items:[{number:55}],complete:false}),fetchIssue,fetchComments});assert.equal(r.complete,false);assert.equal(r.errors[0].stage,'search');});
test('failed fetch does not count as read',()=>{const r=discover({seeds:[999],fetchIssue,fetchComments});assert.deepEqual(r.read,[]);assert.deepEqual(r.visited,[999]);assert.equal(r.complete,false);});

test('source revision changed during read is incomplete',()=>{let i=0;const r=discover({seeds:[41],fetchIssue:()=>({body:++i===1?'old':'new',comments:0,updated_at:'v'+i}),fetchComments:()=>({items:[],complete:true})});assert.equal(r.complete,false);assert.equal(r.errors[0].error,'source_version_changed');});
test('duplicate comment IDs are rejected',()=>{const r=discover({seeds:[41],fetchIssue:()=>({body:'ok',comments:2,updated_at:'v1'}),fetchComments:()=>({items:[{id:1},{id:1}],complete:true})});assert.equal(r.complete,false);assert.equal(r.errors[0].error,'duplicate_or_invalid_comment_id');});
