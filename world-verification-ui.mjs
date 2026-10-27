/* Browser-only research version history. No changes to aiBrain.v1 or private memory. */
import {LEGACY_KEY,JOURNAL_KEY,JOURNAL_SCHEMA,STATUSES,
 readWorldLedger,rowsAtVersion,appendWorldLedger} from './world-verification-ledger.mjs';
const $=id=>document.getElementById(id);
const safeUrl=raw=>{try{const u=new URL(raw);return u.protocol==='https:'?u.href:'';}catch(_){return '';}};
let snapshot=readWorldLedger(localStorage);
const download=(name,body,kind='application/json')=>{
 const url=URL.createObjectURL(new Blob([body],{type:kind}));
 const a=document.createElement('a');a.href=url;a.download=name;
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function sourceNodeId(){
 const x=window.BrainResearchLink;
 return x?.status==='linked'&&x?.sourceNodeId?x.sourceNodeId:null;
}
function update(change){
 if(!snapshot.ok){showIssue(snapshot.reason);return false;}
 // Expected raw is captured when tab last read the data, not reread immediately
 // before the action. A stale tab must fail instead of silently overwriting.
 const result=appendWorldLedger(localStorage,snapshot.rawV2,{
  ...change,sourceNodeId:sourceNodeId()});
 if(!result.ok){showIssue(result.reason);return false;}
 snapshot=readWorldLedger(localStorage);
 render();
 return snapshot.ok;
}
function showIssue(reason){
 $('verifyFormStatus').textContent='版本保存未完成：'+reason+'。未自動刪除原始記錄；請先備份，必要時重新整理。';
 $('worldHistoryStatus').textContent='無法確認保存：'+reason;
}
function makeText(tag,value,cls=''){
 const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;
}
function render(){
 $('verifyCount').textContent=snapshot.ok?snapshot.rows.length:'無法讀取';
 $('worldHistoryCount').textContent=snapshot.ok?'版本 '+snapshot.events.length:'保護模式';
 $('worldHistoryStatus').textContent=snapshot.ok?
  ('舊版 v1 保留；追加歷史 '+snapshot.events.length+' 筆。狀態是研究者自評，並非獨立認證。'):
  ('原始紀錄或版本鏈不完整（'+snapshot.reason+'），已停止編輯。可下載原始備份。');
 const list=$('verifyList');list.replaceChildren();
 if(!snapshot.ok){
  list.append(makeText('p','資料無法安全讀取；不以空資料覆蓋舊紀錄。','warning'));
  return;
 }
 if(!snapshot.rows.length)list.append(makeText('p','目前沒有顯示中的研究假設，歷史仍可回查。','fine'));
 snapshot.rows.slice().reverse().forEach(r=>{
  const item=document.createElement('div');item.className='verify-case';
  const h=makeText('h3',r.hypothesis),f=makeText('p','推翻條件：'+r.falsifier),
    date=makeText('p','提出 '+r.createdOn+' · 截止 '+r.deadline+' · 狀態：'+r.status,'fine');
  item.append(h,f,date);
  if(r.metric)item.append(makeText('p','測量：'+r.metric,'fine'));
  if(r.source&&safeUrl(r.source)){
   const a=document.createElement('a');a.href=safeUrl(r.source);a.target='_blank';a.rel='noopener noreferrer';a.textContent='來源連結';item.append(a);
  }
  const controls=document.createElement('div');controls.className='verify-actions';
  const select=document.createElement('select');select.setAttribute('aria-label','研究狀態');
  for(const status of STATUSES){const opt=document.createElement('option');opt.value=status;opt.textContent=status;select.append(opt);}
  select.value=r.status;
  select.addEventListener('change',()=>{
   const next=select.value;
   const reason='人工更新：'+r.status+' → '+next+'；尚未附研究論證';
   if(!update({type:'status',recordId:r.id,status:next,reason}))select.value=r.status;
  });
  const del=document.createElement('button');del.className='button';del.type='button';del.textContent='移出目前列表（保留歷史）';
  del.addEventListener('click',()=>{
   if(confirm('僅從目前列表移除；舊版本保留，可由歷史恢復。確定？'))
    update({type:'delete',recordId:r.id,reason:'人工移出列表；原始版本仍保留'});
  });
  controls.append(select,del);item.append(controls);list.append(item);
 });
 const history=$('worldHistoryList');history.replaceChildren();
 if(!snapshot.events.length)history.append(makeText('li','尚無 v2 變更；若有舊資料則作為唯讀基線。'));
 for(const e of snapshot.events.slice().reverse()){
  const li=document.createElement('li');
  li.append(makeText('span','v'+e.version+' · '+e.type+' · '+e.reason+' · '+e.at+' · '+(e.sourceNodeId||'未連 3D 來源')+' '));
  const button=document.createElement('button');button.type='button';button.className='button';
  button.textContent='以新版本恢復到此';
  button.addEventListener('click',()=>{
   const previous=rowsAtVersion(localStorage,e.version);
   if(!previous.ok){showIssue(previous.reason);return;}
   if(!confirm('恢復到版本 '+e.version+' 的顯示內容？這會追加一筆新版本，原歷史不刪除。'))return;
   update({type:'restore',rows:previous.rows,reason:'人工恢復至版本 '+e.version+'；保留舊事件'});
  });
  li.append(button);history.append(li);
 }
 $('worldHistoryVersionZero').disabled=!snapshot.events.length;
}
const currentDate=()=>new Date().toLocaleDateString('en-CA');
$('verifyDate').value=currentDate();
$('verifyForm').addEventListener('submit',e=>{
 e.preventDefault();
 const hypothesis=$('verifyHypothesis').value.trim(),falsifier=$('verifyFalsifier').value.trim(),
  createdOn=$('verifyDate').value,deadline=$('verifyDeadline').value,
  sourceRaw=$('verifySource').value.trim(),source=sourceRaw?safeUrl(sourceRaw):'';
 if(!hypothesis||!falsifier||!createdOn||!deadline||deadline<createdOn||(sourceRaw&&!source)){
  $('verifyFormStatus').textContent='請檢查必填欄位、日期及 https 來源。';return;
 }
 const row={id:'v'+Date.now()+'-'+Math.random().toString(36).slice(2,10),hypothesis,falsifier,
  createdOn,deadline,source,metric:$('verifyMetric').value.trim(),
  status:'待驗證',createdAt:new Date().toISOString()};
 if(update({type:'create',row,reason:'新增待驗證假設；尚未經獨立證據核驗'})){
  $('verifyForm').reset();$('verifyDate').value=currentDate();
  $('verifyFormStatus').textContent='已建立新事件版本，舊歷史保留。';
 }
});
$('verifyExport').addEventListener('click',()=>{
 if(!snapshot.ok){showIssue(snapshot.reason);return;}
 download('world-model-verification-current-v1-compatible.json',
  JSON.stringify({schema:LEGACY_KEY,exportedAt:new Date().toISOString(),
  verifiedReference:window.worldVerificationExample||null,records:snapshot.rows},null,2));
});
$('worldHistoryExport').addEventListener('click',()=>{
 let rawV1=null,rawV2=null;try{rawV1=localStorage.getItem(LEGACY_KEY);rawV2=localStorage.getItem(JOURNAL_KEY);}
 catch(_){showIssue('storage_unreadable');return;}
 download('world-model-verification-history-backup.json',JSON.stringify({
  exportedAt:new Date().toISOString(),legacyKey:LEGACY_KEY,legacyRaw:rawV1,
  ledgerKey:JOURNAL_KEY,ledgerRaw:rawV2,integrity:snapshot.ok?'checked':'unverified_corrupt'},null,2));
});
$('worldHistoryVersionZero').addEventListener('click',()=>{
 const old=rowsAtVersion(localStorage,0);
 if(!old.ok){showIssue(old.reason);return;}
 if(confirm('恢復到最初的 v1 基線？會以新版本記錄，不刪除歷史。'))
  update({type:'restore',rows:old.rows,reason:'人工恢復至原始唯讀基線'});
});
$('verifyImportButton').addEventListener('click',()=>$('verifyImport').click());
$('verifyImport').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 if(file.size>1024*1024){showIssue('匯入超過 1MB');e.target.value='';return;}
 try{
  const data=JSON.parse(await file.text());
  if(data.schema!==LEGACY_KEY||!Array.isArray(data.records)||data.records.length>500)
   throw Error('匯入格式不符');
  const rows=data.records.map((r,i)=>{
   if(!r||typeof r.hypothesis!=='string'||typeof r.falsifier!=='string'||
      typeof r.createdOn!=='string'||typeof r.deadline!=='string')throw Error('紀錄缺必填欄');
   const url=r.source?safeUrl(r.source):'';
   if(r.source&&!url)throw Error('來源 URL 不安全');
   return {id:'import-'+Date.now()+'-'+i,hypothesis:r.hypothesis.slice(0,800),
     falsifier:r.falsifier.slice(0,800),createdOn:r.createdOn.slice(0,10),
     deadline:r.deadline.slice(0,10),source:url,metric:String(r.metric||'').slice(0,800),
     status:STATUSES.includes(r.status)?r.status:'待驗證',createdAt:new Date().toISOString()};
  });
  if(confirm('匯入 '+rows.length+' 筆？只取代目前顯示的研究，不刪除歷史或舊 v1 原文。'))
   update({type:'import',rows,reason:'人工匯入 v1 相容 JSON，歷史原文保留'});
 }catch(err){showIssue('匯入失敗：'+err.message);}finally{e.target.value='';}
});
addEventListener('storage',e=>{
 if(e.key===LEGACY_KEY||e.key===JOURNAL_KEY){
  $('worldHistoryStatus').textContent='其他分頁已修改研究。為避免覆寫，請重新整理後再編輯。';
 }
});
window.WorldVerifyHistory={view:()=>readWorldLedger(localStorage),at:v=>rowsAtVersion(localStorage,v),
 append:change=>update(change)};
document.body.dataset.ledgerReady='1';
render();
