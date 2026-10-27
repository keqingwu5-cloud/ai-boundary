import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {validateBrainImport as modern} from '../brain-import-guard.mjs';
const require=createRequire(import.meta.url);
const old=await import('file://'+resolve(dirname(fileURLToPath(import.meta.url)),'_legacy_pr_sources/storage.mjs'));
const graph=()=>({
 version:1,
 brains:[{id:'main',parentBrainId:null,rootNodeId:null,position:[0,0,0]}],
 nodes:[{id:'n1',title:'Research node',brainId:'main',parentId:null,pos:[0,0,0]}],
 links:[],history:[]
});
const copy=x=>JSON.parse(JSON.stringify(x));
function legacyVerdict(g){try{old.validateGraph(copy(g));return {ok:true,reason:'ok'};}catch(e){return {ok:false,reason:e.message};}}
const cases=[
 {name:'valid v1',setup:g=>g,newOK:true,oldOK:true},
 {name:'valid v2',setup:g=>{g.version=2;return g;},newOK:true,oldOK:true},
 {name:'unversioned historically accepted by new guard',setup:g=>{delete g.version;return g;},newOK:true,oldOK:false,oldError:'UNSUPPORTED_GRAPH_VERSION',flag:'legacy_version_policy'},
 {name:'unsupported future v999 rejected by both',setup:g=>{g.version=999;return g;},newOK:false,newError:'unsupported_graph_version',oldOK:false,oldError:'UNSUPPORTED_GRAPH_VERSION'},
 {name:'self parent brain cycle rejected',setup:g=>{g.brains[0].parentBrainId='main';return g;},newOK:false,newError:'brain_parent_cycle',oldOK:false,oldError:'PARENT_CYCLE'},
 {name:'two-brain parent cycle rejected',setup:g=>{g.brains.push({id:'a',parentBrainId:'b'},{id:'b',parentBrainId:'a'});return g;},newOK:false,newError:'brain_parent_cycle',oldOK:false,oldError:'PARENT_CYCLE'},
 {name:'orphan brain reference rejected',setup:g=>{g.brains[0].parentBrainId='missing';return g;},newOK:false,newError:'brain_parent_missing',oldOK:false,oldError:'DANGLING_BRAIN'},
 {name:'node parent orphan rejected',setup:g=>{g.nodes[0].parentId='unknown';return g;},newOK:false,newError:'node_parent_missing_or_self',oldOK:false,oldError:'DANGLING_NODE'},
 {name:'node self-parent rejected',setup:g=>{g.nodes[0].parentId='n1';return g;},newOK:false,newError:'node_parent_missing_or_self',oldOK:false,oldError:'PARENT_CYCLE'},
 {name:'two-node ancestor cycle rejected',setup:g=>{g.nodes[0].parentId='n2';g.nodes.push({...g.nodes[0],id:'n2',parentId:'n1'});return g;},newOK:false,newError:'node_parent_cycle',oldOK:false,oldError:'PARENT_CYCLE'},
 {name:'duplicate node rejected',setup:g=>{g.nodes.push({...g.nodes[0]});return g;},newOK:false,newError:'node_id_invalid_or_duplicate',oldOK:false,oldError:'DUPLICATE_OR_INVALID_ID'},
 {name:'missing node position old lenient new strict',setup:g=>{delete g.nodes[0].pos;return g;},newOK:false,newError:'node_shape_invalid',oldOK:true,flag:'modern_required_position'},
 {name:'missing node title old lenient new strict',setup:g=>{delete g.nodes[0].title;return g;},newOK:false,newError:'node_shape_invalid',oldOK:true,flag:'modern_required_title'},
 {name:'node with invalid media old lenient new strict',setup:g=>{g.nodes[0].media='bad';return g;},newOK:false,newError:'node_media_invalid',oldOK:true,flag:'modern_required_media_shape'},
 {name:'same-node self link old lenient new strict',setup:g=>{g.links.push({id:'l1',from:'n1',to:'n1'});return g;},newOK:false,newError:'link_endpoint_missing_or_self',oldOK:true,flag:'modern_disallows_self_edge'},
 {name:'invalid missing link rejected',setup:g=>{g.links.push({id:'l1',from:'n1',to:'not-found'});return g;},newOK:false,newError:'link_endpoint_missing_or_self',oldOK:false,oldError:'DANGLING_LINK'},
 {name:'unknown non-schema metadata preserved',setup:g=>{g.researchMemo={legacy:true};return g;},newOK:true,oldOK:true}
];
for(const spec of cases)test('schema differential: '+spec.name,()=>{
 const g=spec.setup(graph()),raw=JSON.stringify(g);
 const fresh=modern(g),prior=legacyVerdict(g);
 assert.equal(fresh.ok,spec.newOK,JSON.stringify({spec:spec.name,fresh,prior}));
 assert.equal(prior.ok,spec.oldOK,spec.name+' old guard decision');
 if(spec.newError)assert.equal(fresh.reason,spec.newError);
 if(spec.oldError)assert.equal(prior.reason,spec.oldError);
 assert.equal(JSON.stringify(g),raw,'both validators are read-only');
 if(spec.flag)assert.ok(fresh.ok!==prior.ok,'distinct old/new schema assumption: '+spec.flag);
});
test('rollup: differential is documented and cannot be advertised as same schema',()=>{
 const divergences=cases.filter(c=>c.newOK!==c.oldOK);
 assert.deepEqual(divergences.map(c=>c.flag),[
  'legacy_version_policy','modern_required_position','modern_required_title',
  'modern_required_media_shape','modern_disallows_self_edge'
 ]);
 console.log('GRAPH_SCHEMA_GAPS_CONFIRMED cases='+cases.length+' divergences='+divergences.length);
});
