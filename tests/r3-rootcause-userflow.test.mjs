import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const get = p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=get('app.js'),index=get('index.html'),audio=get('audio-lab-import.js');
const between=(str,a,b)=>{
  const i=str.indexOf(a),j=str.indexOf(b,i+a.length);
  if(i<0||j<i)throw Error('SOURCE_MARKER_NOT_FOUND '+a+' / '+b);
  return str.slice(i,j);
};
const bootFragment=between(app, "let graphObservedRaw = null, graphBootReason = 'UNKNOWN';",'/* concept layer migration');
const saveFragment=between(app,'let saveT = 0;','/* Never replace corrupt/unreadable existing graph data with seed content.');
const mutatorFragment=between(app,'function mutate(action, payload, fn){','const N = id =>');
const sample={brains:[{id:'main'}],nodes:[],links:[],history:[]};
class Store {
  constructor(data={}) {this.map=new Map(Object.entries(data));this.events=[];this.badReads=false;}
  getItem(key){if(this.badReads)throw Error('storage_access_denied');return this.map.get(key)??null;}
  setItem(key,value){this.map.set(key,String(value));this.events.push({key,value:String(value)});}
  removeItem(key){this.map.delete(key);this.events.push({key,removed:true});}
}
function classify(store){
  const c={localStorage:store};
  vm.createContext(c);
  const actualValid=between(app,'function valid(s){',"let graphObservedRaw = null, graphBootReason = 'UNKNOWN';");
  vm.runInContext("const KEY='aiBrain.v1';\n"+actualValid+bootFragment+"\nglobalThis.inspect=()=>({result:load(),reason:graphBootReason,raw:graphObservedRaw});",c);
  return c.inspect();
}
function guardedSource(store,reason,raw){
  const c={localStorage:store,graphBootReason:reason,graphObservedRaw:raw,
    undoStack:[],state:sample,clearTimeout:()=>{},setTimeout:()=>{throw Error('unexpected timer')},
    toast:()=>{},flashSaved:()=>{},lockedCompareWrite:()=>{throw Error('SHOULD_NOT_WRITE')},
    sync:()=>{},renderHistory:()=>{},renderCrumbs:()=>{},emit:()=>{}};
  vm.createContext(c);
  vm.runInContext("const KEY='aiBrain.v1', UKEY='aiBrain.v1.undo';\n"+
    saveFragment+"\n"+mutatorFragment+
    "\nglobalThis.probe=()=>({blocked:graphWriterBlocked,status:graphSaveStatus});"+
    "\nglobalThis.attemptSave=()=>save(true);"+
    "\nglobalThis.attemptMutate=()=>mutate('add',{},()=>{state.nodes.push({id:'WRONG_NEW_NODE'});});",c);
  return c;
}
let passed=0;
async function test(name,fn){
  try{await fn();passed++;console.log('PASS: '+name);}
  catch(err){console.error('FAIL: '+name+' '+(err?.stack||err));process.exitCode=1;}
}
await test('NO_EXISTING_RECORD is distinguishable from invalid data',()=>{
  const r=classify(new Store());
  assert.equal(r.reason,'NO_EXISTING_RECORD');assert.equal(r.raw,null);
});
await test('VALID_EXISTING_DATA loads exact state without being downgraded',()=>{
  const raw=JSON.stringify(sample),r=classify(new Store({'aiBrain.v1':raw}));
  assert.equal(r.reason,'EXISTING_VALID');assert.equal(r.raw,raw);
  assert.equal(r.result.brains[0].id,'main');
});
await test('INVALID_EXISTING_JSON preserves raw exactly',()=>{
  const raw='{"brains": [ BROKEN';
  const r=classify(new Store({'aiBrain.v1':raw}));
  assert.equal(r.reason,'EXISTING_INVALID');assert.equal(r.raw,raw);
  assert.equal(r.result,null);
});
await test('INVALID_EXISTING_SCHEMA is rejected and preserved',()=>{
  const raw='{"brains":[],"nodes":[],"links":[],"history":[]}';
  const r=classify(new Store({'aiBrain.v1':raw}));
  assert.equal(r.reason,'EXISTING_INVALID');assert.equal(r.raw,raw);
});
await test('READ_UNAVAILABLE is not confused with empty storage',()=>{
  const s=new Store();s.badReads=true;
  const r=classify(s);assert.equal(r.reason,'READ_UNAVAILABLE');
});
await test('READ_ONLY does not persist seed preview over corrupt original',()=>{
  const raw='UNREADABLE_RAW',s=new Store({'aiBrain.v1':raw});
  const c=guardedSource(s,'EXISTING_INVALID',raw);
  assert.equal(c.probe().blocked,true);
  assert.equal(c.probe().status,'READ_ONLY');
  c.attemptSave();
  assert.equal(s.getItem('aiBrain.v1'),raw);
  assert.equal(s.events.length,0);
});
await test('READ_ONLY rejects actual mutation, does not just block save',()=>{
  const raw='UNREADABLE_RAW',s=new Store({'aiBrain.v1':raw});
  const c=guardedSource(s,'EXISTING_INVALID',raw);
  assert.equal(c.attemptMutate(),false);
  assert.equal(c.state.nodes.some(n=>n.id==='WRONG_NEW_NODE'),false);
});
await test('UI offers persistent status and original-raw export',()=>{
  assert(index.includes('id="graphWriteStatus"'));
  assert(index.includes('id="graphRawBackup"'));
  assert(app.includes("a.download='ai-brain-original-unreadable.txt'"));
  assert(app.includes("if(!graphWriterBlocked) save(true);"));
});

const PENDING='aiBrain.audioLab.pending.v1';
function payload() {
  return {schemaVersion:1,experimentId:'jp-transition-audio-v1',totalTests:50,
    snapshotId:'synthetic-snapshot',evaluatedAt:'2026-11-10',technicalPassCount:48,
    manualRatingCount:15,choices:Array.from({length:5},(_,i)=>({
      id:'choice-'+i,motifId:'motif-'+i,name:'candidate-'+i,score:100-i,
      use:'sound',variation:'base',humanAverage:null,selectionBasis:'synthetic'
    }))};
}
async function importCase(receiptMode){
  const store=new Store({[PENDING]:JSON.stringify(payload())});
  const ui=[];let nodes=[],links=[];
  const brain={
    getState:()=>({nodes:JSON.parse(JSON.stringify(nodes)),links:JSON.parse(JSON.stringify(links))}),
    addQuestion:q=>{const id='ROOT';nodes.push({id,...q});return id;},
    addDirection:(root,q)=>{const id='SUB-'+nodes.length;nodes.push({id,parentId:root,title:q.title});links.push({from:root,to:id});return id;},
    focusNode:()=>{}
  };
  if(receiptMode!=='MISSING'){
    brain.confirmPersistence=async()=>receiptMode==='OK'?
      {ok:true,reason:'WRITE_READBACK_CONFIRMED'}:{ok:false,reason:'STALE_WRITER'};
  }
  const document={
    readyState:'complete',body:{appendChild:el=>ui.push(el.textContent)},
    createElement:()=>({style:{},setAttribute:()=>{},addEventListener:()=>{},remove:()=>{},textContent:''})
  };
  const c={
    localStorage:store,window:{AIBrain:brain},location:{hash:'#audio-lab'},
    document,console:{error:()=>{},log:()=>{}},setTimeout:()=>{}
  };
  vm.createContext(c);
  vm.runInContext(audio,c);
  // Await the importNow() microtask continuation after confirmPersistence().
  await new Promise(resolve=>setImmediate(resolve));
  return {store,ui,nodes,links};
}
await test('AUDIO imported but persist FAILED preserves pending',async()=>{
  const r=await importCase('FAIL');
  assert(r.store.getItem(PENDING));
  assert(!r.store.events.some(x=>x.key===PENDING&&x.removed));
  assert(r.ui.some(x=>x.includes('匯入未完成')));
});
await test('AUDIO legacy brain without ACK preserves pending',async()=>{
  const r=await importCase('MISSING');
  assert(r.store.getItem(PENDING));
  assert(!r.store.events.some(x=>x.key===PENDING&&x.removed));
});
await test('AUDIO pending removed only AFTER positive persistence ACK',async()=>{
  const r=await importCase('OK');
  assert.equal(r.store.getItem(PENDING),null);
  assert(r.store.events.some(x=>x.key===PENDING&&x.removed));
  assert(r.ui.some(x=>x.includes('已同步並確認儲存')));
});
console.log('R3_ROOTCAUSE_SUMMARY: '+passed+'/11 checks passed (synthetic; not Safari or independent BOT3 review)');
if(passed!==11)process.exitCode=1;
