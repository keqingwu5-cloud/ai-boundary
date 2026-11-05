const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const {createHmacAuth}=require('../api/auth-adapter.cjs');const {createHttpServer}=require('../api/http-server.cjs');
const secret='this-is-a-32-byte-minimum-test-secret-value';
function token(claims){const p=Buffer.from(JSON.stringify(claims)).toString('base64url');return p+'.'+crypto.createHmac('sha256',secret).update(p).digest('base64url');}
test('rejects forged signature and expired token',async()=>{const auth=createHmacAuth({keys:{worker:secret},clock:()=>1000000});const claims={endpoint_id:'worker',aud:'mainbrain-api',iat:990,exp:1010,scopes:['tasks:send']};assert.equal((await auth({headers:{authorization:'Bearer '+token(claims)}})).endpoint_id,'worker');await assert.rejects(auth({headers:{authorization:'Bearer '+token({...claims,exp:999})}}),/UNAUTHORIZED/);await assert.rejects(auth({headers:{authorization:'Bearer '+token(claims).slice(0,-2)+'xx'}}),/UNAUTHORIZED/);});
test('HTTP denies unauthenticated send and limits payload',async()=>{const server=createHttpServer({store:{},authenticate:async()=>null});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const url='http://127.0.0.1:'+server.address().port+'/v1/tasks/send';let r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,401);r=await fetch(url,{method:'POST',body:'x'.repeat(66000)});assert.equal(r.status,413);}finally{await new Promise(r=>server.close(r));}});


test('HTTP returns 409 for known idempotency conflict from store',async()=>{
 const store={async enqueue(){throw Error('IDEMPOTENCY_CONFLICT');}};
 const authenticate=async()=>({verified:true,endpoint_id:'sender',scopes:['tasks:send']});
 const server=createHttpServer({store,authenticate});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/v1/tasks/send';
  const payload={event_id:'evt1',task_id:'task1',destination_endpoint_id:'receiver',idempotency_key:'key1',payload_version:'1',payload:{text:'hello'}};
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(res.status,409);
  assert.deepEqual(await res.json(),{error:'IDEMPOTENCY_CONFLICT'});
 }finally{await new Promise(r=>server.close(r));}
});
test('HTTP does not expose unexpected internal error messages',async()=>{
 const store={async enqueue(){throw Error('sensitive database connection details');}};
 const authenticate=async()=>({verified:true,endpoint_id:'sender',scopes:['tasks:send']});
 const server=createHttpServer({store,authenticate});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/v1/tasks/send';
  const payload={event_id:'evt2',task_id:'task2',destination_endpoint_id:'receiver',idempotency_key:'key2',payload_version:'1',payload:{text:'hello'}};
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(res.status,500);
  assert.deepEqual(await res.json(),{error:'INTERNAL_ERROR'});
 }finally{await new Promise(r=>server.close(r));}
});

test('HTTP intent endpoint preserves verified actor and rejects insufficient scope',async()=>{
 const calls=[];
 const store={markExternalIntent:async p=>{calls.push(p);return {...p,external_intent_at:'2026-11-01T00:00:00Z'};}};
 const authenticate=async req=>({verified:true,endpoint_id:'worker2',
   scopes:req.headers.authorization==='Bearer permitted'?['tasks:execute']:['tasks:receive']});
 const server=createHttpServer({store,authenticate});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/v1/tasks/intent';
  const body=JSON.stringify({event_id:'EV1',attempt_id:'ATT1',endpoint_id:'spoofed'});
  let result=await fetch(url,{method:'POST',headers:{authorization:'Bearer limited','content-type':'application/json'},body});
  assert.equal(result.status,401);
  assert.equal(calls.length,0);
  result=await fetch(url,{method:'POST',headers:{authorization:'Bearer permitted','content-type':'application/json'},body});
  assert.equal(result.status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].endpoint_id,'worker2');
  assert.equal(calls[0].attempt_id,'ATT1');
 }finally{await new Promise(r=>server.close(r));}
});
