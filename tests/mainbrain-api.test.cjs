const {test}=require('node:test');const assert=require('node:assert/strict');const {createApi}=require('../api/mainbrain-api.cjs');
function setup(){const records=new Map(),calls=[];const store={
 async enqueue(p){calls.push('enqueue');const old=[...records.values()].find(x=>x.source_endpoint_id===p.source_endpoint_id&&x.idempotency_key===p.idempotency_key);if(old){if(old.payload_digest!==p.payload_digest)throw Error('IDEMPOTENCY_CONFLICT');return old;}if(records.has(p.event_id))throw Error('EVENT_CONFLICT');records.set(p.event_id,p);return p;},
 async lease({destination_endpoint_id}){calls.push('lease');return [...records.values()].filter(x=>x.destination_endpoint_id===destination_endpoint_id&&x.state==='queued');},
 async markExternalIntent(p){calls.push('intent');return p;},
 async markExecuted(p){calls.push('execute');return p;},async ack(p){calls.push('ack');return p;},async fail(p){calls.push('fail');return p;},async get(id){return records.get(id);}
 };const api=createApi({store,authenticate:async req=>req.principal,clock:()=> '2026-10-19T00:00:00Z'});const principal=(endpoint_id,scopes)=>({verified:true,endpoint_id,scopes});const payload={event_id:'E1',task_id:'T1',destination_endpoint_id:'worker2',idempotency_key:'K1',payload_version:'1',payload:{instruction:'review'}};return {api,principal,payload,calls};}
test('rejects unauthenticated sender',async()=>{const {api,payload}=setup();await assert.rejects(api.send({body:payload}),/Verified endpoint/);});
test('send uses authenticated identity, never body actor',async()=>{const {api,principal,payload}=setup();const v=await api.send({principal:principal('gpt1',['tasks:send']),body:{...payload,source_endpoint_id:'spoof'}});assert.equal(v.source_endpoint_id,'gpt1');assert.equal(v.state,'queued');});
test('same idempotency key returns same event; changed content conflicts',async()=>{const {api,principal,payload}=setup(),req=p=>({principal:principal('gpt1',['tasks:send']),body:p});const a=await api.send(req(payload)),b=await api.send(req(payload));assert.equal(a,b);await assert.rejects(api.send(req({...payload,payload:{instruction:'changed'}})),/IDEMPOTENCY_CONFLICT/);});
test('only destination can receive task',async()=>{const {api,principal,payload}=setup();await api.send({principal:principal('gpt1',['tasks:send']),body:payload});assert.equal((await api.receive({principal:principal('worker2',['tasks:receive'])})).length,1);assert.equal((await api.receive({principal:principal('other',['tasks:receive'])})).length,0);});
test('status access limited to endpoints',async()=>{const {api,principal,payload}=setup();await api.send({principal:principal('gpt1',['tasks:send']),body:payload});await assert.rejects(api.status({principal:principal('stranger',['tasks:status']),params:{event_id:'E1'}}),/event not accessible/);});
test('API ACK explicitly tagged as API, not ChatGPT read',async()=>{const {api,principal}=setup();const r=await api.ack({principal:principal('worker2',['tasks:ack']),body:{event_id:'E1',attempt_id:'A1',payload_digest:'a'.repeat(64),payload_version:'1',receipt_evidence:'signed receipt'}});assert.equal(r.channel,'api');});
test('ACK missing evidence rejected',async()=>{const {api,principal}=setup();await assert.rejects(api.ack({principal:principal('worker2',['tasks:ack']),body:{event_id:'E1'}}),/required/);});
test('execution requires attempt and evidence',async()=>{const {api,principal}=setup();await assert.rejects(api.execute({principal:principal('worker2',['tasks:execute']),body:{event_id:'E1'}}),/required/);});

test('intent rejects absent execute scope and uses authenticated identity',async()=>{
 const {api,principal}=setup();
 const body={event_id:'E1',attempt_id:'A1',endpoint_id:'spoofed'};
 await assert.rejects(api.intent({principal:principal('worker2',['tasks:receive']),body}),/Verified endpoint/);
 const r=await api.intent({principal:principal('worker2',['tasks:execute']),body});
 assert.equal(r.endpoint_id,'worker2');
 assert.equal(r.attempt_id,'A1');
 assert.notEqual(r.endpoint_id,'spoofed');
});
test('intent requires event and attempt identifiers',async()=>{
 const {api,principal}=setup();
 await assert.rejects(api.intent({principal:principal('worker2',['tasks:execute']),body:{event_id:'E1'}}),
   /event_id and attempt_id required/);
});

test('report evidence uses separate scope and authenticated endpoint',async()=>{
 const seen=[];
 const store={
  recordOutcome:async p=>{seen.push(['report',p]);return {...p,recorded:true};},
  authorizeDispatch:async p=>{seen.push(['authorize',p]);return {...p,authorized:true};}
 };
 const api=createApi({store,authenticate:async req=>req.principal});
 const principal=(scope)=>({verified:true,endpoint_id:'worker2',scopes:[scope]});
 const report={event_id:'E1',attempt_id:'A1',payload_digest:'a'.repeat(64),
  report_id:'report-A1',reason:'execution_outcome_unknown',endpoint_id:'spoof'};
 await assert.rejects(api.report({principal:principal('tasks:execute'),body:report}),/Verified endpoint/);
 assert.equal(seen.length,0);
 const result=await api.report({principal:principal('tasks:report'),body:report});
 assert.equal(result.endpoint_id,'worker2');
 assert.equal(seen[0][1].endpoint_id,'worker2');
 await assert.rejects(api.authorize({principal:principal('tasks:report'),
  body:{event_id:'E1',attempt_id:'A1'}}),/Verified endpoint/);
 const checked=await api.authorize({principal:principal('tasks:execute'),
  body:{event_id:'E1',attempt_id:'A1',endpoint_id:'spoof'}});
 assert.equal(checked.endpoint_id,'worker2');
 assert.equal(seen[1][0],'authorize');
});

