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

test("module-specific verification, handoff and rollback persist in complete memory text",()=>{
 const d=clone(draft);
 d.steps[0].check="需要核對當時證據";
 d.steps[0].forward="轉給資料治理";
 d.steps[0].reverse="退回人工修正指令";
 const text=c.fullArchitectureText(d);
 assert.match(text,/檢查：需要核對當時證據/);
 assert.match(text,/交接：轉給資料治理/);
 assert.match(text,/出錯退回：退回人工修正指令/);
});
test("interface statuses never declare remote AI API operational",()=>{
 const api=c.INTERFACES.find(x=>x.id==="ai_api");
 assert.equal(api.status,"planned");
 assert.match(c.STATUSES[api.status].label,/尚未接通/);
});

test("record candidate preserves user-defined extra fields and their explanations",()=>{
 const data={recordId:"T-300",source:"人工",receivedAt:"2026-10-15",version:"1",evidence:"參考",validation:"待核",next:"補件",extraFields:[{label:"復盤理由",value:"需要比較前後差異"}]};
 const packet=c.recordPack("inbound",data,"extra1");
 assert.equal(memory.validatePack(packet).length,1);
 assert.match(packet.items[0].content,/復盤理由：需要比較前後差異/);
});
test("too many, duplicate or blank extra fields are rejected",()=>{
 const d={recordId:"T-1",source:"人工",receivedAt:"2026-10-15",version:"1",evidence:"參考",validation:"待核",next:"補件"};
 assert.throws(()=>c.recordPack("inbound",{...d,extraFields:Array.from({length:9},(_,i)=>({label:String(i),value:"內容"}))},"extra2"),/最多/);
 assert.throws(()=>c.recordPack("inbound",{...d,extraFields:[{label:"A",value:"ok"},{label:"A",value:"dup"}]},"extra3"),/重複/);
 assert.throws(()=>c.recordPack("inbound",{...d,extraFields:[{label:"",value:"empty"}]},"extra4"),/無效/);
});

test("candidate transfer appears as ghost modules and planned routes, never live",()=>{
 const transfer={schema:"tcvl.candidate-map-transfer.v0.1",project:{id:"P1",title:"研究平台",goal:"架構擴張"},
 nodes:[{id:"future1",title:"未來品質模組",purpose:"觀察錯誤率與修正",fromNode:"governance",stage:"candidate"}],
 links:[{id:"L1",from:"governance",to:"future1",kind:"branch",stage:"planned"}]};
 const result=c.normalizeCandidateTransfer(transfer,ids);
 assert.equal(result.nodes[0].status,"候選規劃／未接線");
 assert.equal(result.edges[0].status,"planned");
 assert.equal(c.routePlan("governance","future1",result.edges).hasUnbuilt,true);
});
test("candidate transfer rejects duplicate official node IDs and broken links",()=>{
 const transfer={schema:"tcvl.candidate-map-transfer.v0.1",project:{id:"P1",title:"研究平台",goal:"架構擴張"},
 nodes:[{id:"future1",title:"未來品質模組",purpose:"持續追查",fromNode:"governance",stage:"candidate"}],
 links:[{id:"L1",from:"governance",to:"missing",kind:"branch",stage:"planned"}]};
 assert.throws(()=>c.normalizeCandidateTransfer(transfer,ids),/連線不存在/);
 transfer.links=[];transfer.nodes[0].id="launcher";
 assert.throws(()=>c.normalizeCandidateTransfer(transfer,ids),/衝突/);
});
test("complete architecture memory export preserves planned routes and candidate states",()=>{
 const transfer={schema:"tcvl.candidate-map-transfer.v0.1",project:{id:"P1",title:"研究平台",goal:"架構擴張"},
 nodes:[{id:"future1",title:"未來品質模組",purpose:"追查錯誤",fromNode:"governance",stage:"candidate"}],
 links:[]};
 const addition=c.normalizeCandidateTransfer(transfer,ids);
 const d=clone(draft),mod=addition.nodes[0];
 d.steps.push({order:d.steps.length+1,id:mod.id,title:mod.title,status:mod.status,input:mod.input,action:mod.work,output:mod.output,next:"待審批"});
 const pack=c.architecturePack(d,"transfer1",c.INTERFACES,[...c.ROUTES,...addition.edges]);
 assert.equal(memory.validatePack(pack).length,1);
 assert.match(pack.items[0].content,/future1/);
 assert.match(pack.items[0].content,/未接線/);
 assert.match(pack.items[0].content,/governance → future1/);
});

test("node verified state and completed module state are separate concepts",()=>{
 const base=c.initialModuleCompletion();
 assert.equal(c.moduleCompletionSummary(base).completed,false);
 assert.equal(c.moduleCompletionSummary(base).verified,0);
 const partial=c.updateNodeVerification(base,{nodeId:"input",state:"verified",evidence:"TEST-E-001",at:"2026-10-15T10:00:00Z"});
 assert.equal(partial.nodes.find(x=>x.id==="input").state,"verified");
 assert.equal(c.moduleCompletionSummary(partial).completed,false);
 assert.equal(c.moduleCompletionSummary(partial).verified,1);
 assert.equal(base.nodes.find(x=>x.id==="input").state,"unverified");
});
test("verified node cannot be marked without an evidence reference",()=>{
 assert.throws(()=>c.updateNodeVerification(c.initialModuleCompletion(),{nodeId:"input",state:"verified",evidence:"",at:"2026-10-15T10:00:00Z"}),/證據/);
});
test("completed module requires all six verified nodes and human acceptance",()=>{
 let status=c.initialModuleCompletion();
 const at="2026-10-15T10:00:00Z";
 assert.throws(()=>c.approveModuleCompletion(status,{reviewer:"使用者",acceptanceRef:"QA1",at}),/六個/);
 for(const node of c.NODE_CHECKS)status=c.updateNodeVerification(status,{nodeId:node.id,state:"verified",evidence:"證據："+node.id,at});
 assert.equal(status.stage,"review");
 assert.throws(()=>c.approveModuleCompletion(status,{reviewer:"",acceptanceRef:"QA1",at}),/核准人/);
 status=c.approveModuleCompletion(status,{reviewer:"人工確認者",acceptanceRef:"REVIEW-2026-1",at});
 assert.equal(c.moduleCompletionSummary(status).completed,true);
 assert.equal(status.stage,"completed");
 assert.match(c.moduleCompletionSummary(status).label,/已完成/);
 assert.ok(status.history.some(h=>h.action==="module.completed"));
});
test("changing completed node invalidates completed status, original history stays intact",()=>{
 let state=c.initialModuleCompletion(),at="2026-10-15T11:00:00Z";
 for(const n of c.NODE_CHECKS)state=c.updateNodeVerification(state,{nodeId:n.id,state:"verified",evidence:"E-"+n.id,at});
 state=c.approveModuleCompletion(state,{reviewer:"人工",acceptanceRef:"QA2",at});
 state=c.updateNodeVerification(state,{nodeId:"handoff",state:"failed",evidence:"接口未回傳",at});
 assert.equal(state.stage,"review");
 assert.equal(c.moduleCompletionSummary(state).completed,false);
 assert.equal(state.reviewer,"");
 assert.ok(state.history.some(e=>e.action==="module.completed"));
});
test("completed module can be reopened without losing historical approval evidence",()=>{
 let state=c.initialModuleCompletion(),at="2026-10-15T11:00:00Z";
 for(const n of c.NODE_CHECKS)state=c.updateNodeVerification(state,{nodeId:n.id,state:"verified",evidence:"E-"+n.id,at});
 state=c.approveModuleCompletion(state,{reviewer:"人工",acceptanceRef:"QA2",at});
 const record=c.reopenModuleCompletion(state,{reason:"發現新的安全缺口",at});
 assert.equal(record.stage,"review");
 assert.equal(c.moduleCompletionSummary(record).completed,false);
 assert.ok(record.history.some(e=>e.action==="module.reopened"));
 assert.ok(record.history.some(e=>e.action==="module.completed"));
 assert.equal(state.stage,"completed");
});
test("complete architecture memory snapshot retains separate node and module states",()=>{
 let progress=c.initialModuleCompletion();
 progress=c.updateNodeVerification(progress,{nodeId:"input",state:"verified",evidence:"EV-007",at:"2026-10-15T11:00:00Z"});
 const d=clone(draft);d.steps[0].completion=progress;
 const output=c.fullArchitectureText(d);
 assert.match(output,/節點驗證及模組完成/);
 assert.match(output,/EV-007/);
 assert.match(output,/"stage":"building"/);
 assert.ok(!output.includes('"stage":"completed"'));
});
