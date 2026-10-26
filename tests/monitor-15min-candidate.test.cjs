"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const m=require("../scripts/monitor-15min-candidate.cjs");
const NOW="2026-10-27T02:00:00.000Z";
const SHA="0123456789abcdef0123456789abcdef01234567";
const checkpoint={status:"RESTORED",last_checked_at:"2026-10-27T01:45:00.000Z",seen:[]};
const gh={events:[],counts:{issues:0,comments:0,workflow_runs:0},main_sha:SHA};
const notion={status:"NOT_CONFIGURED",events:[],scope:{pages:0,data_sources:0}};
const run=(a={})=>m.evaluate({branch:"candidate/test",now:NOW,checkpoint:a.checkpoint||checkpoint,github:a.github||gh,notion:a.notion||notion});
const uuid="3fe9d611-eff6-81d8-bb47-f4ed03b8da64";
test("schema has immutable audit provenance, user approval remains separate",()=>{
 const r=run();assert.match(r.report.schema,/candidate/);assert.equal(r.report.readonly,true);
 assert.equal(r.report.main_merge_authorized,false);assert.equal(r.report.deployment_authorized,false);
 assert.equal(r.report.actual_gpt2_ack_verified,false);
});
test("bootstrap cannot alert on historical data",()=>{
 const changed={...gh,events:[m.normalizeIssue({number:41,title:"P0 BLOCKED",updated_at:NOW})]};
 const r=run({checkpoint:{status:"BOOTSTRAP",seen:[],last_checked_at:null},github:changed});
 assert.equal(r.report.observed_changes,1);assert.equal(r.report.review_events.length,0);
 assert.equal(r.report.baseline_no_alerts,true);
});
test("unchanged event is not repeatedly reported",()=>{
 const item=m.normalizeIssue({number:54,title:"P0 blocked",updated_at:NOW});
 const a=run({github:{...gh,events:[item]},checkpoint:{...checkpoint,seen:[item.key]}});
 assert.equal(a.report.observed_changes,0);assert.equal(a.report.review_events.length,0);
});
test("new high-priority task creates review signal without pretending proven failure",()=>{
 const item=m.normalizeIssue({number:54,title:"P0 BLOCKED security",updated_at:NOW});
 const r=run({github:{...gh,events:[item]}});
 assert.equal(r.report.review_events[0].priority,"REVIEW_UNVERIFIED");
 assert.equal(r.report.review_events[0].reference,"https://github.com/keqingwu5-cloud/ai-boundary/issues/54");
});
test("same issue amended gets new version key, original retained",()=>{
 const a=m.normalizeIssue({number:41,title:"ok",updated_at:"2026-10-27T01:00:00Z"});
 const b=m.normalizeIssue({number:41,title:"ok",updated_at:"2026-10-27T01:30:00Z"});
 assert.notEqual(a.key,b.key);
 const r=run({github:{...gh,events:[a,b]},checkpoint:{...checkpoint,seen:[a.key]}});
 assert.ok(r.checkpoint.seen.includes(a.key));assert.ok(r.checkpoint.seen.includes(b.key));
 assert.equal(r.report.observed_changes,1);
});
test("issue and PR are distinguishable even when number is same",()=>{
 const issue=m.normalizeIssue({number:62,updated_at:NOW,title:"A"});
 const pr=m.normalizeIssue({number:62,updated_at:NOW,title:"A",pull_request:{url:"placeholder"}});
 assert.equal(issue.kind,"issue");assert.equal(pr.kind,"pr");assert.notEqual(issue.key,pr.key);
});
test("untrusted ACK in title is only a claim",()=>{
 const it=m.normalizeIssue({number:56,updated_at:NOW,title:"GPT2 ACK complete"});
 assert.equal(it.ack_status,"CLAIM_ONLY_NOT_VERIFIED");
});
test("untrusted ACK in comment is only a claim, no actual receipt",()=>{
 const c=m.normalizeComment({id:123456,issue_url:"https://api.github.com/repos/keqingwu5-cloud/ai-boundary/issues/56",body:"ACK approved by GPT2",updated_at:NOW});
 assert.equal(c.ack_status,"CLAIM_ONLY_NOT_VERIFIED");assert.match(c.ref,/issuecomment-123456/);
 assert.equal(run({github:{...gh,events:[c]}}).report.actual_gpt2_delivery_verified,false);
});
test("invalid issue comment reference is rejected",()=>{
 assert.equal(m.normalizeComment({id:1,issue_url:"https://api.github.com/wrong",updated_at:NOW}),null);
});
test("failed workflow yields CRITICAL_UNVERIFIED rather than approval",()=>{
 const item=m.normalizeRun({id:901,updated_at:NOW,status:"completed",conclusion:"failure",name:"Unexpected CI"});
 assert.equal(item.priority,"CRITICAL_UNVERIFIED");
 const r=run({github:{...gh,events:[item]}});
 assert.equal(r.report.action_required,"REVIEW_WORKFLOW_FAILURE");
});
test("known fail-closed release guard does not create a false critical incident",()=>{
 const item=m.normalizeRun({id:900,updated_at:NOW,status:"completed",conclusion:"failure",name:"Memory V1 evidence inventory and release block"});
 assert.equal(item.priority,"KNOWN_EXPECTED_NO_GO");
 const r=run({github:{...gh,events:[item]}});
 assert.equal(r.report.action_required,"NONE");
});
test("unfinished workflow status produces no completed-run claim",()=>{
 assert.equal(m.normalizeRun({id:990,status:"in_progress",updated_at:NOW,name:"Browser E2E"}),null);
});
test("unconfigured Notion is explicitly partial coverage",()=>{
 const r=run();assert.equal(r.report.notion.status,"NOT_CONFIGURED");assert.equal(r.report.coverage,"PARTIAL");
});
test("Notion metadata redacts page ids and original content",()=>{
 const n=m.normalizeNotion({id:uuid,last_edited_time:NOW,archived:false,title:"SECRET"},"page");
 assert.ok(n);assert.equal(n.ref.includes(uuid),false);
 assert.equal(JSON.stringify(n).includes("SECRET"),false);
});
test("malformed Notion resource ids fail instead of calling arbitrary URLs",()=>{
 assert.deepEqual(m.validateIds(uuid+","+uuid),[uuid]);
 assert.throws(()=>m.validateIds("https://evil.example/test"),/INVALID_NOTION/);
 assert.throws(()=>m.validateIds("abc"),/INVALID_NOTION/);
});
test("Notion without authorization stays NOT_CONFIGURED",async()=>{
 const out=await m.collectNotion(()=>{throw Error("should not call");},"",[uuid],[]);
 assert.equal(out.status,"NOT_CONFIGURED");
});
test("Notion access error remains visible and never silently passes",async()=>{
 await assert.rejects(()=>m.collectNotion(async()=>{throw Error("NOTION_READ_FAILED_HTTP_403");},"fixture-token",[uuid],[]),/403/);
});
test("Notion data source pagination processes pages and tracks source safely",async()=>{
 let calls=0;const r=await m.collectNotion(async(route,token,body)=>{
   assert.match(route,/data_sources/);assert.equal(body.page_size,100);calls++;
   return calls===1?{results:[{id:uuid,last_edited_time:NOW}],has_more:true,next_cursor:"page-two"}:{results:[{id:"4009d611-eff6-8173-aee2-f23d5eda3350",last_edited_time:NOW}],has_more:false};
 },"fixture-token",[],[uuid]);
 assert.equal(calls,2);assert.equal(r.events.length,2);
 assert.equal(r.status,"READ_SUCCEEDED_METADATA_ONLY");
});
test("truncated Notion query is a hard failure, not a false success",async()=>{
 await assert.rejects(()=>m.collectNotion(async()=>({results:[],has_more:true,next_cursor:"cursor"}),"token",[],[uuid]),/BAD_PAGINATION_CURSOR/);
});
test("GitHub paginated results are accumulated, not silently limited to first 100",async()=>{
 let c=0;const items=await m.paginated(async()=>{c++;return c===1?Array.from({length:100},(_,i)=>i):[100]},"/issues");
 assert.equal(items.length,101);assert.equal(c,2);
});
test("GitHub pagination limit errors instead of claiming full coverage",async()=>{
 await assert.rejects(()=>m.paginated(async()=>new Array(100).fill(1),"/issues"),/PAGINATION_LIMIT/);
});
test("GitHub polling maps issue, comment, runs and main SHA without remote ACK",async()=>{
 const events=await m.collectGithub(async route=>{
   if(route.includes("/issues/comments?"))return [{id:77,issue_url:"https://api.github.com/repos/keqingwu5-cloud/ai-boundary/issues/41",body:"ACK",updated_at:NOW}];
   if(route.includes("/issues?"))return [{number:41,title:"handoff",updated_at:NOW}];
   if(route.includes("/actions/runs?"))return {workflow_runs:[{id:1555,status:"completed",conclusion:"success",updated_at:NOW}]};
   if(route.includes("/commits/main"))return {sha:SHA,commit:{committer:{date:NOW}}};
   throw Error("unplanned-route:"+route);
 },"2026-10-27T01:45:00Z");
 assert.equal(events.events.length,4);
 assert.equal(events.counts.comments,1);assert.equal(events.main_sha,SHA);
});
test("checkpoint persists only a matching branch and valid ISO date",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tcvl-monitor-"));
 try{
  const file=path.join(dir,"state.json");
  fs.writeFileSync(file,JSON.stringify({schema:m.SCHEMA,branch:"A",last_checked_at:"2026-10-27T01:30:00Z",seen:["one"]}));
  assert.equal(m.readCheckpoint(file,"A",NOW).status,"RESTORED");
  assert.equal(m.readCheckpoint(file,"B",NOW).status,"INVALID_PREVIOUS_EVIDENCE");
  fs.writeFileSync(file,"corrupted");
  assert.equal(m.readCheckpoint(file,"A",NOW).status,"INVALID_PREVIOUS_EVIDENCE");
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("stale checkpoint highlights missed polling gap",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"tcvl-monitor-"));
 try{
  const file=path.join(dir,"state.json");
  fs.writeFileSync(file,JSON.stringify({schema:m.SCHEMA,branch:"A",last_checked_at:"2026-10-20T01:00:00Z",seen:[]}));
  const s=m.readCheckpoint(file,"A",NOW);
  assert.equal(s.status,"STALE_CHECKPOINT");
  assert.equal(run({checkpoint:s}).report.baseline_no_alerts,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("changed public texts never copied into emitted evidence report",()=>{
 const secret="test-not-a-real-token";
 const x=m.normalizeIssue({number:65,title:"CRITICAL "+secret,updated_at:NOW});
 const doc=JSON.stringify(run({github:{...gh,events:[x]}}).report);
 assert.equal(doc.includes(secret),false);
});
