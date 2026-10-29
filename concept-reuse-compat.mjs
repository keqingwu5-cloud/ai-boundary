/* Pure read-only adapter for existing First Brain ↔ world-model data.
 * PREVIEW ONLY. Does not implement a new concept store, migration or acceptance.
 * Old PR #13/#28 gates can consume a manual candidate after independent integration.
 */
import {readWorldLedger,JOURNAL_SCHEMA} from './world-verification-ledger.mjs';
import {checkedNodeId} from './research-context-bridge.mjs';
const idOk=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(x);
const preview=(status,reason,packet=null)=>({status,reason,packet});
export const CLAIM_PREVIEW_SCHEMA='tcvl.claim-ref-preview.v0.1';
export function previewWorldClaimReference({storage,brainRef,recordId}={}){
 if(!idOk(recordId))return preview('blocked','record_id_invalid');
 // The graph must already have been validated by readNodeContext(), not guessed from a URL.
 if(brainRef?.status!=='linked'||!checkedNodeId(brainRef?.node?.id))
   return preview('blocked','first_brain_not_linked');
 const ledger=readWorldLedger(storage);
 if(!ledger.ok)return preview('blocked','world_model_'+ledger.reason);
 const row=ledger.rows.find(x=>x.id===recordId);
 if(!row)return preview('blocked','world_model_record_missing_or_removed');
 const edits=ledger.events.filter(e=>e.recordId===recordId);
 // Legacy v1 / snapshot imports have no trustworthy record-level node provenance.
 if(!edits.length||edits[0].type!=='create')
   return preview('unlinked','no_record_creation_origin');
 const nodeId=brainRef.node.id;
 if(edits.some(e=>e.sourceNodeId!==nodeId))
   return preview('blocked','source_identity_missing_or_changed');
 const latest=edits.at(-1);
 // An unknown external URL is a reference hint, NOT independently verified evidence.
 return preview('candidate_only','mapping_needs_review',{
  schema:CLAIM_PREVIEW_SCHEMA,
  node_id:nodeId,
  claim_locator:{system:JOURNAL_SCHEMA,external_id:recordId,canonical_id:null},
  statement:row.hypothesis,
  classification:'hypothesis',
  falsifier:row.falsifier,
  research_status:row.status,
  source_url_hint:typeof row.source==='string'?row.source:'',
  evidence_refs:[],
  source_independently_verified:false,
  causal_relation:'not_proven',
  context_relation:{type:'context_reference',from:nodeId,to:recordId},
  source_event_id:latest.eventId,
  journal_version:latest.version,
  claim_revision_id:null,
  proposed_on:row.createdOn,
  recorded_at:latest.at,
  approval:'candidate_only',
  provenance:'local_manual_unverified'
 });
}
export function legacyTcvlCandidateInput(result,{candidateId='',enteredAt=''}={}){
 if(result?.status!=='candidate_only'||!result.packet)
   return {ok:false,reason:'preview_unavailable',candidate:null};
 const p=result.packet;
 if(!idOk(candidateId)||candidateId.length>80||
    typeof enteredAt!=='string'||!Number.isFinite(Date.parse(enteredAt)))
   return {ok:false,reason:'manual_identity_and_timestamp_required',candidate:null};
 if(p.claim_locator.external_id.length>110)
   return {ok:false,reason:'source_ref_too_long',candidate:null};
 // Compatible INPUT to PR #28 TcvlCandidateCore.candidate(), not a core memory item.
 // Leave highlight/comparison and causal/evidence empty to FORCE later review.
 const candidate={
  id:candidateId,kind:'research',title:p.statement.slice(0,160),
  summary:p.statement.slice(0,1200),
  highlight:'',comparison:'',context:'',uncertainties:'來源網址與因果均未獨立核實',
  sources:[p.claim_locator.system+':'+p.claim_locator.external_id],
  evidence_refs:[],
  links:{
   context:{state:'linked',refs:[p.node_id],reason:'已驗證本機節點 ID；不是因果'},
   memory:{state:'missing',refs:[],reason:'未經 GPT② 記憶審查'},
   causal:{state:'missing',refs:[],reason:'因果未驗證'}
  },
  origin_status:'candidate_unverified',
  entered_at:enteredAt
 };
 return {ok:true,reason:'manual_candidate_input_only',candidate};
}
