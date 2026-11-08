/** Isolated First Brain preview controller. No persistent storage or network. */
import {createGapAwareEngine} from '../gap-aware-composition.mjs';

const qty = value => ({kind:'quantity',value,unit:'MB',dimension:'data'});
const ALLOWED = new Set(['KNOWN','UNKNOWN','MISSING','UNVERIFIED','INTENTIONALLY_OPEN','NOT_APPLICABLE','REDACTED']);
const error = code => ({ok:false,reason:code});

function quantityText(result) {
  if (result?.kind!=='quantity_result'||result.dimension!=='data'||result.unit!=='MB') return null;
  const a=BigInt(result.value.numerator), b=BigInt(result.value.denominator);
  if (b<=0n) return null;
  return b===1n ? `${a} MB` : `${a}/${b} MB`;
}
function slimRecord(row) {
  return {id:row.id,revision:row.revision,role:row.role,kind:row.kind,hash_prefix:row.hash_prefix??null,state:row.state??null};
}
/** Public, reproducible synthetic demonstration; no true attestation or identity. */
export async function runPilot({a=4,b=6,cState='UNKNOWN',c=2}={}){
  if (!ALLOWED.has(cState)) return error('C_STATE_INVALID');
  const validQuantity=x=>Number.isSafeInteger(x)&&x>=0&&x<=1000000;
  if (![a,b].every(validQuantity) || (cState==='KNOWN'&&!validQuantity(c))) return error('INTEGER_RANGE_REQUIRED');
  const engine = createGapAwareEngine();
  const sourceRows=[];
  for (const [id,v] of [['A',a],['B',b]]){
    const reg=await engine.registerKnown({id,revision:'r1',payload:qty(v)});
    if(reg.status!=='registered')return error(`SOURCE_${id}_${reg.reason||reg.status}`);
    sourceRows.push({id,revision:'r1',role:'input',kind:'known',hash_prefix:reg.content_hash.slice(0,12)});
  }
  const x=await engine.compose({inputIds:['A','B'],rule:'quantity_sum',context:{target_unit:'MB'}});
  if(x.status!=='created'&&x.status!=='reused')return error(`X_${x.reason||x.status}`);
  const xRead=engine.read(x.id);
  if(xRead.status!=='candidate_only')return error('X_READ_FAILED');
  const xValue=quantityText(xRead.packet?.typed_result);
  if(xValue===null)return error('X_VALUE_UNAVAILABLE');
  let y;
  if(cState==='KNOWN'){
    const res=await engine.registerKnown({id:'C',revision:'r1',payload:qty(c)});
    if(res.status!=='registered')return error(`C_${res.reason||res.status}`);
    sourceRows.push({id:'C',revision:'r1',role:'increment',kind:'known',hash_prefix:res.content_hash.slice(0,12)});
    y=await engine.compose({inputIds:[x.id,'C'],rule:'quantity_sum',context:{target_unit:'MB'}});
  }else{
    const res=await engine.registerGap({id:'C',revision:'r1',state:cState,explanation_code:'DEMO_NOT_SUPPLIED'});
    if(res.status!=='registered')return error(`GAP_${res.reason||res.status}`);
    sourceRows.push({id:'C',revision:'r1',role:'increment',kind:'gap',state:cState});
    y=await engine.compose({inputIds:[x.id,'C'],rule:'quantity_sum',context:{target_unit:'MB'}});
  }
  if(y.status==='blocked'){
    return {ok:true,phase:'SAFE_BLOCK',x:{id:x.id,value:xValue},y:null,sourceRows:sourceRows.map(slimRecord),gap:{state:cState,visible:cState!=='REDACTED'},reason:y.reason,
      audit:{authority:'none',approval:'NOT_APPROVED',remote_ack:'NOT_VERIFIED',scope:'SYNTHETIC_SESSION_ONLY',persisted:false}};
  }
  const yRead=engine.read(y.id);
  if(yRead.status!=='candidate_only')return error('Y_READ_FAILED');
  const isPartial=yRead.packet.kind==='partial_composition';
  return {
    ok:true,phase:isPartial?'INCOMPLETE':'COMPUTED',
    x:{id:x.id,value:xValue,refs:xRead.packet.input_refs.map(r=>({id:r.id,hash_prefix:r.fingerprint.slice(0,12)}))},
    y:{id:y.id,value:isPartial?null:quantityText(yRead.packet.typed_result),input_ids:[x.id,'C'],coverage:isPartial?yRead.packet.coverage:'COMPLETE'},
    gap:isPartial?{state:cState,visible:true,reason:'BLANKS_NOT_FILLED',slot_id:'C'}:null,
    sourceRows:sourceRows.map(slimRecord),
    audit:{authority:'none',approval:'NOT_APPROVED',remote_ack:'NOT_VERIFIED',scope:'SYNTHETIC_SESSION_ONLY',persisted:false}
  };
}