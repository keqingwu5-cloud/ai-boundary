/* First Brain R11: local, evidence-grounded outcome learning.
 * Positive and negative observations are neither eternal facts nor model training.
 * Reuse is conservative: exact normalized conditions, person-reviewed with evidence.
 */
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const bounded=(s,max)=>typeof s==="string"&&s.trim().length>0&&s.trim().length<=max;
const optional=(s,max)=>s===undefined||(typeof s==="string"&&s.length<=max);
const OUTCOME=new Set(["worked","failed"]);
const STAGE=new Set(["observed","person_reviewed"]);
export function validateLearningRecord(r){
 if(!object(r)||!bounded(r.id,200)||!OUTCOME.has(r.outcome)||
    !bounded(r.conditions,160)||!bounded(r.observation,500)||
    !bounded(r.lesson,320)||!optional(r.rootCause,320)||
    !optional(r.evidence,500)||!STAGE.has(r.stage)||
    !Number.isFinite(r.recordedAt)||r.recordedAt<0)return false;
 if(r.stage==="person_reviewed"&&(!bounded(r.evidence,500)||
   !Number.isFinite(r.reviewedAt)||r.reviewedAt<r.recordedAt))return false;
 return true;
}
export function validateLearningRecords(records){
 return Array.isArray(records)&&records.length<=40&&records.every(validateLearningRecord)&&
    new Set(records.map(r=>r.id)).size===records.length;
}
export function prepareLearningObservation(input,id,at){
 if(!object(input)||!bounded(id,200)||!Number.isFinite(at)||at<0)return null;
 const outcome=input.outcome,conditions=String(input.conditions??"").trim(),
   observation=String(input.observation??"").trim(),lesson=String(input.lesson??"").trim(),
   evidence=String(input.evidence??"").trim(),rootCause=String(input.rootCause??"").trim();
 const record={id,outcome,conditions,observation,lesson,evidence,rootCause,
   stage:"observed",recordedAt:at};
 return validateLearningRecord(record)?record:null;
}
// Reviewing means the human acknowledged the entry and its evidence reference.
// It does NOT mean the claim's factual accuracy was independently proven.
export function markLearningReviewed(record,at){
 if(!validateLearningRecord(record)||!bounded(record.evidence,500)||
    record.stage!=="observed"||!Number.isFinite(at)||at<record.recordedAt)return null;
 return {...record,stage:"person_reviewed",reviewedAt:at};
}
const normalize=s=>String(s??"").trim().toLocaleLowerCase();
export function findReusableLessons(graph,conditions){
 const c=normalize(conditions);
 if(!c||c.length>160||!object(graph)||!Array.isArray(graph.nodes))return [];
 const found=[];
 for(const node of graph.nodes){
  if(!object(node)||!Array.isArray(node.learningRecords))continue;
  for(const r of node.learningRecords){
   if(!validateLearningRecord(r)||r.stage!=="person_reviewed"||
      normalize(r.conditions)!==c)continue;
   found.push({nodeId:node.id,nodeTitle:String(node.title||""),
     outcome:r.outcome,conditions:r.conditions,observation:r.observation,
     lesson:r.lesson,rootCause:r.rootCause||"",evidence:r.evidence,
     recordedAt:r.recordedAt,reviewedAt:r.reviewedAt,id:r.id,
     scope:"context_match_only_not_general_truth"});
  }
 }
 return found.sort((a,b)=>b.reviewedAt-a.reviewedAt).slice(0,20);
}
