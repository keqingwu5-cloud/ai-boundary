"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const c=require("../tcvl-architecture-core.js");
const memory=require("../memory-workflow-core.js");
const ids=["launcher","governance","collaboration","correction","vault","traceback"];
const draft={schema:c.SCHEMA,name:"主腦完整架構",stage:"concept_only_not_deployed",
  steps:ids.map((id,i)=>({order:i+1,id,title:"節點 "+id,status:"設計草稿",input:"原始資料",action:"執行來源檢查與測試",output:"待審報告",next:"人工交接"})),
  reverseRule:"有異常就保留 ID 並退回原始來源",verificationGates:"需人工驗證來源、狀態與權限"};
const clone=x=>JSON.parse(JSON.stringify(x));
test("complete blueprint validates without mutation",()=>{
 const original=clone(draft);assert.deepEqual(c.validateBlueprint(draft),[]);assert.deepEqual(draft,original);
});
test("missing steps and wrong schema rejected",()=>{
 assert.ok(c.validateBlueprint({...draft,steps:[]}).length>0);
 assert.ok(c.validateBlueprint({...draft,schema:"invalid"}).length>0);
});
test("duplicate module IDs rejected",()=>{
 assert.ok(c.validateBlueprint({...draft,steps:[draft.steps[0],draft.steps[0]]}).includes("invalid_or_duplicate_step"));
});
test("missing reverse and quality gates rejected",()=>{
 assert.ok(c.validateBlueprint({...draft,reverseRule:""}).includes("gate_or_rollback_missing"));
});
test("full architecture snapshot contains all steps, states, routes and interface statuses",()=>{
 const output=c.fullArchitectureText(draft);
 assert.ok(ids.every(id=>output.includes(id)));
 assert.match(output,/狀態：設計草稿/);
 assert.match(output,/接口 ai_api/);
 assert.match(output,/路徑與接口狀態/);
});
test("generated full architecture pack conforms to current memory import schema",()=>{
 const p=c.architecturePack(draft,"id-001");
 assert.equal(memory.validatePack(p).length,1);
 assert.ok(p.items[0].question.startsWith(c.ARCH_PREFIX));
 assert.equal(p.items[0].eventType,"new_question");
 assert.equal(p.items[0].evidenceLevel,"hypothesis");
});
test("memory export never silently truncates a huge architecture",()=>{
 const expanded=clone(draft);expanded.steps[0].action="A".repeat(12000);
 assert.throws(()=>c.architecturePack(expanded,"id-too-long"),/架構草稿格式錯誤|過長/);
});
test("five field templates include named input and output sets",()=>{
 assert.deepEqual(Object.keys(c.FIELD_TEMPLATES).sort(),["correction","inbound","interface","outbound","rejection"]);
 for(const name of Object.keys(c.FIELD_TEMPLATES))assert.ok(c.FIELD_TEMPLATES[name].fields.some(([key])=>key==="recordId"));
});
test("rejection record pack preserves all rejection fields in candidate only",()=>{
 const p=c.recordPack("rejection",{recordId:"C-007",reason:"來源不足",evidence:"原反證仍存在",impact:"M-002",owner:"GPT②",retest:"重新蒐證"},"r-001");
 assert.equal(memory.validatePack(p).length,1);
 assert.match(p.items[0].content,/原反證仍存在/);
 assert.match(p.items[0].content,/人工記錄，尚未查證/);
});
test("empty record fields stop export",()=>{
 assert.throws(()=>c.recordPack("rejection",{recordId:"C-007",reason:"缺少"},"r-002"),/請填寫/);
});
test("all record templates can create valid memory candidates",()=>{
 for(const [id,template] of Object.entries(c.FIELD_TEMPLATES)){
  const fields=Object.fromEntries(template.fields.map(([key])=>[key,key+"示範值"]));
  const p=c.recordPack(id,fields,id+"-id");
  assert.equal(memory.validatePack(p).length,1);
 }
});
test("launcher to vault route explicitly manual and non automatic",()=>{
 const r=c.routePlan("launcher","vault");
 assert.ok(r.steps.length>=1);
 assert.equal(r.automatic,false);
 assert.equal(r.requiresManual,true);
 assert.equal(r.fullyConnected,false);
});
test("direct launcher to traceback is only demo not verified AI communication",()=>{
 const r=c.routePlan("launcher","traceback");
 assert.ok(r.steps.some(x=>x.status==="demo"));
 assert.equal(r.containsDemo,true);
 assert.equal(r.automatic,false);
});
test("return route is not assumed to exist without a defined edge",()=>{
 assert.equal(c.routePlan("unknown-node","vault").unreachable,true);
});
test("invalid connector status is rejected",()=>{
 assert.throws(()=>c.routePlan("A","B",[{from:"A",to:"B",status:"connected",action:"test"}]));
});
test("created planned edge does not become a live connection",()=>{
 const path=c.routePlan("custom-a","custom-b",[{from:"custom-a",to:"custom-b",status:"planned",action:"設計順序"}]);
 assert.equal(path.hasUnbuilt,true);assert.equal(path.automatic,false);
});
test("bidirectional history respects independent inbound/outbound toggles",()=>{
 const arr=[{direction:"inbound",kind:"correction"},{direction:"outbound",kind:"rejection"}];
 assert.equal(c.filterHistory(arr,{showInbound:true,showOutbound:false}).length,1);
 assert.equal(c.filterHistory(arr,{showInbound:false,showOutbound:true}).length,1);
 assert.equal(c.filterHistory(arr,{showInbound:false,showOutbound:false}).length,0);
});
test("history kind filtering preserves only corrections",()=>{
 const arr=[{direction:"inbound",kind:"correction"},{direction:"outbound",kind:"rejection"}];
 assert.deepEqual(c.filterHistory(arr,{kinds:["correction"]}),[arr[0]]);
});
