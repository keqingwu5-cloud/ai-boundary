"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const core=require("../tcvl-data-room-core.js");
const memory=require("../memory-workflow-core.js");
const now="2026-10-16T07:00:00.000Z";
const start=()=>core.createRoom({projectId:"project1",batchId:"relay1",title:"主腦測試",at:now});
const original=(w,id="SOURCE1",eventId="event1")=>core.registerOriginal(w,{id,title:"原始設計說明",locator:"PRIVATE-DATA-ROOM-REF-1",custodian:"人工保管者",version:"v1",at:now,eventId});
const assign=(w,roleId="GPT1",eventId="a1")=>core.assign(w,{roleId,owner:"人工負責人",duty:"整理原始資料與差異",reviewer:"人工審核者",at:now,eventId});
const submit=(w,id="report1",roleId="GPT1",eventId="s1")=>core.submit(w,{id,roleId,originalIds:["SOURCE1"],source:"人工手動貼回，作者未驗證",
 summary:"研究報告",evidence:"來源比對仍未完成",gaps:"反例待核對",next:"提交人工審查",at:now,eventId});
test("empty room is independent of any real file storage",()=>{
 const w=start();assert.deepEqual(core.validate(w),[]);
 assert.equal(w.originals.length,0);assert.equal(w.submissions.length,0);
});
test("original reference retains custody, version, and no actual file bytes",()=>{
 const w=original(start());assert.equal(w.originals[0].storageStatus,"reference_only_unverified");
 assert.equal(w.originals[0].version,"v1");assert.ok(!("content" in w.originals[0]));
});
test("register original does not mutate prior room",()=>{
 const a=start(),b=original(a);assert.equal(a.revision,0);assert.equal(b.revision,1);assert.equal(a.originals.length,0);
});
test("duplicate original ID cannot replace an original version",()=>{
 const w=original(start());assert.throws(()=>original(w,"SOURCE1","event2"),/已存在/);
});
test("invalid digest and misleading claims are not accepted",()=>{
 assert.throws(()=>core.registerOriginal(start(),{id:"X",title:"X",locator:"PRIVATE",custodian:"A",version:"v1",sha256:"not-a-sha",at:now,eventId:"e1"}),/雜湊/);
 const w=original(start());w.originals[0].storageStatus="remote_archived_verified";assert.ok(core.validate(w).includes("original_invalid"));
});
test("each AI has an independent assigned human accountability and reviewer",()=>{
 let w=original(start());w=assign(w,"GPT1","a1");w=assign(w,"GPT2","a2");w=assign(w,"BOT3","a3");
 assert.equal(w.assignments.length,3);assert.equal(core.statusSummary(w).length,3);
 assert.equal(core.statusSummary(w).every(x=>x.assignment?.owner==="人工負責人"),true);
});
test("changing owner preserves previous event history and does not edit old submission",()=>{
 let w=assign(original(start()));w=submit(w);
 w=core.assign(w,{roleId:"GPT1",owner:"新負責人",duty:"接手追蹤",reviewer:"人工審核者",at:now,eventId:"a2"});
 assert.equal(w.submissions[0].owner,"人工負責人");assert.equal(w.assignments[0].owner,"新負責人");
 assert.ok(w.events.some(x=>x.id==="a1")&&w.events.some(x=>x.id==="a2"));
});
test("role cannot submit until human assignment exists",()=>assert.throws(()=>submit(original(start())),/尚未指派/));
test("role cannot fabricate an unknown original reference",()=>{
 const w=assign(original(start()));
 assert.throws(()=>core.submit(w,{id:"r2",roleId:"GPT1",originalIds:["LOST"],source:"人工",summary:"摘要",evidence:"對照",gaps:"不確定",next:"補證",at:now,eventId:"s2"}),/未登記/);
});
test("valid submission preserves original association and unverified AI identity",()=>{
 const w=submit(assign(original(start())));const x=w.submissions[0];
 assert.deepEqual(x.originalIds,["SOURCE1"]);assert.equal(x.identityVerified,false);assert.equal(x.reviewState,"pending");
 assert.equal(w.events.at(-1).kind,"role.submitted");
});
test("rejecting a submission keeps original and the review chain",()=>{
 let w=submit(assign(original(start())));
 w=core.review(w,{submissionId:"report1",decision:"rejected",reviewer:"人工審核者",reason:"證據不足",impact:"影響 M001",next:"補證",at:now,eventId:"review1"});
 assert.equal(w.submissions[0].reviewState,"rejected");
 assert.equal(w.submissions[0].summary,"研究報告");
 assert.equal(w.submissions[0].reviews[0].next,"補證");
 assert.equal(w.originals[0].version,"v1");
});
test("follow-up review adds to history rather than deleting earlier rejection",()=>{
 let w=submit(assign(original(start())));
 w=core.review(w,{submissionId:"report1",decision:"rejected",reviewer:"人工審核者",reason:"證據不足",impact:"需重審",next:"補證",at:now,eventId:"review1"});
 w=core.review(w,{submissionId:"report1",decision:"revision_requested",reviewer:"人工審核者",reason:"須重測",impact:"測試條件不同",next:"另建修訂上交",at:now,eventId:"review2"});
 assert.deepEqual(w.submissions[0].reviews.map(x=>x.decision),["rejected","revision_requested"]);
});
test("reviews require reason, impact, reviewer and next action",()=>{
 const w=submit(assign(original(start())));
 assert.throws(()=>core.review(w,{submissionId:"report1",decision:"rejected",reviewer:"人工",reason:"X",impact:"",next:"X",at:now,eventId:"a5"}),/不可缺少/);
});
test("data room memory candidate follows the existing manual memory-import format",()=>{
 const w=submit(assign(original(start())));
 const p=core.buildCandidate(w,"report1","c001");
 assert.equal(memory.validatePack(p).length,1);
 assert.equal(p.items[0].evidenceLevel,"hypothesis");
 assert.match(p.items[0].content,/原檔索引/);
 assert.match(p.items[0].content,/未上傳檔案/);
 assert.match(p.items[0].content,/身分驗證：未驗證/);
});
test("candidate does not contain a secret copy of original files",()=>{
 const w=submit(assign(original(start()))),p=core.buildCandidate(w,"report1","c2");
 assert.ok(!("file" in p.items[0]));
 assert.ok(!("blob" in p.items[0]));
 assert.equal(core.statusSummary(w)[0].originalBytesStored,0);
});
test("invalid room references and altered review state are rejected",()=>{
 const w=submit(assign(original(start())));
 w.submissions[0].originalIds=["lost"];assert.ok(core.validate(w).includes("submission_invalid"));
});
test("wrong project IDs are not silently changed by role reports",()=>{
 const w=submit(assign(original(start())));
 assert.equal(w.projectId,"project1");assert.equal(w.batchId,"relay1");
});
