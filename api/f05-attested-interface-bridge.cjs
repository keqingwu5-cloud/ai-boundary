'use strict';
// F05 candidate ↔ attested-source adapter. NO network, writes, routing, approval or ACK.
// Structural input validation is NOT full F05 Python gateway conformance.
// Context/registries are injected and NOT independently trusted. No real AI identity proof.
const crypto=require('node:crypto');
const stable=require('../vendor/fast-json-stable-stringify-v2.1.0.cjs');
const {reviewTrustedSource}=require('./source-baseline-attestation.cjs');
const HEX=/^[a-f0-9]{64}$/, ID=/^[A-Za-z0-9_.:-]{1,80}$/;
const TYPES=new Set(['SUBMIT','RESULT','RETURN','RESUBMIT','ACK_CLAIM']);
const LINKS=new Set(['parent','depends_on','derived_from','related_to','contradicts','causes']);
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=v=>typeof v==='string'&&v.trim().length>0&&v.length<=500;
const validId=v=>typeof v==='string'&&ID.test(v);
const sha=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const categoryNames=[
  '基本訊息','版本','ID','放置順序','邏輯','連結','跨輪一致性','重複及復發',
  '雙端身分','排版','文字循序','引用及使用紀錄'
];
function checkSet(){
  return categoryNames.map((name,i)=>({id:String(i+1).padStart(2,'0'),name,
    status:[5,6,8,9,10,11].includes(i)?'UNKNOWN':'PASS'}));
}
function resultBase(status,checks,reasons=[],review=null,return_event=null){
  return {result:status,action:'NO_EXTERNAL_EFFECT',approved:false,
    actual_remote_ack:false,independent_sender_identity_verified:false,
    real_source_verified:false,checks,reasons,review,return_event};
}
function quarantine(code,review=null){
  const checks=checkSet();
  checks[8].status='UNKNOWN';
  return resultBase('QUARANTINE_NO_ROUTE',checks,[],review??{reason:code},null);
}
function findKnown(objMap,id){
  return obj(objMap)&&Object.prototype.hasOwnProperty.call(objMap,id)?objMap[id]:undefined;
}
async function assessF05Interface({message,source,context,trust,baseline=null,head=null,now}={}){
  // An external caller must set a route and target. The message cannot choose
  // the expected destination, source scope, project, case, task or placement.
  const requiredContext=['project_id','case_id','task_id','sender_endpoint_id',
    'receiver_endpoint_id','expected_scope'];
  if(!obj(context)||requiredContext.some(k=>!str(context[k]))||
      !obj(context.placement)||!str(context.placement.container)||
      !str(context.placement.slot)||!Number.isSafeInteger(context.placement.ordinal)||
      !Number.isSafeInteger(context.last_sequence)||context.last_sequence<0||
      !validId(context.last_event_id)||
      !obj(context.known_events)||!obj(context.known_citations))
    return quarantine('MISSING_TRUSTED_TARGET_OR_ROUTE');
  // Local attestation validity must be proven even for malformed interface
  // metadata before giving a return suggestion; it does not prove AI identity.
  let review;
  try{
    review=await reviewTrustedSource({source,baseline,head,trust,now,
      expected_scope:context.expected_scope});
  }catch{return quarantine('SOURCE_VALIDATOR_ERROR');}
  if(review.state==='QUARANTINED')
    return quarantine('SOURCE_NOT_ATTESTED',review);
  const checks=checkSet(),reasons=[],fail=(check,code,field_path,reason,suggested_correction)=>{
    checks[check-1].status='FAIL';
    if(reasons.length<24)reasons.push({code,field_path,expected:'MATCH_CONFIGURED_CONTRACT',
      actual:'MISMATCH_OR_MISSING',reason,suggested_correction});
  };
  const m=obj(message)?message:{};
  if(m.schema_version!=='f05-bridge-v0.1')
    fail(1,'SCHEMA_VERSION_UNSUPPORTED','schema_version','非橋接契約版本','使用受核對的接口 schema 版本');
  for(const k of ['project_id','case_id','task_id','event_id','attempt_id',
    'sender_endpoint_id','receiver_endpoint_id','source_ref','source_version',
    'source_digest','purpose_id','original_goal','message_kind']){
    if(!str(m[k]))fail(1,'REQUIRED_FIELD_MISSING',k,'必要基本欄位不存在或無效','補足欄位並保留原始版本');
  }
  if(m.project_id!==context.project_id)
    fail(1,'PROJECT_MISMATCH','project_id','專案識別不一致','沿用來源任務專案 ID');
  if(m.case_id!==context.case_id)
    fail(3,'CASE_ID_MISMATCH','case_id','案件 ID 不一致','回掛原案件 case_id');
  if(m.task_id!==context.task_id)
    fail(3,'TASK_ID_MISMATCH','task_id','任務 ID 不一致','沿用原任務 task_id');
  for(const idField of ['event_id','attempt_id']){
    if(!validId(m[idField]))fail(3,'INVALID_ID',idField,'事件／嘗試 ID 格式不符','建立不重用的合法 ID');
  }
  const claim=source?.attestation?.statement;
  if(m.source_ref!==context.expected_scope||m.source_ref!==claim?.scope)
    fail(2,'SOURCE_SCOPE_MISMATCH','source_ref','來源範圍與簽章及目標不一致','核對來源 scope 與受信預期目標');
  if(m.source_version!==claim?.source_revision)
    fail(2,'SOURCE_VERSION_MISMATCH','source_version','來源版本與簽章聲明不一致','以原始受信來源版本重建事件');
  if(!HEX.test(m.source_digest)||m.source_digest!==claim?.raw_source_digest)
    fail(2,'SOURCE_DIGEST_MISMATCH','source_digest','來源摘要與已驗來源不一致','對原始來源重新取證，不覆蓋原件');
  if(m.purpose_id!==claim?.purpose_id)
    fail(5,'PURPOSE_MISMATCH','purpose_id','目的與簽章聲明不一致','退回對照原始目的，必要時另開問題');
  if(!str(m.original_goal))
    fail(5,'ORIGINAL_GOAL_REQUIRED','original_goal','缺原問題／目的文字','保留原問題與其版本');
  if(m.sender_endpoint_id!==context.sender_endpoint_id||
     m.receiver_endpoint_id!==context.receiver_endpoint_id)
    fail(9,'ENDPOINT_ROUTE_MISMATCH','sender_endpoint_id,receiver_endpoint_id',
      '聲稱的兩端與外部預期路由不一致','由獨立權限配置重新核對端點');
  if(!TYPES.has(m.message_kind))
    fail(5,'MESSAGE_KIND_INVALID','message_kind','訊息種類不符合目前接口契約','使用明確的事件類型');
  // Rejections and corrected resubmissions are separate append-only events,
  // never a mutation of the rejected event or a reused event identifier.
  if(m.message_kind==='RETURN'){
    const reasons=m.return_reasons;
    if(!validId(m.rejected_event_id)||!findKnown(context.known_events,m.rejected_event_id)||
      !Array.isArray(reasons)||reasons.length<1||reasons.length>20||
      reasons.some(x=>!obj(x)||!validId(x.code)||!str(x.field_path)||
        !str(x.reason)||!str(x.suggested_correction)))
      fail(7,'RETURN_CONTEXT_MISSING','rejected_event_id,return_reasons',
        '退回缺被拒事件參照、具體欄位原因或建議','回掛原 rejected_event_id 並逐項說明退回原因');
  }
  if(m.message_kind==='RESUBMIT'){
    if(!validId(m.supersedes_event_id)||!findKnown(context.known_events,m.supersedes_event_id)||
      m.supersedes_event_id===m.event_id)
      fail(7,'RESUBMIT_CONTEXT_MISSING','supersedes_event_id',
        '重新提交缺有效的原事件版本鏈','使用新 event/attempt，連結被取代事件');
  }
  if(!Number.isSafeInteger(m.sequence)||m.sequence!==context.last_sequence+1)
    fail(4,'SEQUENCE_MISMATCH','sequence','事件排序與前一序號不一致','以受核對的序號重新提交');
  if(m.previous_event_id!==context.last_event_id)
    fail(7,'PREVIOUS_EVENT_MISMATCH','previous_event_id','前一事件關聯不一致','參照原事件並保留修正歷史');
  if(!obj(m.placement)||m.placement.container!==context.placement.container||
    m.placement.slot!==context.placement.slot||
    m.placement.ordinal!==context.placement.ordinal)
    fail(4,'PLACEMENT_MISMATCH','placement','目的容器、位置或序號不一致','依預先核准的位置投遞');
  if(!Array.isArray(m.links)||m.links.length>100)
    fail(6,'LINKS_INVALID','links','關聯清單不存在或超過限制','回查及限制關聯數量');
  else for(let i=0;i<m.links.length;i++){
    const link=m.links[i],ref=findKnown(context.known_events,link?.target_id);
    if(!obj(link)||!LINKS.has(link.type)||!validId(link.target_id)){
      fail(6,'LINK_INVALID',`links[${i}]`,'關聯格式不合法','校正關係類型及目標 ID');continue;
    }
    if(!ref)fail(6,'LINK_TARGET_MISSING',`links[${i}].target_id`,'無法讀回關聯目標','重新核實受信事件位置與 ID');
    else if(ref.version!==link.target_version)
      fail(6,'LINK_VERSION_MISMATCH',`links[${i}].target_version`,'關聯版本不一致','修正指向固定來源版本');
  }
  if(!Array.isArray(m.citations)||m.citations.length>100)
    fail(12,'CITATION_LIST_INVALID','citations','引用清單缺失或超限','保留引用來源與使用紀錄');
  else for(let i=0;i<m.citations.length;i++){
    const c=m.citations[i],rec=findKnown(context.known_citations,c?.citation_id);
    const use=c?.usage;
    if(!obj(c)||!validId(c.citation_id)||!str(c.source_ref)||!str(c.source_version)||
       !HEX.test(c.source_digest)||!str(c.locator)||!str(c.claim_id)||
       !str(c.readback_ref)||!obj(use)||!validId(use.use_id)||
       !Number.isSafeInteger(use.sequence)||use.sequence<1){
      fail(12,'CITATION_CONTRACT_INVALID',`citations[${i}]`,
        '引用與使用紀錄欄位不完整','補上來源版次、定位、主張及使用鏈');continue;
    }
    // Citations may reference a *different* source. Compare the cited version
    // against its own registry entry; do not force it to equal main graph digest.
    // The registry is injected and does NOT prove semantic support or authenticity.
    if(!rec||c.source_ref!==rec.source_ref||c.source_version!==rec.source_version||
       c.locator!==rec.locator||c.source_digest!==rec.source_digest)
      fail(12,'CITATION_REGISTRY_MISMATCH',`citations[${i}]`,
        '引用版本或段落與呼叫端登記表不符','重新讀回引用原文與版本');
    if(use.used_in_event_id!==m.event_id||use.used_in_attempt_id!==m.attempt_id||
      use.used_by_endpoint!==m.sender_endpoint_id)
      fail(12,'CITATION_USAGE_MISMATCH',`citations[${i}].usage`,
        '引用使用事件／嘗試／端點不符','建立新的引用使用事件並連回原文');
  }
  let repeated=false;
  const prior=validId(m.event_id)?findKnown(context.known_events,m.event_id):undefined;
  if(prior){
    let digest=null;
    try{digest=sha(stable(m));}catch{}
    if(!digest||digest!==prior.digest)
      fail(8,'EVENT_ID_REUSED_WITH_NEW_CONTENT','event_id','同一事件 ID 不得承載不同內容','建立新 event_id、attempt_id 並回掛舊事件');
    else repeated=true;
  }
  if(reasons.length){
    const canTrace=validId(m.event_id)&&str(m.case_id)&&str(m.task_id);
    const returnEvent=canTrace?{
      // A locally evidenced defect is not authorization to contact the
      // claimed sender. Without independently authenticated F05 sender
      // identity, this is a held diagnostic record, not a routeable return.
      status:'HELD_UNVERIFIED_SENDER',rejected_event_id:m.event_id,
      original_case_id:m.case_id,original_task_id:m.task_id,
      original_version:typeof m.source_version==='string'?m.source_version:null,
      return_to:null,route_verified:false,reasons
    }:null;
    return resultBase('QUARANTINE_NO_VERIFIED_SENDER',checks,reasons,review,returnEvent);
  }
  if(repeated)return resultBase('DUPLICATE_NO_EFFECT',checks,[],review,null);
  // We only verified local structure and injected trust policy. No trusted
  // independent endpoint identity, text semantics, factual citation evidence.
  return resultBase('LOCAL_REVIEW_ONLY',checks,[],review,null);
}
module.exports={assessF05Interface};
