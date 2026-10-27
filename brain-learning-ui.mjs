/* Node-level success/failure notebook in the existing First Brain sidebar.
 * No external AI training, network requests, or automatic rule promotion.
 */
const el=(tag,text)=>{
 const e=document.createElement(tag);
 if(text!==undefined)e.textContent=String(text);
 return e;
};
function field(parent,label,key,max,required=false){
 const wrap=el("label");
 wrap.style.cssText="display:block;margin:8px 0;font:13px/1.5 system-ui";
 wrap.append(el("span",label));
 const input=el("input");
 input.name=key;
 input.maxLength=max;
 input.required=required;
 input.style.cssText="display:block;width:100%;box-sizing:border-box;padding:7px;margin-top:3px;border:1px solid #526477;border-radius:6px;background:#14263a;color:#fff";
 wrap.append(input);parent.append(wrap);return input;
}
export function bindLearningPanel(parent,{nodeId,entries=[],onRecord,onReview,onSearch,onRefresh}){
 const details=el("details");details.id="learnPanel";details.className="fl";
 const summary=el("summary","🧠 成功與失敗的經驗");details.append(summary);
 const expl=el("p","每筆經驗都記下適用條件與證據。人工審閱只表示曾核對，不等於獨立證實或永遠正確。");
 expl.style.cssText="font-size:12px;opacity:.85";details.append(expl);
 const list=el("div");list.id="learningRecordsList";details.append(list);
 if(!entries.length)list.append(el("p","尚無經驗記錄。"));
 for(const item of entries){
  const card=el("div");
  card.style.cssText="border:1px solid #526477;border-radius:8px;padding:8px;margin:8px 0;font:12px/1.6 system-ui";
  card.append(el("b",(item.outcome==="worked"?"✓ 成功":"↯ 失敗")+
    "・"+(item.stage==="person_reviewed"?"已人工審閱":"待查證")));
  for(const [label,value] of [["條件",item.conditions],["觀察",item.observation],["原因",item.rootCause],["下次做法",item.lesson],["證據",item.evidence]]){
   if(value)card.append(el("p",label+"："+value));
  }
  if(item.stage==="observed"){
   const button=el("button","已核對條件與證據，進行人工審閱");
   button.type="button";button.dataset.learningReview=item.id;
   button.onclick=async()=>{
    if(!confirm("已核對這筆證據與適用條件？這不代表外部驗證或絕對正確。"))return;
    const ok=await Promise.resolve(onReview(item.id));
    if(ok)onRefresh();
   };
   card.append(button);
  }
  list.append(card);
 }
 const form=el("form");form.id="learningForm";
 const selectLabel=el("label");selectLabel.append(el("span","觀察結果"));
 const select=el("select");select.name="outcome";
 for(const [value,text] of [["worked","成功／有效"],["failed","失敗／無效"]]){
  const option=el("option",text);option.value=value;select.append(option);
 }
 selectLabel.append(select);form.append(selectLabel);
 const conditions=field(form,"當時適用條件","conditions",160,true);
 const observation=field(form,"具體觀察結果","observation",500,true);
 const rootCause=field(form,"成功關鍵／失敗可能原因","rootCause",320);
 const lesson=field(form,"下次沿用或避免的做法","lesson",320,true);
 const evidence=field(form,"證據編號、版本或來源（可暫缺；不能審閱）","evidence",500);
 const button=el("button","記錄經驗（待查證）");button.type="submit";form.append(button);
 form.onsubmit=async event=>{
  event.preventDefault();
  const ok=await Promise.resolve(onRecord({
   outcome:select.value,conditions:conditions.value,observation:observation.value,
   rootCause:rootCause.value,lesson:lesson.value,evidence:evidence.value
  }));
  if(ok)onRefresh();
 };
 details.append(form);
 const lookup=el("form");lookup.id="learningFindForm";
 const findInput=field(lookup,"重用經驗：搜尋完全相同的適用條件","conditions",160,true);
 const go=el("button","查找已人工審閱的經驗");go.type="submit";lookup.append(go);
 const results=el("div");results.id="learningMatches";results.setAttribute("role","status");
 lookup.onsubmit=event=>{
  event.preventDefault();results.replaceChildren();
  const found=onSearch(findInput.value);
  if(!found.length){results.append(el("p","沒有相同條件、附證據且已人工審閱的經驗。"));return;}
  for(const item of found){
   const row=el("p",(item.outcome==="worked"?"✓":"↯")+" "+item.nodeTitle+
     "｜"+item.lesson+"（證據："+item.evidence+"；僅限同條件參考）");
   results.append(row);
  }
 };
 details.append(lookup,results);parent.append(details);
 return details;
}
