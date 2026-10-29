import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {previewWorldClaimReference,legacyTcvlCandidateInput} from '../concept-reuse-compat.mjs';
import {appendWorldLedger} from '../world-verification-ledger.mjs';
import {readNodeContext} from '../research-context-bridge.mjs';
const require=createRequire(import.meta.url);
const old=resolve(dirname(fileURLToPath(import.meta.url)),'_legacy_pr_sources');
const gate=require(resolve(old,'question-gate-v2.js'));
const candidate=require(resolve(old,'tcvl-candidate-core.js'));
const traceback=require(resolve(old,'tcvl-traceback-core.js'));
const legacyReliability=await import('file://'+resolve(old,'storage.mjs'));
const data=()=>new Map([['aiBrain.v1',JSON.stringify({
 brains:[{id:'main'}],nodes:[{id:'n_q1',brainId:'main',title:'測試節點',kind:'question',status:'open',pos:[0,0,0]}],
 links:[],history:[]
})]]);
const storage=()=>{const m=data();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),m}};
function prepare(){
 const s=storage(),c=appendWorldLedger(s,null,{
  type:'create',row:{id:'study1',hypothesis:'X 可能影響 Y',falsifier:'X 存在但 Y 不變',
   createdOn:'2026-10-27',deadline:'2026-11-30',source:'',metric:'',status:'待驗證'},
  sourceNodeId:'n_q1',reason:'舊模組合成相容測試'});
 assert.equal(c.ok,true);
 return {s,ref:readNodeContext(s,'n_q1')};
}
test('18 PR28 actual candidate constructor accepts manual preview but rejects automatic promotion',()=>{
 const {s,ref}=prepare();
 const p=previewWorldClaimReference({storage:s,brainRef:ref,recordId:'study1'});
 const out=legacyTcvlCandidateInput(p,{candidateId:'candidate:study1',enteredAt:'2026-10-27T08:00:00Z'});
 assert.equal(out.ok,true);
 const oldShape=candidate.candidate(out.candidate);
 const validation=candidate.check({...candidate.blank(),items:[oldShape]});
 assert.deepEqual(validation,[]);
 const decision=candidate.evaluate(oldShape,[]);
 assert.equal(decision.route,'hold');
 assert.equal(decision.core_memory,'human_approval_required');
 assert.equal(decision.remote_ack,'not_connected');
});
test('19 PR13 actual question gate distinguishes complete questioning from verified truth',()=>{
 const q=gate.build('X 可能影響 Y 的機制是什麼？','causal');
 assert.equal(q.answers.length,5);
 assert.equal(gate.review(q).ready,false);
 q.answers=Array.from({length:5},(_,i)=>'假設案例的測試回答 '+(i+1)+'：待來源核查');
 q.revisedQuestion='條件 X 於時段 T 是否提高事件 Y 的機率？';
 q.falsifier='同條件下 X 出現而 Y 未改變的合成反例';
 q.metric='依已定義的 Y 測量比較';
 q.dataSource='合成測試資料，尚未取得獨立真實來源';
 const out=gate.review(q);
 assert.equal(out.ready,true);
 assert.equal(out.certified,false);
});
test('20 PR28 traceback actual relation schema rejects new context_reference until explicitly mapped',()=>{
 const now='2026-10-27T08:00:00Z';
 const h={schema:'tcvl.traceback-case.v1',records:[
  {id:'old:claim1',type:'claim',createdAt:now,recordedAt:now},
  {id:'old:revision1',type:'revision',createdAt:now,recordedAt:now}
 ],events:[],edges:[{from:'old:claim1',to:'old:revision1',
  type:'context_reference',recordedAt:now}]};
 assert.ok(traceback.validateHistory(h).includes('edge_invalid'));
 h.edges[0].type='related_to';
 assert.deepEqual(traceback.validateHistory(h),[]);
});
test('21 PR4 actual graph guard has a different graph-version requirement; no blind stacking',()=>{
 const source=JSON.parse(data().get('aiBrain.v1'));
 assert.equal(readNodeContext({getItem:k=>k==='aiBrain.v1'?JSON.stringify(source):null},'n_q1').status,'linked');
 assert.throws(()=>legacyReliability.validateGraph(source),/UNSUPPORTED_GRAPH_VERSION/);
 const compatible={...source,version:1};
 assert.doesNotThrow(()=>legacyReliability.validateGraph(compatible));
});
test('22 PR28 actual traceback comparison requires identical test protocol and cutoff',()=>{
 const a={caseId:'c1',protocolId:'p1',datasetCutoff:'2026-10-27',outcome:'fail'};
 const b={...a,outcome:'pass'};
 assert.equal(traceback.compareRetests(a,b).comparable,true);
 assert.equal(traceback.compareRetests(a,{...b,datasetCutoff:'2026-10-28'}).comparable,false);
});
