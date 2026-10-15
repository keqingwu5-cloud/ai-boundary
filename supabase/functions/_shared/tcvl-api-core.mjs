/* TCVL unified API contract. Stateless / safe for browser previews and server. */
export const API_VERSION = "tcvl.platform-api.v1";
export const TASK_STATES = Object.freeze(["queued","running","stop_requested","stopped","completed","refused","failed"]);
export const CONNECTOR_STATES = Object.freeze(["planned","configured","disabled","error"]);
export const CAPABILITIES = Object.freeze([
 "model.respond","code.inspect","data.read","knowledge.search","events.receive",
 "notifications.send","media.generate","project.sync"
]);
export const RECORD_KINDS = Object.freeze(["inbound","outbound","rejection","correction","status","validation"]);
export const ROUTE_CATALOG = Object.freeze([
 {method:"GET",path:"/v1/overview",purpose:"取得專案與接口功能的共用入口狀態"},
 {method:"GET",path:"/v1/projects",purpose:"列出本人專案"},
 {method:"POST",path:"/v1/projects",purpose:"建立專案"},
 {method:"PATCH",path:"/v1/projects/:id/settings",purpose:"更新專案的提醒、介面或圖片設定"},
 {method:"GET",path:"/v1/conversations",purpose:"查看與專案連結的對話"},
 {method:"POST",path:"/v1/conversations",purpose:"建立專案對話；任務停止不影響對話"},
 {method:"GET",path:"/v1/tasks",purpose:"查看任務和中斷進度"},
 {method:"POST",path:"/v1/tasks",purpose:"建立待執行任務，不自動呼叫外部 AI"},
 {method:"POST",path:"/v1/tasks/:id/stop",purpose:"提出停止請求，保留既有進度與對話"},
 {method:"POST",path:"/v1/tasks/:id/refuse",purpose:"記錄拒絕理由、影響與後續處理"},
 {method:"GET",path:"/v1/events",purpose:"取得可回溯的雙向與審核事件"},
 {method:"GET",path:"/v1/connectors",purpose:"讀取接口註冊清單和狀態"},
 {method:"POST",path:"/v1/connectors",purpose:"新增規劃中的接口，不含憑證或自動執行"},
 {method:"GET",path:"/v1/connectors/template",purpose:"取得雙向接口訂製範本"},
 {method:"POST",path:"/v1/connectors/validate",purpose:"驗證雙向接口規格，不連線、不儲存"},
 {method:"POST",path:"/v1/transfers/preview",purpose:"模擬送出／接收決策，未執行任何外部傳輸"}
]);
export function isObject(v){return v!==null && typeof v==="object" && !Array.isArray(v)}
export function stringField(v,max){return typeof v==="string"&&v.trim().length>=1&&v.length<=max?v.trim():null}
export function optionalString(v,max){return v===undefined||v===null||v===""?null:stringField(v,max)}
export function uuid(v){return typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)}
export function projectInput(b){
 if(!isObject(b))return {error:"project_body_invalid"};
 const name=stringField(b.name,100);
 if(!name)return {error:"project_name_required"};
 return {value:{name}};
}
export function conversationInput(b){
 if(!isObject(b)||!uuid(b.project_id))return {error:"project_id_invalid"};
 const title=stringField(b.title,160),goal=optionalString(b.goal,1200);
 if(!title||b.goal!==undefined && b.goal!==null && b.goal!==""&&!goal)return {error:"conversation_title_or_goal_invalid"};
 return {value:{project_id:b.project_id,title,goal:goal||""}};
}
export function taskInput(b){
 if(!isObject(b)||!uuid(b.project_id))return {error:"project_id_invalid"};
 const title=stringField(b.title,160),description=optionalString(b.description,3500);
 if(!title||b.description!==undefined&&b.description!==null&&b.description!==""&&!description)return {error:"task_title_or_description_invalid"};
 if(b.conversation_id!=null&&!uuid(b.conversation_id))return {error:"conversation_id_invalid"};
 return {value:{project_id:b.project_id,title,description:description||"",conversation_id:b.conversation_id||null}};
}
export function refusalInput(b){
 if(!isObject(b))return {error:"refusal_body_invalid"};
 const reason=stringField(b.reason,1800),impact=stringField(b.impact,1800),next_action=stringField(b.next_action,1800);
 if(!reason||!impact||!next_action)return {error:"refusal_reason_impact_next_required"};
 return {value:{reason,impact,next_action}};
}
export function connectorInput(b){
 if(!isObject(b))return {error:"connector_body_invalid"};
 const id=stringField(b.connector_id,75),name=stringField(b.display_name,150),provider=stringField(b.provider,120);
 if(!id||!/^[a-z0-9][a-z0-9-_.]*$/.test(id)||!name||!provider)return {error:"connector_identity_invalid"};
 if(!Array.isArray(b.capabilities)||!b.capabilities.length||b.capabilities.length>CAPABILITIES.length)return {error:"connector_capabilities_invalid"};
 const caps=[...new Set(b.capabilities)];
 if(caps.length!==b.capabilities.length||caps.some(x=>!CAPABILITIES.includes(x)))return {error:"connector_capabilities_invalid"};
 // Only a manifest: NEVER accept tokens, execution URLs, scopes or an unverified online status from clients.
 const allowed=new Set(["connector_id","display_name","provider","capabilities"]);
 if(Object.keys(b).some(k=>!allowed.has(k)))return {error:"connector_extra_field_forbidden"};
 return {value:{connector_id:id,display_name:name,provider,capabilities:caps,status:"planned"}};
}
export function settingsInput(b){
 if(!isObject(b))return {error:"settings_body_invalid"};
 const allowed=new Set(["notifications","image","ui"]);
 if(!Object.keys(b).length||Object.keys(b).some(k=>!allowed.has(k)))return {error:"settings_keys_invalid"};
 const result={};
 if(b.notifications!==undefined){
   if(!isObject(b.notifications)||Object.keys(b.notifications).some(k=>!["rejection_alerts","status_alerts"].includes(k)) ||
      Object.values(b.notifications).some(x=>typeof x!=="boolean"))return {error:"notification_settings_invalid"};
   result.notifications={...b.notifications};
 }
 if(b.image!==undefined){
   if(!isObject(b.image)||Object.keys(b.image).some(k=>!["aspect_ratio","quality"].includes(k)))return {error:"image_settings_invalid"};
   const o=b.image;
   if(o.aspect_ratio!==undefined&&!["1:1","4:3","16:9","9:16"].includes(o.aspect_ratio))return {error:"image_aspect_invalid"};
   if(o.quality!==undefined&&!["standard","high"].includes(o.quality))return {error:"image_quality_invalid"};
   result.image={...o};
 }
 if(b.ui!==undefined){
   if(!isObject(b.ui)||Object.keys(b.ui).some(k=>!["show_inbound","show_outbound","dim_inactive"].includes(k))||
      Object.values(b.ui).some(x=>typeof x!=="boolean"))return {error:"ui_settings_invalid"};
   result.ui={...b.ui};
 }
 return {value:result};
}
export function taskStopDecision(status){
 if(status==="queued"||status==="running")return {action:"request_stop",result:"stop_requested",message:"停止請求已保存；尚未保證遠端執行已停止"};
 if(status==="stop_requested")return {action:"unchanged",result:"stop_requested",message:"已有停止請求；等待執行器確認"};
 if(["stopped","completed","refused","failed"].includes(status))return {action:"unchanged",result:status,message:"任務已是終止狀態；不會改動對話"};
 return {action:"invalid",result:"invalid",message:"未知任務狀態"};
}
export function visibleAlert(event){
 if(!isObject(event)||event.kind!=="rejection")return null;
 const details=event.details||{};
 if(!stringField(details.reason,1800)||!stringField(details.impact,1800)||!stringField(details.next_action,1800))return null;
 return {severity:"warning",title:"任務遭拒絕，需要處理",reason:details.reason,impact:details.impact,next_action:details.next_action,task_id:event.task_id||null};
}
