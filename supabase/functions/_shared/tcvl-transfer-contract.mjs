/* TCVL bi-directional transfer contract V1.
 * Runtime-agnostic validation. Does not perform HTTP, read credentials or persist anything.
 */
export const TRANSFER_SCHEMA="tcvl.transfer.v1";
export const CONNECTOR_SCHEMA="tcvl.connector.manifest.v1";
export const DIRECTION=Object.freeze(["inbound","outbound"]);
export const CHANNEL_STATES=Object.freeze(["disabled","planned","needs_review","ready"]);
export const RECEIPT_STATES=Object.freeze([
 "draft","validated","queued","sent","accepted","processing","processed",
 "rejected","failed","stop_requested","stopped"
]);
export const PAYLOAD_SCHEMAS=Object.freeze(["tcvl.task.v1","tcvl.result.v1","tcvl.evidence.v1","tcvl.event.v1"]);
export const TRANSPORTS=Object.freeze(["manual","https","webhook"]);
const isObj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const nonempty=(x,max=250)=>typeof x==="string"&&x.trim().length>0&&x.length<=max;
const id=x=>nonempty(x,100)&&/^[a-zA-Z0-9][a-zA-Z0-9_:.\-]{0,99}$/.test(x);
const guid=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const iso=x=>typeof x==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const hasOnly=(obj,allowed)=>Object.keys(obj).every(k=>allowed.includes(k));
export function directionDefaults(direction){
 if(!DIRECTION.includes(direction))throw Error("invalid_direction");
 return {
   enabled:false,
   mode:"manual",
   payload_schema:direction==="outbound"?"tcvl.task.v1":"tcvl.result.v1",
   require_source_verification:true,
   require_human_approval:true,
   require_receipt:true,
   allowed_event_types:direction==="outbound"?["task"] : ["result","rejection"],
   max_bytes:65536,
   field_map:[],
   retry:{max_attempts:0,backoff_seconds:60},
   on_failure:"quarantine"
 };
}
export const EVENT_TYPES=Object.freeze(["task","result","evidence","rejection","correction","status"]);
export const FAILURE_ACTIONS=Object.freeze(["quarantine","hold","notify"]);
export function validateDirectionConfig(config,direction){
 const errors=[];
 if(!DIRECTION.includes(direction)||!isObj(config))return ["invalid_direction_config"];
 const valid=["enabled","mode","payload_schema","require_source_verification","require_human_approval",
  "require_receipt","allowed_event_types","max_bytes","field_map","retry","on_failure"];
 if(!hasOnly(config,valid))errors.push("unknown_direction_field");
 if(typeof config.enabled!=="boolean"||!TRANSPORTS.includes(config.mode))errors.push("direction_enabled_or_mode_invalid");
 if(!PAYLOAD_SCHEMAS.includes(config.payload_schema))errors.push("payload_schema_invalid");
 for(const key of ["require_source_verification","require_human_approval","require_receipt"])
   if(typeof config[key]!=="boolean")errors.push(key+"_invalid");
 if(!Array.isArray(config.allowed_event_types)||!config.allowed_event_types.length||
   config.allowed_event_types.length>EVENT_TYPES.length||
   new Set(config.allowed_event_types).size!==config.allowed_event_types.length||
   config.allowed_event_types.some(x=>!EVENT_TYPES.includes(x)))errors.push("allowed_event_types_invalid");
 if(!Number.isInteger(config.max_bytes)||config.max_bytes<1024||config.max_bytes>262144)errors.push("max_bytes_invalid");
 if(!Array.isArray(config.field_map)||config.field_map.length>12)errors.push("field_map_invalid");
 else {
  const sources=new Set(),targets=new Set();
  for(const item of config.field_map){
   if(!isObj(item)||!hasOnly(item,["source","target"])||
    !nonempty(item.source,80)||!nonempty(item.target,80)||
    !/^[a-zA-Z][\w.-]*$/.test(item.source)||!/^[a-zA-Z][\w.-]*$/.test(item.target)||
    sources.has(item.source)||targets.has(item.target))errors.push("field_map_invalid");
   if(isObj(item)){sources.add(item.source);targets.add(item.target)}
  }
 }
 if(!isObj(config.retry)||!hasOnly(config.retry,["max_attempts","backoff_seconds"])||
   !Number.isInteger(config.retry.max_attempts)||config.retry.max_attempts<0||config.retry.max_attempts>4||
   !Number.isInteger(config.retry.backoff_seconds)||config.retry.backoff_seconds<1||config.retry.backoff_seconds>3600)
   errors.push("retry_invalid");
 if(!FAILURE_ACTIONS.includes(config.on_failure))errors.push("failure_action_invalid");
 // Declaring a network transport is not permission to turn it on without backend review.
 if(config.enabled && config.mode!=="manual")errors.push("unreviewed_network_connector_forbidden");
 if(config.enabled && (!config.require_source_verification||!config.require_human_approval))
   errors.push("review_and_source_verification_required");
 if(config.mode==="manual"&&config.retry?.max_attempts!==0)errors.push("manual_retry_must_be_zero");
 return [...new Set(errors)];
}
export function defaultManifest(connector_id="connector-demo",display_name="新增接口",provider="custom"){
 return {schema:CONNECTOR_SCHEMA,connector_id,display_name,provider,
  status:"planned",inbound:directionDefaults("inbound"),outbound:directionDefaults("outbound")};
}
export function validateManifest(m){
 if(!isObj(m)||m.schema!==CONNECTOR_SCHEMA)return ["connector_schema_invalid"];
 const errors=[];
 if(!hasOnly(m,["schema","connector_id","display_name","provider","status","inbound","outbound"]))
   errors.push("unknown_manifest_field");
 if(!id(m.connector_id)||!nonempty(m.display_name,150)||!nonempty(m.provider,100))errors.push("connector_identity_invalid");
 if(!["planned","configured","disabled","error"].includes(m.status))errors.push("connector_status_invalid");
 for(const d of DIRECTION)errors.push(...validateDirectionConfig(m[d],d).map(x=>d+":"+x));
 if(m.status==="planned"&&(m.inbound?.enabled||m.outbound?.enabled))errors.push("planned_connector_cannot_be_enabled");
 return [...new Set(errors)];
}
export function draftMessage({message_id,correlation_id,project_id,task_id=null,connector_id,direction,event_type,payload_schema,created_at,payload,attempt=0}={}){
 const errors=[];
 if(!guid(message_id)||!guid(correlation_id)||!guid(project_id)||task_id!==null&&!guid(task_id))errors.push("identity_invalid");
 if(!id(connector_id)||!DIRECTION.includes(direction)||!EVENT_TYPES.includes(event_type)||
   !PAYLOAD_SCHEMAS.includes(payload_schema))errors.push("routing_invalid");
 if(!iso(created_at))errors.push("created_at_invalid");
 if(!isObj(payload)||!Object.keys(payload).length)errors.push("payload_invalid");
 if(!Number.isInteger(attempt)||attempt<0||attempt>4)errors.push("attempt_invalid");
 if(errors.length)return {ok:false,errors};
 return {ok:true,value:{schema:TRANSFER_SCHEMA,message_id,correlation_id,project_id,task_id,
   connector_id,direction,event_type,payload_schema,created_at,
   provenance:{claimed_source:null,verified_source:false},
   status:"draft",attempt,payload}};
}
export function validateEnvelope(e){
 if(!isObj(e)||e.schema!==TRANSFER_SCHEMA)return ["transfer_schema_invalid"];
 const errors=[];
 if(!guid(e.message_id)||!guid(e.correlation_id)||!guid(e.project_id)||e.task_id!=null&&!guid(e.task_id))errors.push("message_identity_invalid");
 if(!id(e.connector_id)||!DIRECTION.includes(e.direction)||!EVENT_TYPES.includes(e.event_type)||!PAYLOAD_SCHEMAS.includes(e.payload_schema))errors.push("message_route_invalid");
 if(!iso(e.created_at)||!RECEIPT_STATES.includes(e.status))errors.push("message_state_invalid");
 if(!isObj(e.provenance)||typeof e.provenance.verified_source!=="boolean")errors.push("message_provenance_invalid");
 if(!isObj(e.payload)||!Object.keys(e.payload).length)errors.push("message_payload_invalid");
 if(!Number.isInteger(e.attempt)||e.attempt<0||e.attempt>4)errors.push("message_attempt_invalid");
 return errors;
}
const ALLOWED={
 draft:["validated","rejected","failed"],
 validated:["queued","rejected","failed"],
 queued:["sent","stop_requested","failed"],
 sent:["accepted","failed","stop_requested"],
 accepted:["processing","rejected","failed","stop_requested"],
 processing:["processed","rejected","failed","stop_requested"],
 stop_requested:["stopped","processed","failed"],
 stopped:[],processed:[],rejected:[],failed:[]
};
export function transition(from,to){
 if(!RECEIPT_STATES.includes(from)||!RECEIPT_STATES.includes(to))return {ok:false,error:"unknown_transfer_state"};
 if(from===to)return {ok:true,idempotent:true};
 if(!ALLOWED[from].includes(to))return {ok:false,error:"transition_not_permitted"};
 return {ok:true,idempotent:false};
}
export function receiptDecision({previous_status,next_status,receipt_message_id,correlation_id,claimed_source,verified_source,reason,impact,next_action}={}){
 const change=transition(previous_status,next_status);
 if(!change.ok)return {ok:false,reason:change.error};
 if(!guid(receipt_message_id)||!guid(correlation_id))return {ok:false,reason:"receipt_identity_invalid"};
 if(!nonempty(claimed_source,160)||typeof verified_source!=="boolean")return {ok:false,reason:"receipt_source_invalid"};
 if(["accepted","processing","processed"].includes(next_status)&&!verified_source)
   return {ok:false,reason:"receipt_source_unverified"};
 if(next_status==="rejected"&&(!nonempty(reason,1200)||!nonempty(impact,1200)||!nonempty(next_action,1200)))
   return {ok:false,reason:"refusal_requires_reason_impact_next_action"};
 return {ok:true,verified:verified_source,rejected_alert:next_status==="rejected",
   terminal:["stopped","processed","rejected","failed"].includes(next_status),
   status:next_status};
}
export function resolveOutbound(config,envelope){
 const errors=[...validateDirectionConfig(config,"outbound"),...validateEnvelope(envelope)];
 if(errors.length)return {decision:"invalid",errors};
 if(envelope.direction!=="outbound")return {decision:"invalid",errors:["direction_mismatch"]};
 if(!config.enabled)return {decision:"blocked",errors:["outbound_disabled"]};
 if(!config.allowed_event_types.includes(envelope.event_type))return {decision:"blocked",errors:["event_not_allowed"]};
 return {decision:"awaiting_human_approval",errors:[],note:"已驗證格式；未實際傳送、未取得回執"};
}
export function resolveInbound(config,envelope){
 const errors=[...validateDirectionConfig(config,"inbound"),...validateEnvelope(envelope)];
 if(errors.length)return {decision:"invalid",errors};
 if(envelope.direction!=="inbound")return {decision:"invalid",errors:["direction_mismatch"]};
 if(!config.enabled)return {decision:"blocked",errors:["inbound_disabled"]};
 if(!config.allowed_event_types.includes(envelope.event_type))return {decision:"quarantine",errors:["event_not_allowed"]};
 if(config.require_source_verification&&!envelope.provenance.verified_source)
   return {decision:"quarantine",errors:["source_unverified"]};
 return {decision:"awaiting_human_review",errors:[],note:"資料已通過欄位檢查，未核准正式記憶"};
}
export function explainTransfer(message){
 return {status:message?.status||"unknown",source:message?.provenance?.claimed_source||"未知",
  verified:message?.provenance?.verified_source===true,
  task:message?.task_id||"未關聯任務",correlation:message?.correlation_id||"無",
  disclaimer:"回執狀態不等於內容經過事實查證"};
}
