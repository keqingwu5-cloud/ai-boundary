/** Local bounded synthetic JSON wire-size demonstration; not WAN/token/CPU savings proof. */
import {writeFileSync} from 'node:fs';
import {createGapAwareEngine} from '../gap-aware-composition.mjs';
import {stableJson} from '../nary-composition.mjs';
const byteCount=o=>new TextEncoder().encode(stableJson(o)).byteLength;
const e=createGapAwareEngine();
const original=[];
for(let i=0;i<4;i++){
 const p={kind:'quantity',dimension:'data',unit:'MB',value:i+1};
 original.push({id:`A${i}`,revision:'r1',payload:p});
 await e.registerKnown({id:`A${i}`,revision:'r1',payload:p});
}
await e.registerGap({id:'G',revision:'r1',state:'INTENTIONALLY_OPEN',explanation_code:'KEEP_OPEN'});
const created=await e.compose({inputIds:['A0','A1','A2','A3','G'],rule:'quantity_sum',context:{target_unit:'MB'}});
const preview=e.read(created.id);
const rawPacket={inputs:original,blank:{id:'G',revision:'r1',state:'INTENTIONALLY_OPEN'}};
const refPacket={ref:created.id,version:'v1.6',status:'INCOMPLETE'};
const originalBytes=byteCount(rawPacket),referenceBytes=byteCount(refPacket),bootstrapBytes=byteCount(preview);
const repeats=50;
const result={kind:'LOCAL_SYNTHETIC_WIRE_SIZE_ONLY',repeat_count:repeats,
 raw_bytes_per_use:originalBytes,ref_bytes_per_use:referenceBytes,
 bootstrap_bytes:bootstrapBytes,baseline_raw_repeat_bytes:originalBytes*repeats,
 with_bootstrap_reference_bytes:originalBytes+bootstrapBytes+referenceBytes*repeats,
 blank_preserved:preview.packet.blanks.some(x=>x.slot_id==='G'&&x.state==='INTENTIONALLY_OPEN'),
 computed_result_null:preview.packet.computed_value===null,
 assumptions:['Shared authorized registry','Same versions','Receiver can resolve reference', 'Cold-start includes input and result bootstrap'],
 limits:['Not measured network latency','Not token savings','No remote ACK','No identity provider']};
const dest=process.argv[2];if(dest)writeFileSync(dest,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));