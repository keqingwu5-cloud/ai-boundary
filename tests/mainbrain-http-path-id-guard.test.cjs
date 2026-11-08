'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHttpServer}=require('../api/http-server.cjs');

async function withServer(store,fn){
  const authenticate=async()=>({verified:true,endpoint_id:'reader',scopes:['tasks:status']});
  const server=createHttpServer({store,authenticate});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{return await fn('http://127.0.0.1:'+server.address().port);}
  finally{await new Promise(resolve=>server.close(resolve));}
}

test('P0_HTTP_PATH_ID_001: query event_id must not replace path event_id',async()=>{
  const calls=[];
  const store={async get(id,options){
    calls.push({id,options});
    return {event_id:id,source_endpoint_id:'reader',destination_endpoint_id:'worker'};
  }};
  await withServer(store,async base=>{
    const r=await fetch(base+'/v1/tasks/EV_A?event_id=EV_B&outcome_limit=2');
    assert.equal(r.status,200);
    assert.equal((await r.json()).data.event_id,'EV_A');
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].id,'EV_A','path event ID must control the store read');
  assert.equal(calls[0].options.limit,2,'legitimate B2 pagination must still work');
});

test('P0_HTTP_PATH_ID_002: query injection cannot switch an inaccessible path event to an accessible one',async()=>{
  const calls=[];
  const store={async get(id){
    calls.push(id);
    return id==='EV_A'
      ? {event_id:id,source_endpoint_id:'other',destination_endpoint_id:'worker'}
      : {event_id:id,source_endpoint_id:'reader',destination_endpoint_id:'worker'};
  }};
  await withServer(store,async base=>{
    const r=await fetch(base+'/v1/tasks/EV_A?event_id=EV_B');
    assert.equal(r.status,403,'requested EV_A is not accessible to the caller');
    assert.deepEqual(await r.json(),{error:'FORBIDDEN'});
  });
  assert.deepEqual(calls,['EV_A'],'must never read EV_B when path identifies EV_A');
});


test('P0_HTTP_SOURCE_EVENT_001: revision-scoped source ID is readable by raw HTTP path',async()=>{
  const eventId='source:'+'a'.repeat(64),calls=[];
  const store={async get(id){calls.push(id);return {event_id:id,source_endpoint_id:'reader',destination_endpoint_id:'worker'};}};
  await withServer(store,async base=>{
    const response=await fetch(base+'/v1/tasks/'+eventId+'?event_id=EV_B');
    assert.equal(response.status,200,'source:SHA256 event_id must survive the HTTP status route');
    assert.equal((await response.json()).data.event_id,eventId);
  });
  assert.deepEqual(calls,[eventId],'path ID must override the injected query event_id');
});

test('P0_HTTP_SOURCE_EVENT_002: percent-encoded source colon is normalized to canonical ID',async()=>{
  const eventId='source:'+'b'.repeat(64),calls=[];
  const store={async get(id){calls.push(id);return {event_id:id,source_endpoint_id:'reader',destination_endpoint_id:'worker'};}};
  await withServer(store,async base=>{
    const response=await fetch(base+'/v1/tasks/'+encodeURIComponent(eventId));
    assert.equal(response.status,200,'encoded source%3A... must reach canonical source:... record');
    assert.equal((await response.json()).data.event_id,eventId);
  });
  assert.deepEqual(calls,[eventId]);
});

test('P0_HTTP_SOURCE_EVENT_003: malformed or double-encoded source IDs remain rejected',async()=>{
  const calls=[],store={async get(id){calls.push(id);return {event_id:id,source_endpoint_id:'reader',destination_endpoint_id:'worker'};}};
  await withServer(store,async base=>{
    for(const id of ['source:'+'c'.repeat(63),'source%253A'+'c'.repeat(64),'source%3A'+'c'.repeat(64)+'%2Fescape']){
      const response=await fetch(base+'/v1/tasks/'+id);
      assert.equal(response.status,404,'malformed source event route must fail closed: '+id.slice(0,20));
    }
  });
  assert.deepEqual(calls,[],'unrecognised URL encodings must never reach store');
});


test('P0_HTTP_CLIENT_SOURCE_EVENT_001: authenticated HTTP client reads source:SHA256 event through server',async()=>{
  const {createHttpTaskClient}=require('../api/http-task-client-candidate.cjs');
  const eventId='source:'+'d'.repeat(64),seen=[];
  const store={async get(id){seen.push(id);return {event_id:id,source_endpoint_id:'reader',destination_endpoint_id:'worker'};}};
  await withServer(store,async base=>{
    const client=createHttpTaskClient({baseUrl:base+'/',tokenProvider:async()=> 'test-only-token'});
    const result=await client.status({event_id:eventId});
    assert.equal(result.event_id,eventId);
  });
  assert.deepEqual(seen,[eventId],'client must preserve canonical ID through HTTP path into store');
});

test('P0_HTTP_CLIENT_SOURCE_EVENT_002: invalid and already-encoded IDs rejected before sending',async()=>{
  const {createHttpTaskClient}=require('../api/http-task-client-candidate.cjs');
  let externalCalls=0;
  const client=createHttpTaskClient({
    baseUrl:'http://127.0.0.1:9999/',
    tokenProvider:async()=>{externalCalls++;return 'test-only-token';},
    httpFetch:async()=>{externalCalls++;throw Error('unexpected HTTP fetch');}
  });
  const invalid=['source:'+'f'.repeat(63),'source%3A'+'f'.repeat(64),'source%253A'+'f'.repeat(64),'source:'+'g'.repeat(64),'source:'+'a'.repeat(64)+'/next'];
  for(const event_id of invalid)
    await assert.rejects(client.status({event_id}),/canonical event ID required/);
  assert.equal(externalCalls,0,'invalid IDs must not request token or send network traffic');
});

test('P0_HTTP_CLIENT_SOURCE_EVENT_003: legacy status ID behavior remains compatible',async()=>{
  const {createHttpTaskClient}=require('../api/http-task-client-candidate.cjs');
  const seen=[];
  const store={async get(id){seen.push(id);return {event_id:id,source_endpoint_id:'reader',destination_endpoint_id:'worker'};}};
  await withServer(store,async base=>{
    const client=createHttpTaskClient({baseUrl:base+'/',tokenProvider:async()=> 'test-only-token'});
    assert.equal((await client.status({event_id:'EV_A'})).event_id,'EV_A');
  });
  assert.deepEqual(seen,['EV_A']);
});
