'use strict';
const http=require('node:http');
const {URL}=require('node:url');
const {createApi}=require('./mainbrain-api.cjs');
const MAX_BODY=65536;
function createHttpServer({store,authenticate,logger=()=>{}}){
 const api=createApi({store,authenticate});
 const routes={'POST /v1/tasks/send':'send','POST /v1/tasks/receive':'receive','POST /v1/tasks/intent':'intent','POST /v1/tasks/authorize':'authorize','POST /v1/tasks/report':'report','POST /v1/tasks/execute':'execute','POST /v1/tasks/ack':'ack','POST /v1/tasks/fail':'fail'};
 return http.createServer(async(req,res)=>{
  let action='unknown';
  try{
   const url=new URL(req.url,'http://localhost');
   const path=url.pathname;
   // Whitelist revision-scoped source IDs; never generically decode URL segments.
   const match=/^\/v1\/tasks\/([A-Za-z0-9_-]{1,128}|source(?::|%3[Aa])[0-9a-f]{64})$/.exec(path);
   const pathEventId=match ? match[1].replace(/^source%3[Aa]/,'source:') : null;
   const method=routes[req.method+' '+path]||(req.method==='GET'&&match?'status':null);
   if(!method){res.writeHead(404);res.end(JSON.stringify({error:'NOT_FOUND'}));return;}
   action=method;let body={};
   if(req.method==='POST'){
    let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Object.assign(Error('body too large'),{code:'TOO_LARGE'});chunks.push(chunk);}
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw Object.assign(Error('invalid JSON'),{code:'BAD_REQUEST'});}
   }
   const q=Object.fromEntries(url.searchParams.entries());
   // The path event ID is authoritative; B2 query options must not replace it.
   const params=match?{...q,event_id:pathEventId}:{};
   const value=await api[method]({headers:req.headers,body,params});
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({data:value}));
  }catch(e){
   const knownCodes=new Set(['UNAUTHORIZED','FORBIDDEN','NOT_FOUND','BAD_REQUEST','TOO_LARGE','IDEMPOTENCY_CONFLICT','EVENT_CONFLICT']);
   const code=(typeof e.code==='string'&&knownCodes.has(e.code))?e.code:(knownCodes.has(e.message)?e.message:'INTERNAL_ERROR');
   const status={UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,BAD_REQUEST:400,TOO_LARGE:413,IDEMPOTENCY_CONFLICT:409,EVENT_CONFLICT:409}[code]||500;
   logger({action,error_code:code,status});
   res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:code}));
  }
 });
}
module.exports={createHttpServer};
