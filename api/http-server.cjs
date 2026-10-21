'use strict';
const http=require('node:http');
const {URL}=require('node:url');
const {createApi}=require('./mainbrain-api.cjs');
const MAX_BODY=65536;
function createHttpServer({store,authenticate,logger=()=>{}}){
 const api=createApi({store,authenticate});
 const routes={'POST /v1/tasks/send':'send','POST /v1/tasks/receive':'receive','POST /v1/tasks/execute':'execute','POST /v1/tasks/ack':'ack','POST /v1/tasks/fail':'fail'};
 return http.createServer(async(req,res)=>{
  let action='unknown';
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   const match=/^\/v1\/tasks\/([A-Za-z0-9_-]{1,128})$/.exec(path);
   const method=routes[req.method+' '+path]||(req.method==='GET'&&match?'status':null);
   if(!method){res.writeHead(404);res.end(JSON.stringify({error:'NOT_FOUND'}));return;}
   action=method;let body={};
   if(req.method==='POST'){
    let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Object.assign(Error('body too large'),{code:'TOO_LARGE'});chunks.push(chunk);}
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw Object.assign(Error('invalid JSON'),{code:'BAD_REQUEST'});}
   }
   const value=await api[method]({headers:req.headers,body,params:match?{event_id:match[1]}:{}});
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({data:value}));
  }catch(e){
   const code=e.code||(/UNAUTHORIZED/.test(e.message)?'UNAUTHORIZED':'INTERNAL_ERROR');
   const status={UNAUTHORIZED:401,FORBIDDEN:403,NOT_FOUND:404,BAD_REQUEST:400,TOO_LARGE:413,IDEMPOTENCY_CONFLICT:409,EVENT_CONFLICT:409}[code]||500;
   logger({action,error_code:code,status});
   res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:code}));
  }
 });
}
module.exports={createHttpServer};
