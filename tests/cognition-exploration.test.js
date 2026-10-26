const assert=require('node:assert/strict');
const {review}=require('../modules/cognition-exploration.js');
const base={id:'c1',question:'Why does a handoff stop?'};
const testable={...base,testProcedure:'run isolated handoff',expectedOutcome:'missing receiver blocks'};
const evidence={kind:'independent_run',ref:'ci://123',verifier:'isolated-runner',commit:'abc123',testScope:'unit',passed:true};
const cases=[
['unexplored defaults to exploring',()=>assert.equal(review(base).phase,'EXPLORING')],
['no test cannot claim verified',()=>assert.equal(review({...base,requestedPhase:'VERIFIED'}).phase,'EXPLORING')],
['test plan promotes only to testable',()=>assert.equal(review({...testable,requestedPhase:'VERIFIED'}).phase,'TESTABLE')],
['evidence does not upgrade without requested phase',()=>assert.equal(review({...testable,evidence:[evidence]}).phase,'EXPLORING')],
['independent evidence and plan permit verified label',()=>assert.equal(review({...testable,requestedPhase:'VERIFIED',evidence:[evidence]}).phase,'VERIFIED')],
['self assertion not independent proof',()=>assert.equal(review({...testable,requestedPhase:'VERIFIED',evidence:[{...evidence,kind:'self_report'}]}).phase,'TESTABLE')],
['result never authorizes execution',()=>assert.equal(review({...testable,requestedPhase:'VERIFIED',evidence:[evidence]}).authorizesExecution,false)],
['source references preserved in proposed event',()=>assert.deepEqual(review({...base,sourceRefs:['issue:41']}).proposedMemoryEvent.sourceRefs,['issue:41'])],
['missing id rejected',()=>assert.throws(()=>review({question:'q'}))]
];
let failed=0;for(const [name,fn] of cases){try{fn();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,e.message)}}if(failed)process.exitCode=1;
