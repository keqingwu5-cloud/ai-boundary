"use strict";
/* Read-only candidate. Does not authorize, dispatch, acknowledge, merge or deploy. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {collectAnchors,buildBaseline} = require("./monitor-operational-baseline.cjs");

const SCHEMA = "tcvl-monitor-15m-candidate/v1";
const REPO = "keqingwu5-cloud/ai-boundary";
const POLICY = "https://github.com/keqingwu5-cloud/ai-boundary/issues/31";
const MONITOR_WORKFLOW_PATH = ".github/workflows/monitor-15min-candidate.yml";
const TRACKED = Object.freeze([31, 36, 38, 41, 54, 55, 56, 57, 60, 62, 63, 64, 65]);
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const MAX_SEEN = 5000;
const OVERLAP_MS = 5 * 60 * 1000;
const HASH = value => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 24);
const ISO = text => typeof text === "string" && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null;
const ID = /^[a-f0-9]{32}$|^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function readCheckpoint(filename, branch, now) {
  if (!filename || !fs.existsSync(filename)) return {status:"BOOTSTRAP",seen:[],last_checked_at:null};
  let data;
  try {data = JSON.parse(fs.readFileSync(filename,"utf8"));}
  catch (_) {return {status:"INVALID_PREVIOUS_EVIDENCE",seen:[],last_checked_at:null};}
  const time = ISO(data.last_checked_at);
  if (data.schema !== SCHEMA || data.branch !== branch || !Array.isArray(data.seen) ||
      !data.seen.every(s => typeof s === "string" && s.length < 150) || !time ||
      Date.parse(time) > Date.parse(now) + 60000 || data.seen.length > MAX_SEEN ||
      (data.intent_fingerprint!==undefined && !/^[a-f0-9]{64}$/.test(data.intent_fingerprint)))
    return {status:"INVALID_PREVIOUS_EVIDENCE",seen:[],last_checked_at:null};
  const stale = Date.parse(now) - Date.parse(time) > 24 * 3600000;
  return {status:stale?"STALE_CHECKPOINT":"RESTORED",seen:data.seen,last_checked_at:time,intent_fingerprint:data.intent_fingerprint||null};
}
function sinceFor(state, now) {
  if (!state.last_checked_at) return new Date(Date.parse(now)-24*3600000).toISOString();
  return new Date(Math.max(Date.parse(now)-24*3600000,Date.parse(state.last_checked_at)-OVERLAP_MS)).toISOString();
}
function safeGithubUrl(kind, id) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return kind === "run" ? "https://github.com/"+REPO+"/actions/runs/"+n :
         "https://github.com/"+REPO+"/issues/"+n;
}
function normalizeIssue(x) {
  if (!Number.isSafeInteger(x.number) || !ISO(x.updated_at)) return null;
  const kind = x.pull_request ? "pr" : "issue";
  // Classification reads title AND full body, but never persists either.
  const issueText = String(x.title||"")+"\n"+String(x.body||"");
  return {key:kind+":"+x.number+":"+x.updated_at,kind,ref:safeGithubUrl("issue",x.number),
    at:x.updated_at,
    priority:/(?:\bP0\b|\bBLOCKED\b|資安|安全異常|安全風險|部署阻擋|RELEASE\s*=\s*NO_GO)/i.test(issueText)?"REVIEW_UNVERIFIED":"CHANGE",
    ack_status:/\bACK\b/i.test(issueText)?"CLAIM_ONLY_NOT_VERIFIED":"NOT_ASSESSED"};
}
function normalizeComment(x) {
  if (!Number.isSafeInteger(x.id) || !ISO(x.updated_at || x.created_at)) return null;
  // Never attribute a foreign issue/comment to the monitored repository.
  const match = /^https:\/\/api\.github\.com\/repos\/keqingwu5-cloud\/ai-boundary\/issues\/([1-9][0-9]*)$/.exec(String(x.issue_url||""));
  if (!match) return null;
  const number = Number(match[1]);
  const url = safeGithubUrl("issue",number);
  if (!url) return null;
  const body = String(x.body||"");
  return {key:"comment:"+x.id+":"+(x.updated_at||x.created_at),kind:"comment",
    ref:url+"#issuecomment-"+x.id,at:x.updated_at||x.created_at,
    priority:/(?:\bP0\b|\bBLOCKED\b|RELEASE\s*=\s*NO_GO|部署阻擋|安全風險|安全異常|資安)/i.test(body)?"REVIEW_UNVERIFIED":"CHANGE",
    ack_status:/\bACK\b/i.test(body)?"CLAIM_ONLY_NOT_VERIFIED":"NOT_ASSESSED"};
}
function normalizeRun(x) {
  if (!Number.isSafeInteger(x.id) || !ISO(x.updated_at || x.created_at)) return null;
  if (x.status !== "completed") return null;
  const blockKnown = /memory v1 evidence inventory and release block/i.test(String(x.name||""));
  const abnormal = ["failure","timed_out","startup_failure","stale"].includes(x.conclusion);
  const otherReview = ["cancelled","action_required"].includes(x.conclusion);
  return {key:"run:"+x.id+":attempt-"+(Number.isSafeInteger(x.run_attempt)&&x.run_attempt>0?x.run_attempt:"unverified")+":"+x.conclusion,kind:"run",ref:safeGithubUrl("run",x.id),
    at:x.updated_at||x.created_at,
    priority:abnormal?(blockKnown?"REVIEW_UNVERIFIED":"CRITICAL_UNVERIFIED"):(otherReview?"REVIEW_UNVERIFIED":"CHANGE"),
    ack_status:"NOT_APPLICABLE"};
}
function normalizeNotion(x, src) {
  if (!x || !ID.test(String(x.id||"")) || !ISO(x.last_edited_time)) return null;
  return {key:"notion:"+HASH(x.id)+":"+x.last_edited_time,kind:"notion",
    ref:"notion:sha256:"+HASH(x.id),at:x.last_edited_time,
    priority:(x.in_trash===true || x.archived===true)?"REVIEW_UNVERIFIED":"CHANGE",
    ack_status:"NOT_ASSESSED",source:src};
}
async function paginated(request, route, attr) {
  const results = [];
  for (let page=1;page<=MAX_PAGES;page++) {
    const data=await request(route+(route.includes("?")?"&":"?")+"per_page="+PAGE_SIZE+"&page="+page);
    const items=attr?data[attr]:data;
    if (!Array.isArray(items)) throw Error("UNEXPECTED_GITHUB_RESPONSE_"+attr);
    results.push(...items);
    if (items.length<PAGE_SIZE) return results;
  }
  throw Error("GITHUB_PAGINATION_LIMIT_REACHED_NO_SILENT_DATA_LOSS");
}
async function collectGithub(request,since) {
  const u=encodeURIComponent(since);
  const issues=await paginated(request,"/repos/"+REPO+"/issues?state=all&since="+u);
  const comments=await paginated(request,"/repos/"+REPO+"/issues/comments?since="+u);
  const runs=await paginated(request,"/repos/"+REPO+"/actions/runs?status=completed","workflow_runs");
  const commits=await paginated(request,"/repos/"+REPO+"/commits?sha=main&since="+u);
  const commit=await request("/repos/"+REPO+"/commits/main");
  if (!/^[0-9a-f]{40}$/i.test(commit.sha||"")) throw Error("GITHUB_MAIN_SHA_NOT_VERIFIABLE");
  const events=[
    ...issues.map(normalizeIssue),
    ...comments.map(normalizeComment),
    // Identity is the canonical workflow file path, not a spoofable display name.
    ...runs.filter(x=>x.path!==MONITOR_WORKFLOW_PATH && Date.parse(x.updated_at||x.created_at)>=Date.parse(since)).map(normalizeRun),
    ...commits.filter(x=>/^[a-f0-9]{40}$/i.test(x.sha||"")).map(x=>({
      key:"commit:"+x.sha,kind:"commit",ref:"https://github.com/"+REPO+"/commit/"+x.sha,
      at:ISO(x.commit?.committer?.date)||since,priority:"CHANGE",ack_status:"NOT_APPLICABLE"
    }))
  ].filter(Boolean);
  events.push({key:"main:"+commit.sha,kind:"main_commit",ref:"https://github.com/"+REPO+"/commit/"+commit.sha,
    at:commit.commit?.committer?.date||since,priority:"CHANGE",ack_status:"NOT_APPLICABLE"});
  return {events,counts:{issues:issues.length,comments:comments.length,workflow_runs:runs.length,main_commits:commits.length},main_sha:commit.sha};
}
async function collectNotion(request,token,pages,datasources) {
  if (!token || (!pages.length && !datasources.length))
    return {status:"NOT_CONFIGURED",events:[],scope:{pages:pages.length,data_sources:datasources.length}};
  const events=[];
  for (const id of pages) {
    const x=await request("/pages/"+id,token);
    const v=normalizeNotion(x,"page");
    if (!v) throw Error("NOTION_PAGE_INVALID_RESPONSE");
    events.push(v);
  }
  for (const id of datasources) {
    let cursor=null,finished=false;
    for (let page=0;page<MAX_PAGES;page++){
      const body={page_size:PAGE_SIZE};
      if (cursor) body.start_cursor=cursor;
      const x=await request("/data_sources/"+id+"/query",token,body);
      if (!Array.isArray(x.results)) throw Error("NOTION_DATASOURCE_INVALID_RESPONSE");
      for (const item of x.results) {
        const v=normalizeNotion(item,"data_source_page");
        if (!v) throw Error("NOTION_PAGE_INCOMPLETE");
        events.push(v);
      }
      if (!x.has_more) {finished=true;break;}
      if (!x.next_cursor || x.next_cursor===cursor) throw Error("NOTION_BAD_PAGINATION_CURSOR");
      cursor=x.next_cursor;
    }
    if (!finished) throw Error("NOTION_PAGINATION_LIMIT_REACHED_NO_SILENT_DATA_LOSS");
  }
  return {status:"READ_SUCCEEDED_METADATA_ONLY",events,scope:{pages:pages.length,data_sources:datasources.length}};
}
function validateIds(value) {
  const ids=String(value||"").split(",").map(x=>x.trim()).filter(Boolean);
  if (ids.length>12 || !ids.every(id=>ID.test(id))) throw Error("INVALID_NOTION_RESOURCE_CONFIGURATION");
  return [...new Set(ids)];
}
function evaluate({branch,now,checkpoint,github,notion}) {
  const previous=new Set(checkpoint.seen);
  const unique=new Map();
  for(const e of [...github.events,...notion.events]){
    if (!e || !e.key || !e.ref) throw Error("INVALID_EVENT");
    unique.set(e.key,e);
  }
  const all=[...unique.values()].sort((a,b)=>a.key.localeCompare(b.key));
  const fresh=all.filter(e=>!previous.has(e.key));
  const baseline=checkpoint.status!=="RESTORED";
  const material=baseline?[]:fresh.filter(e=>e.priority==="CRITICAL_UNVERIFIED" || e.priority==="REVIEW_UNVERIFIED");
  const checkpointGap=checkpoint.status==="INVALID_PREVIOUS_EVIDENCE" || checkpoint.status==="STALE_CHECKPOINT";
  const nextSeen=[...new Set([...checkpoint.seen,...all.map(e=>e.key)])];
  // Do not silently evict evidence by lexicographic key ordering: this can drop
  // newer low-numbered issues and cause duplicate alerts or missed recovery.
  if (nextSeen.length > MAX_SEEN) throw Error("MONITOR_CHECKPOINT_CAPACITY_EXCEEDED_MANUAL_REBASE_REQUIRED");
  return {
    report:{schema:SCHEMA,branch,checked_at:now,readonly:true,
      github:{status:"READ_SUCCEEDED",counts:github.counts,main_sha:github.main_sha},
      notion:{status:notion.status,scope:notion.scope},
      checkpoint_status:checkpoint.status,baseline_no_alerts:baseline,
      observed_changes:fresh.length,observed_events:fresh.map(e=>({kind:e.kind,reference:e.ref,priority:e.priority,ack_status:e.ack_status})).slice(0,100),
      observed_overflow:fresh.length>100,
      review_events:material.map(e=>({kind:e.kind,reference:e.ref,
        priority:e.priority,ack_status:e.ack_status})).slice(0,100),
      review_overflow:material.length>100,
      unverified_receiver_ack_only:true,
      actual_gpt2_delivery_verified:false,actual_gpt2_ack_verified:false,
      deployment_authorized:false,main_merge_authorized:false,
      coverage:(notion.status!=="READ_SUCCEEDED_METADATA_ONLY"||baseline)?"PARTIAL":"CONFIGURED_SOURCES_ONLY",
      notification_channel:"GITHUB_ACTIONS_FAILURE_AND_SUMMARY_ONLY_NOT_PUSH_GUARANTEED",
      action_required:checkpointGap?"REVIEW_CHECKPOINT_GAP":
                      material.some(e=>e.priority==="CRITICAL_UNVERIFIED")?"REVIEW_WORKFLOW_FAILURE":
                      material.length?"REVIEW_CHANGES":"NONE",
      policy:POLICY},
    checkpoint:{schema:SCHEMA,branch,last_checked_at:now,seen:nextSeen}
  };
}
async function githubRequest(route,token) {
  if(!token)throw Error("GITHUB_TOKEN_NOT_CONFIGURED");
  const response=await fetch("https://api.github.com"+route,{
    headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28","User-Agent":"tcvl-monitor-readonly"},
    signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw Error("GITHUB_REQUEST_FAILED_HTTP_"+response.status);
  return response.json();
}
async function notionRequest(route,token,body) {
  const response=await fetch("https://api.notion.com/v1"+route,{
    method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,"Notion-Version":"2026-03-11",
      "Content-Type":"application/json","User-Agent":"tcvl-monitor-readonly"},
    body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw Error("NOTION_READ_FAILED_HTTP_"+response.status);
  return response.json();
}
function persistExclusive(filename,value) {
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  fs.writeFileSync(filename,JSON.stringify(value,null,2)+"\n",{flag:"wx",mode:0o600});
}
async function main() {
  if (process.argv.length!==2) throw Error("NO_CLI_FLAGS_SUPPORTED");
  const now=new Date().toISOString();
  const branch=(process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME||"local").slice(0,200);
  const checkpoint=readCheckpoint("prior/state.json",branch,now);
  const since=sinceFor(checkpoint,now);
  const ids=validateIds(process.env.NOTION_MONITOR_PAGE_IDS||"");
  const sources=validateIds(process.env.NOTION_MONITOR_DATA_SOURCE_IDS||"");
  const github=await collectGithub(route=>githubRequest(route,process.env.GITHUB_TOKEN),since);
  const notion=await collectNotion(notionRequest,process.env.NOTION_MONITOR_TOKEN,ids,sources);
  const anchors=await collectAnchors(route=>githubRequest(route,process.env.GITHUB_TOKEN));
  const operational=buildBaseline({anchors,github,notion,checkpoint,branch,event:process.env.GITHUB_EVENT_NAME,checkedAt:now,
    previousIntentFingerprint:checkpoint.intent_fingerprint});
  const {report,checkpoint:next}=evaluate({branch,now,checkpoint,github,notion});
  report.operational_baseline=operational;
  // Never silently accept a changed task purpose based on a new code version.
  next.intent_fingerprint=operational.intent_continuity==="POLICY_CHANGED_REVIEW"?
    checkpoint.intent_fingerprint:operational.intent_fingerprint;
  persistExclusive("monitor-output/report.json",report);
  persistExclusive("monitor-output/state.json",next);
  const summary=["## TCVL 15-minute candidate monitor",
    "- Checked: "+now,
    "- GitHub: "+report.github.status+"; issues/PR "+github.counts.issues+"; comments "+github.counts.comments+"; main commits "+github.counts.main_commits,
    "- Notion: "+report.notion.status+" (read-only, metadata only)",
    "- Checkpoint: "+report.checkpoint_status+"; coverage "+report.coverage,
    "- Task-aware baseline: "+operational.conclusion+"; intent "+operational.intent_continuity+"; stage "+(operational.intended_vs_observed.stage_match?"MATCH":"REVIEW")+"; source "+(operational.intended_vs_observed.source_scope_match?"MATCH":"REVIEW"),
    "- Purpose/phase and live anchor metadata: "+operational.task_anchors.length+" references; issue state does not prove task completion",
    "- New changes: "+report.observed_changes+"; review signals "+report.review_events.length,
    "- No automated delivery/ACK proof, approvals, merge, deploy or vault access",
    "- Evidence: monitor-output/report.json; checkpoint: state.json",
    // Show only canonical public GitHub references; never log Notion identifiers.
    ...report.review_events.filter(e=>typeof e.reference==="string" &&
      e.reference.startsWith("https://github.com/"+REPO+"/")).slice(0,20)
      .map(e=>"- Review candidate ("+e.priority+"): "+e.reference)
    ].join("\n")+"\n";
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
  process.stdout.write(summary);
  // A candidate report can be green with incomplete Notion configuration, but never claims full coverage.
  if(report.action_required!=="NONE" || report.review_overflow || report.observed_overflow ||
     !operational.intended_vs_observed.stage_match || !operational.intended_vs_observed.source_scope_match ||
     operational.intent_continuity==="POLICY_CHANGED_REVIEW") process.exitCode=3;
}
if(require.main===module)main().catch(err=>{
  const code=String(err&&err.message||"UNKNOWN_MONITOR_ERROR").replace(/[^A-Z0-9_]/gi,"_").slice(0,100);
  process.stderr.write("MONITOR_NO_GO_"+code+"\n");process.exitCode=2;
});
module.exports={SCHEMA,TRACKED,readCheckpoint,sinceFor,normalizeIssue,normalizeComment,
  normalizeRun,normalizeNotion,validateIds,paginated,collectGithub,collectNotion,evaluate};
