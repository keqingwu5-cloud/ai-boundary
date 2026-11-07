'use strict';
// Read-only GitHub REST adapter for the existing synchronous P0-6 locator.
// This adapter never writes GitHub data, never claims remote-agent ACK,
// and fails closed if search, pagination, or source fields are incomplete.
const {discover,locate}=require('./task-locator-candidate.cjs');
const {evaluateSourceSnapshot}=require('./task-source-summary.cjs');
const own=(x,k)=>x && Object.prototype.hasOwnProperty.call(x,k);
const validInt=n=>Number.isSafeInteger(n)&&n>0;
const validUrl=s=>typeof s==='string' && /^https:\/\//.test(s);
function createGitHubReader({repository,fetchImpl=globalThis.fetch,token=process.env.GITHUB_TOKEN,apiRoot='https://api.github.com',maxPages=10,pageSize=100}={}){
  if(typeof repository!=='string'||!/^[\w.-]+\/[\w.-]+$/.test(repository))throw Error('invalid_repository');
  if(typeof fetchImpl!=='function')throw Error('fetch_unavailable');
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>20)throw Error('invalid_max_pages');
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)throw Error('invalid_page_size');
  if(apiRoot!=='https://api.github.com')throw Error('non_github_api_origin_blocked');
  const root=`${apiRoot}/repos/${repository}`;
  async function readJson(url){
    const headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
    if(token)headers.Authorization=`Bearer ${token}`;
    const res=await fetchImpl(url,{method:'GET',headers,redirect:'error'});
    if(!res||!res.ok)throw Error(`github_http_${res?.status||'unavailable'}`);
    return {data:await res.json(),next:/<[^>]+>;\s*rel="next"/.test(res.headers?.get('link')||'')};
  }
  function validBody(o,name){
    if(!own(o,'body')||(o.body!==null&&typeof o.body!=='string'))throw Error(`missing_${name}_body`);
    return o.body===null?'':o.body;
  }
  async function getIssue(number){
    if(!validInt(number))throw Error('invalid_issue_number');
    const {data:p}=await readJson(`${root}/issues/${number}`);
    if(!p||p.number!==number||!Number.isSafeInteger(p.comments)||p.comments<0||!validUrl(p.html_url)||!p.updated_at)throw Error('invalid_issue_metadata');
    return {number,body:validBody(p,'issue'),url:p.html_url,comments:p.comments,updated_at:p.updated_at};
  }
  async function paginate(urlFactory){
    const all=[];
    for(let page=1;page<=maxPages;page++){
      const {data,next}=await readJson(urlFactory(page));
      if(!Array.isArray(data))throw Error('invalid_page_items');
      all.push(...data);
      if(!next)return {items:all,complete:true};
    }
    return {items:all,complete:false};
  }
  async function getComments(number){
    if(!validInt(number))throw Error('invalid_issue_number');
    const batch=await paginate(page=>`${root}/issues/${number}/comments?per_page=${pageSize}&page=${page}`);
    const items=batch.items.map(p=>{
      if(!p||!validInt(p.id)||!validUrl(p.html_url))throw Error('invalid_comment_metadata');
      return {id:p.id,url:p.html_url,body:validBody(p,'comment'),updated_at:p.updated_at||p.created_at||null};
    });
    return {items,complete:batch.complete};
  }
  async function searchIssues(query){
    if(typeof query!=='string'||!query.trim())throw Error('invalid_query');
    const q=encodeURIComponent(`repo:${repository} is:issue ${query}`);
    const found=[]; let total=null; let incomplete=false;
    for(let page=1;page<=maxPages;page++){
      const {data,next}=await readJson(`https://api.github.com/search/issues?q=${q}&per_page=${pageSize}&page=${page}`);
      if(!data||!Array.isArray(data.items)||!Number.isSafeInteger(data.total_count)||data.total_count<0)throw Error('invalid_search_response');
      if(total===null)total=data.total_count;
      if(total!==data.total_count)throw Error('search_revision_changed');
      incomplete ||= data.incomplete_results===true;
      for(const p of data.items){if(!p||!validInt(p.number)||!validUrl(p.html_url))throw Error('invalid_search_item');found.push({number:p.number});}
      if(!next)return {items:found,complete:!incomplete&&found.length===total};
    }
    return {items:found,complete:false};
  }
  return {getIssue,getComments,searchIssues};
}

// Prefetch a bounded, independently validated REST snapshot, then reuse the
// existing, tested synchronous locator rather than rewriting its source rules.
async function discoverGitHub({reader,seeds=[],query,maxNodes=20,followLinks=false}={}){
  if(!reader||!['getIssue','getComments','searchIssues'].every(k=>typeof reader[k]==='function'))throw Error('reader_required');
  if(!Array.isArray(seeds)||!Number.isSafeInteger(maxNodes)||maxNodes<1||maxNodes>100)throw Error('invalid_bounds');
  const pending=[...seeds], attempted=new Set(), issues=new Map(),comments=new Map(),errors=[];
  if(query){
    try{
      const found=await reader.searchIssues(query);
      if(!found||found.complete!==true||!Array.isArray(found.items))throw Error('search_incomplete');
      for(const item of found.items){if(!item||!validInt(item.number))throw Error('invalid_search_item');pending.push(item.number);}
    }catch(e){errors.push({stage:'search',error:String(e.message||e)});}
  }
  if(!pending.length&&!errors.length){
    if(!query)throw Error('seeds_or_query_required');
    // A complete search with zero matches is a normal, healthy empty result.
    return {records:[],visited:[],read:[],unresolved:[],errors:[],complete:true,scope:'seeds_and_search_only'};
  }
  if(!pending.length)return {records:[],visited:[],read:[],unresolved:[],errors,complete:false,scope:'seeds_and_search_only'};
  while(pending.length&&attempted.size<maxNodes){
    const n=pending.shift();
    if(!validInt(n)||attempted.has(n))continue;
    attempted.add(n);
    try{
      const a=await reader.getIssue(n);
      const c=await reader.getComments(n);
      const b=await reader.getIssue(n);
      if(!a||!b||!c||c.complete!==true||!Array.isArray(c.items)||!Number.isSafeInteger(a.comments)||a.comments!==c.items.length)throw Error('incomplete_source');
      if(a.updated_at!==b.updated_at||a.body!==b.body||a.comments!==b.comments||a.url!==b.url)throw Error('source_version_changed');
      if(typeof a.body!=='string'||!validUrl(a.url)||!a.updated_at)throw Error('invalid_issue_source');
      const ids=new Set();
      for(const v of c.items){if(!v||!validInt(v.id)||ids.has(v.id))throw Error('duplicate_or_invalid_comment_id');ids.add(v.id);if(typeof v.body!=='string'||!validUrl(v.url))throw Error('invalid_comment_source');}
      issues.set(n,a);comments.set(n,c);
      if(followLinks)for(const text of [a.body,...c.items.map(v=>v.body)])for(const hit of text.matchAll(/(?:^|[^\w])#(\d{1,8})\b/g)){
        const k=Number(hit[1]);if(!attempted.has(k)&&!pending.includes(k))pending.push(k);
      }
    }catch(e){errors.push({stage:'read',issue:n,error:String(e.message||e)});}
  }
  // Treat partially prefetched nodes as errors, never silently complete.
  const snapshot=discover({seeds:[...attempted],fetchIssue:n=>issues.get(n),fetchComments:n=>comments.get(n),maxNodes:100,followLinks});
  const extra=[...errors,...snapshot.errors.filter(e=>!errors.some(x=>x.stage==='read'&&x.issue===e.issue))];
  return {...snapshot,errors:extra,unresolved:[...new Set([...pending,...snapshot.unresolved])],complete:pending.length===0&&snapshot.complete&&extra.length===0,scope:followLinks?'linked_graph_bounded':'seeds_and_search_only'};
}
module.exports={createGitHubReader,discoverGitHub,locate};

// Optional read-only CLI (never comments, writes, dispatches, or acknowledges).
// Example: node api/task-locator-github-adapter.cjs 41
if(require.main===module){
  const repository=process.env.GITHUB_REPOSITORY||'keqingwu5-cloud/ai-boundary';
  const input=String(process.argv[2]||'41');
  const searching=input.startsWith('--query=');
  const query=searching?input.slice('--query='.length).trim():null;
  const seeds=searching?[]:input.split(',').map(Number);
  const opts=process.argv.slice(3);
  if(opts.some(x=>!x.startsWith('--expect=')&&!x.startsWith('--previous-digest=')))throw Error('unrecognized_cli_option');
  if(opts.filter(x=>x.startsWith('--expect=')).length>1||opts.filter(x=>x.startsWith('--previous-digest=')).length>1)throw Error('duplicate_cli_option');
  const expectedArg=opts.find(x=>x.startsWith('--expect='));
  const digestArg=opts.find(x=>x.startsWith('--previous-digest='));
  const expectedNumber=expectedArg?Number(expectedArg.slice('--expect='.length)):null;
  const previousDigest=digestArg?digestArg.slice('--previous-digest='.length):null;
  if(!searching&&seeds.some(n=>!validInt(n)))throw Error('invalid_cli_seeds');
  if(searching&&!query)throw Error('query_required');
  if(expectedArg&&!validInt(expectedNumber))throw Error('invalid_cli_expect');
  const reader=createGitHubReader({repository});
  discoverGitHub({reader,seeds,query,followLinks:false,maxNodes:Math.max(1,Math.min(20,searching?10:seeds.length))}).then(r=>{
    // Snapshot digest is an output cursor; no durable checkpoint is written in this CLI.
    const summary=evaluateSourceSnapshot(r,{previousDigest});
    const expectedFound=expectedNumber===null?null:r.read.includes(expectedNumber);
    console.log(JSON.stringify({scope:r.scope,complete:summary.complete,read:r.read,
      records:summary.records,source_digest:summary.source_digest,
      previous_digest_accepted:summary.previous_digest_accepted,
      change_state:summary.state,summary:summary.one_line,
      duplicates:summary.duplicates,anomalies:summary.anomalies,
      unresolved:r.unresolved,errors:r.errors,expected_issue_found:expectedFound,
      remote_agent_ack:'NOT_VERIFIED'},null,2));
    if(!summary.complete||expectedFound===false)process.exitCode=2;
  }).catch(e=>{console.error(`read_only_bridge_failed:${String(e.message||e)}`);process.exitCode=2;});
}
