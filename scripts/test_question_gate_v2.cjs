'use strict';
/* Run: node scripts/test_question_gate_v2.cjs */
const assert=require('node:assert/strict');
const gate=require('../question-gate-v2.js');
assert.equal(gate.TYPES.length,4);
assert.throws(()=>gate.build('','causal'),/輸入原始問題/);
for(const type of gate.TYPES){
 const row=gate.build('在特定市場環境下，美股變化是否領先台灣市場？',type);
 assert.equal(row.prompts.length,5);
 assert.equal(new Set(row.prompts).size,5);
 assert.equal(gate.review(row).ready,false);
 row.answers=[
 '界定在週期轉折的情況下，NASDAQ與台灣科技產業的範圍',
 '官方日期與價量資料應能證實上游事件確實發生',
 '要排除共同受到總經消息影響及匯率改變的可能性',
 '歷史上若存在美股上漲但台股下跌的反例，就不能用必然上漲作為規則',
 '用隔日與五日的產業超額報酬，與隨機或基準情境比較'
 ];
 assert.equal(gate.review(row).ready,false,'missing hypothesis specification must block');
 Object.assign(row,{
 revisedQuestion:'美國科技股上漲時，台灣科技類股未來五日的超額報酬是否高於基準',
 falsifier:'若樣本外測試未優於對照組，便拒絕該條候選假設',
 metric:'比較不同市場週期中五個交易日的超額報酬中位數及誤差',
 dataSource:'證交所、公開公司財報和美國交易所行情'
 });
 assert.equal(gate.review(row).ready,true,'completeness only');
 assert.equal(gate.review(row).certified,false,'not statistical validation');
 row.answers[2]='';
 assert.equal(gate.review(row).ready,false,'missing answer must block');
}
console.log('PASS: four research types, five contextual prompts, gating and no false certification');
