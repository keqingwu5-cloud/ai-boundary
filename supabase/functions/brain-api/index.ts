/* Draft Supabase Edge Function (not deployed). No vendor AI execution or secrets in repository. */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
 API_VERSION,ROUTE_CATALOG,projectInput,conversationInput,taskInput,
 connectorInput,refusalInput,settingsInput,uuid,visibleAlert
} from "../_shared/tcvl-api-core.mjs";
import {
 defaultManifest,validateManifest,draftMessage,resolveInbound,resolveOutbound
} from "../_shared/tcvl-transfer-contract.mjs";

const ALLOWED_ORIGIN=Deno.env.get("TCVL_ALLOWED_ORIGIN")||"https://keqingwu5-cloud.github.io";
const MAX_BYTES=16000;
function headers(origin){
 const h={"cache-control":"no-store","x-content-type-options":"nosniff","vary":"Origin"};
 if(origin===ALLOWED_ORIGIN){
  h["access-control-allow-origin"]=ALLOWED_ORIGIN;
  h["access-control-allow-methods"]="GET,POST,PATCH,OPTIONS";
  h["access-control-allow-headers"]="authorization,apikey,content-type,x-client-info";
 }
 return h;
}
function reply(body,status,origin){
 return new Response(JSON.stringify(body),{status,headers:{...headers(origin),"content-type":"application/json; charset=utf-8"}});
}
function fail(code,status,origin){return reply({ok:false,error:code},status,origin)}
async function jsonLimited(request){
 const length=Number(request.headers.get("content-length")||"0");
 if(!Number.isFinite(length)||length>MAX_BYTES)throw Error("body_too_large");
 const reader=request.body?.getReader();
 if(!reader)throw Error("empty_body");
 const chunks=[];let sum=0;
 while(true){
  const {value,done}=await reader.read();
  if(done)break;
  sum+=value.byteLength;
  if(sum>MAX_BYTES){await reader.cancel();throw Error("body_too_large")}
  chunks.push(value);
 }
 const bytes=new Uint8Array(sum);let i=0;
 for(const c of chunks){bytes.set(c,i);i+=c.byteLength}
 try{return JSON.parse(new TextDecoder().decode(bytes))}
 catch{throw Error("invalid_json")}
}
function pageSize(url){
 const n=Number(url.searchParams.get("limit")||25);
 return Number.isSafeInteger(n)?Math.min(50,Math.max(1,n)):25;
}
function apiPath(path){
 const pos=path.indexOf("/brain-api/");
 if(pos>=0)return path.slice(pos+"/brain-api".length);
 if(path.endsWith("/brain-api"))return "/";
 return null;
}
function asData(result,origin,status=200){
 if(result.error)return fail("database_operation_failed",500,origin);
 return reply({ok:true,data:result.data},status,origin);
}
Deno.serve(async(request)=>{
 const origin=request.headers.get("origin")||"";
 if(request.method==="OPTIONS"){
  if(origin!==ALLOWED_ORIGIN)return fail("origin_not_allowed",403,origin);
  return new Response(null,{status:204,headers:headers(origin)});
 }
 const url=new URL(request.url),path=apiPath(url.pathname);
 if(!path)return fail("unknown_route",404,origin);
 const method=request.method.toUpperCase();
 const bearer=request.headers.get("authorization")||"";
 const token=bearer.match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!token)return fail("authentication_required",401,origin);
 const server=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!server||!anon)return fail("server_configuration_missing",503,origin);
 const db=createClient(server,anon,{
  global:{headers:{Authorization:"Bearer "+token}},
  auth:{persistSession:false,autoRefreshToken:false}
 });
 const verified=await db.auth.getUser(token);
 const userId=verified.data?.user?.id;
 if(verified.error||!uuid(userId))return fail("authentication_invalid",401,origin);

 try{
  if(method==="GET"&&path==="/v1/overview")
   return reply({ok:true,version:API_VERSION,model_api_connected:false,
     message:"平台 API 僅處理經身分驗證的資料與草稿，尚未建立外部 AI 傳輸能力",
     routes:ROUTE_CATALOG},200,origin);

  if(method==="GET"&&path==="/v1/projects")
   return asData(await db.from("tcvl_projects").select("id,name,settings,created_at,updated_at")
    .eq("owner_id",userId).order("created_at",{ascending:false}).limit(pageSize(url)),origin);
  if(method==="POST"&&path==="/v1/projects"){
   const input=projectInput(await jsonLimited(request));
   if(input.error)return fail(input.error,400,origin);
   return asData(await db.from("tcvl_projects").insert({owner_id:userId,...input.value})
    .select("id,name,settings,created_at").single(),origin,201);
  }
  const settingsPath=path.match(/^\/v1\/projects\/([0-9a-f-]{36})\/settings$/i);
  if(method==="PATCH"&&settingsPath){
   if(!uuid(settingsPath[1]))return fail("project_id_invalid",400,origin);
   const input=settingsInput(await jsonLimited(request));
   if(input.error)return fail(input.error,400,origin);
   const previous=await db.from("tcvl_projects").select("settings")
    .eq("id",settingsPath[1]).eq("owner_id",userId).maybeSingle();
   if(previous.error)return fail("database_operation_failed",500,origin);
   if(!previous.data)return fail("project_not_found",404,origin);
   const original=previous.data.settings||{};
   const merged={...original};
   for(const [key,value] of Object.entries(input.value))
     merged[key]={...(original[key]||{}),...value};
   return asData(await db.from("tcvl_projects").update({settings:merged,updated_at:new Date().toISOString()})
    .eq("id",settingsPath[1]).eq("owner_id",userId).select("id,settings").single(),origin);
  }
  if(method==="GET"&&path==="/v1/conversations"){
   const q=db.from("tcvl_conversations").select("id,project_id,title,goal,status,created_at")
    .eq("owner_id",userId).order("created_at",{ascending:false}).limit(pageSize(url));
   if(url.searchParams.has("project_id")){
    if(!uuid(url.searchParams.get("project_id")))return fail("project_id_invalid",400,origin);
    q.eq("project_id",url.searchParams.get("project_id"));
   }
   return asData(await q,origin);
  }
  if(method==="POST"&&path==="/v1/conversations"){
   const input=conversationInput(await jsonLimited(request));
   if(input.error)return fail(input.error,400,origin);
   const owned=await db.from("tcvl_projects").select("id").eq("id",input.value.project_id)
    .eq("owner_id",userId).maybeSingle();
   if(owned.error||!owned.data)return fail("project_not_found",404,origin);
   return asData(await db.from("tcvl_conversations").insert({...input.value,owner_id:userId})
    .select("id,project_id,title,goal,status,created_at").single(),origin,201);
  }
  if(method==="GET"&&path==="/v1/tasks"){
   const q=db.from("tcvl_tasks").select("id,project_id,conversation_id,title,description,status,progress,created_at,updated_at,stop_requested_at,stopped_at")
    .eq("owner_id",userId).order("created_at",{ascending:false}).limit(pageSize(url));
   if(url.searchParams.has("project_id")){
    if(!uuid(url.searchParams.get("project_id")))return fail("project_id_invalid",400,origin);
    q.eq("project_id",url.searchParams.get("project_id"));
   }
   return asData(await q,origin);
  }
  if(method==="POST"&&path==="/v1/tasks"){
   const input=taskInput(await jsonLimited(request));
   if(input.error)return fail(input.error,400,origin);
   const owned=await db.from("tcvl_projects").select("id")
    .eq("id",input.value.project_id).eq("owner_id",userId).maybeSingle();
   if(owned.error||!owned.data)return fail("project_not_found",404,origin);
   if(input.value.conversation_id){
    const belongs=await db.from("tcvl_conversations").select("id")
      .eq("id",input.value.conversation_id).eq("project_id",input.value.project_id).eq("owner_id",userId).maybeSingle();
    if(belongs.error||!belongs.data)return fail("conversation_not_in_project",400,origin);
   }
   return asData(await db.from("tcvl_tasks").insert({...input.value,owner_id:userId})
    .select("id,project_id,conversation_id,title,status,progress,created_at").single(),origin,201);
  }
  const stop=path.match(/^\/v1\/tasks\/([0-9a-f-]{36})\/stop$/i);
  if(method==="POST"&&stop){
   if(!uuid(stop[1]))return fail("task_id_invalid",400,origin);
   // Narrow atomic RPC performs ownership verification + writes an audit entry.
   const result=await db.rpc("tcvl_request_stop",{p_task_id:stop[1]});
   if(result.error)return fail("task_not_found_or_stop_failed",400,origin);
   return reply({ok:true,data:result.data,remote_stopped:false,
     note:"停止請求不表示遠端 AI 已停止。對話保持可用。"},200,origin);
  }
  const refuse=path.match(/^\/v1\/tasks\/([0-9a-f-]{36})\/refuse$/i);
  if(method==="POST"&&refuse){
   if(!uuid(refuse[1]))return fail("task_id_invalid",400,origin);
   const input=refusalInput(await jsonLimited(request));
   if(input.error)return fail(input.error,400,origin);
   const result=await db.rpc("tcvl_refuse_task",{p_task_id:refuse[1],
      p_reason:input.value.reason,p_impact:input.value.impact,p_next_action:input.value.next_action});
   if(result.error)return fail("task_not_found_or_refusal_failed",400,origin);
   return reply({ok:true,data:result.data,
     alert:visibleAlert({kind:"rejection",task_id:refuse[1],details:input.value})},200,origin);
  }
  if(method==="GET"&&path==="/v1/events"){
   const projectId=url.searchParams.get("project_id");
   if(!uuid(projectId))return fail("project_id_required",400,origin);
   return asData(await db.from("tcvl_events").select("id,project_id,task_id,kind,direction,actor_kind,details,recorded_at")
     .eq("owner_id",userId).eq("project_id",projectId)
     .order("recorded_at",{ascending:false}).limit(pageSize(url)),origin);
  }
  if(method==="GET"&&path==="/v1/connectors")
   return asData(await db.from("tcvl_connectors").select("id,connector_id,display_name,provider,capabilities,status,last_verified_at,created_at")
     .eq("owner_id",userId).order("created_at",{ascending:false}).limit(pageSize(url)),origin);
  if(method==="POST"&&path==="/v1/connectors"){
   const input=connectorInput(await jsonLimited(request));
   if(input.error)return fail(input.error,400,origin);
   return asData(await db.from("tcvl_connectors").insert({...input.value,owner_id:userId})
      .select("id,connector_id,display_name,provider,capabilities,status,created_at").single(),origin,201);
  }
  if(method==="GET"&&path==="/v1/connectors/template")
   return reply({ok:true,template:defaultManifest()},200,origin);
  if(method==="POST"&&path==="/v1/connectors/validate"){
   const manifest=await jsonLimited(request),errors=validateManifest(manifest);
   return reply({ok:errors.length===0,errors,validated_only:true,stored:false,connected:false},errors.length?422:200,origin);
  }
  if(method==="POST"&&path==="/v1/transfers/preview"){
   const input=await jsonLimited(request);
   if(!input||typeof input!=="object")return fail("transfer_preview_invalid",400,origin);
   const errors=validateManifest(input.manifest);
   if(errors.length)return reply({ok:false,errors},422,origin);
   const draft=draftMessage(input.message);
   if(!draft.ok)return reply({ok:false,errors:draft.errors},422,origin);
   if(draft.value.connector_id!==input.manifest.connector_id)
      return fail("connector_identity_mismatch",422,origin);
   const direction=draft.value.direction;
   const decision=direction==="inbound"
     ?resolveInbound(input.manifest.inbound,draft.value)
     :resolveOutbound(input.manifest.outbound,draft.value);
   return reply({ok:true,direction,decision,preview_only:true,
     sent:false,received:false,executed:false,verified:false},200,origin);
  }
  return fail("route_not_found",404,origin);
 }catch(e){
   if(e?.message==="body_too_large")return fail("body_too_large",413,origin);
   if(e?.message==="invalid_json"||e?.message==="empty_body")return fail("invalid_json",400,origin);
   // Avoid leaking database, access credentials, and internal errors to clients.
   return fail("request_failed",500,origin);
 }
});
