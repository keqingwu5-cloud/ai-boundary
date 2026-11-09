import {runChessPreview} from './chess-core.mjs';
const $=id=>document.getElementById(id);
let revision=0;
function invalidate(){revision++;$('status').textContent='輸入已改變，舊結果不可使用';$('board').textContent='—';$('result').textContent='—';$('branches').replaceChildren();$('audit').textContent='尚未執行最新輸入';}
for(const id of ['a','b'])$(id).addEventListener('input',invalidate);
$('c-state').addEventListener('change',invalidate);
$('run').addEventListener('click',async()=>{
  const version=revision;
  $('run').disabled=true;$('status').textContent='正在執行隔離研究候選';
  const parse=id=>{const x=$(id).value.trim();if(!/^(0|[1-9]\d*)$/.test(x))return NaN;return Number(x);};
  try{
    const result=await runChessPreview({a:parse('a'),b:parse('b'),cState:$('c-state').value});
    if(version!==revision)return;
    if(!result.ok)throw new Error(result.reason);
    $('status').textContent='隔離測試完成 · 非真實世界推演';
    $('board').textContent=result.board_id;
    $('result').textContent=`${result.x.value} · ${result.x.result_content_id}`;
    $('branches').replaceChildren(...result.branches.map(branch=>{
      const li=document.createElement('li');li.textContent=`${branch.name}：${branch.event_id}`;return li;
    }));
    $('audit').textContent=JSON.stringify(result.audit,null,2);
  }catch(e){if(version===revision){$('status').textContent='安全拒絕';$('board').textContent='—';$('result').textContent='—';$('branches').replaceChildren();$('audit').textContent=String(e.message||e);}}
  finally{$('run').disabled=false;}
});
$('run').click();