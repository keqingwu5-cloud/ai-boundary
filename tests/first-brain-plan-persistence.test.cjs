'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createContext, runInContext } = require('node:vm');
const { webcrypto } = require('node:crypto');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const app = readFileSync(resolve(root, 'app.js'), 'utf8');
const packetRaw = readFileSync(resolve(root, 'data/first-brain-eight-dim-plan-20261030.json'), 'utf8');
const core = require('../first-brain-plan-core.js');
const guardModule = import('../brain-import-guard.mjs');

function sourceBetween(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'original application functions must be present');
  return app.slice(from, to);
}

// Exercise the original app entry, mutation and Undo with an injected adapter.
// The adapter simulates the commit boundary; these are not IndexedDB engine tests.
const application = [
  sourceBetween('const listeners = {};', '/* ================= operations'),
  sourceBetween('function setStatus(', 'function recordLearningFeedback('),
  sourceBetween('function deleteNode(', 'function resetAll('),
  sourceBetween('async function loadEightDimensionPlan(', '/* ================= three.js scene')
].join('\n');

function initialGraph() {
  return {
    version:2, brains:[{id:'main'}],
    nodes:[{id:'old',brainId:'main',title:'original',pos:[0,0,0],status:'open'}],
    links:[], history:[]
  };
}
function database() {
  return {revision:1, mainRaw:JSON.stringify(initialGraph()), undoRaw:'[]', writes:0};
}
const graph = db => JSON.parse(db.mainRaw);
const loaded = db => graph(db).history.some(event=>event.action==='plan.loaded');

async function createTab(db, { mode = true, renderError = false, broadcastError = false } = {}) {
  const { validateBrainImport } = await guardModule;
  const messages = [], events = [], errors = [];
  const ctx = createContext({
    FirstBrainPlanCore:core,
    crypto:webcrypto, TextEncoder,
    TX_MODE:mode, TX_DB:'test-db', TX_AUTH_KEY:'authority', focusId:'main',
    STATUS:{open:'待研究',researching:'研究中'},
    localStorage:{getItem:key=>key==='authority'?'idb':null},
    fetch:async path=>{
      assert.equal(path,'./data/first-brain-eight-dim-plan-20261030.json');
      return {ok:true,text:async()=>packetRaw};
    },
    confirm:()=>true,
    toast:msg=>messages.push(msg),
    recordEvent:e=>events.push(e.action),
    showConcurrentWarning:()=>messages.push('concurrent warning'),
    console:{error:(...args)=>errors.push(args)},
    txChannel:{postMessage(){if(broadcastError)throw Error('channel closed');}},
    renderHistory(){},renderCrumbs(){},closePanel(){},focusNode(){},focusBrain(){},flashSaved(){},
    sync(){if(renderError)throw Error('render failed');},
    migrate:state=>state,
    validateBrainImport,
    document:{querySelector(){return null;}},
    async readTransactional3D(){
      const snapshot=graph(db);
      const checked=validateBrainImport(snapshot);
      if(!checked.ok)return {ok:false,reason:checked.reason};
      return {ok:true,revision:db.revision,mainRaw:db.mainRaw,graph:snapshot,undo:JSON.parse(db.undoRaw)};
    },
    async commitTransactional3D(_, expectedRevision, proposed, undo){
      if(db.beforeCommit){
        const callback=db.beforeCommit;
        delete db.beforeCommit;
        await callback();
      }
      if(expectedRevision!==db.revision)return {ok:false,reason:'stale_revision'};
      if(db.abort)return {ok:false,reason:'transaction_aborted'};
      db.mainRaw=JSON.stringify(proposed);
      db.undoRaw=JSON.stringify(undo);
      db.writes++;
      db.revision++;
      return db.conflictAfterCommit
        ? {ok:false,reason:'legacy_writer_detected_after_commit',committedRevision:db.revision}
        : {ok:true,revision:db.revision};
    },
    initial:graph(db), initialUndo:JSON.parse(db.undoRaw), initialRevision:db.revision
  });
  runInContext(application + `
    let state=initial, undoStack=initialUndo, txRevision=initialRevision;
    let txReady=true, txBusy=false, txCommitConfirmed=false, txLoadError=null, txLastWrite;
    listeners.change=[recordEvent];
    globalThis.api={
      load:loadEightDimensionPlan,undo,deleteNode,setStatus,
      graph:()=>JSON.stringify(state), ready:()=>txReady, idle:()=>txLastWrite
    };
  `,ctx);
  return {...ctx.api,messages,events,errors};
}

test('loads and undoes via the same transaction and keeps exact saved bytes in Undo', async()=>{
  const db=database(), t=await createTab(db), before=db.mainRaw;
  assert.equal(await t.load(),true);
  assert.equal(graph(db).nodes.length,10);
  assert.equal(graph(db).links.length,8);
  assert.equal(db.revision,2);
  assert.deepEqual(JSON.parse(db.undoRaw),[before]);
  assert.deepEqual(t.events,['plan.loaded']);
  assert.equal(await t.undo(),true);
  assert.equal(db.revision,3);
  assert.equal(db.mainRaw,before);
  assert.equal(loaded(db),false);
});

test('a legacy page cannot write a plan with the split-key storage path', async()=>{
  const db=database(), t=await createTab(db,{mode:false});
  assert.equal(await t.load(),false);
  assert.match(t.messages.at(-1),/啟用交易式保存/);
  assert.equal(db.writes,0);
});

test('stale duplicate path checks stored revision after another tab undoes the plan', async()=>{
  const db=database(), a=await createTab(db);
  assert.equal(await a.load(),true);
  const b=await createTab(db);
  assert.equal(await a.undo(),true);
  assert.equal(await b.load(),false);
  assert.match(b.messages.at(-1),/儲存版本已變動/);
  assert.equal(db.writes,2);
  assert.equal(loaded(db),false);
});

test('a competing ordinary edit wins the CAS without losing its saved data', async()=>{
  const db=database(), a=await createTab(db), b=await createTab(db);
  db.beforeCommit=async()=>{b.setStatus('old','researching');assert.equal(await b.idle(),true);};
  assert.equal(await a.load(),false);
  assert.equal(graph(db).nodes[0].status,'researching');
  assert.equal(db.writes,1);
  assert.equal(loaded(db),false);
  assert.deepEqual(a.events,[]);
});

test('an aborted transaction changes neither graph, Undo, nor local history', async()=>{
  const db=database(), t=await createTab(db), before=db.mainRaw;
  db.abort=true;
  assert.equal(await t.load(),false);
  assert.match(t.messages.at(-1),/交易未完成/);
  assert.equal(db.mainRaw,before);
  assert.equal(db.undoRaw,'[]');
  assert.equal(t.graph(),before);
  assert.deepEqual(t.events,[]);
  db.abort=false;
  assert.equal(await t.load(),true);
  db.abort=true;
  const saved=db.mainRaw, undo=db.undoRaw;
  assert.equal(await t.undo(),false);
  assert.doesNotMatch(t.messages.at(-1),/已復原/);
  assert.equal(db.mainRaw,saved);
  assert.equal(db.undoRaw,undo);
});

test('render or notification faults after commit do not masquerade as save failure', async()=>{
  const db=database(), t=await createTab(db,{renderError:true,broadcastError:true});
  assert.equal(await t.load(),true);
  assert.ok(loaded(db));
  assert.equal(t.graph(),db.mainRaw);
  assert.deepEqual(t.events,['plan.loaded']);
  assert.match(t.messages.at(-1),/規劃已保存，畫面更新失敗/);
  assert.equal(t.errors.length,2);
});

test('a legacy-writer conflict detected after commit reports the saved transaction and blocks edits', async()=>{
  const db=database(), t=await createTab(db);
  db.conflictAfterCommit=true;
  assert.equal(await t.load(),false);
  assert.ok(loaded(db));
  assert.equal(t.ready(),false);
  assert.match(t.messages.at(-1),/交易已保存.*舊版寫入衝突/);
  assert.deepEqual(t.events,[]);
});

test('same packet after legitimate D4 deletion stays modified; a dangling link is rejected', async()=>{
  for(const legal of [true,false]){
    const db=database(), t=await createTab(db);
    assert.equal(await t.load(),true);
    const edited=graph(db);
    const childId=edited.nodes.find(n=>n.id.endsWith('_d4')).id;
    if(legal){
      t.deleteNode(childId);
      assert.equal(await t.idle(),true);
    }else{
      edited.nodes=edited.nodes.filter(node=>node.id!==childId);
      db.mainRaw=JSON.stringify(edited);
    }
    const saved=db.mainRaw, writes=db.writes;
    assert.equal(await t.load(),legal);
    assert.match(t.messages.at(-1),legal?/保留你的修改/:/link_endpoint_missing_or_self/);
    assert.equal(db.writes,writes);
    assert.equal(db.mainRaw,saved);
  }
});

test('an unchanged source anchor allows local edits; a changed anchor does not pass as a duplicate', async()=>{
  const db=database(), t=await createTab(db);
  assert.equal(await t.load(),true);
  const edited=graph(db);
  const child=edited.nodes.find(n=>n.id.endsWith('_d4'));
  child.counterEvidence.push({text:'new evidence'});
  child.status='researching';
  db.mainRaw=JSON.stringify(edited);
  assert.equal(await t.load(),true);
  assert.match(t.messages.at(-1),/未新增節點/);
  assert.equal(db.writes,1);
  child.planSource.source_id='different';
  db.mainRaw=JSON.stringify(edited);
  assert.equal(await t.load(),false);
  assert.match(t.messages.at(-1),/source_anchor_conflict/);
  assert.equal(db.writes,1);
});
