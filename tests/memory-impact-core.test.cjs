"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const core=require("../memory-impact-core.js");
const state=()=>({vaultId:"SYNTHETIC-ONLY",revision:4,memories:[{id:"M1",question:"原問題",purpose:"原目的",versions:[{content:"原答案"}]}],candidates:[{id:"C0",originId:"SOURCE-1",question:"舊提案",content:"原資料",status:"rejected"}],audit:[],memoryControls:{direction:{text:"保存原始證據",version:2},threshold:{text:"人工審查",version:3},history:[]}});
const candidate=()=>({eventType:"new_question",parentId:null,question:"新的問題",purpose:"目的",content:"新的資料",originId:"NEW-1"});
test("preflight is read-only, candidate only, never approval or transport",()=>{const s=state(),p=candidate(),before=JSON.stringify({s,p}),r=core.preview(s,p,{directionRelation:"aligned"});assert.equal(r.canSaveCandidate,true);assert.equal(r.canApprove,false);assert.equal(r.canDispatch,false);assert.equal(JSON.stringify({s,p}),before);assert.equal(r.directionVersion,2);assert.equal(r.thresholdVersion,3);});
test("same origin ID different payload is blocked",()=>{const r=core.preview(state(),{...candidate(),originId:"SOURCE-1",question:"舊提案",content:"新版"});assert.ok(r.blocks.includes("SOURCE_ID_CONTENT_CONFLICT"));assert.equal(r.canSaveCandidate,false);});
test("exact origin duplicate is warned and not automatically approved",()=>{const r=core.preview(state(),{...candidate(),originId:"SOURCE-1",question:"舊提案",content:"原資料"});assert.ok(r.warnings.includes("EXACT_ORIGIN_DUPLICATE"));assert.equal(r.canApprove,false);});
test("unknown parent blocks branch",()=>{const r=core.preview(state(),{...candidate(),parentId:"UNKNOWN",eventType:"revise_question"});assert.ok(r.blocks.includes("PARENT_MISSING"));assert.equal(r.canSaveCandidate,false);});
test("valid split preserves parent and only proposes a new branch",()=>{const r=core.preview(state(),{...candidate(),parentId:"M1",eventType:"revise_question"},{directionRelation:"aligned"});assert.ok(r.warnings.includes("NEW_BRANCH_PRESERVE_PARENT"));assert.deepEqual(r.affectedMemoryIds,["M1"]);assert.equal(r.canApprove,false);});
test("answer revision cannot silently change question or purpose",()=>{const r=core.preview(state(),{...candidate(),parentId:"M1",eventType:"revise_answer"});assert.ok(r.blocks.includes("ANSWER_CANNOT_REWRITE_QUESTION"));});
test("stale vault/direction/threshold snapshots fail closed",()=>{const r=core.preview(state(),candidate(),{expectedVaultRevision:3,expectedDirectionVersion:1,expectedThresholdVersion:2});assert.deepEqual(r.blocks,["STALE_VAULT_REVISION","STALE_DIRECTION_VERSION","STALE_THRESHOLD_VERSION"]);});
test("unassessed direction is a warning, not automated deletion",()=>{const r=core.preview(state(),candidate());assert.ok(r.warnings.includes("DIRECTION_NOT_ASSESSED"));assert.equal(r.canSaveCandidate,true);});
test("different direction remains a candidate for human review",()=>{const r=core.preview(state(),candidate(),{directionRelation:"divergent_keep"});assert.ok(r.warnings.includes("DIVERGENT_BUT_PRESERVED"));assert.equal(r.canSaveCandidate,true);assert.equal(r.canApprove,false);});
test("source without a provenance ID is labelled unverified",()=>{const c=candidate();delete c.originId;assert.ok(core.preview(state(),c,{directionRelation:"aligned"}).warnings.includes("SOURCE_ID_UNVERIFIED"));});
test("existing topic gets warning but not fabricated causality",()=>{const r=core.preview(state(),{...candidate(),question:"原問題"},{directionRelation:"aligned"});assert.ok(r.warnings.includes("SIMILAR_EXISTING_TOPIC_REVIEW"));assert.deepEqual(r.affectedMemoryIds,["M1"]);});
test("unsupported operation / direction classification fail",()=>{assert.throws(()=>core.preview(state(),{eventType:"delete",question:"a",content:"b"}),/impact_input_invalid/);assert.throws(()=>core.preview(state(),candidate(),{directionRelation:"approved"}),/impact_relation_invalid/);});
test("empty proposal is blocked",()=>{assert.ok(core.preview(state(),{...candidate(),content:""}).blocks.includes("EMPTY_PROPOSAL"));});
test("corrupt control version blocks but older vault without controls stays readable",()=>{const s=state();s.memoryControls.direction.version=-1;assert.ok(core.preview(s,candidate()).blocks.includes("CONTROLS_INVALID"));delete s.memoryControls;assert.equal(core.preview(s,candidate()).directionVersion,0);});
test("page wiring provides preview and does not remove required manual review",()=>{const html=fs.readFileSync(path.join(__dirname,"../memory.html"),"utf8"),js=fs.readFileSync(path.join(__dirname,"../memory.js"),"utf8");assert.match(html,/memory-impact-core\.js/);assert.match(html,/id="previewMemoryImpact"/);assert.match(html,/id="directionRelation"/);assert.match(js,/impactBeforeSave\(c,impact\)/);assert.match(js,/if\(!latest.canSaveCandidate\)/);assert.match(js,/state\.candidates\.unshift\(c\)/);assert.match(js,/function reviewApproval\(c\)/);assert.doesNotMatch(html,/自動核准已啟用/);});

test("restore preview is pure, cannot approve or merge and detects removed events",()=>{
 const previous=state(),incoming={...state(),memories:[],candidates:[],audit:[]};
 previous.audit=[{id:"EV1"},{id:"EV2"}];
 const before=JSON.stringify({previous,incoming});
 const r=core.previewRestore(previous,incoming);
 assert.equal(r.requiresHumanApproval,true);assert.equal(r.willMerge,false);
 assert.equal(r.counts.lostMemories,1);assert.equal(r.counts.lostCandidates,1);
 assert.equal(r.counts.lostAuditEvents,2);assert.equal(r.counts.lostVersions,1);
 assert.ok(r.warnings.includes("HISTORY_REMOVAL"));
 assert.equal(JSON.stringify({previous,incoming}),before);
});
test("same version number with altered contents is loss of original evidence",()=>{
 const previous=state(),incoming=JSON.parse(JSON.stringify(previous));
 incoming.memories[0].versions[0].content="改寫答案";
 const r=core.previewRestore(previous,incoming);
 assert.equal(r.counts.lostVersions,1);
 assert.ok(r.warnings.includes("HISTORY_REMOVAL"));
});
test("different vault and old revision are flagged without inventing an automatic merge",()=>{
 const old=state(),incoming={...state(),vaultId:"OTHER-DEVICE",revision:1};
 const r=core.previewRestore(old,incoming);
 assert.ok(r.warnings.includes("DIFFERENT_VAULT"));
 assert.ok(r.warnings.includes("OLDER_REVISION"));
 assert.equal(r.willMerge,false);
});
test("direction/threshold rollback identified independently",()=>{
 const old=state(),incoming=JSON.parse(JSON.stringify(old));
 incoming.memoryControls.direction.version=1;
 const r=core.previewRestore(old,incoming);
 assert.deepEqual(r.controlsRollingBack,["direction"]);
 assert.ok(r.warnings.includes("CONTROL_VERSION_ROLLBACK"));
});
test("same preserved synthetic vault has zero known loss but still requires manual approval",()=>{
 const old=state(),r=core.previewRestore(old,JSON.parse(JSON.stringify(old)));
 assert.deepEqual(r.counts,{lostMemories:0,lostCandidates:0,lostAuditEvents:0,lostVersions:0,
   modifiedMemories:0,modifiedCandidates:0,modifiedAuditEvents:0});
 assert.deepEqual(r.warnings,[]);
 assert.equal(r.requiresHumanApproval,true);
});
test("invalid restore payloads fail rather than reporting zero loss",()=>{
 assert.throws(()=>core.previewRestore(state(),{}),/restore_impact_input_invalid/);
});
test("page warns before restore commit using real preview output",()=>{
 const js=fs.readFileSync(path.join(__dirname,"../memory.js"),"utf8");
 assert.match(js,/MemoryImpactCore\.previewRestore\(state,decoded\.data\)/);
 assert.match(js,/impactDetails\+"\\n確定已保留本機目前的加密備份/);
 assert.match(js,/commitStagedBackup\(staged,previous\)/);
});

test("legacy backup with no vault ID or revision is explicitly warned before any overwrite",()=>{
 const old=state(),incoming=JSON.parse(JSON.stringify(old));delete incoming.vaultId;delete incoming.revision;
 const r=core.previewRestore(old,incoming);
 assert.ok(r.warnings.includes("UNKNOWN_BACKUP_VAULT_ID"));
 assert.ok(r.warnings.includes("UNKNOWN_BACKUP_REVISION"));
 assert.equal(r.requiresHumanApproval,true);
});

test("restore detects same-ID candidate and audit tampering",()=>{
 const old=state(),fresh=JSON.parse(JSON.stringify(old));
 old.audit=[{id:"EV1",summary:"拒絕原由"}];fresh.audit=[{id:"EV1",summary:"拒絕被改寫"}];
 fresh.candidates[0].content="改寫的候選";
 const before=JSON.stringify({old,fresh}),r=core.previewRestore(old,fresh);
 assert.equal(r.counts.lostCandidates,0);assert.equal(r.counts.lostAuditEvents,0);
 assert.equal(r.counts.modifiedCandidates,1);assert.equal(r.counts.modifiedAuditEvents,1);
 assert.ok(r.warnings.includes("EXISTING_RECORD_CHANGED"));
 assert.equal(r.requiresHumanApproval,true);assert.equal(r.willMerge,false);
 assert.equal(JSON.stringify({old,fresh}),before);
});
test("restore flags same-ID memory title rewrite even with identical versions",()=>{
 const old=state(),fresh=JSON.parse(JSON.stringify(old));fresh.memories[0].question="改寫的原問題";
 const r=core.previewRestore(old,fresh);
 assert.equal(r.counts.lostVersions,0);assert.equal(r.counts.modifiedMemories,1);
 assert.ok(r.warnings.includes("EXISTING_RECORD_CHANGED"));
});
test("restore ignores property order only",()=>{
 const old=state(),fresh=JSON.parse(JSON.stringify(old)),c=fresh.candidates[0];
 fresh.candidates[0]={content:c.content,status:c.status,question:c.question,originId:c.originId,id:c.id};
 const r=core.previewRestore(old,fresh);
 assert.equal(r.counts.modifiedCandidates,0);
 assert.ok(!r.warnings.includes("EXISTING_RECORD_CHANGED"));
});
