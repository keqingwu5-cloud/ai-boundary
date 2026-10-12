const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const corsOrigin=null;
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:JSON_HEADERS});
const err=(status,message)=>json({ok:false,error:message},status);
const id=()=>crypto.randomUUID(),now=()=>new Date().toISOString();
const eq=(a,b)=>{const x=new TextEncoder().encode(a||""),y=new TextEncoder().encode(b||"");if(x.length!==y.length)return false;let r=0;for(let i=0;i<x.length;i++)r|=x[i]^y[i];return r===0;};
function auth(req,env){
 const header=req.headers.get("authorization")||"";
 const token=header.startsWith("Bearer ")?header.slice(7):"";
 if(!token)return null;
 if(env.ADMIN_TOKEN&&eq(token,env.ADMIN_TOKEN))return {role:"admin",name:"user"};
 for(const [name,key] of [["GPT1","AGENT_GPT1_TOKEN"],["GPT2","AGENT_GPT2_TOKEN"],["BOT3","AGENT_BOT3_TOKEN"]]){
  if(env[key]&&eq(token,env[key]))return {role:"agent",name};
 }
 return null;
}
async function body(req){const t=await req.text();if(t.length>200000)throw Error("payload_too_large");return JSON.parse(t||"{}");}
const txt=(v,max=25000)=>typeof v==="string"&&v.length<=max;
const audit=async(db,actor,type,subject,details)=>db.prepare("INSERT INTO audit_events (id,event_type,actor,subject_id,details_json,created_at) VALUES(?,?,?,?,?,?)").bind(id(),type,actor,subject,JSON.stringify(details),now()).run();
function route(path,method,kind){
 return path===kind&&method==="GET";
}
export default {
 async fetch(request,env){
  if(!env.DB||!env.ADMIN_TOKEN)return err(503,"not_configured");
  const u=new URL(request.url),path=u.pathname.replace(/\/+$/,"")||"/",method=request.method;
  if(method==="OPTIONS")return err(403,"cross_origin_disabled");
  const actor=auth(request,env);if(!actor)return err(401,"unauthorized");
  try{
   const db=env.DB;
   if(path==="/health"&&method==="GET")return json({ok:true,role:actor.role,status:"private_api_ready",shared_memory_sync:false});
   if(path==="/tasks"&&method==="POST"){
    if(actor.role!=="admin")return err(403,"admin_only");
    const b=await body(request);
    if(!txt(b.title,160)||!txt(b.instruction)||!txt(b.completion_criteria||"",5000)||!txt(b.stop_conditions||"",5000))return err(400,"invalid_task_fields");
    const targets=Array.isArray(b.targets)?[...new Set(b.targets)]:[];
    if(!targets.length||targets.some(t=>!["GPT1","GPT2","BOT3"].includes(t)))return err(400,"invalid_targets");
    const requestId=id(),created=now(),taskIds=[];
    for(const target of targets){const taskId=id();await db.prepare("INSERT INTO tasks(id,request_id,target,title,instruction,completion_criteria,stop_conditions,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'queued',?,?)").bind(taskId,requestId,target,b.title,b.instruction,b.completion_criteria||"",b.stop_conditions||"",created,created).run();taskIds.push(taskId);}
    await audit(db,actor.name,"tasks.created",requestId,{targets,taskIds});
    return json({ok:true,request_id:requestId,task_ids:taskIds,state:"queued",delivered:false},201);
   }
   if(path==="/tasks"&&method==="GET"){
    if(actor.role!=="admin")return err(403,"admin_only");
    const rows=await db.prepare("SELECT id,request_id,target,title,state,created_at,updated_at,report,pitfalls_json FROM tasks ORDER BY created_at DESC LIMIT 100").all();
    return json({ok:true,items:rows.results});
   }
   if(path==="/tasks/claim"&&method==="POST"){
    if(actor.role!=="agent")return err(403,"agent_only");
    const row=await db.prepare("SELECT id FROM tasks WHERE target=? AND state='queued' ORDER BY created_at LIMIT 1").bind(actor.name).first();
    if(!row)return json({ok:true,item:null});
    const leaseToken=id(),at=now(),expires=new Date(Date.now()+15*60*1000).toISOString();
    const result=await db.prepare("UPDATE tasks SET state='claimed',lease_token=?,claimed_at=?,lease_until=?,updated_at=? WHERE id=? AND state='queued'").bind(leaseToken,at,expires,at,row.id).run();
    if(result.meta?.changes!==1)return json({ok:true,item:null,collision:true});
    const item=await db.prepare("SELECT id,title,instruction,completion_criteria,stop_conditions,lease_until FROM tasks WHERE id=?").bind(row.id).first();
    await audit(db,actor.name,"task.claimed",row.id,{lease_until:expires});
    return json({ok:true,item:{...item,lease_token:leaseToken}});
   }
   const match=path.match(/^\/tasks\/([0-9a-f-]{36})\/report$/);
   if(match&&method==="POST"){
    if(actor.role!=="agent")return err(403,"agent_only");
    const b=await body(request);if(!txt(b.report,100000)||!["completed","failed"].includes(b.state)||!Array.isArray(b.pitfalls)||b.pitfalls.length>25||!txt(b.lease_token,80))return err(400,"invalid_report");
    const pitfalls=JSON.stringify(b.pitfalls);if(pitfalls.length>50000)return err(400,"pitfalls_too_large");
    const row=await db.prepare("SELECT target,state,lease_token,lease_until FROM tasks WHERE id=?").bind(match[1]).first();
    if(!row||row.target!==actor.name)return err(404,"task_not_found");
    if(row.state!=="claimed"||!eq(row.lease_token,b.lease_token)||row.lease_until<now())return err(409,"lease_invalid_or_expired");
    const result=await db.prepare("UPDATE tasks SET state=?, report=?, pitfalls_json=?,lease_token=NULL,updated_at=? WHERE id=? AND state='claimed' AND lease_token=? AND lease_until>=?").bind(b.state,b.report,pitfalls,now(),match[1],b.lease_token,now()).run();
    if(result.meta?.changes!==1)return err(409,"claim_changed");
    await audit(db,actor.name,"task.reported",match[1],{state:b.state,pitfall_count:b.pitfalls.length});
    return json({ok:true,task_id:match[1],state:b.state,central_memory_updated:false});
   }
   if(path==="/candidates"&&method==="POST"){
    const b=await body(request);
    if(!["revise_answer","revise_question","new_question","pitfall","other"].includes(b.event_type)||!txt(b.original_question,4000)||!txt(b.purpose,4000)||!txt(b.summary,20000)||!Array.isArray(b.evidence)||JSON.stringify(b.evidence).length>25000)return err(400,"invalid_candidate");
    const semantic=["not_required","pending","confirmed","diverged"].includes(b.alignment_state)?b.alignment_state:"pending";
    const cId=id(),at=now();
    await db.prepare("INSERT INTO memory_candidates(id,event_type,parent_memory_id,original_question,purpose,summary,evidence_json,alignment_state,source_agent,source_task_id,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?)").bind(cId,b.event_type,txt(b.parent_memory_id,100)?b.parent_memory_id:null,b.original_question,b.purpose,b.summary,JSON.stringify(b.evidence),semantic,actor.name,txt(b.source_task_id,100)?b.source_task_id:null,at).run();
    await audit(db,actor.name,"candidate.created",cId,{event_type:b.event_type,alignment_state:semantic});
    return json({ok:true,candidate_id:cId,state:"pending",authoritative:false},201);
   }
   if(path==="/candidates"&&method==="GET"){
    if(actor.role!=="admin")return err(403,"admin_only");
    const rows=await db.prepare("SELECT * FROM memory_candidates ORDER BY created_at DESC LIMIT 100").all();
    return json({ok:true,items:rows.results});
   }
   const review=path.match(/^\/candidates\/([0-9a-f-]{36})\/review$/);
   if(review&&method==="POST"){
    if(actor.role!=="admin")return err(403,"admin_only");
    const b=await body(request);if(!["approve","reject"].includes(b.action)||!txt(b.note,5000)||!b.note.trim())return err(400,"invalid_review");
    const c=await db.prepare("SELECT * FROM memory_candidates WHERE id=?").bind(review[1]).first();
    if(!c)return err(404,"candidate_not_found");
    if(c.state!=="pending")return err(409,"already_reviewed");
    if(b.action==="approve"&&c.alignment_state==="pending")return err(409,"semantic_alignment_pending");
    if(b.action==="approve"&&c.alignment_state==="diverged")return err(409,"semantic_alignment_diverged");
    const at=now();
    await db.prepare("UPDATE memory_candidates SET state=?,review_note=?,reviewed_at=? WHERE id=? AND state='pending'").bind(b.action==="approve"?"approved":"rejected",b.note,at,c.id).run();
    if(b.action==="approve")await db.prepare("INSERT INTO memory_items(id,candidate_id,event_type,parent_memory_id,original_question,purpose,summary,evidence_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id(),c.id,c.event_type,c.parent_memory_id,c.original_question,c.purpose,c.summary,c.evidence_json,at).run();
    await audit(db,actor.name,"candidate.reviewed",c.id,{action:b.action,note:b.note});
    return json({ok:true,id:c.id,state:b.action==="approve"?"approved":"rejected"});
   }
   if(path==="/memory"&&method==="GET"){
    if(actor.role!=="admin")return err(403,"admin_only");
    const rows=await db.prepare("SELECT * FROM memory_items ORDER BY created_at DESC LIMIT 100").all();
    return json({ok:true,items:rows.results});
   }
   if(path==="/audit"&&method==="GET"){
    if(actor.role!=="admin")return err(403,"admin_only");
    const rows=await db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 100").all();
    return json({ok:true,items:rows.results});
   }
   return err(404,"not_found");
  }catch(e){if(e instanceof SyntaxError)return err(400,"invalid_json");if(e?.message==="payload_too_large")return err(413,"payload_too_large");return err(500,"server_error");}
 }
};
