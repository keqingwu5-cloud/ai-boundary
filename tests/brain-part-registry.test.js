const assert=require('node:assert/strict');
const engine=require('../modules/task-cognition-engine.js');
const registry=require('../modules/brain-part-registry.js');
const base={id:'task-1',goal:'understand and route task',originalCause:'user request',action:'review'};
const cases=[
['registry lists four independent parts',()=>assert.equal(registry.list().length,4)],
['part metadata is defensive copy',()=>{const x=registry.inspect('task-cognition');x.dependencies.push('fake');assert.deepEqual(registry.inspect('task-cognition').dependencies,[])}],
['unknown part is not invented',()=>assert.equal(registry.inspect('not-found'),null)],
['dependencies resolved before dependent part',()=>{const x=registry.resolve(['ack-handoff']);assert.deepEqual(x.selected.map(p=>p.id),['task-cognition','ack-handoff']);assert.equal(x.readyForExecution,false)}],
['unknown dependencies surfaced',()=>assert.deepEqual(registry.resolve(['missing']).missing,[{id:'missing',reason:'NOT_REGISTERED'}])],
['candidate reused for review',()=>{const r=registry.assess(base,engine);assert.ok(r.reusableMechanisms.some(m=>m.id==='task-cognition'))}],
['draft-only components never claimed implemented',()=>{const r=registry.assess({...base,action:'publish'},engine);assert.ok(r.suggestedParts.some(p=>p.id==='condition-gate'&&p.status==='DESIGN_ONLY'));assert.equal(r.canExecuteProtectedAction,false)}],
['handoff without verified prerequisites is denied',()=>assert.equal(registry.assess({...base,action:'handoff'},engine).state,'DENIED')],
['original cause retained across registry assessment',()=>assert.equal(registry.assess(base,engine).historyEvent.originalCause,base.originalCause)],
['invalid engine rejected',()=>assert.throws(()=>registry.assess(base,{}))]
];
let failed=0;for(const [name,run] of cases){try{run();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}if(failed)process.exitCode=1;
