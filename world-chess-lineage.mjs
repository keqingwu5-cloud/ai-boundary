/** World-as-Chess derivation ledger — isolated, in-memory, no authority, no execution.
 * The same reusable N-ary content may be used by distinct branches. Each branch
 * has its own event history. All identities and capabilities are caller-claimed.
 */
import {sha256, stableJson} from './nary-composition.mjs';

export const LINEAGE_SCHEMA='firstbrain.world-chess.lineage.preview.v1';
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const HASH=/^[0-9a-f]{64}$/;
const NARY_ID=/^(?:cmp|gapcmp):[0-9a-f]{64}$/;
const LABELS=new Set(['hypothesis','action_candidate','counterfactual']);
const GAP_STATES=new Set(['MISSING','UNKNOWN','UNVERIFIED','INTENTIONALLY_OPEN','NOT_APPLICABLE','REDACTED']);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const id=x=>typeof x==='string'&&ID.test(x);
const exactly=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const copy=x=>JSON.parse(JSON.stringify(x));
const blocked=reason=>({status:'blocked',decision:'HOLD',reason,packet:null});
const ok=packet=>({status:'candidate_only',decision:'HOLD',packet:copy(packet)});
const parseTime=x=>{
  if(typeof x!=='string'||!/^(?:\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/.test(x))return null;
  const n=Date.parse(x);return Number.isFinite(n)?n:null;
};
const unique=x=>Array.isArray(x)&&new Set(x).size===x.length;
function checkInputs(x) {
  try {const raw=stableJson(x);return raw.length<=128*1024;}catch{return false;}
}
function refsValid(xs,asOf) {
  return Array.isArray(xs)&&xs.length<=128&&unique(xs.map(x=>x?.id))&&xs.every(x=>
    exactly(x,['id','revision','content_hash','available_at'])&&id(x.id)&&id(x.revision)&&
    HASH.test(x.content_hash)&&parseTime(x.available_at)!==null&&parseTime(x.available_at)<=asOf);
}
function gapsValid(xs) {
  return Array.isArray(xs)&&xs.length<=128&&unique(xs.map(x=>x?.id))&&xs.every(x=>
    exactly(x,['id','revision','state'])&&id(x.id)&&id(x.revision)&&GAP_STATES.has(x.state));
}
function boundary(b) {
  if(!exactly(b,['id','revision','as_of','reference_frame','source_refs','gap_refs']))return 'BOARD_INVALID';
  if(!id(b.id)||!id(b.revision)||parseTime(b.as_of)===null)return 'BOARD_INVALID';
  if(!plain(b.reference_frame)||!checkInputs(b.reference_frame)||
     Object.keys(b.reference_frame).some(k=>!['scale','observer','domain','population','unit','effective_at'].includes(k))||
     Object.values(b.reference_frame).some(v=>typeof v!=='string'||v.length>300))return 'REFERENCE_FRAME_INVALID';
  if(Object.hasOwn(b.reference_frame,'effective_at')&&(parseTime(b.reference_frame.effective_at)===null||parseTime(b.reference_frame.effective_at)>parseTime(b.as_of)))return 'REFERENCE_FRAME_INVALID';
  if(!refsValid(b.source_refs,parseTime(b.as_of)))return 'SOURCE_OR_TIME_INVALID';
  // Do not even expose IDs of restricted gaps from the preview.
  if(Array.isArray(b.gap_refs)&&b.gap_refs.some(g=>g?.state==='REDACTED'))return 'ACCESS_DENIED_OR_UNAVAILABLE';
  if(!gapsValid(b.gap_refs))return 'GAP_INVALID';
  if(b.source_refs.some(s=>b.gap_refs.some(g=>g.id===s.id)))return 'SOURCE_GAP_NAMESPACE_CONFLICT';
  if(!checkInputs(b))return 'BOARD_TOO_LARGE_OR_UNSAFE';
  return null;
}
function deriveResultValid(r) {
  return exactly(r,['id','content_hash','authority','evidence_certification','memory_approval','real_ack'])&&
    NARY_ID.test(r.id)&&HASH.test(r.content_hash)&&
    r.authority==='none'&&r.evidence_certification==='UNVERIFIED'&&
    r.memory_approval==='NOT_APPROVED'&&r.real_ack==='NOT_VERIFIED';
}
export function createWorldChessLineage({maxBoards=16,maxBranches=128,maxMoves=1024}={}) {
  if(!Number.isSafeInteger(maxBoards)||maxBoards<1||maxBoards>64||
     !Number.isSafeInteger(maxBranches)||maxBranches<1||maxBranches>512||
     !Number.isSafeInteger(maxMoves)||maxMoves<1||maxMoves>4096)throw Error('ENGINE_LIMITS_INVALID');
  const boards=new Map(),branches=new Map(),events=new Map();
  async function freezeBoard(board) {
    const error=boundary(board);if(error)return blocked(error);
    const fingerprint=await sha256(stableJson(board));
    const frozenId='board:'+fingerprint;
    if(boards.has(frozenId))return {status:'reused',decision:'HOLD',id:frozenId};
    if(boards.size>=maxBoards)return blocked('BOARD_CAPACITY');
    boards.set(frozenId,copy(board));
    return {status:'created',decision:'HOLD',id:frozenId,board_fingerprint:fingerprint};
  }
  async function fork({boardId,branchId,label,assumptions=[],intervention={}}={}) {
    if(typeof boardId!=='string'||!/^board:[0-9a-f]{64}$/.test(boardId)||!id(branchId)||!LABELS.has(label)||
       !boards.has(boardId)||!Array.isArray(assumptions)||assumptions.length>16||
       assumptions.some(x=>typeof x!=='string'||x.length>300)||!plain(intervention)||!checkInputs(intervention))return blocked('BRANCH_INVALID');
    if(branches.has(branchId))return blocked('BRANCH_ID_REUSED');
    if(branches.size>=maxBranches)return blocked('BRANCH_CAPACITY');
    const fingerprint=await sha256(stableJson({boardId,branchId,label,assumptions,intervention}));
    branches.set(branchId,{id:branchId,boardId,label,assumptions:copy(assumptions),intervention:copy(intervention),fingerprint,steps:new Map()});
    return {status:'created',decision:'HOLD',id:branchId,board_id:boardId};
  }
  async function recordMove({branchId,stepId,content,sourceRefs=[],gapRefs=[]}={}) {
    const branch=branches.get(branchId);
    if(!branch||!id(stepId)||!deriveResultValid(content)||
       !unique(sourceRefs)||!sourceRefs.every(id)||!unique(gapRefs)||!gapRefs.every(id))return blocked('MOVE_INVALID');
    const board=boards.get(branch.boardId);
    if(!sourceRefs.every(r=>board.source_refs.some(s=>s.id===r)) ||
       !gapRefs.every(r=>board.gap_refs.some(g=>g.id===r)))return blocked('MOVE_REFERENCE_NOT_ON_BOARD');
    if(events.size>=maxMoves&&!branch.steps.has(stepId))return blocked('MOVE_CAPACITY');
    // Idempotent retries of the same exact step are safe. Conflicting payloads fail closed.
    const input={schema:LINEAGE_SCHEMA,board_id:branch.boardId,branch_id:branchId,
      branch_fingerprint:branch.fingerprint,step_id:stepId,result_content_id:content.id,
      result_content_hash:content.content_hash,source_refs:[...sourceRefs],gap_refs:[...gapRefs]};
    const eventHash=await sha256(stableJson(input));
    const existing=branch.steps.get(stepId);
    if(existing){if(existing.packet_hash!==eventHash)return blocked('STEP_ID_REUSED_WITH_DIFFERENT_CONTENT');
      return {status:'reused',decision:'HOLD',id:existing.derivation_event_id};}
    const event={...input,derivation_event_id:'move:'+eventHash,packet_hash:eventHash,
      authority:'none',evidence_certification:'UNVERIFIED',memory_approval:'NOT_APPROVED',
      actual_execution:'NOT_EXECUTED',real_ack:'NOT_VERIFIED'};
    branch.steps.set(stepId,event);events.set(event.derivation_event_id,event);
    return {status:'recorded',decision:'HOLD',id:event.derivation_event_id,
      result_content_id:content.id};
  }
  function readEvent(eventId) {
    if(typeof eventId!=='string'||!/^move:[0-9a-f]{64}$/.test(eventId))return blocked('EVENT_ID_INVALID');
    const event=events.get(eventId);return event?ok(event):blocked('EVENT_NOT_FOUND');
  }
  function compareBranches(a,b) {
    const left=branches.get(a),right=branches.get(b);
    if(!left||!right)return blocked('BRANCH_NOT_FOUND');
    if(left.boardId!==right.boardId)return blocked('BASELINE_BOARD_MISMATCH');
    return ok({schema:LINEAGE_SCHEMA,kind:'branch_comparison',board_id:left.boardId,
      branches:[a,b],left_events:[...left.steps.values()].map(x=>x.derivation_event_id),
      right_events:[...right.steps.values()].map(x=>x.derivation_event_id),
      authority:'none',evidence_certification:'UNVERIFIED',memory_approval:'NOT_APPROVED',
      actual_execution:'NOT_EXECUTED',real_ack:'NOT_VERIFIED'});
  }
  return Object.freeze({freezeBoard,fork,recordMove,readEvent,compareBranches,stats:()=>({boards:boards.size,branches:branches.size,events:events.size,authority:'none'})});
}