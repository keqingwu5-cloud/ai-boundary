/* World Model V2 – question-level falsification gate.
   Static, offline, no AI, no network or auto verdicts. Existing worldModel.verify.v1 untouched. */
(function(root){
'use strict';
const TYPES=['causal','forecast','supply','general'];
const DIMENSIONS=['定義與範圍','前提是否成立','替代原因與隱藏條件','反例與失效條件','測量、時間與資料'];
const questions={
 causal:[
 '這個問題的主詞、事件與被影響對象，是否定義到可以區分不同情境？',
 '提問預設的前提是什麼？有沒有原始數據支持，而非僅憑印象？',
 '是否有共同原因、反向因果或第三個變數，同時影響兩端？',
 '什麼觀察會讓這條因果鏈不成立？有沒有已知反例？',
 '事件與結果的時間差應設定多長？用哪個指標及對照組驗證？'],
 forecast:[
 '要預測的對象、方向、門檻和時間範圍是否足夠明確？',
 '目前能取得哪些當時已知的資訊，哪些仍是未證實假設？',
 '是否存在其他因素使結果相反，例如政策、價格已提前反映或市場制度改變？',
 '哪些反例或失效條件會推翻預測？是否允許模型回答「無法判斷」？',
 '如何固定預測截止日、比較基準、交易成本及樣本外驗證方法？'],
 supply:[
 '供應鏈的上游、產品、客戶與下游受影響公司是否指向明確對象？',
 '訂單、供應商與產能關係有公開證據，還是僅是推測？',
 '是否存在替代供應商、庫存、轉單、時間差或利潤分配等隱藏環節？',
 '哪一項出貨、營收、毛利或採購資料出現反例時，應撤回「受益」判斷？',
 '用什麼資料與期間證明訂單傳到獲利，並分開驗證股價是否提前反映？'],
 general:[
 '這個問題的範圍、關鍵用詞及問題對象是否清楚？',
 '問題是否包含未證實的前提？如何先核對前提本身？',
 '除了原本的解釋，是否至少有一種合理但不同的替代解釋？',
 '什麼證據或特殊情境可以反駁問題中的預設判斷？',
 '需要哪些原始來源、時間範圍、比較對象與評估標準才能驗證？']
};
const trim=(v,max=1600)=>String(v==null?'':v).trim().slice(0,max);
function build(question,type){
 const text=trim(question,800),kind=TYPES.includes(type)?type:'general';
 if(!text)throw new Error('請先輸入原始問題');
 return {version:2,question:text,type:kind,dimensions:DIMENSIONS.slice(),prompts:questions[kind].slice(),answers:['','','','','']};
}
function review(entry){
 if(!entry||!Array.isArray(entry.answers)||entry.answers.length!==5)return {ready:false,completed:0,missing:[0,1,2,3,4],notes:['五道反問資料不完整']};
 const answers=entry.answers.map(x=>trim(x,1600));
 const missing=answers.map((v,i)=>v.length>=12?-1:i).filter(i=>i>=0);
 const revised=trim(entry.revisedQuestion,1000);
 const notes=[];
 if(missing.length)notes.push('五道問題仍有未充分回答項目');
 if(!revised||revised.length<12)notes.push('尚未形成清楚、可操作的修訂問題');
 if(!trim(entry.falsifier,800))notes.push('缺少事先定義的推翻條件');
 if(!trim(entry.metric,800))notes.push('缺少預先定義的測量標準');
 if(!trim(entry.dataSource,900))notes.push('缺少可核對的資料來源或取得計畫');
 return {ready:notes.length===0,completed:5-missing.length,missing,notes,kind:'question_scope_review_only',certified:false};
}
root.QuestionGateV2={build,review,DIMENSIONS,TYPES};
if(typeof module==='object'&&module.exports)module.exports=root.QuestionGateV2;
})(typeof globalThis==='object'?globalThis:this);
