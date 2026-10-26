const assert=require('node:assert/strict');
const {evaluate}=require('../modules/task-cognition-engine.js');
const base={id:'p-1',goal:'deliver verified handoff',originalCause:'user requested delivery'};
const proof=(scope)=>({ref:'evidence://fixture',verified:true,verifier:'fixture-verifier',scope});
const required=['identity','authorization','source_integrity','trusted_ack'].map(id=>({id,mandatory:true,why:'needed for handoff',evidence:proof('test')}));
const tests=[
['review with missing metadata is diagnostic only',()=>{const r=evaluate({action:'review'});assert.equal(r.state,'NEEDS_INFO');assert.equal(r.canExecuteProtectedAction,false)}],
['handoff without prerequisites is denied',()=>{const r=evaluate({...base,action:'handoff'});assert.equal(r.state,'DENIED');assert.ok(r.problems.some(x=>x.condition==='trusted_ack'))}],
['all synthetic proofs still do not authorize execution',()=>{const r=evaluate({...base,action:'handoff',conditions:required});assert.equal(r.state,'READY_FOR_AUTHORIZATION');assert.equal(r.canExecuteProtectedAction,false)}],
['protected identity exclusion fails closed',()=>{const r=evaluate({...base,action:'publish',conditions:[{id:'identity',applicable:false,exclusionReason:'skip'},...required.filter(x=>x.id!=='identity')]});assert.equal(r.state,'DENIED')}],
['missing exclusion rationale flagged',()=>{const r=evaluate({...base,action:'review',conditions:[{id:'optional',applicable:false}]});assert.equal(r.state,'NEEDS_INFO')}],
['existing mechanisms reused only on satisfied prerequisites',()=>{const r=evaluate({...base,action:'review',conditions:[{id:'source',evidence:proof('test')} ]},[{id:'history',enabled:true,actions:['review'],requires:['source'],version:'1'},{id:'blocked',enabled:true,actions:['review'],requires:['missing']}]);assert.deepEqual(r.reusableMechanisms,[{id:'history',version:'1'}])}],
['original cause preserved in result',()=>{const r=evaluate({...base,action:'draft'});assert.equal(r.historyEvent.originalCause,base.originalCause)}],
['unknown actions rejected',()=>assert.throws(()=>evaluate({...base,action:'override'},[]))],
['unverified self assertion does not count as proof',()=>{const r=evaluate({...base,action:'publish',conditions:required.map(c=>({...c,evidence:{verified:true}}))});assert.equal(r.state,'DENIED')}]
];
let failed=0;for(const [name,fn] of tests){try{fn();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}
if(failed)process.exitCode=1;
