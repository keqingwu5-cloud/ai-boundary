"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const workflow=require("../memory-workflow-core.js"),controls=require("../memory-controls-core.js"),auto=require("../memory-auto-drive-core.js");
const ts1="2026-10-30T00:00:00.000Z",ts2="2026-10-31T00:00:00.000Z";
const empty=()=>({memories:[],candidates:[],audit:[]});
const item=(id,content)=>({id,question:"原始記憶方向",purpose:"保留差異",content,reason:"合成對照",evidence:"合成來源",evidenceLevel:"hypothesis"});
const pack=items=>({schema:workflow.PACK_SCHEMA,items});
test("integration: reversed dated audit selects latest status, keeps input and read-only drive",()=>{
 const s=empty(),audit=[{kind:"workflow.recorded",ref:"w1",status:"blocked",at:ts1,taskTitle:"原始記憶方向"},
  {kind:"workflow.recorded",ref:"w1",status:"done",at:ts2,taskTitle:"原始記憶方向"}];s.audit=audit;
 const before=JSON.stringify(audit);assert.equal(workflow.processLatest(audit)[0].status,"done");
 const p=auto.plan({...s,memoryControls:{direction:{text:"原始記憶方向",version:1},threshold:{text:"",version:0},history:[]}});
 assert.equal(p.proposals.some(x=>x.type==="blocked_research"&&x.ref==="w1"),false);
 assert.equal(p.sideEffects,false);assert.equal(JSON.stringify(audit),before);
});
test("integration: invalid audit entries do not crash workflow summary",()=>{
 assert.equal(workflow.processLatest([null,{kind:"workflow.recorded",ref:"w",status:"done",at:ts2}])[0].status,"done");
});
test("integration: same pack distinct answers keep bidirectional candidate conflict",()=>{
 const r=workflow.planImport(pack([item("source-a","方向甲"),item("source-b","方向乙")]),empty());
 assert.deepEqual(r.conflicts,["source-a","source-b"]);
 assert.deepEqual(r.accepted[0].possibleBatchConflictWith,["source-b"]);
 assert.deepEqual(r.accepted[1].possibleBatchConflictWith,["source-a"]);
});
test("integration: reused origin changed payload blocked, byte-identical retained as duplicate",()=>{
 const stored={...empty(),candidates:[{id:"c1",originId:"origin-1",question:"原始記憶方向",content:"方向甲"}]};
 assert.throws(()=>workflow.planImport(pack([item("origin-1","方向乙")]),stored),/來源版本衝突/);
 assert.deepEqual(workflow.planImport(pack([item("origin-1","方向甲")]),stored).duplicated,["origin-1"]);
});
test("integration: control history chain is validated, originals remain unchanged",()=>{
 const a=controls.revise(undefined,"direction","方向甲","合成初始",ts1,"e1");
 const b=controls.revise(a,"direction","方向乙","合成更新",ts2,"e2");
 assert.equal(controls.view(b).direction.version,2);
 assert.throws(()=>controls.view({...b,direction:{text:"偽造",version:2}}),/memory_controls_history_invalid/);
 assert.equal(b.history[0].after,"方向甲");
});
test("integration: deep vault validation rejects dangling parents but accepts empty legacy",()=>{
 const code=fs.readFileSync(path.join(__dirname,"../memory.js"),"utf8");
 const beg=code.indexOf("function validState("),end=code.indexOf("\nasync function decryptEnvelope",beg);
 assert.ok(beg>=0&&end>beg);
 const context={VAULT:"ai-boundary.memory.v1"};vm.createContext(context);
 vm.runInContext(code.slice(beg,end)+"\nthis.validateVault=validState;",context);
 const legacy={schema:"ai-boundary.memory.v1",memories:[],candidates:[],audit:[]};
 assert.equal(context.validateVault(legacy),true);
 const orphan={...legacy,memories:[{id:"M",question:"Q",purpose:"P",parentId:"MISSING",
  versions:[{number:1,content:"C",reason:"R",source:"user",evidence:"E",approvedAt:ts1}]}]};
 assert.equal(context.validateVault(orphan),false);
});
test("integration: direction preflight stays local/draft, remains repeatable and never approves",()=>{
 const s=empty();assert.equal(auto.plan(s).proposals.length,0);
 s.memoryControls={direction:{text:"保留原始證據",version:1},threshold:{text:"",version:0},history:[]};
 s.candidates=[{id:"p",status:"pending",question:"新的語意反例"}];
 const before=JSON.stringify(s),p=auto.plan(s,{limit:3});
 for(let i=0;i<20;i++)assert.deepEqual(auto.plan(s,{limit:3}),p);
 assert.equal(JSON.stringify(s),before);assert.equal(p.sideEffects,false);assert.equal(p.alignment,"not_verified");
 assert.ok(p.proposals.every(x=>x.status==="idea_draft"));
});
test("integration: private-origin static bundle includes mandatory auto-drive module",()=>{
 const pkg=fs.readFileSync(path.join(__dirname,"../scripts/package-memory-v1.cjs"),"utf8");
 const verify=fs.readFileSync(path.join(__dirname,"../scripts/verify-memory-v1-bundle.cjs"),"utf8");
 assert.match(pkg,/"memory-auto-drive-core\.js"/);assert.match(verify,/"memory-auto-drive-core\.js"/);
 assert.match(fs.readFileSync(path.join(__dirname,"../memory.html"),"utf8"),/src="\.\/memory-auto-drive-core\.js/);
});
