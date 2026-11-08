import {runPilot} from './pilot-core.mjs';

const $ = id=>document.getElementById(id);
const pretty = x=>JSON.stringify(x,null,2);
let lastResult=null;
const names={KNOWN:'已提供數值',UNKNOWN:'未知',MISSING:'未提供',UNVERIFIED:'待驗證',INTENTIONALLY_OPEN:'刻意留白',NOT_APPLICABLE:'不適用',REDACTED:'權限受限'};
function setText(id,value){$(id).textContent=value;}
function makeSource(row){
  const li=document.createElement('li');
  const tag=document.createElement('b');tag.textContent=row.id+' · '+(row.role==='increment'?'新增':'原始');
  const text=document.createElement('span');text.textContent=row.kind==='known'?`r1 · hash ${row.hash_prefix}…`:`r1 · ${names[row.state]||'資訊缺口'}`;
  li.append(tag,text);return li;
}
let editRevision=0;
const errorLabels={
  A_MISSING:'來源 A 留空；空白不會被當成 0。',
  B_MISSING:'來源 B 留空；空白不會被當成 0。',
  C_MISSING:'C 已選擇「確切數值」，請明確輸入；留空不是 0。',
  A_INTEGER_RANGE_REQUIRED:'A 必須是 0～1,000,000 的整數。',
  B_INTEGER_RANGE_REQUIRED:'B 必須是 0～1,000,000 的整數。',
  C_INTEGER_RANGE_REQUIRED:'C 必須是 0～1,000,000 的整數。'
};
function clearResults(){
  lastResult=null;
  $('export').disabled=true;
  setText('x-value','—');
  setText('x-ref','等待重新計算');
  setText('y-value','—');
  setText('y-explain','尚未用修改後的資料執行');
  setText('source-count','0');
  $('source-list').replaceChildren();
  setText('audit','尚未執行最新輸入');
}
function inputsChanged(){
  editRevision++;
  clearResults();
  setText('status','資料已修改，待重新執行');
  setText('status-note','先前結果已失效，不可當成最新證據匯出。');
}
function requiredInteger(id){
  const raw=$(id).value.trim();
  if(raw==='')throw new Error(id.toUpperCase()+'_MISSING');
  if(!/^(0|[1-9][0-9]*)$/.test(raw))throw new Error(id.toUpperCase()+'_INTEGER_RANGE_REQUIRED');
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value>1000000)throw new Error(id.toUpperCase()+'_INTEGER_RANGE_REQUIRED');
  return value;
}
async function run(){
  const myRevision=editRevision;
  $('run').disabled=true;
  clearResults();
  setText('run','正在執行隔離換算…');
  setText('status','正在計算');
  setText('status-note','僅處理本次輸入的合成資料');
  try {
    const a=requiredInteger('a');
    const b=requiredInteger('b');
    const cState=$('state').value;
    const c=cState==='KNOWN'?requiredInteger('c'):undefined;
    const r=await runPilot({a,b,cState,c});
    if(myRevision!==editRevision)return;
    if(!r.ok)throw new Error(r.reason||'PILOT_REJECTED');
    setText('x-value',r.x.value);
    setText('x-ref',r.x.id.slice(0,26)+'…');
    setText('y-value',r.phase==='COMPUTED'?r.y.value:r.phase==='SAFE_BLOCK'?'禁止使用':'保留空白');
    setText('y-explain',r.phase==='COMPUTED'?'C 已提供數值；沿用 X，再執行指定規則。':r.phase==='SAFE_BLOCK'?'受限資訊不可透過 X＋C 暴露，底層已拒絕。':'C 為「'+(names[r.gap.state]||'資訊缺口')+'」，不是 0；Y 保持不完整。');
    setText('status',r.phase==='COMPUTED'?'完成隔離運算':r.phase==='SAFE_BLOCK'?'安全阻擋':'不完整但可追溯');
    setText('status-note','合成範例 · 無正式資料讀寫 · 無跨 AI ACK');
    setText('source-count',String(r.sourceRows.length));
    $('source-list').replaceChildren(...r.sourceRows.map(makeSource));
    setText('audit',pretty({phase:r.phase,x:r.x,y:r.y,gap:r.gap,audit:r.audit}));
    lastResult=r;
    $('export').disabled=false;
  }catch(e){
    if(myRevision===editRevision){
      clearResults();
      const code=String(e.message||e);
      setText('status','輸入錯誤');
      setText('status-note',errorLabels[code]||code);
    }
  }finally{
    $('run').disabled=false;
    setText('run','執行隔離測試');
  }
}
function stateChanged(){
  $('c-field').hidden=$('state').value!=='KNOWN';
  inputsChanged();
}
for(const id of ['a','b','c'])$(id).addEventListener('input',inputsChanged);
$('state').addEventListener('change',stateChanged);
$('run').addEventListener('click',run);
$('reset').addEventListener('click',()=>{
  $('a').value='4';$('b').value='6';$('c').value='2';$('state').value='UNKNOWN';
  stateChanged();void run();
});
$('export').addEventListener('click',()=>{
  if(!lastResult||$('export').disabled)return;
  const file=new Blob([pretty({schema:'firstbrain.isolated-pilot.v0.1',result:lastResult})],{type:'application/json'});
  const url=URL.createObjectURL(file);
  const anchor=document.createElement('a');anchor.href=url;anchor.download='first-brain-isolated-pilot.json';
  anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

stateChanged();void run();