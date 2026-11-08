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
async function run(){
  $('run').disabled=true;setText('run','正在執行隔離換算…');
  try {
    const r=await runPilot({a:Number($('a').value),b:Number($('b').value),cState:$('state').value,c:Number($('c').value)});
    lastResult=r;
    if(!r.ok){setText('status','輸入錯誤');setText('status-note',r.reason);return;}
    setText('x-value',r.x.value);
    setText('x-ref',r.x.id.slice(0,26)+'…');
    setText('y-value',r.phase==='COMPUTED'?r.y.value:r.phase==='SAFE_BLOCK'?'禁止使用':'保留空白');
    setText('y-explain',r.phase==='COMPUTED'?'C 已提供數值；沿用 X 的計算結果，再執行一次指定規則。':r.phase==='SAFE_BLOCK'?'受限資訊不可透過 X＋C 暴露，底層已拒絕。':`C 為「${names[r.gap.state]}」，不是 0；Y 保持不完整。`);
    setText('status',r.phase==='COMPUTED'?'完成隔離運算':r.phase==='SAFE_BLOCK'?'安全阻擋':'不完整但可追溯');
    setText('status-note','合成範例 · 無正式資料讀寫 · 無跨 AI ACK');
    setText('source-count',String(r.sourceRows.length));
    $('source-list').replaceChildren(...r.sourceRows.map(makeSource));
    setText('audit',pretty({phase:r.phase,x:r.x,y:r.y,gap:r.gap,audit:r.audit}));
    $('export').disabled=false;
  }catch(e){setText('status','執行失敗');setText('status-note',String(e.message||e));lastResult=null;}
  finally{$('run').disabled=false;setText('run','執行隔離測試');}
}
function stateChanged(){const known=$('state').value==='KNOWN';$('c-field').hidden=!known;}
$('state').addEventListener('change',stateChanged);
$('run').addEventListener('click',run);
$('reset').addEventListener('click',()=>{$('a').value='4';$('b').value='6';$('c').value='2';$('state').value='UNKNOWN';stateChanged();void run()});
$('export').addEventListener('click',()=>{
  if(!lastResult)return;
  const file = new Blob([pretty({schema:'firstbrain.isolated-pilot.v0.1',result:lastResult})],{type:'application/json'});
  const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download='first-brain-isolated-pilot.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
stateChanged();void run();