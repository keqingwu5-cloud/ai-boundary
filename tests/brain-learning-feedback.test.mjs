import test from "node:test";
import assert from "node:assert/strict";
import {prepareLearningObservation,markLearningReviewed,findReusableLessons,validateLearningRecords,analyzeLearningEvidence} from "../brain-learning-feedback.mjs";
import {validateBrainImport} from "../brain-import-guard.mjs";
const graph=()=>({version:2,brains:[{id:"main",parentBrainId:null}],nodes:[{id:"n-1",brainId:"main",parentId:null,title:"規格研究",pos:[0,0,0]}],links:[],history:[]});
test("R11 success and failure remain contextual observations until human review",()=>{
 const worked=prepareLearningObservation({outcome:"worked",conditions:"格式 v1 匯入",observation:"10 個合成樣本通過",lesson:"先執行差異檢查",evidence:"CI-123"},"learn-1",100);
 const failed=prepareLearningObservation({outcome:"failed",conditions:"格式 v1 匯入",observation:"舊欄位有差異",lesson:"保留原始 bytes",rootCause:"新舊驗證器規則不同",evidence:"CI-124"},"learn-2",105);
 assert.equal(worked.stage,"observed");assert.equal(failed.stage,"observed");
 const g=graph();g.nodes[0].learningRecords=[worked,failed];
 assert.equal(validateBrainImport(g).ok,true);
 assert.deepEqual(findReusableLessons(g,"格式 v1 匯入"),[],"observations must never be presented as trusted reusable rules");
 const reviewed=markLearningReviewed(failed,110);
 assert.equal(reviewed.stage,"person_reviewed");
 g.nodes[0].learningRecords[1]=reviewed;
 assert.equal(analyzeLearningEvidence(g,"格式 V1 匯入").status,"conflicted",
   "reviewed failure versus observed success is still a contradiction");
 assert.deepEqual(findReusableLessons(g,"格式 V1 匯入"),[],
   "never recommend an outcome while the same context has opposing evidence");
 // Only the failure has been reported under this distinct condition.
 g.nodes[0].learningRecords[0].conditions="格式 v2 匯入";
 const matched=findReusableLessons(g,"格式 V1 匯入");
 assert.equal(matched.length,1);
 assert.equal(matched[0].outcome,"failed");
 assert.equal(matched[0].lesson,"保留原始 bytes");
 assert.equal(matched[0].scope,"context_match_only_not_general_truth");
 assert.deepEqual(findReusableLessons(g,"另一個版本"),[]);
});
test("R11 cannot promote missing evidence, impossible inputs, invalid history or duplicate IDs",()=>{
 const missing=prepareLearningObservation({outcome:"worked",conditions:"情境",observation:"觀察",lesson:"再試"},"learn-x",10);
 assert.equal(markLearningReviewed(missing,20),null);
 assert.equal(prepareLearningObservation({outcome:"correct",conditions:"情境",observation:"觀察",lesson:"再試"},"bad",10),null);
 assert.equal(prepareLearningObservation({outcome:"failed",conditions:"情境",observation:"觀察",lesson:""},"bad2",10),null);
 const g=graph();g.nodes[0].learningRecords=[{...missing,stage:"person_reviewed",reviewedAt:11}];
 assert.equal(validateBrainImport(g).reason,"node_learning_records_invalid");
 g.nodes[0].learningRecords=[missing,missing];
 assert.equal(validateLearningRecords(g.nodes[0].learningRecords),false);
 assert.equal(validateBrainImport(g).reason,"node_learning_records_invalid");
 const old=graph();
 assert.equal(validateBrainImport(old).ok,true,"historical node has no new fields");
 assert.equal(JSON.stringify(old).includes("learningRecords"),false,"validation never rewrites bytes");
});

test("R12 conflicting successes and failures preserve all evidence and never choose a winner",()=>{
 const g=graph(),condition="同一資料格式與相同版本";
 const worked=prepareLearningObservation({outcome:"worked",conditions:condition,observation:"案例A 通過",
   lesson:"可以嘗試匯入",evidence:"CI-R12-good"},"r12-good",100);
 const failed=prepareLearningObservation({outcome:"failed",conditions:condition,observation:"案例B 失敗",
   lesson:"應先檢查版本",rootCause:"版本衝突待查",evidence:"CI-R12-bad"},"r12-bad",110);
 g.nodes[0].learningRecords=[markLearningReviewed(worked,120),failed];
 assert.equal(analyzeLearningEvidence(g,condition).status,"conflicted",
   "even an unreviewed counterexample must prevent automatic recommendation");
 assert.equal(analyzeLearningEvidence(g,condition).reviewed,1);
 assert.equal(analyzeLearningEvidence(g,condition).observed,1);
 assert.deepEqual(findReusableLessons(g,condition),[]);
 g.nodes[0].learningRecords[1]=markLearningReviewed(failed,125);
 const both=analyzeLearningEvidence(g,condition);
 assert.equal(both.status,"conflicted");
 assert.equal(both.conflicts.length,2);
 assert.equal(both.conflicts[0].evidence,"CI-R12-good");
 assert.equal(both.conflicts[1].evidence,"CI-R12-bad");
 assert.equal(both.worked,1);assert.equal(both.failed,1);
 assert.deepEqual(findReusableLessons(g,condition),[]);
 assert.equal(validateBrainImport(g).ok,true);
 assert.equal(analyzeLearningEvidence(g,"不同情境").status,"none");
});
