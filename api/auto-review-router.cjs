'use strict';
// AUTO-REVIEW: pure local comparison, no IO, scheduler, AI dispatch or persistence.
// Graph validation uses the same pinned validator as the browser storage candidate.
// Stable serialization is pinned MIT fast-json-stable-stringify v2.1.0.
const {createHash}=require('node:crypto');
const stringify=require('../vendor/fast-json-stable-stringify-v2.1.0.cjs');

const MAX_BATCH=100,MAX_RAW_CHARS=1_000_000;
const ID=/^[A-Za-z0-9_.:-]{1,80}$/;
const HEX=/^[0-9a-f]{64}$/;
const EVENTS=Object.freeze({
  RECEIVED:{SOURCE_MISSING:'SOURCE_ABSENT',INVALID:'QUARANTINED',VALID:'VALIDATED'},
  VALIDATED:{COMPARE:'COMPARED',INVALID:'QUARANTINED'},
  COMPARED:{INVALID:'QUARANTINED',BASELINE_MISSING:'WAIT_BASELINE',
    SAME:'NO_CHANGE',CONTENT_CHANGED:'REVIEW_CANDIDATE',
    HISTORY_CHANGED:'REVIEW_HISTORY',METADATA_CHANGED:'REVIEW_METADATA',
    CONFLICT:'NEED_COUNTEREVIDENCE'}
});
const REVIEW_EVENTS=Object.freeze({
  WAIT_BASELINE:{REQUEST_RECHECK:'NEEDS_RECHECK',REJECT:'REJECTED'},
  REVIEW_CANDIDATE:{REQUEST_RECHECK:'NEEDS_RECHECK',REQUEST_COUNTEREVIDENCE:'NEED_COUNTEREVIDENCE',REJECT:'REJECTED'},
  REVIEW_HISTORY:{REQUEST_RECHECK:'NEEDS_RECHECK',REQUEST_COUNTEREVIDENCE:'NEED_COUNTEREVIDENCE',REJECT:'REJECTED'},
  REVIEW_METADATA:{REQUEST_RECHECK:'NEEDS_RECHECK',REQUEST_COUNTEREVIDENCE:'NEED_COUNTEREVIDENCE',REJECT:'REJECTED'},
  NEED_COUNTEREVIDENCE:{REQUEST_RECHECK:'NEEDS_RECHECK',REJECT:'REJECTED'}
});
const validId=value=>typeof value==='string'&&ID.test(value);
const fingerprint=obj=>createHash('sha256').update(stringify(obj),'utf8').digest('hex');
// The separate UTF-8 source-string hash is for audit, not authenticity or a signature.
const rawFingerprint=raw=>createHash('sha256').update(raw,'utf8').digest('hex');
let validatorPromise;
function validator(){
  if(!validatorPromise)validatorPromise=import('../brain-graph-integrity.mjs')
    .then(m=>m.validateBrainGraph);
  return validatorPromise;
}
function move(state,event){
  const next=EVENTS[state]?.[event];
  if(!next)throw new Error('INVALID_STATE_TRANSITION');
  return next;
}
function output(source_id,state,reason,digests={}){
  return {source_id:validId(source_id)?source_id:null,state,reason,
    action:'NO_EXTERNAL_EFFECT',review_required:state!=='NO_CHANGE',
    approved:false,source_digest:digests.source_digest??null,
    raw_source_digest:digests.raw_source_digest??null,
    content_digest:digests.content_digest??null,
    history_digest:digests.history_digest??null};
}
function validateBaseline(baseline){
  if(!baseline||typeof baseline!=='object'||Array.isArray(baseline))return false;
  if(!validId(baseline.source_id)||!HEX.test(baseline.content_digest)||
    !HEX.test(baseline.history_digest))return false;
  if(baseline.source_revision!=null&&!validId(baseline.source_revision))return false;
  if(baseline.purpose_id!=null&&!validId(baseline.purpose_id))return false;
  if(baseline.raw_source_digest!=null&&!HEX.test(baseline.raw_source_digest))return false;
  return true;
}
async function scanEntry(entry,baseline=null){
  let state='RECEIVED';
  const id=entry?.source_id;
  if(!validId(id))return output(null,move(state,'INVALID'),'INVALID_SOURCE_ID');
  if(entry.raw===null||entry.raw===undefined)
    return output(id,move(state,'SOURCE_MISSING'),'SOURCE_ABSENT');
  if(typeof entry.raw!=='string'||entry.raw.length>MAX_RAW_CHARS)
    return output(id,move(state,'INVALID'),'SOURCE_INVALID_OR_TOO_LARGE');
  if(entry.source_revision!=null&&!validId(entry.source_revision))
    return output(id,move(state,'INVALID'),'INVALID_SOURCE_REVISION');
  if(entry.purpose_id!=null&&!validId(entry.purpose_id))
    return output(id,move(state,'INVALID'),'INVALID_PURPOSE_ID');
  let graph;
  try{graph=JSON.parse(entry.raw);}
  catch{return output(id,move(state,'INVALID'),'INVALID_JSON');}
  let valid;
  try{valid=await (await validator())(graph);}
  catch{return output(id,move(state,'INVALID'),'VALIDATOR_UNAVAILABLE');}
  if(!valid)return output(id,move(state,'INVALID'),'GRAPH_INVALID');
  state=move(state,'VALID');
  if(baseline!==null&&!validateBaseline(baseline))
    return output(id,move(state,'INVALID'),'INVALID_BASELINE');
  if(baseline!==null&&baseline.source_id!==id)
    return output(id,move(state,'INVALID'),'BASELINE_SOURCE_MISMATCH');
  let digests;
  try{
    const withoutHistory={...graph};
    delete withoutHistory.history;
    digests={source_digest:fingerprint(graph),
      raw_source_digest:rawFingerprint(entry.raw),
      content_digest:fingerprint(withoutHistory),
      history_digest:fingerprint(graph.history)};
  }catch{return output(id,move(state,'INVALID'),'DIGEST_FAILURE');}
  state=move(state,'COMPARE');
  if(baseline===null)return output(id,move(state,'BASELINE_MISSING'),'BASELINE_REQUIRES_REVIEW',digests);
  const sameContent=digests.content_digest===baseline.content_digest;
  const sameHistory=digests.history_digest===baseline.history_digest;
  if(baseline.purpose_id!== (entry.purpose_id??null) &&
    (baseline.purpose_id!=null||entry.purpose_id!=null))
    return output(id,move(state,'CONFLICT'),'PURPOSE_MISMATCH',digests);
  // Missing provenance must never silently pass as "no change".
  // These are caller claims, not authenticated origin proofs.
  if(!entry.purpose_id||!baseline.purpose_id)
    return output(id,move(state,'CONFLICT'),'PURPOSE_CONTEXT_UNVERIFIED',digests);
  if(!entry.source_revision||!baseline.source_revision)
    return output(id,move(state,'CONFLICT'),'REVISION_CONTEXT_UNVERIFIED',digests);
  // A source revision cannot silently alter canonical content/history.
  if(entry.source_revision===baseline.source_revision&&(!sameContent||!sameHistory))
    return output(id,move(state,'CONFLICT'),'SAME_REVISION_DIFFERENT_CONTENT',digests);
  // Optional raw source fingerprint protects representation fidelity for newer baselines.
  // Older baselines with no raw_source_digest remain supported but can't detect this drift.
  if(sameContent&&sameHistory&&baseline.raw_source_digest!=null&&
    digests.raw_source_digest!==baseline.raw_source_digest&&
    entry.source_revision===baseline.source_revision)
    return output(id,move(state,'METADATA_CHANGED'),'SOURCE_BYTES_CHANGED_SAME_REVISION',digests);
  if(sameContent&&sameHistory){
    if(baseline.source_revision!=null&&entry.source_revision!=null&&
      baseline.source_revision!==entry.source_revision)
      return output(id,move(state,'METADATA_CHANGED'),'SOURCE_REVISION_CHANGED_ONLY',digests);
    return output(id,move(state,'SAME'),'NO_CHANGE',digests);
  }
  return sameContent
    ?output(id,move(state,'HISTORY_CHANGED'),'HISTORY_ONLY_CHANGED',digests)
    :output(id,move(state,'CONTENT_CHANGED'),'CONTENT_CHANGED',digests);
}
async function scanBatch(entries,baselines={}){
  if(!Array.isArray(entries)||entries.length>MAX_BATCH)throw new TypeError('batch limit exceeded');
  if(!baselines||typeof baselines!=='object'||Array.isArray(baselines))
    throw new TypeError('baseline map must be object');
  const seen=new Set(),out=[];
  for(const entry of entries){
    const id=entry?.source_id;
    if(validId(id)&&seen.has(id)){
      out.push(output(id,'QUARANTINED','DUPLICATE_SOURCE_ID'));
      continue;
    }
    if(validId(id))seen.add(id);
    // Caller-provided baselines are read but never mutated or independently trusted.
    const b=validId(id)&&Object.prototype.hasOwnProperty.call(baselines,id)
      ?baselines[id]:null;
    out.push(await scanEntry(entry,b));
  }
  return out;
}
function reviewTransition(record,event){
  // This is NOT an authenticated approval, durable audit or official memory write.
  const target=REVIEW_EVENTS[record?.state]?.[event?.type];
  if(!target)throw new Error('FORBIDDEN_OR_INVALID_REVIEW_TRANSITION');
  if(typeof event.actor_id!=='string'||!event.actor_id.trim()||
    event.actor_id.length>120||typeof event.evidence_ref!=='string'||
    !event.evidence_ref.trim()||event.evidence_ref.length>300)
    throw new Error('reviewer identity claim and evidence reference required');
  return {
    source_id:validId(record.source_id)?record.source_id:null,
    source_digest:record.source_digest??null,
    raw_source_digest:record.raw_source_digest??null,
    content_digest:record.content_digest??null,
    history_digest:record.history_digest??null,
    previous_state:record.state,state:target,
    action:'NO_EXTERNAL_EFFECT',review_required:true,approved:false,
    reviewer_identity_claimed:event.actor_id,
    reviewer_identity_verified:false,review_evidence_ref:event.evidence_ref
  };
}
module.exports={scanEntry,scanBatch,reviewTransition};
