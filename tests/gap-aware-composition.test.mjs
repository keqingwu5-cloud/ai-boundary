import test from 'node:test';
import assert from 'node:assert/strict';
import {createGapAwareEngine,GAP_STATES,GAP_SCHEMA} from '../gap-aware-composition.mjs';
const qty=(value,unit='MB',dimension='data')=>({kind:'quantity',dimension,unit,value});
const make=async()=>{
 const e=createGapAwareEngine();
 for(const [id,value] of [['A',1],['B',2],['C',3],['D',4]])assert.equal((await e.registerKnown({id,revision:'r1',payload:qty(value)})).status,'registered');
 return e;
};
const add=(e,inputIds,rule='quantity_sum',context={target_unit:'MB'})=>e.compose({inputIds,rule,context});
const gap=(e,id,state='UNKNOWN',revision='r1',explanation_code=null)=>e.registerGap({id,state,revision,explanation_code});

test('01 all six blank states are defined and are distinct',()=>{
 assert.deepEqual(GAP_STATES,['MISSING','UNKNOWN','UNVERIFIED','INTENTIONALLY_OPEN','NOT_APPLICABLE','REDACTED']);
});
test('02 ordinary known data are really added using V1.5',async()=>{
 const e=await make();const result=await add(e,['A','B','C','D']);
 assert.equal(result.status,'created'); assert.deepEqual(result.result.value,{numerator:'10',denominator:'1'});
});
test('03 unknown is not zero or empty string',async()=>{
 const e=await make();await gap(e,'G');const result=await add(e,['A','G']);
 assert.equal(result.status,'created_partial');const packet=e.read(result.id).packet;
 assert.equal(packet.computed_value,null);assert.equal(packet.coverage,'INCOMPLETE');
 assert.equal(packet.blanks[0].state,'UNKNOWN'); assert.equal(packet.blanks[0].slot_id,'G');
});
test('04 missing does not imply zero',async()=>{
 const e=await make();await gap(e,'G','MISSING');
 assert.equal(e.read((await add(e,['A','G'])).id).packet.blanks[0].state,'MISSING');
});
test('05 unverified is not verified when used with known data',async()=>{
 const e=await make();await gap(e,'G','UNVERIFIED');
 const p=e.read((await add(e,['A','G'])).id).packet;
 assert.equal(p.evidence_certification,'UNVERIFIED');assert.equal(p.blanks[0].state,'UNVERIFIED');
});
test('06 intentionally open cannot be auto-filled',async()=>{
 const e=await make();await gap(e,'G','INTENTIONALLY_OPEN');
 assert.equal((await e.resolveGap({id:'G',expectedRevision:'r1',revision:'r2',payload:qty(2),evidenceRef:'sourceG'})).reason,'INTENTIONAL_BLANK_REQUIRES_DECISION');
 assert.equal(e.read('G').packet.state,'INTENTIONALLY_OPEN');
});
test('07 not applicable is not silently skipped from mean',async()=>{
 const e=await make();await gap(e,'G','NOT_APPLICABLE');
 const r=await add(e,['A','G'],'quantity_mean');
 assert.equal(e.read(r.id).packet.computed_value,null);
 assert.equal(e.read(r.id).packet.blanks[0].state,'NOT_APPLICABLE');
});
test('08 redacted never reveals detail or partial ID',async()=>{
 const e=await make();await gap(e,'G','REDACTED');
 const r=await add(e,['A','G']);assert.equal(r.status,'blocked');assert.equal(r.reason,'ACCESS_DENIED_OR_UNAVAILABLE');
 assert.equal(r.id,undefined);assert.equal(e.read('G').packet,null);
});
test('09 reject implicit null, value zero, or extra payload in a blank',async()=>{
 const e=await make();
 for(const value of [null,0,''])assert.equal((await e.registerGap({id:'Q',revision:'r1',state:'UNKNOWN',value})).status,'blocked');
});
test('10 exact value zero is valid and not a gap',async()=>{
 const e=await make();await e.registerKnown({id:'Z',revision:'r1',payload:qty(0)});
 const r=await add(e,['A','Z']);assert.equal(r.result.value.numerator,'1');
});
test('11 empty string is not a valid typed quantity and not a blank',async()=>{
 const e=await make();const r=await e.registerKnown({id:'Q',revision:'r1',payload:''});assert.equal(r.status,'blocked');
});
test('12 multiple blank states survive N-way composition',async()=>{
 const e=await make();await gap(e,'G1','UNKNOWN');await gap(e,'G2','MISSING');await gap(e,'G3','UNVERIFIED');
 const p=e.read((await add(e,['A','B','G1','G2','G3'])).id).packet;
 assert.equal(p.blanks.length,3);assert.equal(p.known_input_ids.length,2);assert.equal(p.computed_value,null);
});
test('13 X with a blank can be combined with C without filling it',async()=>{
 const e=await make();await gap(e,'G','UNKNOWN');const x=await add(e,['A','G']);
 const y=await add(e,[x.id,'C']);const p=e.read(y.id).packet;
 assert.equal(p.blanks.length,1);assert.equal(p.blanks[0].slot_id,'G');assert.deepEqual(new Set(p.known_input_ids),new Set(['A','C']));
});
test('14 same exact partial reference is reusable',async()=>{
 const e=await make();await gap(e,'G');const x=await add(e,['A','G']);const y=await add(e,['A','G']);
 assert.equal(x.id,y.id);assert.equal(y.status,'reused');assert.equal(e.stats().partial_reused,1);
});
test('15 revised gap makes old X stale, without hallucinating filling',async()=>{
 const e=await make();await gap(e,'G');const x=await add(e,['A','G']);
 const revision=await e.reviseGap({id:'G',expectedRevision:'r1',revision:'r2',state:'UNVERIFIED'});
 assert.equal(revision.status,'revised');assert.equal(e.read(x.id).reason,'STALE_DEPENDENCY');
 const n=await add(e,['A','G']);assert.notEqual(n.id,x.id);assert.equal(e.read(n.id).packet.blanks[0].state,'UNVERIFIED');
});
test('16 old X cannot be further used after gap revision',async()=>{
 const e=await make();await gap(e,'G');const x=await add(e,['A','G']);await e.reviseGap({id:'G',expectedRevision:'r1',revision:'r2',state:'UNKNOWN'});
 assert.equal((await add(e,[x.id,'C'])).reason,'STALE_DEPENDENCY');
});
test('17 known input revision also makes partial X stale',async()=>{
 const e=await make();await gap(e,'G');const x=await add(e,['A','G']);
 await e.registerKnown({id:'A',revision:'r2',payload:qty(9)});
 assert.equal(e.read(x.id).reason,'STALE_DEPENDENCY');
});
test('18 gap resolution needs supplied source evidence hint',async()=>{
 const e=await make();await gap(e,'G');assert.equal((await e.resolveGap({id:'G',expectedRevision:'r1',revision:'r2',payload:qty(5)})).reason,'RESOLUTION_CONTRACT_INVALID');
});
test('19 explicit intentionally-open resolution creates candidate not proof',async()=>{
 const e=await make();await gap(e,'G','INTENTIONALLY_OPEN');
 const r=await e.resolveGap({id:'G',expectedRevision:'r1',revision:'r2',payload:qty(5),evidenceRef:'hint_source',decision:'explicit_user_choice'});
 assert.equal(r.status,'resolved_candidate');assert.equal(r.evidence_certification,'UNVERIFIED');
 const added=await add(e,['A','G']);assert.equal(added.result.value.numerator,'6');
 assert.equal(e.read('G').packet.authority,'none');
});
test('20 resolved blank preserves an explicit revision history',async()=>{
 const e=await make();await gap(e,'G','UNKNOWN');await e.resolveGap({id:'G',expectedRevision:'r1',revision:'r2',payload:qty(5),evidenceRef:'h1'});
 const h=e.readGapHistory('G').packet.events;assert.equal(h.length,2);assert.equal(h[0].state,'UNKNOWN');assert.equal(h[1].state,'SUPPLIED_UNVERIFIED');
});
test('21 resolving one gap cannot rewrite an old composed X',async()=>{
 const e=await make();await gap(e,'G');const x=await add(e,['A','G']);
 await e.resolveGap({id:'G',expectedRevision:'r1',revision:'r2',payload:qty(3),evidenceRef:'h1'});
 assert.equal(e.read(x.id).reason,'STALE_DEPENDENCY');
 const y=await add(e,['A','G']);assert.equal(y.result.value.numerator,'4');
});
test('22 a restricted typed input cannot leak through partial X',async()=>{
 const e=await make();await gap(e,'G');await e.registerKnown({id:'SECRET',revision:'r1',payload:qty(90),capabilities:['read_secret']});
 const no=await add(e,['SECRET','G']);assert.equal(no.status,'blocked');
 const yes=await e.compose({inputIds:['SECRET','G'],rule:'quantity_sum',context:{target_unit:'MB'},capabilities:['read_secret']});
 assert.equal(yes.status,'created_partial');assert.equal(e.read(yes.id).status,'blocked');
 assert.equal(e.read(yes.id,{capabilities:['read_secret']}).packet.coverage,'INCOMPLETE');
});
test('23 no automatic memory write or remote ACK in partial results',async()=>{
 const e=await make();await gap(e,'G');const p=e.read((await add(e,['A','G'])).id).packet;
 assert.equal(p.authority,'none');assert.equal(p.memory_approval,'NOT_APPROVED');assert.equal(p.real_ack,'NOT_VERIFIED');
 assert.equal(p.automatic_fill,false);
});
test('24 invalid blank state is rejected',async()=>{const e=await make();assert.equal((await gap(e,'G','VERIFIED')).reason,'GAP_CONTRACT_INVALID');});
test('25 unknown rule is blocked, no inference engine invented',async()=>{
 const e=await make();await gap(e,'G');assert.equal((await e.compose({inputIds:['A','G'],rule:'invent_answer'})).reason,'RULE_NOT_ALLOWED');
});
test('26 reference-only inputs never invent a computed result',async()=>{
 const e=await make();const r=await e.compose({inputIds:['A','B'],rule:'derive_candidate'});
 assert.equal(r.status,'created_partial');assert.equal(e.read(r.id).packet.coverage,'REFERENCE_ONLY');assert.equal(e.read(r.id).packet.computed_value,null);
});
test('27 compare_refs stays reference-only with open blank',async()=>{
 const e=await make();await gap(e,'G','INTENTIONALLY_OPEN');const r=await e.compose({inputIds:['A','G'],rule:'compare_refs'});
 assert.equal(e.read(r.id).packet.rule.name,'compare_refs');assert.equal(e.read(r.id).packet.blanks[0].state,'INTENTIONALLY_OPEN');
});
test('28 same gap ID cannot be registered twice without revision',async()=>{
 const e=await make();await gap(e,'G');assert.equal((await gap(e,'G')).reason,'ID_ALREADY_REGISTERED');
});
test('29 gap revision requires exact previous version',async()=>{
 const e=await make();await gap(e,'G');assert.equal((await e.reviseGap({id:'G',expectedRevision:'r0',revision:'r2',state:'MISSING'})).reason,'STALE_EXPECTED_REVISION');
});
test('30 version rollback cannot erase blank history',async()=>{
 const e=await make();await gap(e,'G');await e.reviseGap({id:'G',expectedRevision:'r1',revision:'r2',state:'UNKNOWN'});
 assert.equal((await e.reviseGap({id:'G',expectedRevision:'r2',revision:'r1',state:'MISSING'})).reason,'REVISION_REUSE_OR_ROLLBACK');
});
test('31 redacted history never reveals past statuses',async()=>{
 const e=await make();await gap(e,'R','REDACTED');assert.equal(e.readGapHistory('R').reason,'ACCESS_DENIED_OR_UNAVAILABLE');
});
test('32 redacted state cannot be changed by unauthenticated adapter',async()=>{
 const e=await make();await gap(e,'R','REDACTED');assert.equal((await e.reviseGap({id:'R',expectedRevision:'r1',revision:'r2',state:'UNKNOWN'})).reason,'ACCESS_DENIED_OR_UNAVAILABLE');
});
test('33 partial nesting does not upgrade proof status or origin count',async()=>{
 const e=await make();await gap(e,'G');const x=await add(e,['A','G']);const y=await add(e,[x.id,'B']);
 assert.equal(e.read(y.id).packet.evidence_certification,'UNVERIFIED');assert.equal(e.read(y.id).packet.blanks.length,1);
});
test('34 duplicate input cannot manufacture independent input counts',async()=>{
 const e=await make();await gap(e,'G');assert.equal((await add(e,['G','G'])).reason,'INPUT_LIST_INVALID');
});
test('35 input list is bounded to 32',async()=>{
 const e=await make();await gap(e,'G');assert.equal((await add(e,Array.from({length:33},(_,i)=>'I'+i))).reason,'INPUT_LIST_INVALID');
});
test('36 invalid context (function/JSON) fails closed',async()=>{
 const e=await make();await gap(e,'G');assert.equal((await e.compose({inputIds:['A','G'],rule:'derive_candidate',context:{fn:()=>1}})).reason,'CONTEXT_INVALID');
});
test('37 invalid user-supplied capability context is rejected',async()=>{
 const e=await make();await gap(e,'G');assert.equal((await e.compose({inputIds:['A','G'],rule:'derive_candidate',capabilities:[null]})).reason,'CONTEXT_OR_CAPABILITIES_INVALID');
});
test('38 missing referenced input blocks, rather than inventing a gap',async()=>{
 const e=await make();assert.equal((await add(e,['A','NONEXISTENT'])).status,'blocked');
});
test('39 bare null and missing field remain different from typed blank state',async()=>{
 const e=await make();assert.equal((await e.registerKnown({id:'NULL',revision:'r1',payload:null})).status,'blocked');
 assert.equal(e.read('NULL').status,'blocked');
});
test('40 stored blank explanation is a bounded code, not an arbitrary prompt',async()=>{
 const e=await make();assert.equal((await gap(e,'G','UNKNOWN','<script>')).status,'blocked');
 await gap(e,'H','UNKNOWN','r1','NOT_YET_CHECKED');assert.equal(e.read('H').packet.explanation_code,'NOT_YET_CHECKED');
});
test('41 cap depth prevents unbounded nested partial expansion',async()=>{
 const e=createGapAwareEngine({maxDepth:2});await e.registerKnown({id:'A',revision:'r1',payload:qty(1)});await gap(e,'G');
 const x=await add(e,['A','G']);const y=await add(e,[x.id,'A']);assert.equal(y.status,'created_partial');
 const z=await add(e,[y.id,'A']);assert.equal(z.reason,'COMPOSITION_DEPTH_LIMIT');
});
test('42 partial read reproducibility does not alter original source',async()=>{
 const e=await make();await gap(e,'G');const aBefore=e.read('A').packet;
 const x=await add(e,['A','G']);assert.equal(e.read(x.id).packet.schema,GAP_SCHEMA);
 assert.deepEqual(e.read('A').packet,aBefore);
});

test('43 projected record missing a selected key must not be silently dropped',async()=>{
 const e=createGapAwareEngine();
 await e.registerKnown({id:'R1',revision:'r1',payload:{kind:'record',fields:{name:'A'}}});
 await e.registerKnown({id:'R2',revision:'r1',payload:{kind:'record',fields:{name:'B',value:0}}});
 const r=await e.compose({inputIds:['R1','R2'],rule:'record_project',context:{fields:['name','value']}});
 assert.equal(r.reason,'UNDECLARED_FIELD_GAP');
});
test('44 explicit null field remains ambiguous until typed missingness supplied',async()=>{
 const e=createGapAwareEngine();
 for(const id of ['R1','R2'])await e.registerKnown({id,revision:'r1',payload:{kind:'record',fields:{name:id,value:null}}});
 const r=await e.compose({inputIds:['R1','R2'],rule:'record_project',context:{fields:['value']}});
 assert.equal(r.reason,'NULL_FIELD_AMBIGUOUS');
});
test('45 record zero value stays valid when field is present',async()=>{
 const e=createGapAwareEngine();
 await e.registerKnown({id:'R1',revision:'r1',payload:{kind:'record',fields:{value:0}}});
 await e.registerKnown({id:'R2',revision:'r1',payload:{kind:'record',fields:{value:1}}});
 const r=await e.compose({inputIds:['R1','R2'],rule:'record_project',context:{fields:['value']}});
 assert.equal(r.status,'created');assert.equal(r.result.rows[0].fields.value,0);
});
test('46 record with explicit blank slot returns incomplete rather than dropping it',async()=>{
 const e=createGapAwareEngine();
 await e.registerKnown({id:'R1',revision:'r1',payload:{kind:'record',fields:{name:'A'}}});
 await e.registerGap({id:'R1_value',revision:'r1',state:'MISSING'});
 const r=await e.compose({inputIds:['R1','R1_value'],rule:'record_project',context:{fields:['name','value']}});
 assert.equal(r.status,'created_partial');assert.equal(e.read(r.id).packet.blanks[0].state,'MISSING');
});

test('47 X=A+B then X+C reuses numeric X without reloading A/B in call',async()=>{
 const e=await make();const x=await add(e,['A','B']);
 assert.equal(x.status,'created');assert.equal(e.read(x.id).packet.typed_result.value.numerator,'3');
 const y=await add(e,[x.id,'C']);
 assert.equal(y.status,'created');assert.equal(y.result.value.numerator,'6');
 assert.deepEqual(e.read(y.id).packet.typed_result.value,{numerator:'6',denominator:'1'});
});
test('48 source read retains only hash ref, transformed X read can return calculated value',async()=>{
 const e=await make();const x=await add(e,['A','B']);
 assert.equal('payload' in e.read('A').packet,false);
 assert.equal(e.read(x.id).packet.kind,'transformed');
});
test('49 X is known numeric but X+G remains incomplete when G is unknown',async()=>{
 const e=await make();const x=await add(e,['A','B']);await gap(e,'G');
 const y=await add(e,[x.id,'G']);const p=e.read(y.id).packet;
 assert.equal(p.blanks[0].state,'UNKNOWN');assert.equal(p.computed_value,null);
 assert.deepEqual(p.known_input_ids,[x.id]);
});
test('50 revision update invalidates numeric X before downstream reuse',async()=>{
 const e=await make();const x=await add(e,['A','B']);
 await e.registerKnown({id:'A',revision:'r2',payload:qty(88)});
 assert.equal(e.read(x.id).status,'blocked');
 assert.equal((await add(e,[x.id,'C'])).status,'blocked');
});