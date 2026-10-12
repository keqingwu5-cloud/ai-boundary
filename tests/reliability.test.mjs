import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { GRAPH_KEY, BACKUP_PREFIX, openGuardedStore, snapshot, restoreBackup, validateGraph } from '../reliability/storage.mjs';
import { createKnowledgeService, initialLedger, versionOf } from '../server/knowledge-service.mjs';
import { fileStore } from '../server/file-store.mjs';
import { createTaskRunner } from '../server/task-runner.mjs';
const graph = () => ({ version:2, brains:[{ id:'main', parentBrainId:null, rootNodeId:null }, { id:'sub', parentBrainId:'main', rootNodeId:'b' }], nodes:[{ id:'a', title:'已驗證內容', brainId:'main', parentId:null, status:'resolved', media:{video:'media/videos/n_q1.mp4'}, concepts:['語言'], custom:{ preserve:true } }, { id:'b', title:'子問題', brainId:'sub', parentId:'a', botNotes:['舊研究'] }], links:[{id:'l', from:'a', to:'b', kind:'derived'}], history:[{ts:1, action:'seed', payload:{text:'舊歷史'}}], seedExtras:['b'] });
class Storage {
  map = new Map(); failure = () => false;
  get length(){ return this.map.size; } key(i){ return [...this.map.keys()][i]; }
  getItem(k){ return this.map.get(k) ?? null; }
  setItem(k,v){ if(this.failure(k,v)) throw new Error('QuotaExceeded'); this.map.set(k,String(v)); }
  removeItem(k){ this.map.delete(k); }
}
function storage(){ const s = new Storage(); s.setItem(GRAPH_KEY, JSON.stringify(graph())); s.setItem('aiBrain.v1.undo', JSON.stringify([JSON.stringify(graph())])); s.setItem('aiBrain.feed.v1','{"likes":{"a":true}}'); s.setItem('aiBrain.knowledge.v1','{"nodes":{"a":42}}'); return s; }
function memory(initial){ let db=structuredClone(initial), tail=Promise.resolve(); return { read:()=>structuredClone(db), transaction(fn){ const p=tail.then(async()=>{const next=structuredClone(db); const result=await fn(next); db=next;return result;});tail=p.catch(()=>{});return p;} }; }
const human = {id:'owner',kind:'human',graphIds:['main'],permissions:['read','review','propose']};
const bot = {id:'radar',kind:'bot',graphIds:['main'],permissions:['propose','review']};
function service(){ const store=memory(initialLedger(graph())); const api=createKnowledgeService({store,graphId:'main',authenticate:async r=>r.session}); return {store,api}; }
const proposal = (g=graph(), op='op-1') => ({operationId:op,taskId:'task-'+op,nodeId:'a', action:'update',classification:'hypothesis',sources:['https://example.org/research'],baseVersions:{a:versionOf(g.nodes[0])},node:{...g.nodes[0],title:'新假設'}});
const submit = (api,p=proposal(),session=bot)=>api({session,body:{type:'submit',proposal:p}});
const review = (api,p,decision='accept',session=human,operationId='review-1')=>api({session,body:{type:'review',proposalId:p.id,decision,operationId}});
test('遷移前完整備份所有 localStorage 知識、子腦、媒體、歷史與偏好',()=>{
 const s=storage(), before=snapshot(s); let saved;
 const p=openGuardedStore(s,g=>{saved=[...s.map.keys()].some(k=>k.startsWith(BACKUP_PREFIX));return {...g,infraExtra:true};},graph);
 assert.equal(saved,true); assert.deepEqual(p.state.nodes,graph().nodes); assert.deepEqual(p.state.links,graph().links);
 const b=JSON.parse([...s.map].find(([k])=>k.startsWith(BACKUP_PREFIX))[1]); assert.deepEqual(b.entries,before.entries);
 p.save(p.state); assert.equal(JSON.parse(s.getItem(GRAPH_KEY)).infraExtra,true);
});
test('遷移 throw 或拓樸／歷史損失不覆寫原始資料',()=>{
 for(const migrate of [()=>{throw Error('fail');}, g=>({...g,nodes:g.nodes.slice(1)}),g=>({...g,links:[]}),g=>({...g,history:[]})]){
 const s=storage(),raw=s.getItem(GRAPH_KEY),p=openGuardedStore(s,migrate,graph);
 assert.equal(p.status().blocked,true); assert.throws(()=>p.save(graph())); assert.equal(s.getItem(GRAPH_KEY),raw);
 }
});
test('損毀與未知版本保持原文，僅使用記憶體預覽',()=>{
 for(const raw of ['{broken',JSON.stringify({...graph(),version:999})]){
 const s=storage();s.setItem(GRAPH_KEY,raw);const p=openGuardedStore(s,g=>g,graph);
 assert.equal(p.status().blocked,true);assert.equal(s.getItem(GRAPH_KEY),raw);
 }
});
test('備份空間不足不執行遷移，原資料與 undo 不變',()=>{
 const s=storage(),before=snapshot(s);let migrated=false;s.failure=k=>k.startsWith(BACKUP_PREFIX);
 const p=openGuardedStore(s,g=>{migrated=true;return g;},graph);
 assert.equal(migrated,false);assert.equal(p.status().blocked,true);assert.deepEqual(snapshot(s).entries,before.entries);
});
test('JSON 備份還原驗證及中途失敗回滾',()=>{
 const s=storage(),b=snapshot(s);s.setItem('aiBrain.feed.v1','{"likes":{}}');
 const before=snapshot(s);let once=true;s.failure=k=>k==='aiBrain.knowledge.v1'&&once&&(once=false,true);
 assert.throws(()=>restoreBackup(s,b),/ROLLED_BACK/);assert.deepEqual(snapshot(s).entries,before.entries);
 s.failure=()=>false;restoreBackup(s,b);assert.deepEqual(snapshot(s).entries,b.entries);
 assert.throws(()=>restoreBackup(s,{...b,entries:{...b.entries,other:'secret'}}),/INVALID/);
});
test('偵測另頁存檔更新，不靜默覆寫',()=>{
 const s=storage(),p=openGuardedStore(s,g=>g,graph);const other={...graph(),external:true};s.setItem(GRAPH_KEY,JSON.stringify(other));
 assert.throws(()=>p.save(graph()),/CONFLICT/);assert.deepEqual(JSON.parse(s.getItem(GRAPH_KEY)),other);
});
test('重複 ID、斷裂關聯及父節點循環拒絕',()=>{
 const g=graph();g.nodes.push(g.nodes[0]);assert.throws(()=>validateGraph(g));
 const cyclic=graph();cyclic.nodes[0].parentId='b';assert.throws(()=>validateGraph(cyclic),/CYCLE/);
});
test('同一操作重送及相同任務更換操作 ID 都不重複新增',async()=>{
 const {api,store}=service();const a=await submit(api),b=await submit(api);
 assert.equal(a.status,201);assert.equal(b.status,200);assert.equal(a.body.id,b.body.id);
 assert.equal((await submit(api,{...proposal(),operationId:'other'})).status,409);
 assert.equal(store.read().proposals.length,1);assert.deepEqual(store.read().graph,graph());
});
test('BOT 只能提案，拒絕偽造身分、未授權與跨 graph 寫入',async()=>{
 const {api,store}=service();assert.equal((await submit(api,proposal(),null)).status,401);
 assert.equal((await submit(api,proposal(),{...bot,graphIds:['other']})).status,403);
 const p=(await submit(api)).body;assert.equal((await review(api,p,'accept',bot)).status,403);
 assert.equal((await api({body:{type:'review',proposalId:p.id,decision:'accept',operationId:'x',session:human}})).status,401);
 assert.deepEqual(store.read().graph,graph());
});
test('接受後保存來源、作者、基礎版本和完整前後版本；重复 review 去重',async()=>{
 const {api,store}=service();const p=(await submit(api)).body;
 assert.equal((await review(api,p)).status,200);assert.equal((await review(api,p)).status,200);
 const db=store.read();assert.equal(db.revisions.length,1);assert.deepEqual(db.revisions[0].before,graph().nodes[0]);
 assert.equal(db.revisions[0].createdBy,'radar');assert.equal(db.revisions[0].classification,'hypothesis');assert.deepEqual(db.revisions[0].sources,proposal().sources);
 assert.equal(db.graph.nodes[0].title,'新假設');assert.deepEqual(db.graph.links,graph().links);
});
test('兩 BOT 同時基於舊版本修改，第二個接受變成 conflict',async()=>{
 const {api,store}=service();const a=(await submit(api)).body;
 const b=(await submit(api,{...proposal(graph(),'op-2'),node:{...graph().nodes[0],title:'矛盾結論'}})).body;
 const out=await Promise.all([review(api,a),review(api,b,'accept',human,'review-2')]);
 assert.deepEqual(out.map(x=>x.status).sort(),[200,409]);assert.equal(store.read().revisions.length,1);
 assert.equal(store.read().proposals.filter(x=>x.status==='conflict').length,1);
});
test('保留與拒絕提案不改正式知識',async()=>{
 const {api,store}=service();const p=(await submit(api)).body;
 assert.equal((await review(api,p,'hold')).body.status,'held');
 assert.equal((await review(api,p,'reject',human,'review-2')).body.status,'rejected');
 assert.deepEqual(store.read().graph,graph());assert.equal(store.read().revisions.length,0);
});
test('新增節點使用穩定 ID，無來源與基礎版本提案拒絕',async()=>{
 const {api,store}=service();assert.equal((await submit(api,{...proposal(),sources:[]})).status,400);
 const p={...proposal(),action:'add',nodeId:'new-node',baseVersions:{'new-node':null},node:{id:'new-node',title:'新節點',brainId:'main',parentId:null}};
 const result=await submit(api,p);await review(api,result.body);await submit(api,p);
 assert.equal(store.read().graph.nodes.filter(n=>n.id==='new-node').length,1);
});
test('原子檔案交易可重開恢復，失敗 transaction 不覆寫',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'brain-'));const path=join(dir,'ledger.json');
 try { const s=fileStore(path,initialLedger(graph()));await s.transaction(db=>{db.events.push({type:'ok'});});
 const raw=await readFile(path,'utf8');await assert.rejects(s.transaction(db=>{db.graph.nodes=[];throw Error('secret');}));assert.equal(await readFile(path,'utf8'),raw);
 const again=fileStore(path,initialLedger(graph()));assert.equal(await again.transaction(db=>db.events.length),1);
 await writeFile(path+'.lock','');await assert.rejects(s.transaction(()=>{}));assert.equal(await readFile(path,'utf8'),raw);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('任務有限重試、去重與額度封頂；錯誤不洩露內容',async()=>{
 const store=memory({});const run=createTaskRunner({store,maxAttempts:2,timeoutMs:20,maxCalls:2,maxCost:4});let calls=0;
 const job={id:'job-1',costCeiling:2,run:async()=>{calls++;throw Error('API_KEY=private-content');}};
 assert.equal((await run(job)).status,'failed');await run(job);assert.equal(calls,2);
 assert.equal((await run({...job,id:'job-2'})).status,'budget_blocked');assert.equal(calls,2);
 assert.ok(!JSON.stringify(store.read()).includes('private-content'));
});
test('逾時不重試且忽略晚到結果，不阻塞其他 BOT',async()=>{
 const store=memory({});const run=createTaskRunner({store,maxAttempts:3,timeoutMs:10,maxCalls:4,maxCost:4});let aborted=false;
 const a=await run({id:'slow',costCeiling:1,run:({signal})=>new Promise(resolve=>{signal.addEventListener('abort',()=>{aborted=true;});setTimeout(resolve,30);})});
 assert.equal(a.status,'timed_out');assert.equal(a.attempts,1);assert.equal(aborted,true);
 assert.equal((await run({id:'good',costCeiling:1,run:async()=>{}})).status,'succeeded');
});
/* 種子資料載入：相容兩種 data.js
   - 舊版（main）：data.js 直接宣告 QUESTIONS 等全域變數
   - PR #3 內容拆檔：data.js 設 window.AI_DATA_READY，用 fetch 讀 content/*.json、patches/*.json —— 這裡用檔案系統模擬 fetch
   ROOT 可用環境變數 AI_BOUNDARY_ROOT 指到另一個工作目錄（例如疊上 #3 的整合樹）來驗證。 */
const ROOT = process.env.AI_BOUNDARY_ROOT ? new URL('file://' + process.env.AI_BOUNDARY_ROOT.replace(/\/?$/, '/')) : new URL('../', import.meta.url);
async function seedContext(root = ROOT){
 const data=await readFile(new URL('data.js',root),'utf8'); const THREE=await import(new URL('vendor/three.module.min.js',root).href);
 const fetchFile=async u=>{ const rel=String(u).split('?')[0].replace(/^\.\//,''); try { const text=await readFile(new URL(rel,root),'utf8'); return { ok:true,status:200,json:async()=>JSON.parse(text),text:async()=>text }; } catch { return { ok:false,status:404,json:async()=>{throw Error('404');},text:async()=>'' }; } };
 const doc={ createElement:()=>({ style:{} }), body:{ appendChild(){} }, documentElement:{ appendChild(){} } };
 const ctx={window:{__V:'test'},Date,Math,console,THREE,fetch:fetchFile,document:doc,Promise,JSON,Object,Array,Error};vm.createContext(ctx);
 vm.runInContext(data,ctx); Object.assign(ctx,ctx.window);
 if (ctx.window.AI_DATA_READY){ await ctx.window.AI_DATA_READY; Object.assign(ctx,ctx.window); }
 return ctx;
}
test('原始 app 實際 seed 與 migrate 結果保持媒體／節點／概念資料（相容 #3 的內容拆檔載入器）',async()=>{
 const source=await readFile(new URL('app.js',ROOT),'utf8');
 const ctx=await seedContext();
 const start=source.indexOf('function mulberry('),end=source.indexOf('const persistence =');
 assert.ok(start>0&&end>start,'app.js 找不到 mulberry() 或 const persistence');
 const dirStart=source.indexOf('function dirPos('),dirEnd=source.indexOf('\n}',dirStart)+2;
 vm.runInContext("const uid = p => p + Math.random(); const REGION = {其他:[0,0,0]};\n"+source.slice(start,end)+'\n'+source.slice(dirStart,dirEnd)+'\nthis.result=migrate(seedState());',ctx);
 const g=JSON.parse(JSON.stringify(ctx.result));assert.ok(g.nodes.length>=31);validateGraph(g);
 const s=new Storage();s.setItem(GRAPH_KEY,JSON.stringify(g));
 const p=openGuardedStore(s,st=>st,graph);p.save(p.state);assert.deepEqual(JSON.parse(s.getItem(GRAPH_KEY)),g);
});
test('種子載入輔助函式支援非同步內容載入器（AI_DATA_READY + fetch）',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'seed-loader-'));
 try {
  const { mkdir, copyFile } = await import('node:fs/promises');
  await mkdir(join(dir,'content')); await mkdir(join(dir,'vendor'));
  await copyFile(new URL('../vendor/three.module.min.js',import.meta.url),join(dir,'vendor/three.module.min.js'));
  await writeFile(join(dir,'content/questions.json'),JSON.stringify([{id:'q1'}]));
  await writeFile(join(dir,'data.js'),"window.AI_DATA_READY = fetch('content/questions.json?v=' + window.__V).then(r => r.json()).then(q => { Object.assign(window, { QUESTIONS:q }); return q; });");
  const ctx=await seedContext(new URL('file://'+dir+'/'));
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.QUESTIONS)),[{id:'q1'}]);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test('審核局部更新保留原媒體與研究欄位；序列化後版本一致',async()=>{
 const {api,store}=service();const p={...proposal(),node:{id:'a',title:'只更新標題'}};
 const result=await submit(api,p);assert.equal((await review(api,result.body)).status,200);
 const n=store.read().graph.nodes[0];assert.deepEqual(n.media,graph().nodes[0].media);assert.deepEqual(n.custom,graph().nodes[0].custom);
 assert.equal(versionOf(n),versionOf(JSON.parse(JSON.stringify(n))));
 assert.equal((await api({session:null,body:{type:'read'}})).status,401);
});
test('未變動的原始備份重用，不因每次載入增加備份',()=>{
 const s=storage();openGuardedStore(s,x=>x,graph);openGuardedStore(s,x=>x,graph);
 assert.equal([...s.map.keys()].filter(k=>k.startsWith(BACKUP_PREFIX)).length,1);
});
test('衝突審核重送不重複記錄操作或研究歷史',async()=>{
 const {api,store}=service();const first=(await submit(api)).body;
 const second=(await submit(api,proposal(graph(),'op-2'))).body;
 await review(api,first);const a=await review(api,second,'accept',human,'review-conflict');
 const before=store.read();const b=await review(api,second,'accept',human,'review-conflict');
 assert.equal(a.status,409);assert.equal(b.status,409);assert.deepEqual(store.read(),before);
});
