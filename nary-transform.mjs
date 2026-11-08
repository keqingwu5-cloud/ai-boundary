/** V1.5 – Generic N-ary typed transformation adapter for V1.4 composition.
 * ISOLATED, IN-MEMORY, READ-ONLY OUTPUT. NOT a source authority, remote cache,
 * identity provider, AI semantic reasoner, or memory writer.
 * Explicit approved operation names are interpreted as data, NOT executable code.
 */
import {createCompositionEngine,stableJson} from './nary-composition.mjs';

export const TRANSFORM_SCHEMA='firstbrain.nary-transform.preview.v1';
export const TRANSFORM_RULES=Object.freeze(['quantity_sum','quantity_mean','quantity_ratio','data_rate','record_project']);
const ID=/^[A-Za-z0-9_.:-]{1,128}$/;
const KEY=/^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
const copy=x=>JSON.parse(JSON.stringify(x));
const blocked=(reason)=>({status:'blocked',decision:'HOLD',reason,packet:null});
const unitMap=Object.freeze({
  bit:{dimension:'data',base:'bit',factor:1n},
  B:{dimension:'data',base:'bit',factor:8n},
  kB:{dimension:'data',base:'bit',factor:8000n},
  MB:{dimension:'data',base:'bit',factor:8000000n},
  KiB:{dimension:'data',base:'bit',factor:8192n},
  MiB:{dimension:'data',base:'bit',factor:8388608n},
  ms:{dimension:'duration',base:'ms',factor:1n},
  s:{dimension:'duration',base:'ms',factor:1000n},
  min:{dimension:'duration',base:'ms',factor:60000n},
  h:{dimension:'duration',base:'ms',factor:3600000n}
});
const validInteger=x=>Number.isSafeInteger(x) && !Object.is(x,-0);
const allowedField=x=>typeof x==='string'&&KEY.test(x)&&!['constructor','prototype','__proto__'].includes(x);
const gcd=(a,b)=>{a=a<0n?-a:a;b=b<0n?-b:b;while(b){const t=a%b;a=b;b=t;}return a||1n;};
function rational(n,d=1n){
  if(d===0n)throw Error('DIVISION_BY_ZERO');
  if(d<0n){n=-n;d=-d;}
  const g=gcd(n,d);
  n/=g;d/=g;
  if(n.toString().length>100||d.toString().length>100)throw Error('RESULT_PRECISION_LIMIT');
  return {numerator:n.toString(),denominator:d.toString()};
}
const qty=x=>isObj(x)&&x.kind==='quantity'&&unitMap[x.unit]&&unitMap[x.unit].dimension===x.dimension&&validInteger(x.value);
const record=x=>isObj(x)&&x.kind==='record'&&isObj(x.fields)&&Object.keys(x.fields).length<=32&&Object.keys(x.fields).every(allowedField);
function scalar(x){return BigInt(x.value)*unitMap[x.unit].factor;}
function fieldsConfig(raw){
  return Array.isArray(raw)&&raw.length>=1&&raw.length<=12&&raw.every(allowedField)&&new Set(raw).size===raw.length;
}
function transformValues(rule, values, context){
  if(rule==='record_project'){
    if(!fieldsConfig(context.fields))throw Error('FIELD_SELECTION_INVALID');
    if(values.some(x=>!record(x)))throw Error('RECORD_INPUT_REQUIRED');
    return {kind:'selected_records',lossy:true,rows:values.map((v,i)=>({position:i,fields:Object.fromEntries(context.fields.filter(k=>Object.hasOwn(v.fields,k)).map(k=>[k,copy(v.fields[k])]))}))};
  }
  if(values.some(x=>!qty(x)))throw Error('QUANTITY_INPUT_REQUIRED');
  if(rule==='data_rate'){
    if(values.length!==2||values[0].dimension!=='data'||values[1].dimension!=='duration')throw Error('DATA_RATE_DIMENSION_OR_ARITY');
    const bits=scalar(values[0]),ms=scalar(values[1]);
    if(bits<0n||ms<=0n)throw Error('DATA_RATE_INVALID_INPUT');
    return {kind:'quantity_result',dimension:'data_rate',unit:'bit/s',value:rational(bits*1000n,ms)};
  }
  if(rule==='quantity_ratio'){
    if(values.length!==2||values[0].dimension!==values[1].dimension)throw Error('RATIO_DIMENSION_OR_ARITY');
    const denominator=scalar(values[1]);
    if(denominator===0n)throw Error('DIVISION_BY_ZERO');
    return {kind:'quantity_result',dimension:'ratio',unit:'1',value:rational(scalar(values[0]),denominator)};
  }
  const dimensions=new Set(values.map(v=>v.dimension));
  if(dimensions.size!==1)throw Error('DIMENSION_MISMATCH');
  const dimension=values[0].dimension;
  const target=context.target_unit;
  const targetDef=unitMap[target];
  if(!targetDef||targetDef.dimension!==dimension)throw Error('TARGET_UNIT_INVALID');
  const total=values.reduce((s,x)=>s+scalar(x),0n);
  const result=rule==='quantity_mean'?rational(total,BigInt(values.length)*targetDef.factor):rational(total,targetDef.factor);
  return {kind:'quantity_result',dimension,unit:target,value:result};
}
function validatePayload(p){
  if(qty(p))return true;
  if(record(p)){
    try{return stableJson(p).length<=512*1024;}catch{return false;}
  }
  return false;
}
const allowedRules=new Set(TRANSFORM_RULES);
export function createTypedTransformEngine({maxInputs=32}={}) {
  const low=createCompositionEngine({maxInputs});
  const outcomes=new Map();
  let evaluations=0, reuse=0;
  async function registerSource(s){
    if(!validatePayload(s?.payload))return blocked('TYPED_SOURCE_INVALID');
    return low.registerSource(s);
  }
  function read(id,{capabilities=[]}={}){
    const base=low.read(id,{capabilities});
    if(base.status!=='candidate_only')return base;
    const typed=outcomes.get(id);
    if(!typed)return blocked('TYPED_RESULT_MISSING');
    return {status:'candidate_only',decision:'HOLD',packet:{
      schema:TRANSFORM_SCHEMA,kind:'transformed',id,rule:{...typed.rule},typed_result:copy(typed.result),
      input_refs:copy(base.packet.input_refs),content_hash:base.packet.content_hash,
      authority:'none',evidence_certification:'UNVERIFIED',memory_approval:'NOT_APPROVED',real_ack:'NOT_VERIFIED',
      semantic_claim:'NOT_EVALUATED',provenance_scope:'ISOLATED_CALLER_DECLARED_ONLY',
      lossiness:typed.result.lossy===true?'FIELDS_OMITTED':'NONE_FOR_DECLARED_NUMERIC_INPUTS'
    }};
  }
  async function transform({inputIds,rule,ruleVersion='1',context={},capabilities=[]}={}){
    if(!Array.isArray(inputIds)||inputIds.length<2||inputIds.length>maxInputs||!inputIds.every(x=>typeof x==='string'&&ID.test(x)))return blocked('INPUT_LIST_INVALID');
    if(!allowedRules.has(rule)||typeof ruleVersion!=='string'||!ID.test(ruleVersion))return blocked('RULE_NOT_ALLOWED');
    if(!isObj(context)||!Object.keys(context).every(x=>['target_unit','fields'].includes(x)))return blocked('CONTEXT_INVALID');
    if(rule==='record_project'?!fieldsConfig(context.fields):['quantity_sum','quantity_mean'].includes(rule)?!unitMap[context.target_unit]:Object.keys(context).length!==0)
      return blocked('RULE_CONTEXT_INVALID');
    // Consistency: only canonical context fields are permitted by the operation.
    if(rule==='record_project'&&Object.keys(context).join(',')!=='fields')return blocked('RULE_CONTEXT_INVALID');
    if(['quantity_sum','quantity_mean'].includes(rule)&&Object.keys(context).join(',')!=='target_unit')return blocked('RULE_CONTEXT_INVALID');
    const values=[];
    for(const id of inputIds){
      const r=low.read(id,{capabilities});
      if(r.status!=='candidate_only')return blocked(r.reason||'SOURCE_BLOCKED');
      if(r.packet.kind==='source')values.push(r.packet.payload);
      else if(outcomes.has(id)){
        if(outcomes.get(id).result.kind!=='quantity_result'||outcomes.get(id).result.dimension==='ratio'||outcomes.get(id).result.dimension==='data_rate')return blocked('COMPOSITION_INPUT_TYPE_UNSUPPORTED');
        const v=outcomes.get(id).result;
        // Only exact integral results can be consumed as new operands in the base-unit type system.
        if(v.value.denominator!=='1')return blocked('FRACTIONAL_COMPOSITE_INPUT_REQUIRES_EXPLICIT_CONVERSION');
        const n=Number(v.value.numerator);
        if(!validInteger(n))return blocked('OUTCOME_NOT_SAFE_INTEGER');
        values.push({kind:'quantity',value:n,unit:v.unit,dimension:v.dimension});
      }else return blocked('UNREGISTERED_COMPOSITE_INPUT');
    }
    let computed;
    try {computed=transformValues(rule,values,context);}catch(e){return blocked(e.message||'RULE_EVALUATION_FAILED');}
    if(stableJson(computed).length>128*1024)return blocked('OUTPUT_TOO_LARGE');
    const operator={type:'derive',ruleId:'v15.'+rule,ruleVersion};
    const outcome=await low.compose({inputIds,operator,context,capabilities});
    if(outcome.status==='blocked')return outcome;
    if(outcome.status==='created'){
      outcomes.set(outcome.id,{rule:{name:rule,version:ruleVersion,context:copy(context)},result:computed});
      evaluations++;
    }else{
      reuse++;
      if(!outcomes.has(outcome.id))return blocked('CACHE_INDEX_MISSING');
    }
    return {status:outcome.status,decision:'HOLD',id:outcome.id,cache_hit:outcome.cache_hit,content_hash:outcome.content_hash,
      computed:outcome.status==='created',result:copy(outcomes.get(outcome.id).result),
      evidence_certification:'UNVERIFIED'};
  }
  return Object.freeze({registerSource,transform,read,stats:()=>({...low.stats(),evaluations,reuses:reuse,typed_outcomes:outcomes.size})});
}

/** Pure byte-budget estimator; requires verified shared cache before 'warm' references are useful. */
export function transportEstimate({sourcePackets,resultPacket,refPacket,reuseCount}={}){
  if(!Array.isArray(sourcePackets)||sourcePackets.length<1||resultPacket===undefined||refPacket===undefined||!Number.isInteger(reuseCount)||reuseCount<1||reuseCount>100000)throw Error('ESTIMATE_INPUT_INVALID');
  const bytes=x=>new TextEncoder().encode(stableJson(x)).byteLength;
  const originalBytes=sourcePackets.reduce((sum,x)=>sum+bytes(x),0);
  const referenceBytes=bytes(refPacket);
  const resultBootstrapBytes=bytes(resultPacket);
  if(originalBytes+resultBootstrapBytes>50_000_000)throw Error('ESTIMATE_TOO_LARGE');
  const baselineBytes=originalBytes*reuseCount;
  const warmReferenceBytes=referenceBytes*reuseCount;
  const coldWithBootstrapBytes=originalBytes+resultBootstrapBytes+warmReferenceBytes;
  return {kind:'LOCAL_JSON_UTF8_ESTIMATE_NOT_NETWORK',source_bytes_per_use:originalBytes,ref_bytes_per_use:referenceBytes,result_bootstrap_bytes:resultBootstrapBytes,
    reuse_count:reuseCount,baseline_bytes:baselineBytes,warm_reference_bytes:warmReferenceBytes,
    cold_with_bootstrap_bytes:coldWithBootstrapBytes,
    warm_savings_bytes:baselineBytes-warmReferenceBytes,cold_savings_bytes:baselineBytes-coldWithBootstrapBytes,
    cache_precondition:'SAME_AUTHORIZED_VERSIONED_SOURCE_AND_RESULT_AVAILABLE_TO_RECEIVER'};
}