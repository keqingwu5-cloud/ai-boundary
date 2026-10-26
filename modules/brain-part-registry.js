/* Shared part registry V0.1. Read-only, deterministic, no persistence or privileged actions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BrainPartRegistry=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const parts=Object.freeze([
{id:'task-cognition',version:'0.1',kind:'evaluator',status:'CANDIDATE',actions:['review','draft','isolated_test'],requires:[],dependencies:[],source:'modules/task-cognition-engine.js',effects:['diagnose task prerequisites'],limitations:['no verified authorization']},
{id:'condition-gate',version:'0.1-draft',kind:'policy',status:'DESIGN_ONLY',actions:['publish','deploy','protected_write'],requires:['identity','authorization','source_integrity'],dependencies:['task-cognition'],source:'docs/drafts/prepublish-condition-gate-v0.1.md',effects:['propose prepublication checks'],limitations:['not installed']},
{id:'history-reconciliation',version:'0.1-draft',kind:'index',status:'DESIGN_ONLY',actions:['review','draft'],requires:['source_integrity'],dependencies:[],source:'docs/drafts/keyword-global-linkage-cross-ai-reconciliation-v0.1.md',effects:['propose historical linking'],limitations:['not connected to live sources']},
{id:'ack-handoff',version:'0.1-candidate',kind:'handoff',status:'UNVERIFIED_E2E',actions:['handoff'],requires:['identity','authorization','source_integrity','trusted_ack'],dependencies:['task-cognition'],source:'PR #42 / Issue #41',effects:['propose handoff contract'],limitations:['real GPT2 receipt not verified']}
]);
const byId=new Map(parts.map(p=>[p.id,p]));
function inspect(id){const p=byId.get(id);return p?JSON.parse(JSON.stringify(p)):null;}
function resolve(ids){const wanted=Array.isArray(ids)?ids:[];const selected=[];const missing=[];const visiting=new Set();const visited=new Set();
function visit(id){if(visited.has(id))return;const p=byId.get(id);if(!p){missing.push({id,reason:'NOT_REGISTERED'});return;}if(visiting.has(id)){missing.push({id,reason:'DEPENDENCY_CYCLE'});return;}visiting.add(id);for(const dep of p.dependencies)visit(dep);visiting.delete(id);visited.add(id);selected.push(inspect(id));}
for(const id of wanted)visit(id);
return {selected,missing,readyForExecution:false};}
function assess(task,engine){if(!engine||typeof engine.evaluate!=='function')throw Error('task evaluator required');const action=task&&task.action||'review';const mechanisms=parts.filter(p=>p.status==='CANDIDATE').map(p=>({id:p.id,version:p.version,enabled:true,actions:p.actions,requires:p.requires}));const result=engine.evaluate(task,mechanisms);return {...result,registryVersion:'0.1',suggestedParts:parts.filter(p=>p.actions.includes(action)).map(p=>({id:p.id,status:p.status,source:p.source})),canExecuteProtectedAction:false};}
return Object.freeze({list:()=>parts.map(p=>inspect(p.id)),inspect,resolve,assess});
});
