import test from 'node:test';
import assert from 'node:assert/strict';
import {previewWorldClaimReference,legacyTcvlCandidateInput,CLAIM_PREVIEW_SCHEMA} from '../concept-reuse-compat.mjs';
import {appendWorldLedger,readWorldLedger,LEGACY_KEY,JOURNAL_KEY} from '../world-verification-ledger.mjs';
import {readNodeContext} from '../research-context-bridge.mjs';
const graph=()=>({brains:[{id:'main'}],nodes:[{id:'n_q1',brainId:'main',title:'研究起點',kind:'question',status:'open',pos:[0,0,0]}],links:[],history:[]});
const row=(id='study1')=>({id,hypothesis:'條件 X 可能導致 Y',falsifier:'觀測 X 而 Y 不發生',
 createdOn:'2026-10-27',deadline:'2026-12-31',source:'https://example.org/unverified',metric:'',status:'待驗證'});
function store(){
 const m=new Map([['aiBrain.v1',JSON.stringify(graph())]]);
 return {m,writes:0,getItem(k){return m.has(k)?m.get(k):null},
 setItem(k,v){this.writes++;m.set(k,String(v));}};
}
function create(s,sourceNodeId='n_q1',id='study1'){
 const c=appendWorldLedger(s,null,{type:'create',row:row(id),reason:'人工合成候選',sourceNodeId});
 assert.equal(c.ok,true,JSON.stringify(c));
 return c;
}
function ref(s,id='n_q1'){return readNodeContext(s,id);}
function preview(s,id='study1',link=ref(s)){return previewWorldClaimReference({storage:s,brainRef:link,recordId:id});}
test('01 valid node plus recorded source association is a preview, not approved claim',()=>{
 const s=store();create(s);const p=preview(s);
 assert.equal(p.status,'candidate_only');assert.equal(p.packet.schema,CLAIM_PREVIEW_SCHEMA);
 assert.equal(p.packet.classification,'hypothesis');
 assert.equal(p.packet.approval,'candidate_only');
 assert.equal(p.packet.claim_locator.canonical_id,null);
 assert.equal(p.packet.causal_relation,'not_proven');
});
test('02 node ID cannot itself become a claim ID',()=>{
 const s=store();create(s);const p=preview(s).packet;
 assert.notEqual(p.node_id,p.claim_locator.external_id);
 assert.equal(p.claim_revision_id,null);
 assert.equal(p.context_relation.type,'context_reference');
});
test('03 external URL is a hint, never evidence or an authority',()=>{
 const s=store();create(s);const p=preview(s).packet;
 assert.equal(p.source_url_hint,'https://example.org/unverified');
 assert.deepEqual(p.evidence_refs,[]);
 assert.equal(p.source_independently_verified,false);
});
test('04 no sourceNodeId at creation => unlinked not silently accepted',()=>{
 const s=store();create(s,null);
 assert.equal(preview(s).status,'blocked');
 assert.equal(preview(s).reason,'source_identity_missing_or_changed');
});
test('05 wrong source ID => integration conflict, even with valid brain',()=>{
 const s=store();create(s,'n_other');
 assert.equal(ref(s).status,'linked');
 assert.equal(preview(s).reason,'source_identity_missing_or_changed');
});
test('06 legacy v1 has no trusted node or event-version linkage',()=>{
 const s=store();s.m.set(LEGACY_KEY,JSON.stringify([row()]));
 assert.equal(preview(s).status,'unlinked');
 assert.equal(preview(s).reason,'no_record_creation_origin');
});
test('07 imported snapshot has no record-level source provenance',()=>{
 const s=store();const c=appendWorldLedger(s,null,{type:'import',rows:[row()],reason:'合成匯入',sourceNodeId:'n_q1'});
 assert.equal(c.ok,true);
 assert.equal(preview(s).status,'unlinked');
});
test('08 saved status change remains a review status not new proven claim',()=>{
 const s=store();const a=create(s);
 const b=appendWorldLedger(s,a.rawV2,{type:'status',recordId:'study1',status:'證據不足',
  reason:'發現缺少資料',sourceNodeId:'n_q1'});
 assert.equal(b.ok,true);
 const p=preview(s).packet;
 assert.equal(p.research_status,'證據不足');
 assert.equal(p.statement,row().hypothesis);
 assert.equal(p.journal_version,2);
 assert.equal(p.claim_revision_id,null);
 assert.equal(p.source_event_id,b.event.eventId);
});
test('09 changed node ID inside old graph invalidates mapping, not world history',()=>{
 const s=store();create(s);const changed=graph();changed.nodes[0].id='n_other';
 s.m.set('aiBrain.v1',JSON.stringify(changed));
 assert.equal(preview(s).reason,'first_brain_not_linked');
 assert.equal(readWorldLedger(s).ok,true);
});
test('10 corrupted world model journal blocks projection',()=>{
 const s=store();create(s);s.m.set(JOURNAL_KEY,'{bad');
 assert.equal(preview(s).reason,'world_model_journal_corrupt');
});
test('11 corrupt brain graph blocks projection without modifying world model',()=>{
 const s=store();create(s);const changed=graph();changed.nodes.push(null);
 s.m.set('aiBrain.v1',JSON.stringify(changed));
 assert.equal(preview(s).reason,'first_brain_not_linked');
});
test('12 delete tombstone does not misrepresent old claim as current',()=>{
 const s=store(),a=create(s),b=appendWorldLedger(s,a.rawV2,{
  type:'delete',recordId:'study1',reason:'人工從目前清單移出',sourceNodeId:'n_q1'});
 assert.equal(b.ok,true);
 assert.equal(preview(s).reason,'world_model_record_missing_or_removed');
 assert.equal(readWorldLedger(s).events.length,2);
});
test('13 two distinct research records sharing one 3D node remain distinct claims',()=>{
 const s=store(),a=create(s);
 const b=appendWorldLedger(s,a.rawV2,{type:'create',row:row('study2'),
  sourceNodeId:'n_q1',reason:'第二種假說'});
 assert.equal(b.ok,true);
 const p1=preview(s,'study1').packet,p2=preview(s,'study2').packet;
 assert.equal(p1.node_id,p2.node_id);
 assert.notEqual(p1.claim_locator.external_id,p2.claim_locator.external_id);
});
test('14 manually identified Tcvl candidate input preserves unverified links',()=>{
 const s=store();create(s);
 const r=legacyTcvlCandidateInput(preview(s),{candidateId:'cand01',enteredAt:'2026-10-27T08:00:00Z'});
 assert.equal(r.ok,true);
 const c=r.candidate;
 assert.equal(c.kind,'research');assert.equal(c.entered_at,'2026-10-27T08:00:00Z');
 assert.equal(c.links.context.state,'linked');
 assert.equal(c.links.memory.state,'missing');assert.equal(c.links.causal.state,'missing');
 assert.deepEqual(c.evidence_refs,[]);
 assert.equal(c.highlight,'');assert.equal(c.comparison,'');
 assert.equal(c.origin_status,'candidate_unverified');
});
test('15 cannot fabricate candidate identity, time, or approved source',()=>{
 const s=store();create(s);const p=preview(s);
 for(const input of [{},{candidateId:'X'},{candidateId:'<html>',enteredAt:'2026-10-27'},
  {candidateId:'c',enteredAt:'yesterday'}]){
  assert.equal(legacyTcvlCandidateInput(p,input).ok,false);
 }
 assert.equal(legacyTcvlCandidateInput({status:'blocked'},{
  candidateId:'c',enteredAt:'2026-10-27T08:00:00Z'}).ok,false);
});
test('16 read-only bridge never updates either data store',()=>{
 const s=store();create(s);
 const before={graph:s.getItem('aiBrain.v1'),journal:s.getItem(JOURNAL_KEY),writes:s.writes};
 const p=preview(s);
 legacyTcvlCandidateInput(p,{candidateId:'c',enteredAt:'2026-10-27T08:00:00Z'});
 assert.equal(s.writes,before.writes);assert.equal(s.getItem('aiBrain.v1'),before.graph);
 assert.equal(s.getItem(JOURNAL_KEY),before.journal);
});
test('17 unique source record IDs must be reasonably bounded for reference use',()=>{
 const s=store();create(s,'n_q1','x'.repeat(150));
 const p=preview(s,'x'.repeat(150));
 assert.equal(p.status,'candidate_only');
 const c=legacyTcvlCandidateInput(p,{candidateId:'short',enteredAt:'2026-10-27T08:00:00Z'});
 assert.equal(c.ok,false);assert.equal(c.reason,'source_ref_too_long');
});
