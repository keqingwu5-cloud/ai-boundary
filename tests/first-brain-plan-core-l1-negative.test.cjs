"use strict";
/**
 * L1 negative tests for PR #86 safety gaps. Independent of PR #85.
 * Expects FIXED core: incomplete graph must REJECT; arbitrary source_id must REJECT.
 */
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {preparePlan,validatePlan}=require("../first-brain-plan-core.js");
const packet=JSON.parse(fs.readFileSync(path.join(__dirname,"../data/first-brain-eight-dim-plan-20261030.json"),"utf8"));
const digest="a".repeat(64),now=1793368800000;
const start=()=>({version:2,brains:[{id:"main"}],nodes:[{id:"old",title:"舊資料"}],links:[],history:[{ts:1,action:"seed"}]});

test("NEG T01: delete D4 then reload must reject incomplete graph",()=>{
  const once=preparePlan(start(),packet,{digest,now}).state;
  once.nodes=once.nodes.filter(n=>!String(n.id).endsWith("_d4"));
  assert.throws(()=>preparePlan(once,packet,{digest,now:now+1}),/receipt_graph_incomplete/);
});

test("NEG T02A: delete D5 link then reload must reject",()=>{
  const once=preparePlan(start(),packet,{digest,now}).state;
  once.links=once.links.filter(l=>!String(l.id).includes("_d5"));
  assert.throws(()=>preparePlan(once,packet,{digest,now:now+1}),/receipt_graph_incomplete_missing_link/);
});

test("NEG T03: pre-existing link ID conflict must reject on first load",()=>{
  const s=start();
  s.links.push({id:"l_n_fp_fb-8d-20261030-v1_d1",from:"old",to:"old",kind:"legacy"});
  assert.throws(()=>preparePlan(s,packet,{digest,now}),/link_id_conflict/);
});

test("NEG T04A: arbitrary source_id must be rejected by allowlist",()=>{
  const p={...packet,source_id:"totally-different-source"};
  assert.throws(()=>validatePlan(p),/source_id_not_allowed/);
});

test("NEG T04B: empty allowlist override rejects",()=>{
  assert.throws(()=>validatePlan(packet,{allowedSourceIds:[]}),/source_id_allowlist_empty/);
});

test("NEG T04C: allowlist override with wrong id rejects; matching id passes",()=>{
  assert.throws(()=>validatePlan(packet,{allowedSourceIds:["only-this-one"]}),/source_id_not_allowed/);
  assert.equal(validatePlan(packet,{allowedSourceIds:[packet.source_id]}),packet);
});

test("POS: intact graph with user title edit is legitimate unchanged",()=>{
  const once=preparePlan(start(),packet,{digest,now}).state;
  const child=once.nodes.find(n=>String(n.id).endsWith("_d1"));
  child.title="使用者合法改標題";
  child.oneLiner="合法編輯內容，結構完整";
  const r=preparePlan(once,packet,{digest,now:now+1});
  assert.equal(r.changed,false);
  assert.equal(r.addedNodes,0);
});

test("POS: happy path still adds 9 nodes",()=>{
  const r=preparePlan(start(),packet,{digest,now});
  assert.equal(r.addedNodes,9);
  assert.equal(r.state.links.length,8);
});

test("POS: official happy-path same-version still unchanged",()=>{
  const once=preparePlan(start(),packet,{digest,now});
  const twice=preparePlan(once.state,packet,{digest,now:now+1});
  assert.equal(twice.changed,false);
});
