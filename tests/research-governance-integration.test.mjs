import test from 'node:test';
import assert from 'node:assert/strict';
import {previewResearchBridge} from '../research-governance-integration.mjs';
import {appendWorldLedger,JOURNAL_KEY} from '../world-verification-ledger.mjs';
const graph=()=>({brains:[{id:'main'}],nodes:[{id:'nodeA',brainId:'main',title:'研究起點',kind:'question',status:'open',pos:[0,0,0]}],links:[],history:[]});
const row={id:'studyA',hypothesis:'合成假說',falsifier:'合成反證',
  createdOn:'2026-11-08',deadline:'2026-12-31',source:'',metric:'',status:'待驗證'};
function mock(){
 const m=new Map([['aiBrain.v1',JSON.stringify(graph())]]);
 return {m,writes:0,getItem(k){return m.get(k)??null;},setItem(k,v){this.writes++;m.set(k,String(v));}};
}
function setup(node='nodeA'){
 const storage=mock();
 const out=appendWorldLedger(storage,null,{type:'create',row,sourceNodeId:node,reason:'合成研究契約驗證',eventId:'eventA'});
 assert.equal(out.ok,true);
 return storage;
}
test('I01 actual PR75 Node / world ledger -> only HOLD and zero writes',async()=>{
 const storage=setup(),graphBefore=storage.getItem('aiBrain.v1');
 const ledgerBefore=storage.getItem(JOURNAL_KEY),writes=storage.writes;
 const x=await previewResearchBridge({storage,nodeId:'nodeA',recordId:'studyA',
  referenceFrame:{comparison_metric:'rate',observer:'demo'},
  asOf:'2026-11-08T12:00:00Z',sourceAvailableAt:'2026-11-08T11:00:00Z'});
 assert.equal(x.status,'candidate_only');assert.equal(x.decision,'HOLD');
 assert.equal(x.packet.node_id,'nodeA');assert.equal(x.packet.source_event_id,'eventA');
 assert.equal(x.packet.memory_record_id,null);assert.equal(x.packet.ack.status,'NOT_VERIFIED');
 assert.equal(storage.writes,writes);assert.equal(storage.getItem('aiBrain.v1'),graphBefore);
 assert.equal(storage.getItem(JOURNAL_KEY),ledgerBefore);
});
test('I02 wrong record source identity cannot pass',async()=>{
 const storage=setup('differentNode');
 const x=await previewResearchBridge({storage,nodeId:'nodeA',recordId:'studyA'});
 assert.equal(x.status,'blocked');assert.ok(x.reason_codes.includes('SOURCE_PREVIEW_NOT_LINKED'));
});
test('I03 unknown record cannot pass',async()=>{
 const storage=setup();const x=await previewResearchBridge({storage,nodeId:'nodeA',recordId:'unknown'});
 assert.equal(x.status,'blocked');
});
test('I04 corrupted journal blocks',async()=>{
 const storage=setup();storage.m.set(JOURNAL_KEY,'{broken');
 const x=await previewResearchBridge({storage,nodeId:'nodeA',recordId:'studyA'});
 assert.equal(x.status,'blocked');
});
test('I05 unknown node fails, no creation',async()=>{
 const storage=setup(),before=storage.writes;
 const x=await previewResearchBridge({storage,nodeId:'newUnknown',recordId:'studyA'});
 assert.equal(x.status,'blocked');assert.ok(x.reason_codes.includes('NODE_MISSING'));
 assert.equal(storage.writes,before);
});
test('I06 untrusted legacy authority indicator fails closed',async()=>{
 const storage=setup();storage.m.set('aiBrain.v1.persistence.authority','unexpected');
 const x=await previewResearchBridge({storage,nodeId:'nodeA',recordId:'studyA'});
 assert.equal(x.status,'blocked');assert.ok(x.reason_codes.includes('NODE_UNREADABLE'));
});