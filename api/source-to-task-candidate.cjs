'use strict';
// Preview-only public GitHub source -> authorized queue contract.
// NEVER dispatches, runs user/issue text, issues grants, or proves agent ACK.
const crypto=require('node:crypto');
const {evaluateSourceSnapshot}=require('./task-source-summary.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const id=x=>typeof x==='string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(x);
function prepareSourceHandoff({snapshot,repository,issue,sourceEndpointId,destinationEndpointId,taskId,eventId,payloadVersion='v1'}={}){
  if(typeof repository!=='string'||!/^[\w.-]+\/[\w.-]+$/.test(repository))throw Error('invalid_repository');
  if(!Number.isSafeInteger(issue)||issue<1)throw Error('invalid_issue');
  if(![sourceEndpointId,destinationEndpointId,taskId,eventId,payloadVersion].every(id))throw Error('invalid_handoff_identity');
  if(sourceEndpointId===destinationEndpointId)throw Error('same_endpoint');
  const summary=evaluateSourceSnapshot(snapshot);
  if(!summary.complete)throw Error('source_incomplete_no_dispatch');
  if(!snapshot.read.includes(issue))throw Error('issue_not_actually_read');
  const issueRecord=snapshot.records.find(x=>x.issue===issue && x.kind==='issue');
  const officialUrl='https://github.com/'+repository+'/issues/'+issue;
  if(!issueRecord||issueRecord.url!==officialUrl)throw Error('source_provenance_not_verified');
  if(snapshot.records.some(x=>x.issue!==issue))throw Error('unexpected_cross_issue_scope');
  if(snapshot.records.some(x=>x.kind==='comment'&&(!Number.isSafeInteger(x.id)||x.id<1||x.url!==officialUrl+'#issuecomment-'+x.id)))throw Error('comment_provenance_not_verified');
  const payload=Object.freeze({
    kind:'SOURCE_REVIEW_METADATA_ONLY',
    repository,issue,source_url:officialUrl,
    source_digest:summary.source_digest,record_count:summary.records,
    content_included:false,independent_agent_ack:false
  });
  // Idempotency scope includes a pinned source digest; repeated source reads
  // generate the same key, while actual content revisions get a new key.
  const idempotencyKey=sha(JSON.stringify({repository,issue,taskId,destinationEndpointId,payloadVersion,source_digest:summary.source_digest}));
  return Object.freeze({
    state:'READY_FOR_SYNTHETIC_TEST_ONLY',
    dispatch_permitted:false,explicit_human_grant_present:false,
    send_body:Object.freeze({
      event_id:eventId,task_id:taskId,destination_endpoint_id:destinationEndpointId,
      payload_version:payloadVersion,idempotency_key:idempotencyKey,payload
    }),
    sender_endpoint_id:sourceEndpointId,
    source_status:'SOURCE_READ_COMPLETE',actual_remote_ack:false
  });
}
module.exports={prepareSourceHandoff};


// Read-only public source preflight: prints no source body and dispatches NOTHING.
if(require.main===module){
  const {createGitHubReader,discoverGitHub}=require('./task-locator-github-adapter.cjs');
  const repository=process.env.GITHUB_REPOSITORY||'keqingwu5-cloud/ai-boundary';
  const issue=Number(process.env.BRIDGE_SOURCE_ISSUE||'41');
  const reader=createGitHubReader({repository});
  discoverGitHub({reader,seeds:[issue],followLinks:false,maxNodes:1}).then(snapshot=>{
    const proposal=prepareSourceHandoff({
      snapshot,repository,issue,
      sourceEndpointId:'synthetic-source-reader',
      destinationEndpointId:'synthetic-review-worker',
      taskId:'synthetic-public-source-review',
      eventId:'synthetic-public-source-event',
      payloadVersion:'v1'
    });
    console.log(JSON.stringify({
      state:proposal.state,
      source_status:proposal.source_status,
      source_digest:proposal.send_body.payload.source_digest,
      record_count:proposal.send_body.payload.record_count,
      idempotency_key:proposal.send_body.idempotency_key,
      content_included:proposal.send_body.payload.content_included,
      dispatch_permitted:proposal.dispatch_permitted,
      explicit_human_grant_present:proposal.explicit_human_grant_present,
      actual_remote_ack:proposal.actual_remote_ack
    },null,2));
  }).catch(e=>{
    console.error('source_to_task_preflight_failed:'+String(e.message||e));
    process.exitCode=2;
  });
}
