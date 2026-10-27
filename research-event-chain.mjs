/* Isolated dual-system diagnostics. Synthetic research fixture only.
 * No network, trades, private memory, persistent writes, or AI automation. */
import {checkedNodeId} from './research-context-bridge.mjs';
export const CHAIN_SCHEMA='brain.research-events.v0.1';
export const DOMAINS=Object.freeze({FIRST_BRAIN:'first_brain',WORLD_MODEL:'world_model',CONNECTION:'integration'});
const ID=/^[a-z0-9_.:-]{1,160}$/i;
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const KINDS=new Set(['hypothesis','observation','counterevidence','revision','branch']);
const ALLOWED_PROVENANCE=new Set(['synthetic_fixture','external_unverified']);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const goodId=x=>typeof x==='string'&&ID.test(x);
function dateOk(s){
 if(typeof s!=='string'||!ISO.test(s))return false;
 const d=new Date(s+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
}
export function validateEventChain(log){
 if(!Array.isArray(log)||log.length>200)return {ok:false,reason:'invalid_log',index:-1};
 const ids=new Map(),roots=new Set(),seenBranches=new Map(),versions=new Map();
 for(let i=0;i<log.length;i++){
  const e=log[i];
  const fail=reason=>({ok:false,reason,index:i});
  if(!record(e)||e.schema!==CHAIN_SCHEMA||!goodId(e.event_id)||ids.has(e.event_id)||
     !goodId(e.research_id)||!checkedNodeId(e.node_id)||!goodId(e.branch_id)||
     !KINDS.has(e.kind)||!Number.isSafeInteger(e.version)||e.version<1||
     typeof e.statement!=='string'||!e.statement.trim()||e.statement.length>600)
   return fail('event_shape_or_duplicate');
  if(!dateOk(e.observed_at)||!dateOk(e.recorded_at)||
     !(e.published_at===null||dateOk(e.published_at)))return fail('dates_invalid');
  if(!ALLOWED_PROVENANCE.has(e.provenance))return fail('provenance_invalid');
  if(e.published_at!==null&&e.published_at>e.recorded_at)return fail('future_publication_leak');
  if(e.kind==='observation'||e.kind==='counterevidence'){
   if(!e.published_at)return fail('missing_publication');
  }
  if(e.provenance==='synthetic_fixture'&&e.evidence_url)return fail('synthetic_cannot_claim_external_evidence');
  if(e.provenance==='external_unverified'&&e.evidence_url!==null){
   try{const u=new URL(e.evidence_url);if(u.protocol!=='https:')return fail('source_url_invalid');}
   catch(_){return fail('source_url_invalid');}
  }
  const next=(versions.get(e.research_id)||0)+1;
  if(e.version!==next)return fail('version_gap_or_rewrite');
  versions.set(e.research_id,next);
  if(e.kind==='hypothesis'){
   if(e.parent_event_id!==null||e.branch_id!=='main'||roots.has(e.research_id))
     return fail('hypothesis_must_be_unique_root');
   roots.add(e.research_id);
   seenBranches.set(e.research_id+':main',true);
  }else{
   const parent=ids.get(e.parent_event_id);
   if(!parent||parent.research_id!==e.research_id||parent.node_id!==e.node_id)
     return fail('parent_or_source_missing');
   if(e.recorded_at<parent.recorded_at)return fail('child_before_parent');
   if(e.kind==='branch'){
    if(e.branch_id===parent.branch_id||seenBranches.has(e.research_id+':'+e.branch_id))
      return fail('branch_must_be_new');
    seenBranches.set(e.research_id+':'+e.branch_id,true);
   }else{
    if(e.branch_id!==parent.branch_id)return fail('branch_lineage_mismatch');
   }
  }
  if(e.kind==='revision'&&(!goodId(e.parent_event_id)||typeof e.reason!=='string'||!e.reason.trim()))
   return fail('revision_reason_missing');
  ids.set(e.event_id,e);
 }
 return {ok:true,reason:'ok',index:-1,versions:Object.fromEntries(versions)};
}
export function appendResearchEvent(log,e){
 const current=validateEventChain(log);
 if(!current.ok)return {ok:false,reason:'existing_'+current.reason,log};
 // Clone both sides; caller cannot mutate the result by changing the input later.
 const next=JSON.parse(JSON.stringify([...log,e]));
 const check=validateEventChain(next);
 return check.ok?{ok:true,reason:'ok',log:next}:{ok:false,reason:check.reason,log};
}
export function knowledgeAt(log,asOf){
 if(!dateOk(asOf))return {ok:false,reason:'as_of_invalid'};
 const valid=validateEventChain(log);
 if(!valid.ok)return {ok:false,reason:'chain_'+valid.reason};
 const events=log.filter(e=>e.recorded_at<=asOf).map(e=>e.event_id);
 const publishedAvailable=log.filter(e=>(e.kind==='observation'||e.kind==='counterevidence')&&e.published_at<=asOf)
  .map(e=>e.event_id);
 return {ok:true,as_of:asOf,recordedEventIds:events,
  retrospectivelyAvailableEvidenceIds:publishedAvailable,
  reconstructedNotOriginalSnapshot:true};
}
export function diagnoseTwoSystems({brainRef,chain,expectedNodeId}){
 const check=validateEventChain(chain);
 const expected=checkedNodeId(expectedNodeId);
 const brainOK=!!expected&&brainRef?.status==='linked'&&brainRef?.node?.id===expected;
 const worldOK=check.ok;
 // Even a valid chain may refer to a different node than the selected brain context.
 const chainNodes=new Set(Array.isArray(chain)?chain.map(e=>e&&e.node_id):[]);
 const connected=brainOK&&worldOK&&chainNodes.size===1&&chainNodes.has(expected);
 const failures=[];
 if(!brainOK)failures.push(DOMAINS.FIRST_BRAIN);
 if(!worldOK)failures.push(DOMAINS.WORLD_MODEL);
 if(brainOK&&worldOK&&!connected)failures.push(DOMAINS.CONNECTION);
 return {firstBrain:brainOK?'PASS':'FAIL',worldModel:worldOK?'PASS':'FAIL',
  integration:connected?'PASS':'FAIL',failedDomains:failures,
  rootCauseStatus:failures.length?'isolated_by_domain':'no_failure_in_this_fixture',
  explanation:!brainOK?'missing_or_invalid_brain_node':!worldOK?check.reason:!connected?'source_id_mismatch':'synthetic_case_only'};
}
export function syntheticResearchCase(node_id='n_q1'){
 const b={schema:CHAIN_SCHEMA,research_id:'fixture:capital-risk',node_id,provenance:'synthetic_fixture',
   evidence_url:null,recorded_at:'2026-10-27'};
 return [
  {...b,event_id:'evt:h1',version:1,branch_id:'main',parent_event_id:null,
   kind:'hypothesis',statement:'合成假設：條件 X 必然令結果 Y 增加',observed_at:'2026-03-01',published_at:null},
  {...b,event_id:'evt:o1',version:2,branch_id:'main',parent_event_id:'evt:h1',
   kind:'observation',statement:'合成觀察：條件 X 曾出現',observed_at:'2026-03-10',published_at:'2026-04-10'},
  {...b,event_id:'evt:r1',version:3,branch_id:'main',parent_event_id:'evt:o1',
   kind:'revision',reason:'新增相反觀測需修正絕對描述',
   statement:'合成修正：條件 X 未必造成結果 Y',observed_at:'2026-10-27',published_at:null},
  {...b,event_id:'evt:b1',version:4,branch_id:'alternative',parent_event_id:'evt:h1',
   kind:'branch',statement:'合成分支：尋找其他解釋',observed_at:'2026-10-27',published_at:null},
  {...b,event_id:'evt:c1',version:5,branch_id:'alternative',parent_event_id:'evt:b1',
   kind:'counterevidence',statement:'合成反例：條件 X 存在但結果 Y 未增加',
   observed_at:'2026-06-01',published_at:'2026-07-15'}
 ];
}
