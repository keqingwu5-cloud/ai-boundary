import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 API_VERSION,ROUTE_CATALOG,projectInput,conversationInput,taskInput,
 settingsInput,connectorInput,refusalInput,visibleAlert,taskStopDecision
} from '../tcvl-api-core.mjs';

const project='11111111-1111-4111-8111-111111111111';
const conversation='22222222-2222-4222-8222-222222222222';
test('shared entry point lists custom two-way connector routes',()=>{
 const paths=ROUTE_CATALOG.map(x=>x.method+' '+x.path);
 assert.ok(paths.includes('POST /v1/connectors/validate'));
 assert.ok(paths.includes('POST /v1/transfers/preview'));
 assert.match(API_VERSION,/tcvl.platform-api.v1/);
});
test('project title must be supplied, never blindly accepted',()=>{
 assert.equal(projectInput({name:'  World model  '}).value.name,'World model');
 assert.equal(projectInput({name:' '}).error,'project_name_required');
});
test('conversation always links to a valid project',()=>{
 assert.ok(conversationInput({project_id:project,title:'Chat'}).value);
 assert.ok(conversationInput({project_id:'wrong',title:'Chat'}).error);
});
test('task can link to conversation without merging independent processes',()=>{
 assert.ok(taskInput({project_id:project,conversation_id:conversation,title:'Test'}).value);
 assert.ok(taskInput({project_id:project,conversation_id:'fake',title:'Test'}).error);
});
test('connector creation only permits registry fields; not tokens or endpoints',()=>{
 const valid={connector_id:'ai-future',display_name:'Future AI',provider:'custom',capabilities:['model.respond']};
 assert.equal(connectorInput(valid).value.status,'planned');
 assert.equal(connectorInput({...valid,api_key:'untrusted'}).error,'connector_extra_field_forbidden');
});
test('unknown or duplicate capabilities cannot be registered',()=>{
 const base={connector_id:'x',display_name:'X',provider:'custom'};
 assert.ok(connectorInput({...base,capabilities:['model.respond','model.respond']}).error);
 assert.ok(connectorInput({...base,capabilities:['unknown']}).error);
});
test('stop is a request, not a remote cancellation acknowledgement',()=>{
 const r=taskStopDecision('running');
 assert.equal(r.result,'stop_requested');
 assert.match(r.message,/尚未保證遠端執行已停止/);
 assert.equal(taskStopDecision('stop_requested').action,'unchanged');
 assert.equal(taskStopDecision('completed').result,'completed');
});
test('refusal must show cause, affected work and next action',()=>{
 const r=refusalInput({reason:'unknown source',impact:'blocks approval',next_action:'provide evidence'});
 assert.equal(r.value.reason,'unknown source');
 assert.ok(refusalInput({reason:'missing',impact:'yes'}).error);
 const alert=visibleAlert({kind:'rejection',task_id:project,details:r.value});
 assert.equal(alert.impact,'blocks approval');
});
test('image settings and notification preferences use shared validation',()=>{
 const x=settingsInput({image:{aspect_ratio:'16:9',quality:'high'},notifications:{rejection_alerts:true}});
 assert.equal(x.value.image.quality,'high');
 assert.ok(settingsInput({image:{api_secret:'x'}}).error);
 assert.ok(settingsInput({ui:{show_inbound:'yes'}}).error);
});
test('front-end and backend transfer contracts must remain byte-identical',()=>{
 const one=readFileSync(new URL('../tcvl-transfer-contract.mjs',import.meta.url),'utf8');
 const two=readFileSync(new URL('../supabase/functions/_shared/tcvl-transfer-contract.mjs',import.meta.url),'utf8');
 assert.equal(one,two);
});
