'use strict';
// Local cache checkpoint for complete read-only GitHub snapshots.
// Contains digest and counters only, never source content, credentials,
// task prompts, private memory or independent-agent ACK claims.
const fs=require('node:fs');
const path=require('node:path');
const {evaluateSourceSnapshot}=require('./task-source-summary.cjs');
const FORMAT='firstbrain-public-source-checkpoint-v1';
const hex64=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function makeScope(repository,issue){
  if(typeof repository!=='string'||!/^[\w.-]+\/[\w.-]+$/.test(repository))throw Error('invalid_repository');
  if(!Number.isSafeInteger(issue)||issue<1)throw Error('invalid_issue');
  return 'github:'+repository+':issue:'+issue;
}
function readCheckpoint(file,scope,{fsApi=fs}={}){
  if(!fsApi.existsSync(file))return {checkpoint:null,status:'ABSENT_CACHE_MISS_OR_FIRST_RUN'};
  let o;
  try{o=JSON.parse(fsApi.readFileSync(file,'utf8'));}catch{throw Error('checkpoint_unreadable');}
  if(!o||typeof o!=='object'||Array.isArray(o)||
    o.format!==FORMAT||o.scope!==scope||!hex64(o.source_digest)||
    !Number.isSafeInteger(o.record_count)||o.record_count<0||
    typeof o.last_success!=='string'||!Number.isFinite(Date.parse(o.last_success))){
    throw Error('checkpoint_invalid_or_wrong_scope');
  }
  return {checkpoint:o,status:'RESTORED_VALID'};
}
function writeCheckpoint(file,cursor,{fsApi=fs}={}){
  const dir=path.dirname(file);
  fsApi.mkdirSync(dir,{recursive:true});
  const temporary=file+'.'+process.pid+'.tmp';
  try{
    fsApi.writeFileSync(temporary,JSON.stringify(cursor)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
    fsApi.renameSync(temporary,file);
  }catch(e){try{fsApi.unlinkSync(temporary);}catch{}throw e;}
}
function advanceCheckpoint({snapshot,repository,issue,checkpointFile,now=new Date().toISOString()}){
  const scope=makeScope(repository,issue);
  const old=readCheckpoint(checkpointFile,scope);
  const summary=evaluateSourceSnapshot(snapshot,{previousDigest:old.checkpoint?.source_digest||null});
  if(!summary.complete||summary.state==='NO_UPDATE'){
    return {summary,checkpoint_status:old.status,checkpoint_written:false,scope};
  }
  if(!Number.isFinite(Date.parse(now)))throw Error('invalid_clock');
  writeCheckpoint(checkpointFile,{
    format:FORMAT,scope,source_digest:summary.source_digest,
    record_count:summary.records,last_success:now
  });
  return {summary,checkpoint_status:old.status,checkpoint_written:true,scope};
}
module.exports={FORMAT,makeScope,readCheckpoint,writeCheckpoint,advanceCheckpoint};

if(require.main===module){
  const {createGitHubReader,discoverGitHub}=require('./task-locator-github-adapter.cjs');
  const repository=process.env.GITHUB_REPOSITORY||'keqingwu5-cloud/ai-boundary';
  const issue=Number(process.env.BRIDGE_SOURCE_ISSUE||'41');
  const checkpointFile=path.join(process.cwd(),'bridge-evidence','source-cursor.json');
  const reader=createGitHubReader({repository});
  discoverGitHub({reader,seeds:[issue],maxNodes:1,followLinks:false}).then(snapshot=>{
    const result=advanceCheckpoint({snapshot,repository,issue,checkpointFile});
    const s=result.summary;
    const output={
      change_state:s.state,complete:s.complete,
      records:s.records,duplicates:s.duplicates,anomalies:s.anomalies,
      checkpoint_status:result.checkpoint_status,
      checkpoint_written:result.checkpoint_written,
      source_digest:s.source_digest,
      summary:s.one_line,
      actual_remote_ack:'NOT_VERIFIED'
    };
    if(process.env.GITHUB_OUTPUT){
      fs.appendFileSync(process.env.GITHUB_OUTPUT,
        'change_state='+s.state+'\ncheckpoint_written='+result.checkpoint_written+'\n');
    }
    console.log(JSON.stringify(output,null,2));
    if(!s.complete)process.exitCode=2;
  }).catch(e=>{console.error('source_checkpoint_failed:'+String(e.message||e));process.exitCode=2;});
}
