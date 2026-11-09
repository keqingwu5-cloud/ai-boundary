/** Keyword -> immutable problem IDs -> historical PR/Issue refs. Isolated read-only candidate. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const NO_GO='PRODUCTION_NO_GO';
const schema='firstbrain.keyword-history.v0.1';
const priorityOrder={P0:0,P1:1,P2:2};
export const normalize=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
function patternFor(alias){
  const x=normalize(alias);
  if(!x)throw Error('EMPTY_ALIAS');
  const e=x.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
  // Latin phrases may be embedded into words (ACK inside 'backup'). Do not allow that.
  const before=/^[a-z0-9_]/u.test(x)?'(?<![a-z0-9_])':'';
  const after=/[a-z0-9_]$/u.test(x)?'(?![a-z0-9_])':'';
  return new RegExp(before+e+after,'u');
}
function assertRecord(p){
  if(!/^FB-P[012]-\d{2}$/u.test(p.id)||!Object.hasOwn(priorityOrder,p.priority)||!Array.isArray(p.aliases)||!p.aliases.length)throw Error('INVALID_PROBLEM_RECORD');
  if(!['BLOCKED','HOLD'].includes(p.gate)||!Array.isArray(p.issues)||!Array.isArray(p.prs)||!p.missing)throw Error('INVALID_PROBLEM_GATE');
  const aliases=new Set();
  for(const s of p.aliases){const a=normalize(s);if(!a||aliases.has(a))throw Error('DUPLICATE_OR_EMPTY_ALIAS:'+p.id);aliases.add(a);patternFor(a);}
  for(const r of [...p.issues,...p.prs])if(!Number.isSafeInteger(r)||r<=0)throw Error('INVALID_REFERENCE');
}
export function validateCatalog(c){
  if(c?.schema!==schema||c?.authority!=='READ_ONLY_CANDIDATE'||c?.production_gate!=='NO_GO'||!Array.isArray(c.problems))throw Error('INVALID_CATALOG');
  const ids=new Set();for(const p of c.problems){assertRecord(p);if(ids.has(p.id))throw Error('DUPLICATE_PROBLEM_ID');ids.add(p.id);}
  return c;
}
export async function loadCatalog(url=new URL('../data/problem-keywords.v01.json',import.meta.url)){
  return validateCatalog(JSON.parse(await readFile(url,'utf8')));
}
function matchAlias(text,alias){return patternFor(alias).test(text);}
function uniqueRefs(kind,nums){return [...new Set(nums)].sort((a,b)=>a-b).map(number=>({kind,number,url:`https://github.com/keqingwu5-cloud/ai-boundary/${kind==='issue'?'issues':'pull'}/${number}`}));}
function refString(v){return typeof v==='string'?v.trim():'';}
export function searchHistory(c,query,{limit=20}={}){
  validateCatalog(c);
  if(typeof query!=='string'||!normalize(query))throw Error('QUERY_REQUIRED');
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_LIMIT');
  const q=normalize(query);
  const hits=[];
  for(const p of c.problems){
    const exactId=normalize(p.id)===q;
    const requestedRefs=[...q.matchAll(/\b(issue|pr)\s*#?(\d{1,5})\b|#(\d{1,5})\b/gu)]
      .map(m=>({kind:m[1]??null,number:Number(m[2]??m[3])}));
    const matched=p.aliases.filter(a=>matchAlias(q,a));
    const refMatched=requestedRefs.some(r=>r.kind==='issue'?p.issues.includes(r.number):r.kind==='pr'?p.prs.includes(r.number):p.issues.includes(r.number)||p.prs.includes(r.number));
    const titleMatch=normalize(p.title)===q;
    if(!exactId&&!matched.length&&!refMatched&&!titleMatch)continue;
    const reasons=[...(exactId?['EXACT_PROBLEM_ID']:[]),...(titleMatch?['EXACT_TITLE']:[]),...(refMatched?['REFERENCE_MATCH']:[]),...matched.map(a=>'ALIAS:'+a)];
    const score=(exactId?10000:0)+(refMatched?1200:0)+(titleMatch?900:0)+matched.reduce((sum,a)=>sum+30+a.length,0);
    hits.push({problem_id:p.id,priority:p.priority,title:p.title,matched_aliases:matched,reason:reasons,score,gate:p.gate,missing:p.missing,refs:[...uniqueRefs('issue',p.issues),...uniqueRefs('pr',p.prs)],evidence:'INDEXED_HISTORICAL_CANDIDATE',remote_ack:'NOT_VERIFIED',verified_reviewer:'NOT_VERIFIED'});
  }
  hits.sort((a,b)=>priorityOrder[a.priority]-priorityOrder[b.priority]||b.score-a.score||a.problem_id.localeCompare(b.problem_id));
  return {query,match_count:hits.length,results:hits.slice(0,limit),truncated:hits.length>limit,decision:NO_GO,real_ack:'NOT_VERIFIED',gate_lifting_permitted:false,source_is_independently_verified:false};
}
/** Compare source snapshots without promoting statuses. Stale SHA is not a successful fix. */
export function compareSourceSnapshots(before,after){
  if(!Array.isArray(before)||!Array.isArray(after))throw Error('INVALID_SNAPSHOTS');
  const checked=(arr)=>{
    const out=new Map();
    for(const s of arr){
      if(!s||!['issue','pr'].includes(s.kind)||!Number.isSafeInteger(s.number)||s.number<=0)throw Error('INVALID_SNAPSHOT_SOURCE');
      const id=s.kind+':'+s.number;if(out.has(id))throw Error('DUPLICATE_SOURCE:'+id);
      if(s.kind==='pr'&&s.head_sha!=null&&!/^[a-f0-9]{40}$/u.test(refString(s.head_sha)))throw Error('INVALID_SOURCE_SHA');
      out.set(id,{kind:s.kind,number:s.number,state:s.state??'UNKNOWN',head_sha:s.head_sha??null,review:s.review??'UNKNOWN',ack:s.ack??'NOT_VERIFIED'});
    }
    return out;
  };
  const prev=checked(before),next=checked(after),updates=[];
  for(const [id,a] of next){
    const b=prev.get(id);
    if(!b){updates.push({source_id:id,change:'NEW_SOURCE',decision:'REQUIRES_REVIEW'});continue;}
    const changes=['state','head_sha','review','ack'].filter(f=>a[f]!==b[f]);
    if(changes.length)updates.push({source_id:id,change:'CHANGED_SOURCE',changed_fields:changes,decision:'STALE_RECHECK_REQUIRED'});
  }
  for(const id of prev.keys())if(!next.has(id))updates.push({source_id:id,change:'SOURCE_NOT_IN_NEW_SNAPSHOT',decision:'UNKNOWN_NOT_CLOSED'});
  updates.sort((a,b)=>a.source_id.localeCompare(b.source_id));
  return {changes:updates,decision:NO_GO,automatic_status_promotion:false,independent_ack_verified:false};
}
/** Counters the common false inference 'CI passed => true remote ACK or deployment'. */
export function assessEvidence(evidence){
  if(!Array.isArray(evidence))throw Error('INVALID_EVIDENCE');
  const recognized=[];
  for(const e of evidence){
    if(!e||typeof e!=='object'||Array.isArray(e)||!['CI','ISSUE_COMMENT','SOURCE_READBACK','REVIEW','REMOTE_ACK'].includes(e.kind))throw Error('INVALID_EVIDENCE_ITEM');
    if(e.kind==='CI'&&e.test_passed===true&&/^[a-f0-9]{40}$/u.test(e.head_sha??'')&&Number.isSafeInteger(e.run_id)&&e.run_id>0&&e.original_job_log_checked===true){recognized.push({kind:e.kind,scope:'PINNED_CI_ONLY'});}
    else recognized.push({kind:e.kind,scope:'CLAIM_ONLY_OR_INCOMPLETE'});
  }
  return {observations:recognized,remote_ack:'NOT_VERIFIED',approval:'NOT_APPROVED',verified_reviewer:'NOT_VERIFIED',decision:NO_GO,reason:'INDEPENDENT_ENDPOINT_IDENTITY_AND_REAL_ACK_NOT_PROVEN_BY_KEYWORD_OR_SELF_REPORT'};
}
if(process.argv[1]&&process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);if(args.length!==1)throw Error('USAGE: node scripts/keyword-historical-audit.mjs "keyword or problem_id"');
    const out=searchHistory(await loadCatalog(),args[0]);
    console.log(JSON.stringify(out,null,2));
    if(!out.results.length)process.exitCode=2;
  }catch(e){console.error('AUDIT_BLOCKED',e.message);process.exitCode=1;}
}