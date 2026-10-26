/* Task cognition engine V0.1: isolated, pure evaluation; no side effects or authorization grants. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.TaskCognitionEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BLOCKING=new Set(['identity','authorization','source_integrity','trusted_ack']);
  const ALLOWED_ACTIONS=new Set(['review','draft','isolated_test','publish','deploy','protected_write','handoff']);
  const REQUIREMENTS=['identity','authorization','source_integrity'];
  const clean=x=>typeof x==='string'?x.trim():'';
  const validEvidence=e=>!!e&&typeof e==='object'&&clean(e.ref)&&e.verified===true&&clean(e.verifier)&&clean(e.scope);
  function evaluate(task,registry=[]){
    if(!task||typeof task!=='object')throw Error('task must be an object');
    const action=clean(task.action)||'review';
    if(!ALLOWED_ACTIONS.has(action))throw Error('unknown action');
    const protectedAction=['publish','deploy','protected_write','handoff'].includes(action);
    const id=clean(task.id),goal=clean(task.goal),cause=clean(task.originalCause);
    const conditions=Array.isArray(task.conditions)?task.conditions:[];
    const problems=[];
    if(!id)problems.push({code:'MISSING_ID',impact:'cannot correlate history'});
    if(!goal)problems.push({code:'MISSING_GOAL',impact:'cannot determine success'});
    if(!cause)problems.push({code:'MISSING_ORIGINAL_CAUSE',impact:'cannot preserve causal history'});
    const decisions=[];
    const ids=new Set();
    for(const c of conditions){
      if(!c||!clean(c.id)||ids.has(c.id)){problems.push({code:'INVALID_CONDITION',impact:'ambiguous prerequisites'});continue;}
      ids.add(c.id);
      const applicable=c.applicable!==false;
      const mandatory=c.mandatory===true||BLOCKING.has(c.id)&&protectedAction;
      const evidence=validEvidence(c.evidence);
      const missing=applicable&&!evidence;
      if(!applicable&&!clean(c.exclusionReason))problems.push({code:'MISSING_EXCLUSION_REASON',condition:c.id,impact:'cannot justify exclusion'});
      if(!applicable&&BLOCKING.has(c.id)&&protectedAction)problems.push({code:'PROTECTED_CONDITION_EXCLUDED',condition:c.id,impact:'security prerequisite cannot be bypassed'});
      if(missing&&mandatory)problems.push({code:'REQUIRED_CONDITION_MISSING',condition:c.id,impact:clean(c.missingImpact)||'required proof absent'});
      decisions.push({id:c.id,applicable,mandatory,evidenceVerified:evidence,status:!applicable?'NOT_APPLICABLE':evidence?'SATISFIED':'NEEDS_INFO',why:clean(c.why),missingImpact:clean(c.missingImpact)});
    }
    if(protectedAction)for(const id of REQUIREMENTS)if(!ids.has(id))problems.push({code:'REQUIRED_CONDITION_UNDECLARED',condition:id,impact:'protected operation requires declaration'});
    if(action==='handoff'&&!ids.has('trusted_ack'))problems.push({code:'REQUIRED_CONDITION_UNDECLARED',condition:'trusted_ack',impact:'receipt is unverified'});
    const matched=registry.filter(m=>m&&clean(m.id)&&m.enabled===true&&Array.isArray(m.actions)&&m.actions.includes(action)&&Array.isArray(m.requires)&&m.requires.every(r=>decisions.some(d=>d.id===r&&d.status==='SATISFIED'))).map(m=>({id:m.id,version:clean(m.version)}));
    const blocked=problems.length>0;
    const state=blocked?(protectedAction?'DENIED':'NEEDS_INFO'):(protectedAction?'READY_FOR_AUTHORIZATION':'CANDIDATE_ONLY');
    // READY_FOR_AUTHORIZATION is intentionally NOT an authorization token.
    return {schemaVersion:'0.1',taskId:id,action,goal,originalCause:cause,state,canExecuteProtectedAction:false,conditions:decisions,problems,reusableMechanisms:matched,recommendation:blocked?'supply evidence or correct declarations':protectedAction?'request independent authorization verification':'proceed only in isolated/review scope',historyEvent:{type:'COGNITION_EVALUATED',taskId:id,originalCause:cause,action,state}};
  }
  return Object.freeze({evaluate});
});
