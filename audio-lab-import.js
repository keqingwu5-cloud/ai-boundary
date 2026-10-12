/* 獨立音訊研究匯入器：僅在實驗室明確要求同步時執行；不覆寫既有節點。 */
(function(){
'use strict';
const PENDING='aiBrain.audioLab.pending.v1',EXPERIMENT='jp-transition-audio-v1';
const pending=localStorage.getItem(PENDING);
if(!location.hash.includes('audio-lab')||!pending)return;
function notify(msg,failed){
 const el=document.createElement('div');el.setAttribute('role','status');
 Object.assign(el.style,{position:'fixed',top:'76px',right:'14px',zIndex:9999,maxWidth:'min(390px,calc(100vw - 28px))',
  background:failed?'#543039':'#183e39',color:'#eafff9',padding:'12px 16px',borderRadius:'12px',boxShadow:'0 8px 30px #0009',font:'13px/1.6 system-ui,sans-serif'});
 el.textContent=msg;document.body.appendChild(el);
 el.addEventListener('click',()=>el.remove());setTimeout(()=>el.remove(),14000);
}
/* 種子資料是非同步載入的（data.js → content/*.json、patches/*.json）：等主腦真的好了（body[data-ready="1"]＋AIBrain）再匯入 */
function whenReady(){
 return new Promise((ok,bad)=>{
  const t0=Date.now();
  (function poll(){
   const b=document.body;
   if(b&&b.dataset.webgl==='0')return bad(Error('這台裝置無法啟用 3D（WebGL），主腦沒有啟動'));
   if(b&&b.dataset.ready==='1'&&window.AIBrain&&typeof window.AIBrain.getState==='function')return ok(window.AIBrain);
   if(Date.now()-t0>30000)return bad(Error('主腦公開 API 尚未就緒（等了 30 秒）'));
   setTimeout(poll,150);
  })();
 });
}
let running=false;
async function importNow(){
 if(running||window.__jpAudioLabImporting)return;   // 同一頁只跑一次（避免重複建立摘要節點）
 running=window.__jpAudioLabImporting=true;
 try{
  const payload=JSON.parse(localStorage.getItem(PENDING)||'null');
  if(!payload||payload.schemaVersion!==1||payload.experimentId!==EXPERIMENT||payload.totalTests!==50||
     !Array.isArray(payload.choices)||payload.choices.length!==5)throw Error('待匯入資料格式不正確');
  const brain=await whenReady();
  const st=brain.getState(),snap=payload.snapshotId;
  if(typeof snap!=='string'||snap.length>160)throw Error('快照 ID 無效');
  const base='https://keqingwu5-cloud.github.io/ai-boundary/audio-lab.html#';
  const url=base+encodeURIComponent(snap);
  // 一個實驗只建立一個摘要節點：同一份快照、或同一個實驗後來的快照（重新送入、重新整理）都沿用已經匯入的那個，只補上缺少的音型方向
  const ofExperiment=n=>n.source&&n.source.outlet==='JP Audio Lab v1'&&typeof n.source.url==='string'&&n.source.url.startsWith(base+encodeURIComponent(EXPERIMENT));
  let existing=st.nodes.find(n=>ofExperiment(n)&&n.source.url===url)||st.nodes.find(n=>ofExperiment(n)&&!n.parentId);
  // 匯入前做獨立備份。失敗則中止，原始主腦不動。
  if(!existing){
   const backupKey='aiBrain.audioLab.backup.'+new Date().toISOString().replace(/[:.]/g,'-');
   localStorage.setItem(backupKey,JSON.stringify({capturedAt:new Date().toISOString(),state:st}));
  }
  const top=payload.choices.slice().sort((a,b)=>b.score-a.score)[0];
  const title='日文轉場音｜50組測試（'+String(payload.evaluatedAt).slice(0,10)+'）';
  let rootId=existing?existing.id:null;
  if(!rootId)rootId=brain.addQuestion({
   title,type:'其他',createdBy:'bot',
   oneLiner:'5個原創五音音型 × 10種變體 = 50組；技術通過 '+payload.technicalPassCount+'/50；人工盲聽 '+payload.manualRatingCount+'/50；當前設計代理領先 '+top.id+'。市場與日文語句同步仍待驗證。',
   concepts:['聲音','日文轉場','音樂 IP','內容驗證'],
   source:{who:'AI 音訊實驗室',outlet:'JP Audio Lab v1',date:String(payload.evaluatedAt).slice(0,10),url,also:[]},
   assumptions:'設計代理分數 ≠ 真實聽眾喜好 ≠ 收益；人工盲聽只反映參與者個人感受，未驗證日文語句切點或市場數據。',
   reasoning:[
    {k:'測試設計',v:'5種原創五音旋律，每種10個變體；可重複音訊合成與結構指標。'},
    {k:'硬性篩選',v:'0.6–2秒、峰值不超過 0.95、RMS 大於 0.015；技術通過 '+payload.technicalPassCount+'/50。'},
    {k:'評分維度',v:'轉場時長／節奏代理35%；音程與方向辨識代理20%；柔和度代理25%；旋律延伸性20%。'},
    {k:'人工驗證',v:'目前已有 '+payload.manualRatingCount+'/50 個版本被人工評分，需盲聽與真人測試更多樣本。'},
    {k:'待驗證',v:'日本語語句切點、不同年齡文化的主觀喜好、短影音使用率、授權付費與 IP 記憶效應。'},
    {k:'原始紀錄',v:'同瀏覽器音訊實驗室 localStorage aiBrain.audioLab.jpTransitions.v1；使用音訊實驗室頁面匯出完整 JSON/CSV。'}
   ]});
  if(!rootId)throw Error('建立摘要節點失敗');
  const after=brain.getState();
  for(const choice of payload.choices){
   const subTitle='音型候選｜'+choice.motifId+' '+choice.name;
   const prev=after.nodes.find(n=>n.parentId===rootId&&(n.title===subTitle||String(n.title).startsWith('音型候選｜'+choice.motifId+' ')));   // 每個音型只留一個方向
   if(prev)continue;
   const desc=choice.id+'；用途：'+choice.use+'；版本：'+choice.variation+'；設計代理：'+choice.score+'/100；人工平均：'+(choice.humanAverage===null?'尚無':choice.humanAverage+'/5')+'；依據：'+choice.selectionBasis+'。';
   if(!brain.addDirection(rootId,{title:subTitle,type:'其他',oneLiner:desc,createdBy:'bot',concepts:['聲音','日文轉場','音樂 IP']}))
    throw Error('建立候選子節點失敗：'+subTitle);
  }
  const final=brain.getState();
  if(final.nodes.length<st.nodes.length+(!existing?6:0)||final.links.length<st.links.length)
   throw Error('匯入後節點／關聯一致性驗證未通過；請使用備份核對');
  localStorage.removeItem(PENDING);
  notify(existing?'這個實驗已經匯入過：沿用原本的摘要節點，只補上缺少的音型方向。點這裡可關閉。':'已同步音效研究：50 組測試摘要＋5 個音型候選方向。舊主腦節點已保留。點這裡可關閉。',false);
  brain.focusNode(rootId);
 }catch(err){
  notify('音訊研究匯入未完成：'+(err&&err.message||String(err))+'。待匯入資料仍保留，請檢查主腦備份。',true);
  console.error('JP Audio Lab import failed',err);
 }finally{running=window.__jpAudioLabImporting=false;}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',importNow,{once:true});
else importNow();
})();