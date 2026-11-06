'use strict';
// P0-6: pure, read-only task locator. Source fetching is supplied by caller.
function discover({seeds, fetchIssue, fetchComments, maxNodes=100}) {
  if (!Array.isArray(seeds) || !seeds.length) throw Error('seeds_required');
  const queue=[...seeds], visited=new Set(), records=[], errors=[];
  while(queue.length && visited.size<maxNodes){
    const n=Number(queue.shift());
    if(!Number.isSafeInteger(n)||n<1||visited.has(n)) continue;
    visited.add(n);
    try {
      const issue=fetchIssue(n), comments=fetchComments(n);
      if(!issue || !Array.isArray(comments)) throw Error('incomplete_source');
      const source=[{url:issue.url,body:issue.body||'',kind:'issue'},...comments.map(c=>({url:c.url,body:c.body||'',kind:'comment',id:c.id}))];
      for(const item of source){
        records.push({issue:n,...item});
        const matches=item.body.matchAll(/(?:^|[^\w])#(\d{1,8})\b/g);
        for(const match of matches){const ref=Number(match[1]);if(!visited.has(ref)&&!queue.includes(ref))queue.push(ref);}
      }
    } catch(e){errors.push({issue:n,error:String(e.message||e)});}
  }
  return {records,visited:[...visited],unresolved:queue,errors,complete:queue.length===0&&errors.length===0};
}
function locate(result, terms){
  const q=[...new Set(terms.map(x=>String(x).toLowerCase()).filter(Boolean))];
  if(!q.length)throw Error('terms_required');
  const matches=result.records.filter(r=>q.some(t=>r.body.toLowerCase().includes(t)));
  const seen=new Set();
  return {matches:matches.filter(r=>{const k=r.url||`${r.issue}:${r.id}`;if(seen.has(k))return false;seen.add(k);return true;}),complete:result.complete,errors:result.errors,unresolved:result.unresolved};
}
module.exports={discover,locate};
