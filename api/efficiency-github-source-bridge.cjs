'use strict';
// Adapter between existing P0-6 GitHub public-source reader and PR #117 preflight.
// Read-only metadata, never dispatches, never treats issue posts as remote ACK.
const crypto=require('node:crypto');
const {discoverGitHub}=require('./task-locator-github-adapter.cjs');
const {evaluateSourceSnapshot}=require('./task-source-summary.cjs');
const {prepareSourceHandoff}=require('./source-to-task-candidate.cjs');
const {planPreflight}=require('./efficiency-cost-preflight.cjs');
const {verifyReviewAttestations}=require('./efficiency-review-attestation.cjs');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const safeRepo=x=>typeof x==='string'&&/^[\w.-]+\/[\w.-]+$/.test(x);
function fromSnapshot({snapshot,repository,issue,purposeDigest,prior=[],attestations=[],trustedReviewerKeys={},limits,nowMs,risk='high',contradiction=false,estimatedReadMicros=0}={}){
  if(!safeRepo(repository)||!Number.isSafeInteger(issue)||issue<1)throw Error('invalid_source_identity');
  if(!['low','high'].includes(risk)||typeof contradiction!=='boolean')throw Error('invalid_risk_policy');
  const sourceId='github:'+repository+':issue:'+issue;
  const summary=evaluateSourceSnapshot(snapshot);
  const scoped=summary.complete===true &&
    Array.isArray(snapshot.read)&&snapshot.read.length===1&&snapshot.read[0]===issue &&
    Array.isArray(snapshot.records)&&snapshot.records.every(r=>r.issue===issue&&typeof r.version==='string'&&r.version.length>0);
  let proposal=null, fingerprint=null;
  if(scoped){
    // Reuse the already implemented source provenance and content binding checks.
    // These synthetic endpoint IDs authorize NOTHING and prove NO remote receiver.
    proposal=prepareSourceHandoff({snapshot,repository,issue,
      sourceEndpointId:'synthetic-efficiency-source',
      destinationEndpointId:'synthetic-efficiency-review',
      taskId:'efficiency-readonly-analysis'});
    const revisionMap=snapshot.records.map(r=>({
      kind:r.kind,issue:r.issue,id:r.id??null,url:r.url,version:r.version
    })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
    fingerprint=digest(JSON.stringify({repository,issue,sourceDigest:summary.source_digest,revisions:revisionMap}));
  }
  // Ignore caller-supplied reviewed:true claims. Only configured pinned-key
  // Ed25519 attestations can become trusted prior for a reuse suggestion.
  const trust=verifyReviewAttestations({attestations,trustedReviewerKeys,nowMs});
  const preflight=planPreflight({purposeDigest,nowMs,prior:trust.accepted,limits,sources:[{
    sourceId,status:scoped?'complete':'partial',risk,contradiction,
    fingerprint,estimatedReadMicros
  }]});
  return Object.freeze({
    schema:'github-efficiency-preview.v1',sourceId,
    source_status:scoped?'COMPLETE_REVISION_SCOPED':'INCOMPLETE_OR_UNVERSIONED',
    records:summary.records,sourceDigest:scoped?summary.source_digest:null,
    revisionFingerprint:fingerprint,
    sourceReadAttempted:true,sourceReadsSkipped:0,
    attestationEvidence:{accepted:trust.accepted.length,rejected:trust.rejected.length,
      rawPriorIgnored:Array.isArray(prior)?prior.length:1,trustRootConfigured:trust.trustRootConfigured},
    preflight,sourceEvidenceChecked:scoped,
    sourceProposal:proposal?{state:proposal.state,dispatch_permitted:proposal.dispatch_permitted,
      actual_remote_ack:proposal.actual_remote_ack}:null,
    downstreamAnalysisExecuted:false,
    externalProviderCalls:0,
    providerTokenSavings:'NOT_MEASURED',realDollarSavings:'UNKNOWN',
    actualRemoteAck:false,deployPermitted:false
  });
}
async function inspectGitHubAndPlan({reader,repository,issue,...opts}={}){
  if(!reader||typeof reader.getIssue!=='function'||typeof reader.getComments!=='function')
    throw Error('read_only_reader_required');
  const counts={getIssue:0,getComments:0,searchIssues:0};
  const wrapped={
    getIssue:async n=>{counts.getIssue++;return reader.getIssue(n);},
    getComments:async n=>{counts.getComments++;return reader.getComments(n);},
    searchIssues:async q=>{counts.searchIssues++;if(typeof reader.searchIssues!=='function')throw Error('search_unavailable');return reader.searchIssues(q);}
  };
  const snapshot=await discoverGitHub({reader:wrapped,seeds:[issue],followLinks:false,maxNodes:1});
  const verdict=fromSnapshot({snapshot,repository,issue,...opts});
  return {...verdict,readerMethodCalls:counts,apiHttpRequests:'NOT_MEASURED_PAGINATION_HIDDEN'};
}
module.exports={fromSnapshot,inspectGitHubAndPlan};
