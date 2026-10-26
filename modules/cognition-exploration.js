/* Cognition exploration log V0.1. Pure functions; no writes to memory, GitHub or permissions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CognitionExploration=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PHASES=['EXPLORING','TESTABLE','VERIFIED'];
const validText=x=>typeof x==='string'&&x.trim().length>0;
function review(item){
 if(!item||typeof item!=='object'||!validText(item.id)||!validText(item.question))throw Error('id and question required');
 const evidence=Array.isArray(item.evidence)?item.evidence:[];
 const hasTest=validText(item.expectedOutcome)&&validText(item.testProcedure);
 const independentEvidence=evidence.some(e=>e&&validText(e.ref)&&validText(e.verifier)&&validText(e.commit)&&validText(e.testScope)&&e.kind==='independent_run'&&e.passed===true);
 const requested=PHASES.includes(item.requestedPhase)?item.requestedPhase:'EXPLORING';
 const actual=independentEvidence&&hasTest?'VERIFIED':hasTest?'TESTABLE':'EXPLORING';
 const phase=PHASES[Math.min(PHASES.indexOf(requested),PHASES.indexOf(actual))];
 return {id:item.id,question:item.question,requestedPhase:requested,phase,missing:[...(!hasTest?['test procedure and expected outcome']:[]),...(requested==='VERIFIED'&&!independentEvidence?['independent execution evidence']:[])],claimsAreFacts:false,authorizesExecution:false,proposedMemoryEvent:{type:'COGNITION_EXPLORATION_REVIEWED',id:item.id,phase,sourceRefs:Array.isArray(item.sourceRefs)?item.sourceRefs:[]}};
}
return Object.freeze({review});
});
