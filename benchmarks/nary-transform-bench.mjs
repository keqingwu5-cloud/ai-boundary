/** Local-only deterministic fixture with measured UTF-8 JSON bytes and CPU timings.
 * NOT WAN throughput, official First Brain latency or tokenizer count.
 */
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {createTypedTransformEngine,transportEstimate} from '../nary-transform.mjs';
const engine=createTypedTransformEngine();
const documents=Array.from({length:4},(_,i)=>({
  id:'doc_'+(i+1),revision:'r1',
  payload:{kind:'record',fields:{title:'文件 '+(i+1),topic:i%2?'記憶版本':'世界模型',
    body:'本文為測試資料，非真實來源；'.repeat(300)+'[END='+i+']',
    source_status:'UNVERIFIED',revision_label:'r1'}}
}));
for(const s of documents){const x=await engine.registerSource(s);if(x.status!=='registered')throw Error('Source registration failed '+x.reason);}
const spec={inputIds:documents.map(x=>x.id),rule:'record_project',ruleVersion:'1',context:{fields:['title','topic','source_status']}};
const t0=performance.now();const out=await engine.transform(spec);const creationMs=performance.now()-t0;
if(out.status!=='created')throw Error('Expected created');
const content=engine.read(out.id);
if(content.status!=='candidate_only')throw Error('Expected readable');
const refPacket={schema:'firstbrain.nary-transform.ref.v1',id:out.id,hash:out.content_hash,revision:'1'};
const reuseCount=50;
const costs=transportEstimate({sourcePackets:documents,resultPacket:content.packet,refPacket,reuseCount});
const elapsed=[];
for(let i=0;i<reuseCount;i++){
  const start=performance.now();
  const r=await engine.transform(spec);
  const p=engine.read(out.id);
  if(r.status!=='reused'||p.status!=='candidate_only')throw Error('Unexpected cache miss');
  elapsed.push(performance.now()-start);
}
const sort=[...elapsed].sort((a,b)=>a-b);
const pct=p=>Number(sort[Math.ceil((p/100)*sort.length)-1].toFixed(4));
const payload={study_id:'FB-NARY-V15-BENCH-20261108',kind:'LOCAL_SYNTHETIC_SINGLE_PROCESS_NOT_NETWORK',
  fixture:{document_count:4,reuse_count:reuseCount,non_english_utf8:true,unverified_synthetic:true},
  transform:{rule:spec.rule,selected_fields:spec.context.fields,created_id:out.id,
    result_bytes:new TextEncoder().encode(JSON.stringify(content.packet.typed_result)).byteLength,
    output_lossiness:content.packet.lossiness},
  bytes:costs,
  local_node_cpu_ms:{creation:Number(creationMs.toFixed(4)),warm_recompose_read_p50:pct(50),warm_recompose_read_p95:pct(95),warm_recompose_read_min:Number(sort[0].toFixed(4)),warm_recompose_read_max:Number(sort.at(-1).toFixed(4))},
  stats:engine.stats(),
  limitations:['initial result must be transferred or deterministically regenerated on the receiver',
    'actual receiver must already have authorized matching source and result',
    'does not measure WAN/USB/Wi-Fi speed or end-to-end agent inference time',
    'does not measure ChatGPT token usage or real API costs',
    'record_project omits fields and is not semantic comprehension',
    'caller-declared permissions are not a production identity system']};
const dest=process.argv[2];if(dest)writeFileSync(dest,JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify(payload,null,2));