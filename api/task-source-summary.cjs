'use strict';
// Produce a small, truthful status from an already validated public source snapshot.
// This is NOT a remote Agent receipt or a durable cross-run checkpoint.
const crypto=require('node:crypto');
const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');
const isId=n=>Number.isSafeInteger(n)&&n>0;
const validDigest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const isArray=Array.isArray;
function evaluateSourceSnapshot(result,{previousDigest=null}={}){
  if(previousDigest!==null&&!validDigest(previousDigest))throw Error('invalid_previous_digest');
  const faults=[];
  if(!result||typeof result!=='object'||isArray(result))faults.push('snapshot_missing');
  const errors=result?.errors,unresolved=result?.unresolved;
  if(!isArray(errors)||!isArray(unresolved)||!isArray(result?.records)||!isArray(result?.read))faults.push('invalid_snapshot_shape');
  if(result?.complete!==true)faults.push('source_not_complete');
  if(isArray(errors)&&errors.length)faults.push('read_or_search_error');
  if(isArray(unresolved)&&unresolved.length)faults.push('unresolved_sources');
  const normalized=new Map();let duplicates=0;
  for(const x of isArray(result?.records)?result.records:[]){
    if(!x||!isId(x.issue)||!['issue','comment'].includes(x.kind)||
       (x.kind==='comment'&&!isId(x.id))||
       typeof x.body!=='string'||typeof x.url!=='string'||!x.url.startsWith('https://')){
      faults.push('invalid_source_record');continue;
    }
    const key=x.kind==='issue'? `issue:${x.issue}`:`comment:${x.issue}:${x.id}`;
    // Metadata-only edits and result order changes do not create false alerts.
    const value={key,url:x.url,content_digest:sha256(x.body)};
    const prior=normalized.get(key);
    if(prior){
      if(JSON.stringify(prior)!==JSON.stringify(value))faults.push('conflicting_duplicate_source');
      else duplicates++;
    }else normalized.set(key,value);
  }
  const cleanFaults=[...new Set(faults)];
  const readCount=isArray(result?.read)?new Set(result.read.filter(isId)).size:0;
  const issueCount=new Set([...normalized.keys()].map(k=>Number(k.split(':')[1]))).size;
  if(cleanFaults.length){
    return {state:'MONITOR_UNHEALTHY',complete:false,source_digest:null,
      previous_digest_accepted:false,records:normalized.size,issues:issueCount,
      read_issues:readCount,duplicates,anomalies:cleanFaults,
      errors:isArray(errors)?errors.length:null,unresolved:isArray(unresolved)?unresolved.length:null,
      actual_remote_ack:'NOT_VERIFIED',one_line:'來源查核未完成；不宣稱沒有更新，也不更新去重基準。'};
  }
  const values=[...normalized.values()].sort((a,b)=>a.key.localeCompare(b.key,'en'));
  const digest=sha256(JSON.stringify(values));
  const state=previousDigest===null?'BASELINE':previousDigest===digest?'NO_UPDATE':'CONTENT_CHANGED';
  const one_line=values.length===0?(state==='CONTENT_CHANGED'?'完整搜尋中未找到任務；相較先前來源有所變動。':'完整搜尋中沒有符合的任務；不是讀取失敗。'):state==='BASELINE'? `首次完整來源基準：${issueCount} 個任務、${values.length} 筆去重來源；跨 AI 收件未驗證。`:
    state==='NO_UPDATE'? `來源內容沒有變更：${issueCount} 個任務、${values.length} 筆去重來源；無需重複通知。`:
    `來源內容有實質變動：${issueCount} 個任務、${values.length} 筆去重來源；需比對新差異。`;
  return {state,complete:true,source_digest:digest,
    previous_digest_accepted:previousDigest!==null,records:values.length,issues:issueCount,
    read_issues:readCount,duplicates,anomalies:[],
    errors:0,unresolved:0,actual_remote_ack:'NOT_VERIFIED',one_line};
}
module.exports={evaluateSourceSnapshot};
