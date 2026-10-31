"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const core=require("../memory-controls-core.js");
const at="2026-10-22T15:00:00.000Z";
test("legacy vaults have empty editable controls",()=>{
  assert.deepEqual(core.view(undefined),{direction:{text:"",version:0},threshold:{text:"",version:0},history:[]});
});
test("direction and threshold are independent and user authored",()=>{
  let s=core.revise(undefined,"direction","先保存資訊完整性","改變研究焦點",at,"A");
  assert.equal(s.direction.version,1);
  assert.equal(s.threshold.version,0);
  s=core.revise(s,"threshold","來源與候選通過後人工審核","調整採用條件",at,"B");
  assert.equal(s.direction.text,"先保存資訊完整性");
  assert.equal(s.threshold.text,"來源與候選通過後人工審核");
  assert.equal(s.history.length,2);
  assert.deepEqual(s.history.map(e=>e.kind),["direction","threshold"]);
});
test("revisions retain previous text and do not overwrite original",()=>{
  let s=core.revise(undefined,"threshold","先查證來源","初稿",at,"A");
  s=core.revise(s,"threshold","先查證來源及差異","新增版本核對",at,"B");
  assert.equal(s.threshold.version,2);
  assert.equal(s.history[0].after,"先查證來源");
  assert.equal(s.history[1].before,"先查證來源");
  assert.equal(s.history[1].after,"先查證來源及差異");
});
test("cannot silently create revisions without a reason or change",()=>{
  const s=core.revise(undefined,"direction","方向甲","初稿",at,"A");
  assert.throws(()=>core.revise(s,"direction","方向甲","一樣",at,"B"),/no_change/);
  assert.throws(()=>core.revise(s,"threshold","門檻甲","",at,"B"),/reason_required/);
  assert.equal(s.history.length,1);
});
test("older structure remains unchanged during view and draft edits",()=>{
  const vault={schema:"ai-boundary.memory.v1",memories:[{id:"M"}],candidates:[{id:"C",status:"pending"}],audit:[]};
  const before=JSON.stringify(vault);
  const controls=core.revise(vault.memoryControls,"direction","保留分支","修改方向",at,"A");
  assert.equal(JSON.stringify(vault),before);
  assert.equal(vault.candidates[0].status,"pending");
  assert.equal(controls.threshold.version,0);
});
test("malformed controls are rejected rather than quietly reset",()=>{
  assert.throws(()=>core.view({direction:{text:"X",version:1},threshold:{text:"Y",version:0},history:[{kind:"bad"}]}),/history_invalid/);
  assert.throws(()=>core.view({direction:{text:"X",version:-1},threshold:{text:"Y",version:0},history:[]}),/memory_controls_invalid/);
});
test("empty value explicitly clears a previously set note with recorded reason",()=>{
  let s=core.revise(undefined,"threshold","舊設定","初始版本",at,"A");
  s=core.revise(s,"threshold","","暫停使用這個門檻設定",at,"B");
  assert.equal(s.threshold.text,"");
  assert.equal(s.history[1].before,"舊設定");
});

test("reject forged latest control values and disconnected history",()=>{
 let a=core.revise(undefined,"direction","方向甲","起始",at,"x1");
 assert.throws(()=>core.view({...a,direction:{text:"偽造",version:2}}),/history_invalid/);
 a=core.revise(a,"direction","方向乙","修正",at,"x2");
 const broken=JSON.parse(JSON.stringify(a));broken.history[1].before="錯誤來源";
 assert.throws(()=>core.view(broken),/history_invalid/);
});
test("reject repeated event IDs while keeping direction and threshold separate",()=>{
 let a=core.revise(undefined,"direction","方向甲","起始",at,"z1");
 a=core.revise(a,"threshold","門檻乙","分離管理",at,"z2");
 const broken=JSON.parse(JSON.stringify(a));broken.history[1].id="z1";
 assert.throws(()=>core.view(broken),/history_invalid/);
 assert.equal(a.direction.version,1);assert.equal(a.threshold.version,1);
});
