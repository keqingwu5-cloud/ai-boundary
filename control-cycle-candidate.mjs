/**
 * First Brain — Trusted Control Cycle V0.1 (isolated candidate).
 * Zero external I/O, storage, timer, network, execution, human-auth or AI ACK.
 * Reuses V1.6 gap-aware N-ary engine; never substitutes observation for approval.
 */
import {createGapAwareEngine} from './gap-aware-composition.mjs';
import {sha256,stableJson} from './nary-composition.mjs';

export const CONTROL_SCHEMA='firstbrain.trusted-control-cycle.candidate.v0.1';
export const CONTROL_MODES=Object.freeze(['STOP','OBSERVE','TEST','CONTROLLED']);
export const NOTIFICATION_KINDS=Object.freeze(['WARNING','FAILURE','EXECUTION','CORRECTION','REVIEW']);
export const DIRECTIONS=Object.freeze(['REUSE','ALTERNATIVE','CHALLENGE_PREMISE','STOP','RESEARCH_ONLY']);
export const EXPANSION_KINDS=Object.freeze(['REFERENCE_ONLY','TYPED_TRANSFORM','RESEARCH']);
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const HEX=/^[0-9a-f]{64}$/;
const id=x=>typeof x==='string'&&ID.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const exact=(o,keys)=>obj(o)&&Object.keys(o).every(k=>keys.includes(k));
const copy=o=>JSON.parse(JSON.stringify(o));
const denied=(reason)=>({status:'blocked',reason,decision:'HOLD',authority:'none',remote_ack:'NOT_VERIFIED'});
const candidate=(extra={})=>({status:'candidate_only',decision:'HOLD',authority:'none',remote_ack:'NOT_VERIFIED',...extra});
const canText=(x,max=280)=>typeof x==='string'&&x.length>=1&&x.length<=max&& !/[\u0000-\u001f]/.test(x);

/**
 * The domain registry expands *namespaces*, not executable plugin privileges.
 * maxInputs/maxDepth/maxEvents are explicit resource bounds, not literal infinity.
 */
export function createControlCycle({maxDomains=64,maxEvents=256,maxHistory=1024,maxInputs=32,maxDepth=24,maxRuleManifests=128}={}){
  for(const [k,v,lo,hi] of [['maxDomains',maxDomains,1,256],['maxEvents',maxEvents,1,10000],
    ['maxHistory',maxHistory,1,100000],['maxInputs',maxInputs,2,32],['maxDepth',maxDepth,1,64],['maxRuleManifests',maxRuleManifests,1,4096]]){
    if(!Number.isInteger(v)||v<lo||v>hi)throw Error(k+'_INVALID');
  }
  const engine=createGapAwareEngine({maxInputs,maxDepth});
  const domains=new Map(),events=new Map(),ruleManifests=new Map();
  let totalHistory=0;
  // Engine mutations may complete before append-only control history can commit.
  // Without transactional rollback, quarantine all engine reads and future work
  // after an append failure; never misreport a clean rollback or remote STOP.
  let engineQuarantined=false;
  const engineBlocked=()=>engineQuarantined?denied('ENGINE_STATE_QUARANTINED'):null;
  function view(e){
    return candidate({schema:CONTROL_SCHEMA,event_id:e.id,domain_id:e.domain_id,
      observed_revision:e.observed_revision,observed_hash:e.observed_hash,
      observation:'RECORDED_UNVERIFIED',baseline:'NOT_APPROVED',control_mode:e.mode,
      execution:'NOT_RUN',direction:e.direction,version:e.version,
      local_stop:e.mode==='STOP',remote_stop_confirmed:false,
      notification_count:e.notifications.size,history_count:e.history.length});
  }
  async function append(e,kind,details){
    if(totalHistory>=maxHistory)return denied('HISTORY_CAPACITY_REACHED');
    const entry={event_id:e.id,sequence:e.version+1,kind,details:copy(details),
      prev_hash:e.history.length?e.history[e.history.length-1].hash:null};
    const hash=await sha256(stableJson(entry));
    // Recheck after async hashing: two callers must not append the same version.
    if(e.version!==entry.sequence-1)return denied('VERSION_CONFLICT');
    if(totalHistory>=maxHistory)return denied('HISTORY_CAPACITY_REACHED');
    e.history.push({...entry,hash});e.version++;
    totalHistory++;
    return candidate({event_id:e.id,version:e.version,entry_hash:hash});
  }
  function getEvent(idValue){return events.get(idValue);}
  function checkVersion(e,expectedVersion){
    return !Number.isInteger(expectedVersion)||expectedVersion!==e.version?'VERSION_CONFLICT':null;
  }
  function registerDomain(record){
    if(!exact(record,['domain_id','contract_revision','description'])||
      !id(record.domain_id)||!id(record.contract_revision)||
      (record.description!==undefined&&!canText(record.description)))return denied('DOMAIN_CONTRACT_INVALID');
    const existing=domains.get(record.domain_id);
    if(existing)return stableJson(existing)===stableJson(record)?
      candidate({domain_id:record.domain_id,operation:'EXISTING_DOMAIN'}):denied('DOMAIN_ID_CONFLICT');
    if(domains.size>=maxDomains)return denied('DOMAIN_CAPACITY_REACHED');
    domains.set(record.domain_id,copy(record));
    return candidate({domain_id:record.domain_id,operation:'DOMAIN_REGISTERED',execution:'NOT_RUN'});
  }
  // Rule catalogs are only versioned declarations; no user-provided JS is executed.
  function registerExpansionRule(record){
    if(!exact(record,['domain_id','rule_id','rule_version','kind','min_inputs','max_inputs','review_ref'])||
       !id(record.domain_id)||!id(record.rule_id)||!id(record.rule_version)||
       !EXPANSION_KINDS.includes(record.kind)||!id(record.review_ref)||
       !Number.isInteger(record.min_inputs)||record.min_inputs<2||
       !Number.isInteger(record.max_inputs)||record.max_inputs<record.min_inputs||
       record.max_inputs>maxInputs)return denied('EXPANSION_RULE_CONTRACT_INVALID');
    if(!domains.has(record.domain_id))return denied('DOMAIN_NOT_REGISTERED');
    const key=record.domain_id+':'+record.rule_id+'@'+record.rule_version;
    const prior=ruleManifests.get(key);
    if(prior)return stableJson(prior)===stableJson(record)?
      candidate({rule_key:key,operation:'DUPLICATE_IGNORED',executable:false}):
      denied('EXPANSION_RULE_ID_COLLISION');
    if(ruleManifests.size>=maxRuleManifests)return denied('RULE_CATALOG_CAPACITY_REACHED');
    ruleManifests.set(key,copy(record));
    return candidate({rule_key:key,operation:'RULE_CATALOGED',executable:false,
      implementation:'NOT_PRESENT',approval:'NOT_APPROVED'});
  }
  async function planExpansion(record){
    if(engineBlocked())return engineBlocked();
    if(!exact(record,['event_id','expected_version','rule_id','rule_version','input_ids','reason'])||
      !id(record.event_id)||!id(record.rule_id)||!id(record.rule_version)||
      !Array.isArray(record.input_ids)||!canText(record.reason))return denied('EXPANSION_PLAN_INVALID');
    const e=getEvent(record.event_id);if(!e)return denied('EVENT_NOT_FOUND');
    if(e.mode==='STOP')return denied('LOCAL_STOP_ACTIVE');
    const versionError=checkVersion(e,record.expected_version);
    if(versionError)return denied(versionError);
    const key=e.domain_id+':'+record.rule_id+'@'+record.rule_version;
    const m=ruleManifests.get(key);if(!m)return denied('RULE_NOT_CATALOGED');
    const inputs=record.input_ids;
    if(inputs.length<m.min_inputs||inputs.length>m.max_inputs||
      !inputs.every(id)||new Set(inputs).size!==inputs.length)return denied('EXPANSION_INPUTS_INVALID');
    // A referenced unknown can be explicitly registered as a gap. REDACTED and
    // missing/expired sources are never silently converted into successful input.
    for(const inputId of inputs){
      const source=engine.read(inputId);
      if(source.status!=='candidate_only')return denied('EXPANSION_INPUT_NOT_READABLE');
    }
    const out=await append(e,'EXPANSION_PLAN_CANDIDATE',{
      rule_key:key,kind:m.kind,inputs:copy(inputs),reason:record.reason,
      external_effect:'NONE',implementation:'NOT_PRESENT',approval:'NOT_APPROVED'
    });
    return out.status==='blocked'?out:{...out,rule_key:key,executable:false,
      implementation:'NOT_PRESENT',approval:'NOT_APPROVED'};
  }
  async function observe(record){
    if(!exact(record,['event_id','domain_id','source_id','revision','source_hash','baseline_ref'])||
      !id(record.event_id)||!id(record.domain_id)||!id(record.source_id)||
      !id(record.revision)||!HEX.test(record.source_hash)||
      (record.baseline_ref!==undefined&&!id(record.baseline_ref)))return denied('OBSERVATION_CONTRACT_INVALID');
    if(!domains.has(record.domain_id))return denied('DOMAIN_NOT_REGISTERED');
    const observed={...record};
    const old=events.get(record.event_id);
    if(old)return stableJson(old.observed)===stableJson(observed)?
      candidate({event_id:record.event_id,operation:'DUPLICATE_IGNORED',version:old.version}):
      denied('EVENT_ID_COLLISION');
    if(events.size>=maxEvents)return denied('EVENT_CAPACITY_REACHED');
    if(totalHistory>=maxHistory)return denied('HISTORY_CAPACITY_REACHED');
    const e={id:record.event_id,domain_id:record.domain_id,
      observed_revision:record.revision,observed_hash:record.source_hash,
      observed,mode:'OBSERVE',direction:null,version:0,history:[],notifications:new Map()};
    events.set(e.id,e);
    const out=await append(e,'OBSERVED',{source_id:record.source_id,revision:record.revision,
      source_hash:record.source_hash,baseline_ref:record.baseline_ref??null,
      attestation:'NOT_VERIFIED',baseline_approval:'NOT_APPROVED'});
    if(out.status==='blocked')events.delete(e.id);
    return out;
  }
  async function proposeBaseline(record){
    if(!exact(record,['event_id','expected_version','candidate_revision','candidate_hash','evidence_ref'])||
      !id(record.event_id)||!id(record.candidate_revision)||!HEX.test(record.candidate_hash)||
      !id(record.evidence_ref))return denied('BASELINE_PROPOSAL_INVALID');
    const e=getEvent(record.event_id);if(!e)return denied('EVENT_NOT_FOUND');
    const error=checkVersion(e,record.expected_version);if(error)return denied(error);
    return append(e,'BASELINE_CANDIDATE',{revision:record.candidate_revision,
      hash:record.candidate_hash,evidence_ref:record.evidence_ref,
      adoption:'NOT_APPROVED',authority:'none'});
  }
  async function proposeDirection(record){
    if(!exact(record,['event_id','expected_version','direction','reason'])||
      !id(record.event_id)||!DIRECTIONS.includes(record.direction)||!canText(record.reason))
      return denied('DIRECTION_CONTRACT_INVALID');
    const e=getEvent(record.event_id);if(!e)return denied('EVENT_NOT_FOUND');
    const error=checkVersion(e,record.expected_version);if(error)return denied(error);
    const out=await append(e,'DIRECTION_PROPOSED',{direction:record.direction,
      reason:record.reason,decision:'REVIEW_ONLY'});
    if(out.status!=='blocked')e.direction=record.direction;
    return out;
  }
  async function requestControl(record){
    if(!exact(record,['event_id','expected_version','action','operator_claim','grant_ref'])||
      !id(record.event_id)||!['START','PAUSE','STOP','RESUME','SET_TEST','SET_CONTROLLED'].includes(record.action)||
      !id(record.operator_claim)||!id(record.grant_ref))return denied('CONTROL_REQUEST_INVALID');
    const e=getEvent(record.event_id);if(!e)return denied('EVENT_NOT_FOUND');
    const error=checkVersion(e,record.expected_version);if(error)return denied(error);
    const out=await append(e,'CONTROL_REQUEST',{action:record.action,operator_claim:record.operator_claim,
      grant_ref:record.grant_ref,identity:'CLAIM_UNVERIFIED',grant:'NOT_VERIFIED',
      remote_action:'NOT_EXECUTED',remote_ack:'NOT_VERIFIED'});
    // Local STOP is allowed: it only disables this ephemeral candidate's compose().
    if(out.status!=='blocked'&&record.action==='STOP')e.mode='STOP';
    // START/RESUME/CONTROLLED never enable live work merely because a string was supplied.
    return out.status==='blocked'?out:{...out,local_mode:e.mode,remote_stop_confirmed:false};
  }
  async function recordReceiptClaim(record){
    if(!exact(record,['event_id','expected_version','receiver_claim','receipt_ref'])||
      !id(record.event_id)||!id(record.receiver_claim)||!id(record.receipt_ref))
      return denied('RECEIPT_CONTRACT_INVALID');
    const e=getEvent(record.event_id);if(!e)return denied('EVENT_NOT_FOUND');
    const error=checkVersion(e,record.expected_version);if(error)return denied(error);
    return append(e,'RECEIPT_CLAIM',{receiver_claim:record.receiver_claim,
      receipt_ref:record.receipt_ref,delivered:'NOT_VERIFIED',actual_ack:'NOT_VERIFIED'});
  }
  async function queueNotification(record){
    if(!exact(record,['event_id','expected_version','notification_id','kind','evidence_ref'])||
      !id(record.event_id)||!id(record.notification_id)||
      !NOTIFICATION_KINDS.includes(record.kind)||!id(record.evidence_ref))
      return denied('NOTIFICATION_CONTRACT_INVALID');
    const e=getEvent(record.event_id);if(!e)return denied('EVENT_NOT_FOUND');
    const existing=e.notifications.get(record.notification_id);
    if(existing)return existing.kind===record.kind&&existing.evidence_ref===record.evidence_ref?
      candidate({event_id:e.id,notification_id:record.notification_id,delivery:'NOT_SENT',
        operation:'DUPLICATE_IGNORED'}):denied('NOTIFICATION_ID_COLLISION');
    const error=checkVersion(e,record.expected_version);if(error)return denied(error);
    const out=await append(e,'NOTIFICATION_ENQUEUED',{notification_id:record.notification_id,
      kind:record.kind,evidence_ref:record.evidence_ref,delivery:'NOT_SENT'});
    if(out.status!=='blocked')e.notifications.set(record.notification_id,
      {kind:record.kind,evidence_ref:record.evidence_ref});
    return out.status==='blocked'?out:{...out,delivery:'NOT_SENT'};
  }
  async function registerSource({event_id,source}={}){
    if(engineBlocked())return engineBlocked();
    const e=getEvent(event_id);if(!e)return denied('EVENT_NOT_FOUND');
    if(e.mode==='STOP')return denied('LOCAL_STOP_ACTIVE');
    if(totalHistory>=maxHistory)return denied('HISTORY_CAPACITY_REACHED');
    const result=await engine.registerKnown(source);
    if(result.status!=='registered'&&result.status!=='reused')return result;
    if(engineQuarantined)return denied('ENGINE_STATE_QUARANTINED');
    const record=await append(e,'SYNTHETIC_SOURCE_REFERENCE',{source_id:source.id,
      revision:source.revision,source_hash:result.content_hash,
      evidence:'UNVERIFIED',authority:'none'});
    if(record.status==='blocked')engineQuarantined=true;
    return record.status==='blocked'?record:candidate({event_id,source_id:source.id,
      source_result:result.status,version:e.version});
  }
  async function registerGap({event_id,gap}={}){
    if(engineBlocked())return engineBlocked();
    const e=getEvent(event_id);if(!e)return denied('EVENT_NOT_FOUND');
    if(e.mode==='STOP')return denied('LOCAL_STOP_ACTIVE');
    if(totalHistory>=maxHistory)return denied('HISTORY_CAPACITY_REACHED');
    const result=await engine.registerGap(gap);
    if(result.status!=='registered')return result;
    if(engineQuarantined)return denied('ENGINE_STATE_QUARANTINED');
    const record=await append(e,'EXPLICIT_GAP_REGISTERED',{gap_id:gap.id,revision:gap.revision,
      state:gap.state,evidence:'UNVERIFIED'});
    if(record.status==='blocked')engineQuarantined=true;
    return record.status==='blocked'?record:candidate({event_id,gap_id:gap.id,version:e.version});
  }
  async function reviseGap({event_id,gap}={}){
    if(engineBlocked())return engineBlocked();
    const e=getEvent(event_id);if(!e)return denied('EVENT_NOT_FOUND');
    if(e.mode==='STOP')return denied('LOCAL_STOP_ACTIVE');
    if(totalHistory>=maxHistory)return denied('HISTORY_CAPACITY_REACHED');
    if(!exact(gap,['id','expectedRevision','revision','state','explanation_code','decision']))
      return denied('GAP_REVISION_CONTRACT_INVALID');
    const result=await engine.reviseGap(gap);
    if(result.status!=='revised')return result;
    if(engineQuarantined)return denied('ENGINE_STATE_QUARANTINED');
    const recorded=await append(e,'EXPLICIT_GAP_REVISED',{gap_id:gap.id,
      revision:gap.revision,state:gap.state,evidence:'UNVERIFIED'});
    if(recorded.status==='blocked')engineQuarantined=true;
    return recorded.status==='blocked'?recorded:
      candidate({event_id,gap_id:gap.id,version:e.version,stale_dependents:'MUST_REVALIDATE'});
  }
  async function compose({event_id,inputIds,rule,ruleVersion='1',context={},capabilities=[]}={}){
    if(engineBlocked())return engineBlocked();
    const e=getEvent(event_id);if(!e)return denied('EVENT_NOT_FOUND');
    if(e.mode==='STOP')return denied('LOCAL_STOP_ACTIVE');
    if(totalHistory>=maxHistory)return denied('HISTORY_CAPACITY_REACHED');
    // The V1.6 engine enforces fan-in/depth/unknown/restricted state and validity.
    const result=await engine.compose({inputIds,rule,ruleVersion,context,capabilities});
    if(!['created','reused','created_partial'].includes(result.status))return result;
    if(engineQuarantined)return denied('ENGINE_STATE_QUARANTINED');
    const recorded=await append(e,'COMPOSITION_CANDIDATE',{result_id:result.id,
      input_ids:copy(inputIds),rule,rule_version:ruleVersion,
      status:result.status,authority:'none',baseline_approval:'NOT_APPROVED'});
    if(recorded.status==='blocked'){engineQuarantined=true;return recorded;}
    return candidate({event_id,result_id:result.id,composition_status:result.status,
      version:e.version,computed:result.computed??(result.status!=='created_partial')});
  }
  function readComposition(resultId,opts){return engineQuarantined?denied('ENGINE_STATE_QUARANTINED'):engine.read(resultId,opts);}
  function readEvent(eventId){const e=getEvent(eventId);return e?view(e):denied('EVENT_NOT_FOUND');}
  function history(eventId){
    const e=getEvent(eventId);
    return e?candidate({event_id:e.id,entries:copy(e.history),signed:false,
      persistence:'IN_MEMORY_ONLY'}):denied('EVENT_NOT_FOUND');
  }
  async function verifyHistory(eventId){
    const e=getEvent(eventId);if(!e)return denied('EVENT_NOT_FOUND');
    let prior=null;
    for(let i=0;i<e.history.length;i++){
      const {hash,...entry}=e.history[i];
      if(entry.prev_hash!==prior||entry.sequence!==i+1||
         await sha256(stableJson(entry))!==hash)return denied('LOCAL_LEDGER_TAMPERED');
      prior=hash;
    }
    return candidate({event_id:eventId,checked_entries:e.history.length,local_chain_consistent:true,
      cryptographic_identity_verified:false,immutable_persistence:false});
  }
  return Object.freeze({registerDomain,registerExpansionRule,planExpansion,observe,proposeBaseline,proposeDirection,
    requestControl,recordReceiptClaim,queueNotification,registerSource,registerGap,
    reviseGap,compose,readComposition,readEvent,history,verifyHistory,
    stats:()=>candidate({domains:domains.size,events:events.size,history_entries:totalHistory,
      engine:engineQuarantined?null:engine.stats(),engine_quarantined:engineQuarantined,
      recovery:engineQuarantined?'RESTART_OR_RECONCILIATION_REQUIRED':'NOT_REQUIRED',auto_recovered:false,
      rule_manifests:ruleManifests.size,external_dispatch:false,approved_baselines:0})});
}
