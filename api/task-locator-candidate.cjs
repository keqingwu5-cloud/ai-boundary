'use strict';
// P0-6 read-only locator: incomplete sources must never be reported complete.
function discover({seeds=[], searchIssues, fetchIssue, fetchComments, maxNodes=100, query}) {
  const queue=[...seeds], attempted=new Set(), read=[], records=[], errors=[];
  if(query){
    try {
      if(typeof searchIssues!=='function')throw Error('search_adapter_missing');
      const found=searchIssues(query);
      if(!found || !Array.isArray(found.items) || found.complete!==true)throw Error('search_incomplete');
      for(const item of found.items){const n=Number(item.number);if(Number.isSafeInteger(n)&&n>0)queue.push(n);}
    }catch(e){errors.push({stage:'search',error:String(e.message||e)});}
  }
  if(!queue.length&&!errors.length)throw Error('seeds_or_query_required');
  while(queue.length && attempted.size<maxNodes){
    const n=Number(queue.shift());
    if(!Number.isSafeInteger(n)||n<1||attempted.has(n))continue;
    attempted.add(n);
    try{
      const issue=fetchIssue(n), result=fetchComments(n);
      if(!issue || !result || !Array.isArray(result.items) || result.complete!==true || !Number.isSafeInteger(issue.comments) || result.items.length!==issue.comments)throw Error('incomplete_source');
      const ids=result.items.map(c=>c.id);if(ids.some(id=>!Number.isSafeInteger(id))||new Set(ids).size!==ids.length)throw Error('duplicate_or_invalid_comment_id');const check=fetchIssue(n);if(!issue.updated_at||!check||check.updated_at!==issue.updated_at||check.comments!==issue.comments||check.body!==issue.body)throw Error('source_version_changed');const sources=[{url:issue.url,body:issue.body||'',kind:'issue',version:issue.updated_at||null},...result.items.map(c=>({url:c.url,body:c.body||'',kind:'comment',id:c.id,version:c.updated_at||null}))];
      read.push(n);
      for(const item of sources){records.push({issue:n,...item});for(const match of item.body.matchAll(/(?:^|[^\w])#(\d{1,8})\b/g)){const ref=Number(match[1]);if(!attempted.has(ref)&&!queue.includes(ref))queue.push(ref);}}
    }catch(e){errors.push({stage:'read',issue:n,error:String(e.message||e)});}
  }
  return {records,visited:[...attempted],read,unresolved:queue,errors,complete:queue.length===0&&errors.length===0};
}
function locate(result,terms){const q=[...new Set(terms.map(x=>String(x).toLowerCase()).filter(Boolean))];if(!q.length)throw Error('terms_required');const seen=new Set();return {matches:result.records.filter(r=>q.some(t=>r.body.toLowerCase().includes(t))).filter(r=>{const k=r.url||`${r.issue}:${r.id}`;if(seen.has(k))return false;seen.add(k);return true;}),complete:result.complete,errors:result.errors,unresolved:result.unresolved};}
module.exports={discover,locate};
