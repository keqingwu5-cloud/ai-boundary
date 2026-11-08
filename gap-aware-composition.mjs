/**
 * First Brain V1.6 — explicit blanks/unknowns retained across N-ary compositions.
 * Research-only, in-memory, no trusted identity, no authority, no remote ACK.
 * Extends V1.5 typed transformations without changing V1.4/V1.5.
 * NOTE: source IDs, version tags and capabilities are caller-declared, NOT attested.
 */
import {createTypedTransformEngine,TRANSFORM_RULES} from './nary-transform.mjs';
import {sha256,stableJson} from './nary-composition.mjs';

export const GAP_SCHEMA='firstbrain.nary-gap-aware.preview.v1';
export const GAP_STATES=Object.freeze(['MISSING','UNKNOWN','UNVERIFIED','INTENTIONALLY_OPEN','NOT_APPLICABLE','REDACTED']);
const states=new Set(GAP_STATES);
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const idOk=x=>typeof x==='string'&&ID.test(x);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const copy=x=>JSON.parse(JSON.stringify(x));
const blocked=reason=>({status:'blocked',decision:'HOLD',reason,packet:null});
const ok=packet=>({status:'candidate_only',decision:'HOLD',packet});
const pendingRules=new Set([...TRANSFORM_RULES,'collect_refs','derive_candidate','compare_refs','sequence_refs']);
const unique=arr=>[...new Set(arr)];

/** An instance is a scoped, ephemeral registry, not a shared authoritative store. */
export function createGapAwareEngine({maxInputs=32,maxGaps=512,maxCompositions=2500,maxDepth=24}={}){
  if(!Number.isInteger(maxInputs)||maxInputs<2||maxInputs>32||!Number.isInteger(maxGaps)||maxGaps<1||maxGaps>10000||!Number.isInteger(maxCompositions)||maxCompositions<1||maxCompositions>50000||!Number.isInteger(maxDepth)||maxDepth<1||maxDepth>64)
    throw Error('ENGINE_LIMIT_INVALID');
  const typed=createTypedTransformEngine({maxInputs});
  const gaps=new Map(); const known=new Map(); const compositions=new Map(); const history=new Map(); const seenVersions=new Map();
  let reused=0,created=0;
  const sourceLike=x=>idOk(x)&&!x.startsWith('cmp:')&&!x.startsWith('gapcmp:');

  async function gapFingerprint(g){
    return sha256(stableJson({schema:GAP_SCHEMA,id:g.id,revision:g.revision,state:g.state,explanation_code:g.explanation_code}));
  }
  function checkCode(c){return c===null||(typeof c==='string'&&/^[A-Z0-9_]{1,60}$/.test(c));}
  function track(id,record){if(!history.has(id))history.set(id,[]);history.get(id).push(copy(record));}
  function hasTyped(id){return known.has(id)||typed.read(id).status==='candidate_only';}
  async function registerGap({id,revision,state,explanation_code=null,...extra}={}){
    if(!sourceLike(id)||!idOk(revision)||!states.has(state)||!checkCode(explanation_code)||Object.keys(extra).length)
      return blocked('GAP_CONTRACT_INVALID');
    if(gaps.has(id)||compositions.has(id)||hasTyped(id))return blocked('ID_ALREADY_REGISTERED');
    if(gaps.size>=maxGaps)return blocked('GAP_LIMIT');
    const g={id,revision,state,explanation_code}; g.fingerprint=await gapFingerprint(g);
    gaps.set(id,g);seenVersions.set(id,new Set([revision]));track(id,{revision,state,transition:'REGISTERED'});
    return {status:'registered',decision:'HOLD',id};
  }
  async function reviseGap({id,expectedRevision,revision,state,explanation_code=null,decision=null,...extra}={}){
    if(!sourceLike(id)||!idOk(expectedRevision)||!idOk(revision)||!states.has(state)||!checkCode(explanation_code)||Object.keys(extra).length)return blocked('GAP_CONTRACT_INVALID');
    const current=gaps.get(id);if(!current)return blocked('GAP_NOT_FOUND');
    if(current.state==='REDACTED'||state==='REDACTED')return blocked('ACCESS_DENIED_OR_UNAVAILABLE');
    if(current.revision!==expectedRevision)return blocked('STALE_EXPECTED_REVISION');
    if(seenVersions.get(id).has(revision))return blocked('REVISION_REUSE_OR_ROLLBACK');
    if(current.state==='INTENTIONALLY_OPEN'&&decision!=='explicit_user_choice')return blocked('INTENTIONAL_BLANK_REQUIRES_DECISION');
    const g={id,revision,state,explanation_code};g.fingerprint=await gapFingerprint(g);
    gaps.set(id,g);seenVersions.get(id).add(revision);track(id,{revision,state,transition:'REVISED',from:expectedRevision});
    return {status:'revised',decision:'HOLD',id};
  }
  async function registerKnown(data){
    if(!plain(data)||!sourceLike(data.id)||gaps.has(data.id)||compositions.has(data.id))return blocked('KNOWN_SOURCE_ID_CONFLICT');
    const result=await typed.registerSource(data);
    if(result.status==='registered'||result.status==='reused'){
      const fields=data.payload?.kind==='record'&&plain(data.payload.fields)?data.payload.fields:null;
      known.set(data.id,{id:data.id,revision:data.revision,fingerprint:result.content_hash,
        capabilities:[...(data.capabilities||[])],
        recordFields:fields?Object.keys(fields):null,
        nullFields:fields?Object.keys(fields).filter(k=>fields[k]===null):[]});
    }
    return result;
  }
  /** Explicit user choice protects intentionally open blanks; evidenceRef is not proof of authenticity. */
  async function resolveGap({id,expectedRevision,revision,payload,evidenceRef,decision=null,capabilities=[]}={}){
    if(!sourceLike(id)||!idOk(expectedRevision)||!idOk(revision)||!idOk(evidenceRef))return blocked('RESOLUTION_CONTRACT_INVALID');
    const current=gaps.get(id);if(!current)return blocked('GAP_NOT_FOUND');
    if(current.state==='REDACTED')return blocked('ACCESS_DENIED_OR_UNAVAILABLE');
    if(current.revision!==expectedRevision)return blocked('STALE_EXPECTED_REVISION');
    if(seenVersions.get(id).has(revision))return blocked('REVISION_REUSE_OR_ROLLBACK');
    if(current.state==='INTENTIONALLY_OPEN'&&decision!=='explicit_user_choice')return blocked('INTENTIONAL_BLANK_REQUIRES_DECISION');
    // No write to original history or any remote memory. A supplied value is still UNVERIFIED.
    const result=await typed.registerSource({id,revision,payload,capabilities});
    if(result.status!=='registered')return result;
    gaps.delete(id);
    const fields=payload?.kind==='record'&&plain(payload.fields)?payload.fields:null;
    known.set(id,{id,revision,fingerprint:result.content_hash,capabilities:[...capabilities],
      recordFields:fields?Object.keys(fields):null,
      nullFields:fields?Object.keys(fields).filter(k=>fields[k]===null):[]});
    seenVersions.get(id).add(revision);
    track(id,{revision,state:'SUPPLIED_UNVERIFIED',transition:'RESOLVED_TO_CANDIDATE',from:expectedRevision,evidence_ref_hint:evidenceRef});
    return {status:'resolved_candidate',decision:'HOLD',id,revision,evidence_certification:'UNVERIFIED'};
  }
  function readInput(id,capabilities,visiting=new Set()){
    if(visiting.has(id))return {blocked:'CYCLE_DETECTED'};
    const g=gaps.get(id);
    if(g){
      if(g.state==='REDACTED')return {blocked:'ACCESS_DENIED_OR_UNAVAILABLE'};
      return {kind:'gap',id,revision:g.revision,fingerprint:g.fingerprint,depth:0,
        gaps:[{slot_id:id,state:g.state,revision:g.revision,explanation_code:g.explanation_code}],known:[]};
    }
    const comp=compositions.get(id);
    if(comp){
      visiting.add(id);
      const children=[];
      for(const child of comp.inputs){
        const view=readInput(child.id,capabilities,visiting);
        if(view.blocked){visiting.delete(id);return view;}
        if(view.fingerprint!==child.fingerprint){visiting.delete(id);return {blocked:'STALE_DEPENDENCY'};}
        children.push(view);
      }
      visiting.delete(id);
      return {kind:'partial',id,fingerprint:comp.fingerprint,depth:comp.depth,
        gaps:unique(children.flatMap(v=>v.gaps).map(g=>g.slot_id)).map(slot_id=>children.flatMap(v=>v.gaps).find(g=>g.slot_id===slot_id)),
        known:unique(children.flatMap(v=>v.known))};
    }
    // V1.5 source read() exposes transformed results only; keep a separate
    // reference-only source registry without exposing payload or weakening ACL.
    const source=known.get(id);
    if(source){
      if(source.capabilities.some(c=>!capabilities.includes(c)))return {blocked:'ACCESS_DENIED_OR_UNAVAILABLE'};
      return {kind:'known',id,fingerprint:source.fingerprint,depth:0,gaps:[],known:[id]};
    }
    // Reject a hidden or stale transformed result before exposing any ref.
    const res=typed.read(id,{capabilities});
    if(res.status!=='candidate_only')return {blocked:res.reason==='CAPABILITY_REQUIRED'?'ACCESS_DENIED_OR_UNAVAILABLE':res.reason||'INPUT_NOT_READABLE'};
    return {kind:'typed_result',id,fingerprint:res.packet.content_hash,depth:0,gaps:[],known:[id]};
  }
  function read(id,{capabilities=[]}={}){
    if(!Array.isArray(capabilities)||capabilities.some(x=>!idOk(x)))return blocked('CAPABILITY_CONTEXT_INVALID');
    const g=gaps.get(id);
    if(g){if(g.state==='REDACTED')return blocked('ACCESS_DENIED_OR_UNAVAILABLE');
      return ok({schema:GAP_SCHEMA,kind:'gap',slot_id:id,revision:g.revision,state:g.state,value:null,
        explanation_code:g.explanation_code,authority:'none',evidence_certification:'UNVERIFIED',real_ack:'NOT_VERIFIED'});
    }
    const comp=compositions.get(id);
    if(!comp){
      const view=readInput(id,capabilities);
      if(view.blocked)return blocked(view.blocked);
      if(view.kind==='known')return ok({schema:GAP_SCHEMA,kind:'known_source_ref',id,content_hash:view.fingerprint,
        authority:'none',evidence_certification:'UNVERIFIED',real_ack:'NOT_VERIFIED'});
      return typed.read(id,{capabilities});
    }
    const v=readInput(id,capabilities);
    if(v.blocked)return blocked(v.blocked);
    return ok(copy(comp.packet));
  }
  async function compose({inputIds,rule,ruleVersion='1',context={},capabilities=[]}={}){
    if(!Array.isArray(inputIds)||inputIds.length<2||inputIds.length>maxInputs||!inputIds.every(idOk)||new Set(inputIds).size!==inputIds.length)
      return blocked('INPUT_LIST_INVALID');
    if(!pendingRules.has(rule)||!idOk(ruleVersion))return blocked('RULE_NOT_ALLOWED');
    if(!plain(context)||!Array.isArray(capabilities)||capabilities.some(x=>!idOk(x)))return blocked('CONTEXT_OR_CAPABILITIES_INVALID');
    let ctxt;try{ctxt=stableJson(context);}catch{return blocked('CONTEXT_INVALID');}
    if(ctxt.length>8192)return blocked('CONTEXT_TOO_LARGE');
    const children=[], gapsFound=[],knownFound=[];
    let depth=0;
    for(const id of inputIds){
      const view=readInput(id,capabilities);
      if(view.blocked)return blocked(view.blocked);
      depth=Math.max(depth,view.depth+1);
      if(depth>maxDepth)return blocked('COMPOSITION_DEPTH_LIMIT');
      children.push({id,fingerprint:view.fingerprint,kind:view.kind});
      gapsFound.push(...view.gaps);knownFound.push(...view.known);
    }
    if(gapsFound.length===0&&TRANSFORM_RULES.includes(rule)){
      if(rule==='record_project'){
        // V1.5 drops absent selected fields. Here we fail closed rather than
        // silently erasing an original blank or treating null as a value.
        if(!Array.isArray(context.fields)||context.fields.length===0)return blocked('RECORD_FIELD_SELECTION_INVALID');
        for(const id of inputIds){
          const src=known.get(id);
          if(!src||src.recordFields===null)return blocked('RECORD_INPUT_PROVENANCE_UNAVAILABLE');
          for(const field of context.fields){
            if(!src.recordFields.includes(field))return blocked('UNDECLARED_FIELD_GAP');
            if(src.nullFields.includes(field))return blocked('NULL_FIELD_AMBIGUOUS');
          }
        }
      }
      // Typed V1.5 handles actual numeric/record execution; no silent semantic guess.
      return typed.transform({inputIds,rule,ruleVersion,context,capabilities});
    }
    // Distinct 'collect_refs' etc. only describe references; no factual inference.
    const key=stableJson({schema:GAP_SCHEMA,inputs:children,rule,ruleVersion,context});
    const digest=await sha256(key);
    const id='gapcmp:'+digest;
    const existing=compositions.get(id);
    if(existing){const current=readInput(id,capabilities);if(!current.blocked){reused++;return {status:'reused',decision:'HOLD',id,computed:false};}}
    if(compositions.size>=maxCompositions)return blocked('COMPOSITION_CAPACITY_REACHED');
    const gapsUnique=[...new Map(gapsFound.map(g=>[g.slot_id,g])).values()];
    const packet={schema:GAP_SCHEMA,kind:'partial_composition',id,rule:{name:rule,version:ruleVersion,context:copy(context)},
      input_refs:children,known_input_ids:unique(knownFound),blanks:gapsUnique,coverage:gapsUnique.length?'INCOMPLETE':'REFERENCE_ONLY',
      computed_value:null,reason:'BLANKS_NOT_FILLED_OR_REFERENCE_ONLY',
      authority:'none',evidence_certification:'UNVERIFIED',memory_approval:'NOT_APPROVED',real_ack:'NOT_VERIFIED',
      information_loss:'NONE_FOR_EXPLICIT_BLANK_STATES',automatic_fill:false};
    compositions.set(id,{id,inputs:children,depth,fingerprint:digest,packet});created++;
    return {status:'created_partial',decision:'HOLD',id,computed:false,blank_count:gapsUnique.length};
  }
  function readGapHistory(id){
    const h=history.get(id);if(!h)return blocked('HISTORY_NOT_FOUND');
    if(h.some(e=>e.state==='REDACTED'))return blocked('ACCESS_DENIED_OR_UNAVAILABLE');
    return ok({kind:'gap_history_candidate',id,events:copy(h),authority:'none'});
  }
  return Object.freeze({registerGap,reviseGap,registerKnown,resolveGap,compose,read,readGapHistory,
    stats:()=>({...typed.stats(),registered_gaps:gaps.size,partial_compositions:compositions.size,
      partial_created:created,partial_reused:reused,authority:'none'})});
}