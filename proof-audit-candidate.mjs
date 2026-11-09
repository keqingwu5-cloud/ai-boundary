/**
 * First Brain proof/audit sidecar V0.1 — isolated, in-memory and read-only to
 * the V0.1 control cycle. Stores only claims, immutable references and digests.
 * It NEVER verifies real identity, receives remote ACK, approves a baseline,
 * writes to memory, or records private model chain-of-thought.
 */
import {sha256,stableJson} from './nary-composition.mjs';

export const PROOF_SCHEMA='firstbrain.proof-audit.candidate.v0.1';
export const AUDIT_STREAMS=Object.freeze([
  'AUTOMATION','REASONING_SUMMARY','WORLD_MODEL','MEMORY'
]);
export const AUDIT_SECTORS=Object.freeze([
  'ENGINEERING','INFRASTRUCTURE','DATA','WATER','ELECTRICITY'
]);
export const REVIEW_VERDICTS=Object.freeze([
  'RECOMMEND','REQUEST_CHANGES','REJECT','INCONCLUSIVE'
]);
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const HEX=/^[0-9a-f]{64}$/;
const CODE=/^[A-Z][A-Z0-9_]{0,59}$/;
const id=s=>typeof s==='string'&&ID.test(s);
const hash=s=>typeof s==='string'&&HEX.test(s);
const code=s=>typeof s==='string'&&CODE.test(s);
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(x));
const exact=(o,allowed)=>isObj(o)&&Object.keys(o).every(k=>allowed.includes(k));
const cp=v=>JSON.parse(JSON.stringify(v));
const blocked=reason=>({status:'blocked',reason,decision:'HOLD',authority:'none',
  identity_verified:false,reviewer_identity_verified:false,actual_ack:'NOT_VERIFIED'});
const pending=(additional={})=>({status:'candidate_only',decision:'HOLD',authority:'none',
  identity_verified:false,reviewer_identity_verified:false,actual_ack:'NOT_VERIFIED',
  ...additional});
const streams=()=>Object.fromEntries(AUDIT_STREAMS.map(s=>[s,'NOT_RECORDED']));

/**
 * Packages link to an immutable control-event VERSION. A changed control event
 * cannot quietly reuse the same reviewed snapshot. No persistence or network.
 */
export function createProofAudit({control,maxPackages=256,maxEntries=4096}={}){
  if(!control||typeof control.readEvent!=='function'||typeof control.history!=='function'||
     typeof control.verifyHistory!=='function')throw Error('CONTROL_INTERFACE_REQUIRED');
  if(!Number.isInteger(maxPackages)||maxPackages<1||maxPackages>10000||
     !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>100000)throw Error('LIMIT_INVALID');
  const packages=new Map();const byEvent=new Map();let totalEntries=0;

  function pinned(p){
    const now=control.readEvent(p.event_id);
    return now.status==='candidate_only'&&now.version===p.control_version&&
      now.domain_id===p.domain_id&&now.observed_hash===p.observed_hash;
  }
  async function append(p,type,data){
    if(totalEntries>=maxEntries)return blocked('AUDIT_CAPACITY_REACHED');
    if(!pinned(p))return blocked('CONTROL_SNAPSHOT_STALE');
    const seq=p.version+1;
    const entry={proof_id:p.proof_id,sequence:seq,type,data:cp(data),
      prev_hash:p.entries.length?p.entries.at(-1).hash:null};
    const digest=await sha256(stableJson(entry));
    // Recheck after async digest: concurrent writes must fail without a fork.
    if(p.version!==seq-1)return blocked('AUDIT_VERSION_CONFLICT');
    if(!pinned(p))return blocked('CONTROL_SNAPSHOT_STALE');
    if(totalEntries>=maxEntries)return blocked('AUDIT_CAPACITY_REACHED');
    p.entries.push({...entry,hash:digest});p.version++;totalEntries++;
    return pending({proof_id:p.proof_id,revision:p.version,entry_hash:digest});
  }
  function version(p,expected){
    return Number.isInteger(expected)&&expected===p.version?null:'AUDIT_VERSION_CONFLICT';
  }
  async function openProof(data){
    if(!exact(data,['proof_id','event_id','expected_control_version','sector',
      'created_by_claim','scope_ref'])||!id(data.proof_id)||!id(data.event_id)||
      !Number.isInteger(data.expected_control_version)||data.expected_control_version<1||
      !AUDIT_SECTORS.includes(data.sector)||!id(data.created_by_claim)||
      !id(data.scope_ref))return blocked('PROOF_CONTRACT_INVALID');
    const current=control.readEvent(data.event_id);
    if(current.status!=='candidate_only')return blocked('CONTROL_EVENT_NOT_FOUND');
    if(current.version!==data.expected_control_version)return blocked('CONTROL_SNAPSHOT_STALE');
    const snapshot={event_id:data.event_id,domain_id:current.domain_id,
      observed_hash:current.observed_hash,control_version:current.version};
    const duplicate=packages.get(data.proof_id);
    if(duplicate)return stableJson(duplicate.creation)===stableJson(data)?
      pending({proof_id:data.proof_id,operation:'DUPLICATE_IGNORED',revision:duplicate.version}):
      blocked('PROOF_ID_COLLISION');
    if(packages.size>=maxPackages)return blocked('PROOF_CAPACITY_REACHED');
    const base={proof_id:data.proof_id,creation:cp(data),...snapshot,
      sector:data.sector,created_by_claim:data.created_by_claim,
      scope_ref:data.scope_ref,version:0,entries:[],action_ids:new Map(),
      log_ids:new Map()};
    const integrity=await control.verifyHistory(data.event_id);
    if(!integrity.local_chain_consistent)return blocked('CONTROL_LEDGER_INVALID');
    if(!pinned(base))return blocked('CONTROL_SNAPSHOT_STALE');
    if(packages.size>=maxPackages)return blocked('PROOF_CAPACITY_REACHED');
    if(packages.has(data.proof_id))return blocked('PROOF_ID_COLLISION');
    packages.set(data.proof_id,base);
    const a=await append(base,'PROOF_OPENED',{created_by_claim:data.created_by_claim,
      scope_ref:data.scope_ref,sector:data.sector,identity:'CLAIM_ONLY',
      control_version:base.control_version,control_history_hash:
      control.history(data.event_id).entries.at(-1)?.hash??null});
    if(a.status==='blocked'){packages.delete(data.proof_id);return a;}
    if(!byEvent.has(data.event_id))byEvent.set(data.event_id,[]);
    byEvent.get(data.event_id).push(data.proof_id);
    return a;
  }
  async function recordAction(data){
    if(!exact(data,['proof_id','expected_revision','action_id','performed_by_claim',
      'action_ref','action_hash','result_code'])||!id(data.proof_id)||
      !id(data.action_id)||!id(data.performed_by_claim)||!id(data.action_ref)||
      !hash(data.action_hash)||!code(data.result_code))return blocked('ACTION_CONTRACT_INVALID');
    const p=packages.get(data.proof_id);if(!p)return blocked('PROOF_NOT_FOUND');
    const previous=p.action_ids.get(data.action_id);
    if(previous)return stableJson(previous)===stableJson(data)?
      pending({proof_id:p.proof_id,operation:'DUPLICATE_IGNORED',revision:p.version}):
      blocked('ACTION_ID_COLLISION');
    const err=version(p,data.expected_revision);if(err)return blocked(err);
    const a=await append(p,'ACTION_CLAIM',{action_id:data.action_id,
      performed_by_claim:data.performed_by_claim,action_ref:data.action_ref,
      action_hash:data.action_hash,result_code:data.result_code,
      identity:'CLAIM_ONLY',execution_verification:'NOT_VERIFIED'});
    if(a.status!=='blocked')p.action_ids.set(data.action_id,cp(data));
    return a;
  }
  async function recordLog(data){
    if(!exact(data,['proof_id','expected_revision','log_id','stream','recorded_by_claim',
      'record_ref','record_hash','summary_code'])||!id(data.proof_id)||
      !id(data.log_id)||!AUDIT_STREAMS.includes(data.stream)||
      !id(data.recorded_by_claim)||!id(data.record_ref)||!hash(data.record_hash)||
      !code(data.summary_code))return blocked('LOG_CONTRACT_INVALID');
    const p=packages.get(data.proof_id);if(!p)return blocked('PROOF_NOT_FOUND');
    const previous=p.log_ids.get(data.log_id);
    if(previous)return stableJson(previous)===stableJson(data)?
      pending({proof_id:p.proof_id,operation:'DUPLICATE_IGNORED',revision:p.version}):
      blocked('LOG_ID_COLLISION');
    const err=version(p,data.expected_revision);if(err)return blocked(err);
    const r=await append(p,'LOG_REFERENCE',{log_id:data.log_id,
      stream:data.stream,recorded_by_claim:data.recorded_by_claim,
      record_ref:data.record_ref,record_hash:data.record_hash,
      summary_code:data.summary_code,raw_text_stored:false,
      identity:'CLAIM_ONLY',validation:'NOT_VERIFIED'});
    if(r.status!=='blocked')p.log_ids.set(data.log_id,cp(data));
    return r;
  }
  async function recordReview(data){
    if(!exact(data,['proof_id','expected_revision','review_id','reviewed_by_claim',
      'review_ref','review_hash','verdict'])||!id(data.proof_id)||
      !id(data.review_id)||!id(data.reviewed_by_claim)||!id(data.review_ref)||
      !hash(data.review_hash)||!REVIEW_VERDICTS.includes(data.verdict))
      return blocked('REVIEW_CONTRACT_INVALID');
    const p=packages.get(data.proof_id);if(!p)return blocked('PROOF_NOT_FOUND');
    const err=version(p,data.expected_revision);if(err)return blocked(err);
    const actions=p.entries.filter(e=>e.type==='ACTION_CLAIM');
    if(!actions.length)return blocked('ACTION_CLAIM_REQUIRED');
    if(p.created_by_claim===data.reviewed_by_claim||
       actions.some(e=>e.data.performed_by_claim===data.reviewed_by_claim))
      return blocked('SELF_REVIEW_CLAIM');
    if(p.entries.some(e=>e.type==='REVIEW_CLAIM'&&e.data.review_id===data.review_id))
      return blocked('REVIEW_ID_COLLISION');
    return append(p,'REVIEW_CLAIM',{review_id:data.review_id,
      reviewed_by_claim:data.reviewed_by_claim,review_ref:data.review_ref,
      review_hash:data.review_hash,verdict:data.verdict,
      reviewed_revision:data.expected_revision,role_separation:'CLAIM_ONLY',
      independent_identity:'NOT_VERIFIED',approval:'NOT_GRANTED'});
  }
  function readProof(proofId){
    const p=packages.get(proofId);if(!p)return blocked('PROOF_NOT_FOUND');
    const e=p.entries;
    const acts=e.filter(x=>x.type==='ACTION_CLAIM').map(x=>cp(x.data));
    const logs=e.filter(x=>x.type==='LOG_REFERENCE').map(x=>cp(x.data));
    const reviews=e.filter(x=>x.type==='REVIEW_CLAIM').map(x=>cp(x.data));
    const last=reviews.at(-1)??null;
    const recentNonReview=e.filter(x=>x.type!=='REVIEW_CLAIM').at(-1);
    let reviewStatus='NOT_REVIEWED';
    if(last)reviewStatus=(last.data.reviewed_revision===recentNonReview?.sequence)?
      'REVIEW_CLAIM_ONLY':'STALE_REVIEW';
    const coverage=streams();
    for(const log of logs)coverage[log.stream]='REFERENCED_UNVERIFIED';
    const sourceStale=!pinned(p);
    return pending({schema:PROOF_SCHEMA,proof_id:p.proof_id,event_id:p.event_id,
      domain_id:p.domain_id,sector:p.sector,control_version:p.control_version,
      control_observed_hash:p.observed_hash,scope_ref:p.scope_ref,
      created_by_claim:p.created_by_claim,performed_by_claims:[...new Set(acts.map(a=>a.performed_by_claim))],
      reviewed_by_claims:[...new Set(reviews.map(a=>a.reviewed_by_claim))],
      actions:acts,logs,reviews,log_coverage:coverage,revision:p.version,
      history_head_hash:e.at(-1)?.hash??null,
      review_status:sourceStale?'STALE_CONTROL_SNAPSHOT':reviewStatus,
      control_snapshot_stale:sourceStale,proof_integrity:'NOT_YET_VERIFIED',
      role_independence:'NOT_VERIFIED',baseline_approval:'NOT_APPROVED',
      memory_write:'NOT_PERFORMED',publication:'NOT_PERFORMED',
      persistence:'IN_MEMORY_ONLY'});
  }
  async function verifyProof(proofId){
    const p=packages.get(proofId);if(!p)return blocked('PROOF_NOT_FOUND');
    let prev=null;
    for(let i=0;i<p.entries.length;i++){
      const {hash:stored,...entry}=p.entries[i];
      if(entry.sequence!==i+1||entry.prev_hash!==prev||
         await sha256(stableJson(entry))!==stored)return blocked('LOCAL_PROOF_CHAIN_INVALID');
      prev=stored;
    }
    return pending({proof_id:p.proof_id,checked_entries:p.entries.length,
      local_chain_consistent:true,identity_authenticated:false,
      independent_review_verified:false,control_snapshot_stale:!pinned(p),
      immutable_storage:false});
  }
  function listProofs(eventId){
    if(!id(eventId))return blocked('EVENT_ID_INVALID');
    return pending({event_id:eventId,proof_ids:cp(byEvent.get(eventId)||[])});
  }
  return Object.freeze({openProof,recordAction,recordLog,recordReview,
    readProof,verifyProof,listProofs,stats:()=>pending({packages:packages.size,
      entries:totalEntries,streams:AUDIT_STREAMS,public_uploads:false})});
}
