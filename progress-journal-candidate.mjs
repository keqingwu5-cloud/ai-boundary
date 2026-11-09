/**
 * Per-project, per-stream progress journal. In-memory research candidate;
 * no real-world action, trusted timestamp, DB or memory writing.
 */
import {sha256,stableJson} from './nary-composition.mjs';
import {AUDIT_STREAMS,AUDIT_SECTORS} from './proof-audit-candidate.mjs';
export const JOURNAL_SCHEMA='firstbrain.project-progress.candidate.v0.1';
export const PROGRESS_STATES=Object.freeze(['PLANNED','IN_PROGRESS','DELAYED','BLOCKED','COMPLETED']);
const ID=/^[A-Za-z0-9_.:-]{1,100}$/,CODE=/^[A-Z][A-Z0-9_]{0,59}$/,DATE=/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const id=x=>typeof x==='string'&&ID.test(x);
const code=x=>typeof x==='string'&&CODE.test(x);
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const exact=(o,keys)=>isObject(o)&&Object.keys(o).every(k=>keys.includes(k));
const clone=x=>JSON.parse(JSON.stringify(x));
const validPercent=x=>Number.isInteger(x)&&x>=0&&x<=100;
const denied=reason=>({status:'blocked',reason,decision:'HOLD',authority:'none'});
const candidate=(fields={})=>({status:'candidate_only',decision:'HOLD',authority:'none',identity_verified:false,review_approved:false,...fields});
function dateNum(s){
  if(typeof s!=='string'||!DATE.test(s))return null;
  const [y,m,d]=s.split('-').map(Number);
  if(y<2000||y>2100)return null;
  const ts=Date.UTC(y,m-1,d);
  return new Date(ts).toISOString().slice(0,10)===s?ts:null;
}
const days=(a,b)=>Math.round((dateNum(b)-dateNum(a))/86400000);
export function createProgressJournals({audit,maxJournals=512,maxEntries=8192}={}){
  if(!audit||typeof audit.readProof!=='function'||typeof audit.verifyProof!=='function')throw Error('AUDIT_INTERFACE_REQUIRED');
  if(!Number.isInteger(maxJournals)||maxJournals<1||maxJournals>10000||
     !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>100000)throw Error('LIMIT_INVALID');
  const journals=new Map(),paths=new Map();let total=0;
  function pinned(j){
    const p=audit.readProof(j.proof_id);
    return p.status==='candidate_only'&&!p.control_snapshot_stale&&
      p.revision===j.proof_revision&&p.event_id===j.event_id&&p.sector===j.sector;
  }
  function read(j){
    const last=j.entries.at(-1),now=last?.details??null;
    return candidate({schema:JOURNAL_SCHEMA,journal_id:j.journal_id,project_id:j.project_id,
      proof_id:j.proof_id,event_id:j.event_id,sector:j.sector,stream:j.stream,
      proof_revision:j.proof_revision,expected_start:j.expected_start,
      expected_due:j.expected_due,plan_ref:j.plan_ref,revision:j.version,
      expected_progress_percent:now?.expected_percent??0,
      actual_progress_percent:now?.actual_percent??0,
      progress_status:now?.progress_status??'PLANNED',
      last_observed_on:now?.observed_on??null,forecast_due:now?.forecast_due??j.expected_due,
      delay_reason_code:now?.delay_reason_code??null,next_action_code:now?.next_action_code??null,
      days_shifted:days(j.expected_due,now?.forecast_due??j.expected_due),
      completed_on:now?.completed_on??null,evidence_ref:now?.evidence_ref??j.plan_ref,
      snapshot_stale:!pinned(j),entries:clone(j.entries),
      history_head_hash:last?.hash??null,persistence:'IN_MEMORY_ONLY',notification:'NOT_SENT'});
  }
  async function append(j,kind,data){
    if(total>=maxEntries)return denied('JOURNAL_ENTRY_CAPACITY');
    if(!pinned(j))return denied('PROOF_SNAPSHOT_STALE');
    const index=j.version+1;
    const record={journal_id:j.journal_id,sequence:index,kind,
      details:clone(data),prev_hash:j.entries.at(-1)?.hash??null};
    const hash=await sha256(stableJson(record));
    if(j.version!==index-1)return denied('JOURNAL_VERSION_CONFLICT');
    if(!pinned(j))return denied('PROOF_SNAPSHOT_STALE');
    if(total>=maxEntries)return denied('JOURNAL_ENTRY_CAPACITY');
    j.entries.push({...record,hash});j.version++;total++;
    return candidate({journal_id:j.journal_id,revision:j.version,entry_hash:hash});
  }
  async function createJournal(input){
    if(!exact(input,['journal_id','project_id','proof_id','sector','stream','expected_start','expected_due','plan_ref'])||
      !id(input.journal_id)||!id(input.project_id)||!id(input.proof_id)||
      !AUDIT_SECTORS.includes(input.sector)||!AUDIT_STREAMS.includes(input.stream)||
      dateNum(input.expected_start)===null||dateNum(input.expected_due)===null||
      days(input.expected_start,input.expected_due)<0||!id(input.plan_ref))
      return denied('JOURNAL_PLAN_INVALID');
    const proof=audit.readProof(input.proof_id);
    if(proof.status!=='candidate_only')return denied('PROOF_NOT_FOUND');
    if(proof.sector!==input.sector||proof.control_snapshot_stale)return denied('PROOF_SECTOR_OR_SNAPSHOT_MISMATCH');
    const existing=journals.get(input.journal_id);
    if(existing)return stableJson(existing.plan)===stableJson(input)?
      candidate({journal_id:input.journal_id,operation:'DUPLICATE_IGNORED',revision:existing.version}):
      denied('JOURNAL_ID_COLLISION');
    const unique=input.proof_id+'|'+input.project_id+'|'+input.stream;
    if(paths.has(unique))return denied('PROOF_PROJECT_STREAM_COLLISION');
    if(journals.size>=maxJournals)return denied('JOURNAL_CAPACITY');
    const chain=await audit.verifyProof(input.proof_id);
    if(chain.local_chain_consistent!==true)return denied('PROOF_LOCAL_CHAIN_INVALID');
    const j={...clone(input),plan:clone(input),event_id:proof.event_id,
      proof_revision:proof.revision,version:0,entries:[]};
    if(journals.has(j.journal_id))return denied('JOURNAL_ID_COLLISION');
    journals.set(j.journal_id,j);
    const added=await append(j,'PLAN_REGISTERED',{
      expected_start:j.expected_start,expected_due:j.expected_due,plan_ref:j.plan_ref,
      observed_on:null,expected_percent:0,actual_percent:0,progress_status:'PLANNED',
      forecast_due:j.expected_due,delay_reason_code:null,next_action_code:'PLAN_PENDING',
      completed_on:null,evidence_ref:j.plan_ref,recorded_by_claim:'PLAN_AUTHOR_UNKNOWN'
    });
    if(added.status==='blocked'){journals.delete(j.journal_id);return added;}
    paths.set(unique,j.journal_id);
    return added;
  }
  async function recordProgress(x){
    if(!exact(x,['journal_id','expected_revision','observed_on','expected_percent','actual_percent',
      'progress_status','forecast_due','delay_reason_code','next_action_code',
      'evidence_ref','recorded_by_claim','completed_on'])||
      !id(x.journal_id)||!Number.isInteger(x.expected_revision)||
      dateNum(x.observed_on)===null||dateNum(x.forecast_due)===null||
      !validPercent(x.expected_percent)||!validPercent(x.actual_percent)||
      !PROGRESS_STATES.includes(x.progress_status)||
      !(x.delay_reason_code===null||code(x.delay_reason_code))||
      !code(x.next_action_code)||!id(x.evidence_ref)||!id(x.recorded_by_claim)||
      !(x.completed_on===null||dateNum(x.completed_on)!==null))
      return denied('PROGRESS_RECORD_INVALID');
    const j=journals.get(x.journal_id);if(!j)return denied('JOURNAL_NOT_FOUND');
    if(j.version!==x.expected_revision)return denied('JOURNAL_VERSION_CONFLICT');
    const prev=j.entries.at(-1)?.details;
    if(days(j.expected_start,x.observed_on)<0||days(j.expected_start,x.forecast_due)<0||
      (prev?.observed_on&&days(prev.observed_on,x.observed_on)<0))
      return denied('DATE_ORDER_INVALID');
    const shifted=days(j.expected_due,x.forecast_due)>0;
    const overdue=days(j.expected_due,x.observed_on)>0&&x.actual_percent<100;
    const completed=x.progress_status==='COMPLETED';
    if(x.progress_status==='DELAYED'){
      if(!x.delay_reason_code||!(shifted||overdue))return denied('DELAY_EVIDENCE_OR_DATE_REQUIRED');
    }else if(shifted||overdue){
      if(!completed||!x.delay_reason_code)return denied('UNACKNOWLEDGED_DELAY');
    }else if(x.delay_reason_code!==null)return denied('UNJUSTIFIED_DELAY_REASON');
    if(completed){
      if(x.actual_percent!==100||!x.completed_on||days(x.completed_on,x.observed_on)<0||
         days(j.expected_start,x.completed_on)<0)return denied('COMPLETION_CONTRACT_INVALID');
    }else if(x.actual_percent===100||x.completed_on!==null)return denied('COMPLETION_CONTRACT_INVALID');
    if(prev&&x.actual_percent<prev.actual_percent)return denied('PROGRESS_REGRESSION_REQUIRES_NEW_PLAN');
    if(prev?.progress_status==='COMPLETED')return denied('COMPLETED_JOURNAL_IMMUTABLE');
    return append(j,'PROGRESS_OBSERVATION',{
      observed_on:x.observed_on,expected_percent:x.expected_percent,
      actual_percent:x.actual_percent,progress_status:x.progress_status,
      forecast_due:x.forecast_due,delay_reason_code:x.delay_reason_code,
      next_action_code:x.next_action_code,evidence_ref:x.evidence_ref,
      recorded_by_claim:x.recorded_by_claim,completed_on:x.completed_on,
      verification:'NOT_VERIFIED',identity:'CLAIM_ONLY'
    });
  }
  function readJournal(journal_id){const j=journals.get(journal_id);return j?read(j):denied('JOURNAL_NOT_FOUND');}
  async function verifyJournal(journal_id){
    const j=journals.get(journal_id);if(!j)return denied('JOURNAL_NOT_FOUND');
    let previous=null;
    for(let i=0;i<j.entries.length;i++){
      const {hash,...record}=j.entries[i];
      if(record.sequence!==i+1||record.prev_hash!==previous||
         await sha256(stableJson(record))!==hash)return denied('LOCAL_JOURNAL_CHAIN_INVALID');
      previous=hash;
    }
    return candidate({journal_id,local_chain_consistent:true,checked_entries:j.entries.length,
      proof_snapshot_stale:!pinned(j),durable:false,trusted_clock:false});
  }
  function folderFor(journal_id){
    const j=journals.get(journal_id);if(!j)return denied('JOURNAL_NOT_FOUND');
    return candidate({journal_id,relative_folder:'logs/'+j.sector+'/'+j.project_id+'/'+j.stream,
      physical_storage:'NOT_CONFIGURED',saved_to_disk:false});
  }
  function listProject({project_id,sector}={}){
    if(!id(project_id)||!AUDIT_SECTORS.includes(sector))return denied('PROJECT_FILTER_INVALID');
    return candidate({project_id,sector,journals:[...journals.values()]
      .filter(j=>j.project_id===project_id&&j.sector===sector)
      .map(j=>({journal_id:j.journal_id,proof_id:j.proof_id,stream:j.stream,
        revision:j.version,progress_status:j.entries.at(-1)?.details.progress_status??'PLANNED'}))});
  }
  return Object.freeze({createJournal,recordProgress,readJournal,verifyJournal,
    folderFor,listProject,stats:()=>candidate({journals:journals.size,entries:total,
      disk_write:false,independent_review_verified:false})});
}
