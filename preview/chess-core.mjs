/** Static, synthetic World-as-Chess demo. Does not authenticate, approve or execute. */
import {createTypedTransformEngine} from '../nary-transform.mjs';
import {createWorldChessLineage} from '../world-chess-lineage.mjs';

const GAP_STATES=new Set(['UNKNOWN','MISSING','UNVERIFIED','INTENTIONALLY_OPEN','NOT_APPLICABLE']);
const qty=value=>({kind:'quantity',value,unit:'MB',dimension:'data'});
const fail=reason=>({ok:false,decision:'HOLD',reason});

export async function runChessPreview({a=4,b=6,cState='UNKNOWN'}={}) {
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0||a>1_000_000||b>1_000_000)return fail('INTEGER_RANGE_REQUIRED');
  if(!GAP_STATES.has(cState))return fail('GAP_STATE_BLOCKED_OR_UNKNOWN');
  const typed=createTypedTransformEngine();
  const sources=[];
  for(const [id,value] of [['A',a],['B',b]]){
    const r=await typed.registerSource({id,revision:'r1',payload:qty(value)});
    if(r.status!=='registered')return fail('SOURCE_REGISTER_FAILED');
    sources.push({id,revision:'r1',content_hash:r.content_hash,available_at:'2026-11-08T12:00:00Z'});
  }
  const result=await typed.transform({inputIds:['A','B'],rule:'quantity_sum',context:{target_unit:'MB'}});
  if(result.status!=='created')return fail('RESULT_CREATE_FAILED');
  const read=typed.read(result.id);
  if(read.status!=='candidate_only')return fail('RESULT_READ_FAILED');
  const raw=read.packet.typed_result;
  if(raw.kind!=='quantity_result'||raw.unit!=='MB'||raw.value.denominator!=='1')return fail('RESULT_TYPE_INVALID');

  const chess=createWorldChessLineage();
  const board=await chess.freezeBoard({id:'S0',revision:'r1',as_of:'2026-11-08T13:00:00Z',
    reference_frame:{scale:'synthetic_demo',observer:'demo',unit:'MB'},source_refs:sources,
    gap_refs:[{id:'C',revision:'r1',state:cState}]});
  if(board.status!=='created')return fail(board.reason||'BOARD_REJECTED');
  for(const [branchId,label,intervention] of [
    ['baseline','hypothesis',{mode:'no_intervention'}],
    ['alternative','counterfactual',{mode:'hypothetical_alternative'}]
  ]){
    const fork=await chess.fork({boardId:board.id,branchId,label,intervention});
    if(fork.status!=='created')return fail('BRANCH_REJECTED');
  }
  const content={id:read.packet.id,content_hash:read.packet.content_hash,
    authority:read.packet.authority,evidence_certification:read.packet.evidence_certification,
    memory_approval:read.packet.memory_approval,real_ack:read.packet.real_ack};
  const alpha=await chess.recordMove({branchId:'baseline',stepId:'sum_A_B',content,sourceRefs:['A','B']});
  const beta=await chess.recordMove({branchId:'alternative',stepId:'sum_A_B',content,sourceRefs:['A','B']});
  if(alpha.status!=='recorded'||beta.status!=='recorded')return fail('EVENT_REJECTED');
  const comparison=chess.compareBranches('baseline','alternative');
  if(comparison.status!=='candidate_only')return fail('COMPARE_REJECTED');
  const first=chess.readEvent(alpha.id).packet;
  const second=chess.readEvent(beta.id).packet;
  if(first.derivation_event_id===second.derivation_event_id||first.result_content_id!==second.result_content_id)return fail('LINEAGE_COLLISION');
  return {
    ok:true,decision:'HOLD',phase:'SYNTHETIC_BRANCH_REFERENCE_ONLY',
    x:{value:`${raw.value.numerator} MB`,result_content_id:content.id},
    board_id:board.id,gap_state:cState,
    branches:[{name:'基準分支',id:first.branch_id,event_id:first.derivation_event_id},
      {name:'反事實分支',id:second.branch_id,event_id:second.derivation_event_id}],
    comparison:comparison.packet,
    provenance:{source_ids:sources.map(s=>s.id),source_hashes:sources.map(s=>s.content_hash),as_of:'2026-11-08T13:00:00Z'},
    audit:{authority:'none',source_independently_verified:false,memory_approval:'NOT_APPROVED',actual_execution:'NOT_EXECUTED',real_ack:'NOT_VERIFIED',persisted:false}
  };
}