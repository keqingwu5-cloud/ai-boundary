'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createGitHubReader,discoverGitHub,locate}=require('../api/task-locator-github-adapter.cjs');
const {discover}=require('../api/task-locator-candidate.cjs');
function response(data,{status=200,link=''}={}){return {ok:status>=200&&status<300,status,headers:{get:key=>key==='link'?link:null},json:async()=>data};}
function fixture({missingCommentBody=false,missingIssueBody=false,searchItems,searchIncomplete=false,omitIncompleteResults=false,searchPages=null,pageSize=100,revisions=false,commentNext=false,issueComments=1}={}){
  let fetch41=0;
  const fetchImpl=async (url,req)=>{
    assert.equal(req.method,'GET');
    assert.equal(req.redirect,'error');
    if(url.includes('/issues/41/comments?')){
      const v={id:10,html_url:'https://github.com/owner/repo/issues/41#issuecomment-10',body:'GPT2 review #33',updated_at:'2026-11-07T00:00:00Z'};
      if(missingCommentBody)delete v.body;
      return response(issueComments?[v]:[],{link:commentNext?'<https://api.github.com/next>; rel="next"':''});
    }
    if(url.includes('/issues/33/comments?'))return response([]);
    if(url.endsWith('/issues/41')){
      const v={number:41,html_url:'https://github.com/owner/repo/issues/41',body:'Bridge P0-6 #33',comments:issueComments,updated_at:revisions&&++fetch41>1?'v2':'v1'};
      if(missingIssueBody)delete v.body;
      return response(v);
    }
    if(url.endsWith('/issues/33'))return response({number:33,html_url:'https://github.com/owner/repo/issues/33',body:'ACK blocked',comments:0,updated_at:'v1'});
    if(url.startsWith('https://api.github.com/search/issues?')){
      if(searchPages){
        const page=Number(new URL(url).searchParams.get('page')||'1');
        const entry=searchPages[page-1];
        if(!entry)throw Error(`unexpected_search_page:${page}`);
        const payload={total_count:entry.total_count,items:entry.items};
        if(entry.omitIncompleteResults!==true)payload.incomplete_results=entry.incomplete_results??false;
        return response(payload,{link:entry.next?'<https://api.github.com/search/issues?page=next>; rel="next"':''});
      }
      const items=searchItems||[{number:41,html_url:'https://github.com/owner/repo/issues/41'}];
      const payload={total_count:items.length,items};
      if(!omitIncompleteResults)payload.incomplete_results=searchIncomplete;
      return response(payload);
    }
    throw Error(`unexpected_route:${url}`);
  };
  return createGitHubReader({repository:'owner/repo',fetchImpl,maxPages:2,pageSize});
}
test('real REST adapter + prefetch produces verified source records without ACK claim',async()=>{
  const r=await discoverGitHub({reader:fixture(),seeds:[41],followLinks:false});
  assert.equal(r.complete,true);assert.deepEqual(r.read,[41]);assert.equal(r.records.length,2);
  assert.equal(r.scope,'seeds_and_search_only');assert.equal(locate(r,['P0-6']).matches.length,1);
  assert.equal(Object.hasOwn(r,'actual_ack'),false);
});
test('follow linked issue 33 with a bounded snapshot',async()=>{
  const r=await discoverGitHub({reader:fixture(),seeds:[41],followLinks:true,maxNodes:3});
  assert.deepEqual(r.read,[41,33]);assert.equal(r.complete,true);
});
test('missing comment body fails closed without falsely marking source read',async()=>{
  const r=await discoverGitHub({reader:fixture({missingCommentBody:true}),seeds:[41]});
  assert.equal(r.complete,false);assert.deepEqual(r.read,[]);assert.ok(r.errors.some(e=>e.error.includes('missing_comment_body')));
});
test('missing issue body fails closed',async()=>{
  const r=await discoverGitHub({reader:fixture({missingIssueBody:true}),seeds:[41]});
  assert.equal(r.complete,false);assert.deepEqual(r.read,[]);assert.ok(r.errors.some(e=>e.error.includes('missing_issue_body')));
});
test('GitHub issue revision drift between first and second read fails closed',async()=>{
  const r=await discoverGitHub({reader:fixture({revisions:true}),seeds:[41]});
  assert.equal(r.complete,false);assert.ok(r.errors.some(e=>e.error==='source_version_changed'));
});
test('search missing item number is incomplete rather than silently skipped',async()=>{
  const r=await discoverGitHub({reader:fixture({searchItems:[{number:'bad',html_url:'https://github.com/owner/repo/issues/bad'}]}),query:'P0-6'});
  assert.equal(r.complete,false);assert.equal(r.records.length,0);assert.ok(r.errors.some(e=>e.error==='invalid_search_item'));
});
test('GitHub reported incomplete search is not treated as complete',async()=>{
  const r=await discoverGitHub({reader:fixture({searchIncomplete:true}),seeds:[41],query:'P0-6'});
  assert.equal(r.complete,false);assert.deepEqual(r.read,[41]);assert.ok(r.errors.some(e=>e.error==='search_incomplete'));
});
test('unfinished comment pagination fails closed',async()=>{
  const r=await discoverGitHub({reader:fixture({commentNext:true}),seeds:[41]});
  assert.equal(r.complete,false);assert.ok(r.errors.some(e=>e.error.startsWith('incomplete_source')||e.error.startsWith('github_http_')||e.error.startsWith('unexpected_route')));
});
test('bounded linked discovery preserves unresolved references',async()=>{
  const r=await discoverGitHub({reader:fixture(),seeds:[41],followLinks:true,maxNodes:1});
  assert.equal(r.complete,false);assert.ok(r.unresolved.includes(33));
});
test('original P0-6 core rejects incomplete search hit and missing source body',()=>{
  const issues={41:{url:'https://github.com/owner/repo/issues/41',body:'hello',comments:0,updated_at:'v1'}};
  const read=n=>issues[n],comments=()=>({items:[],complete:true});
  let r=discover({seeds:[41],query:'P0-6',searchIssues:()=>({complete:true,items:[{number:'bad'}]}),fetchIssue:read,fetchComments:comments,followLinks:false});
  assert.equal(r.complete,false);assert.equal(r.errors[0].error,'invalid_search_item');
  r=discover({seeds:[41],fetchIssue:()=>({url:'link',comments:0,updated_at:'v1'}),fetchComments:comments});
  assert.equal(r.complete,false);assert.equal(r.errors[0].error,'missing_issue_body');
});
test('no-token request does not create authorization header',async()=>{
  let seen=false;
  const reader=createGitHubReader({repository:'owner/repo',token:'',fetchImpl:async(url,req)=>{seen=true;assert.equal(Object.hasOwn(req.headers,'Authorization'),false);return response({number:41,html_url:'https://github.com/owner/repo/issues/41',body:'',comments:0,updated_at:'v1'});}});
  const x=await reader.getIssue(41);assert.equal(x.body,'');assert.equal(seen,true);
});
test('non-GitHub origin blocked before reading token',()=>{
  assert.throws(()=>createGitHubReader({repository:'owner/repo',apiRoot:'https://evil.example',token:'secret'}),/non_github_api_origin_blocked/);
});

test('live search returns complete bounded snapshot and issue source',async()=>{
  const r=await discoverGitHub({reader:fixture(),query:'in:title \"共用交接入口\"',followLinks:false,maxNodes:3});
  assert.equal(r.complete,true);assert.deepEqual(r.read,[41]);
  assert.equal(r.records.length,2);assert.equal(r.scope,'seeds_and_search_only');
  assert.equal(locate(r,['P0-6']).matches.length,1);
});

test('empty GitHub issue search is a complete no-work result',async()=>{
  const r=await discoverGitHub({reader:fixture({searchItems:[]}),query:'in:title "nothing matches"',followLinks:false});
  assert.equal(r.complete,true);assert.deepEqual(r.records,[]);
  assert.deepEqual(r.read,[]);assert.deepEqual(r.errors,[]);
});

test('duplicate search hits across pages fail closed and do not claim a complete source',async()=>{
  const r=await discoverGitHub({reader:fixture({pageSize:1,searchPages:[
    {total_count:2,items:[{number:41,html_url:'https://github.com/owner/repo/issues/41'}],next:true},
    {total_count:2,items:[{number:41,html_url:'https://github.com/owner/repo/issues/41'}]}
  ]}),query:'P0-6',followLinks:false});
  assert.equal(r.complete,false);assert.deepEqual(r.read,[]);
  assert.ok(r.errors.some(e=>e.error==='duplicate_search_item'));
});

test('two distinct search pages remain a complete read',async()=>{
  const r=await discoverGitHub({reader:fixture({pageSize:1,searchPages:[
    {total_count:2,items:[{number:41,html_url:'https://github.com/owner/repo/issues/41'}],next:true},
    {total_count:2,items:[{number:33,html_url:'https://github.com/owner/repo/issues/33'}]}
  ]}),query:'P0-6',followLinks:false,maxNodes:3});
  assert.equal(r.complete,true);assert.deepEqual(r.read,[41,33]);
});

test('foreign-repo search hit is not read as the local same-numbered issue',async()=>{
  const r=await discoverGitHub({reader:fixture({searchItems:[{number:41,html_url:'https://github.com/other/repo/issues/41'}]}),query:'P0-6',followLinks:false});
  assert.equal(r.complete,false);assert.deepEqual(r.read,[]);
  assert.ok(r.errors.some(e=>e.error==='invalid_search_item'));
});

test('search hit with a non-issue path or mismatched number fails closed',async()=>{
  let r=await discoverGitHub({reader:fixture({searchItems:[{number:41,html_url:'https://github.com/owner/repo/pull/41'}]}),query:'P0-6'});
  assert.equal(r.complete,false);assert.deepEqual(r.read,[]);
  assert.ok(r.errors.some(e=>e.error==='invalid_search_item'));
  r=await discoverGitHub({reader:fixture({searchItems:[{number:41,html_url:'https://github.com/owner/repo/issues/99'}]}),query:'P0-6'});
  assert.equal(r.complete,false);assert.deepEqual(r.read,[]);
  assert.ok(r.errors.some(e=>e.error==='invalid_search_item'));
});

test('missing incomplete_results is not treated as a complete search',async()=>{
  const r=await discoverGitHub({reader:fixture({omitIncompleteResults:true}),query:'P0-6',followLinks:false});
  assert.equal(r.complete,false);assert.deepEqual(r.read,[]);
  assert.ok(r.errors.some(e=>e.error==='search_incomplete'));
});

test('null or non-boolean incomplete_results is not treated as complete',async()=>{
  let r=await discoverGitHub({reader:fixture({searchIncomplete:null}),query:'P0-6'});
  assert.equal(r.complete,false);assert.ok(r.errors.some(e=>e.error==='search_incomplete'));
  r=await discoverGitHub({reader:fixture({searchIncomplete:'false'}),query:'P0-6'});
  assert.equal(r.complete,false);assert.ok(r.errors.some(e=>e.error==='search_incomplete'));
});
