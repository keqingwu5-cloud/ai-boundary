"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const http=require("node:http");
const {origins,inspect,inspectRemote}=require("../scripts/check-memory-private-origin.cjs");
const priv="https://memory.test.example/memory.html";
const pub="https://public.test.example/";
const csp="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const safeHeaders={
 "content-type":"text/html; charset=utf-8",
 "content-security-policy":csp,
 "referrer-policy":"no-referrer",
 "cache-control":"no-store, max-age=0",
 "x-content-type-options":"nosniff",
 "cross-origin-resource-policy":"same-origin",
 "strict-transport-security":"max-age=31536000"
};
const base=(override={})=>({privateUrl:priv,publicUrl:pub,headers:safeHeaders,...override});
test("preflight requires genuinely distinct HTTPS hostname; same host changed path or port fails",()=>{
 assert.throws(()=>origins("https://public.test.example/memory.html",pub),/private_hostname/);
 assert.throws(()=>origins("https://public.test.example:8443/memory.html",pub),/private_hostname/);
 assert.throws(()=>origins("http://memory.test.example/memory.html",pub),/https_required/);
 assert.throws(()=>origins(priv,"http://public.test.example/"),/https_required/);
 assert.throws(()=>origins("https://memory.test.example:8443/memory.html",pub),/private_unusual_port/);
 assert.throws(()=>origins("https://memory.test.example/sub/memory.html",pub),/private_page_not_bundle/);
});
test("preflight rejects URL credentials and any query or fragment",()=>{
 assert.throws(()=>origins("https://user:secret@memory.test.example/memory.html",pub),/credentials_or_query/);
 assert.throws(()=>origins(priv+"?token=DO_NOT_SEND",pub),/credentials_or_query/);
 assert.throws(()=>origins(priv+"#private-content",pub),/credentials_or_query/);
});
test("correct HTTPS host headers pass only the header gate; never authorize deployment",()=>{
 const r=inspect(base());
 assert.equal(r.result,"HOST_HEADERS_PASS_NOT_RELEASE_APPROVAL");
 assert.deepEqual(r.blocking,[]);
 assert.equal(r.syntheticOnly,false);
 assert.equal(r.checks["csp:frame-ancestors"],"PASS");
 assert.equal(r.checks.hsts,"PASS");
});
test("meta-only CSP or frame-ancestors missing from HTTP header blocks",()=>{
 const noCsp={...safeHeaders};
 delete noCsp["content-security-policy"];
 const a=inspect(base({headers:noCsp}));
 assert.equal(a.result,"RELEASE_BLOCKED");
 assert.ok(a.blocking.includes("unsafe_or_missing_csp_frame-ancestors"));
 const b=inspect(base({headers:{...safeHeaders,"content-security-policy":csp.replace("; frame-ancestors 'none'","")}}));
 assert.ok(b.blocking.includes("unsafe_or_missing_csp_frame-ancestors"));
});
test("unsafe CSP network, eval, or injected second directive are rejected",()=>{
 const evil=["connect-src https:","script-src 'self' 'unsafe-eval'","frame-ancestors *","script-src 'self'; script-src 'unsafe-inline'"];
 for(const bad of evil){
  const replacement=bad.startsWith("script-src 'self';")?
   csp+"; "+bad.split("; ")[1]:
   csp.replace(/(?:connect-src|script-src|frame-ancestors) [^;]+/,bad);
  const r=inspect(base({headers:{...safeHeaders,"content-security-policy":replacement}}));
  assert.equal(r.result,"RELEASE_BLOCKED",bad);
 }
});
test("weak cache, MIME sniffing, referrer and CORP are independently rejected",()=>{
 const cases=[
  ["cache-control","public, max-age=86400","private_page_must_not_be_cached"],
  ["content-type","text/plain","private_html_mime_invalid"],
  ["x-content-type-options","none","nosniff_header_missing"],
  ["referrer-policy","origin","referrer_policy_not_strict"],
  ["cross-origin-resource-policy","cross-origin","private_cross_origin_resource_policy_missing"]
 ];
 for(const [field,bad,expected] of cases){
  const r=inspect(base({headers:{...safeHeaders,[field]:bad}}));
  assert.ok(r.blocking.includes(expected),field);
 }
});
test("private response cookie and CORS access are deployment blockers",()=>{
 let r=inspect(base({headers:{...safeHeaders,"set-cookie":"session=SYNTHETIC; Secure"}}));
 assert.ok(r.blocking.includes("private_page_must_not_set_cookies"));
 r=inspect(base({headers:{...safeHeaders,"access-control-allow-origin":"*"}}));
 assert.ok(r.blocking.includes("private_page_must_not_expose_cors"));
});
test("redirect, error status, and absent HSTS are blockers",()=>{
 for(const status of [301,302,403,404,500]){
  const r=inspect(base({status}));
  assert.ok(r.blocking.includes("private_page_not_http_200"));
 }
 const headers={...safeHeaders};delete headers["strict-transport-security"];
 assert.ok(inspect(base({headers})).blocking.includes("hsts_missing_or_too_short"));
});
test("HTTP loopback synthetic exemption is explicit and NEVER produces release approval",()=>{
 const a="http://127.0.0.1:33001/memory.html",b="http://localhost:33002/";
 assert.throws(()=>origins(a,b),/https_required/);
 const r=inspect({privateUrl:a,publicUrl:b,headers:{...safeHeaders,"strict-transport-security":""},syntheticLoopback:true});
 assert.equal(r.syntheticOnly,true);
 assert.equal(r.result,"HOST_HEADERS_PASS_NOT_RELEASE_APPROVAL");
 assert.equal(r.checks.hsts,"SYNTHETIC_ONLY_NOT_ASSESSED");
 assert.equal(inspect({privateUrl:"http://memory.test.example/memory.html",publicUrl:pub,headers:safeHeaders,syntheticLoopback:true}).result,"RELEASE_BLOCKED");
});
test("read-only remote verifier checks live response headers using anonymous GET and does not send a vault",async()=>{
 const hits=[];
 const server=http.createServer((req,res)=>{
  hits.push({method:req.method,url:req.url,cookie:req.headers.cookie||""});
  res.writeHead(200,safeHeaders);
  res.end("<!doctype html><title>synthetic private host</title>");
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const u="http://127.0.0.1:"+server.address().port+"/memory.html";
  const r=await inspectRemote(u,"http://localhost:39999/",{syntheticLoopback:true});
  assert.equal(r.result,"HOST_HEADERS_PASS_NOT_RELEASE_APPROVAL");
  assert.equal(r.syntheticOnly,true);
  assert.deepEqual(hits,[{method:"GET",url:"/memory.html",cookie:""}]);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test("remote preflight rejects redirects without following them",async()=>{
 const hits=[];
 const server=http.createServer((req,res)=>{
  hits.push(req.url);
  res.writeHead(302,{location:"/unsafe-target",...safeHeaders});
  res.end();
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const u="http://127.0.0.1:"+server.address().port+"/memory.html";
  const r=await inspectRemote(u,"http://localhost:39999/",{syntheticLoopback:true});
  assert.ok(r.blocking.includes("private_page_not_http_200"));
  assert.deepEqual(hits,["/memory.html"]);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test("remote preflight requires authorized URLs before any network request",async()=>{
 let called=0;
 await assert.rejects(()=>inspectRemote("http://private.test.example/memory.html",pub,{fetchImpl:async()=>{called++;throw Error("unexpected network");}}),/https_required/);
 await assert.rejects(()=>inspectRemote("https://public.test.example/memory.html",pub,{fetchImpl:async()=>{called++;throw Error("unexpected network");}}),/private_hostname/);
 assert.equal(called,0);
});
