'use strict';
// Child-only dependency doubles. Real server.cjs, TCP listener and OS signals.
const Module = require('node:module');
const http = require('node:http');
const path = require('node:path');
const original = Module._load;
const target = path.resolve(process.env.LIFECYCLE_TARGET);
const cfg = { DATA:process.env.LIFECYCLE_DATA, QUEUE_WT:'/synthetic-queue', PORT:0,
 HOST:'127.0.0.1', EXECUTOR_MODE:'MOCK', ORIGIN_ID:'origin', WORKER_ID:'worker' };
const mode=process.env.LIFECYCLE_MODE;
Module._load=function(name,parent,...rest) {
 if(parent?.filename===target){
  if(name==='./config.cjs')return cfg;
  if(name==='./file-store.cjs')return {createFileStore:()=>({snapshot:()=>({grants:{g:{task_id:'TASK-LOCAL-E2E',grant_id:'g'}}})})};
  if(name.endsWith('/api/auth-adapter.cjs'))return {createHmacAuth:()=>()=>{}};
  if(name.endsWith('/api/mainbrain-api.cjs'))return {createApi:()=>({})};
  if(name.endsWith('/api/http-server.cjs'))return {createHttpServer:()=>{
   const server=http.createServer((req,res)=>res.end('alive'));
   server.on('listening',()=>process.send({port:server.address().port}));return server;
  }};
  if(name.endsWith('/api/polling-worker-candidate.cjs'))return {createPollingWorker:()=>({runUntilStopped:({signal})=>{
   process.send({worker:true});
   if(mode==='throw')throw Error('synthetic synchronous failure');
   if(mode==='resolve')return Promise.resolve();
   if(mode==='reject')return Promise.reject(Error('synthetic receive failure'));
   if(mode==='abort-error')return Promise.reject(Object.assign(Error('unsolicited abort'),{name:'AbortError'}));
   return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{
    if(mode==='late-error')reject(Error('failure during shutdown'));else resolve();
   },{once:true}));
  }})};
  if(name==='./mock-executor.cjs')return {createMockExecutor:()=>()=>{},createRealExecutorStub:()=>{throw Error('forbidden')}};
  if(name==='./token.cjs')return {mintToken:()=>''};
 }
 return original.call(this,name,parent,...rest);
};
require(target);
