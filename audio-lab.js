/* 獨立、可回溯的 50 組日文轉場短音研究。資料只存在本機，需主動同步才寫入主腦。 */
(function(){
'use strict';
const Core=window.AudioLabCore;
const DATA_KEY='aiBrain.audioLab.jpTransitions.v1';
const PENDING_KEY='aiBrain.audioLab.pending.v1';
const EXPERIMENT='jp-transition-audio-v1';
const DESIGN_VERSION='1.0.0';
const $=s=>document.querySelector(s);
const candidates=Core.makeCandidates().map(c=>Object.assign(c,{metrics:Core.inspect(c,Core.synth(c))}));
const byId=new Map(candidates.map(c=>[c.id,c]));
let state,blindId=null,heard=false,audioContext=null,playingSource=null;
function today(){return new Date().toISOString();}
function emptyState(){return {schemaVersion:1,experimentId:EXPERIMENT,designVersion:DESIGN_VERSION,createdAt:today(),updatedAt:today(),checks:candidates.map(x=>x.metrics),ratings:{},notes:{},events:[]};}
function loadState(){
 try{const parsed=JSON.parse(localStorage.getItem(DATA_KEY)||'null');
   if(parsed&&parsed.schemaVersion===1&&parsed.experimentId===EXPERIMENT&&parsed.ratings&&parsed.notes){
    state=parsed;
    const before=JSON.stringify(state.checks||[]);
    state.checks=candidates.map(x=>x.metrics);
    if(before!==JSON.stringify(state.checks)){state.updatedAt=today();persist(false);}
    return;
   }
 }catch(e){console.warn('AudioLab storage read failed',e);}
 state=emptyState();persist(false);
}
function persist(update=true){
 if(update)state.updatedAt=today();
 try{localStorage.setItem(DATA_KEY,JSON.stringify(state));return true;}
 catch(e){notice('本機資料儲存失敗：'+e.message);return false;}
}
function notice(message){$('#notice').textContent=message;}
function rating(c){return state.ratings[c.id]||null;}
function ratedCount(){return Object.keys(state.ratings).filter(k=>byId.has(k)).length;}
function manualScore(c){
 const r=rating(c);if(!r)return null;
 const vals=[r.transition,r.memory,r.comfort];
 if(!vals.every(v=>Number.isInteger(v)&&v>=1&&v<=5))return null;
 return +(vals.reduce((a,b)=>a+b,0)/3).toFixed(2);
}
function effective(c){const manual=manualScore(c);return manual===null?c.metrics.score:Math.round(c.metrics.score*.55+manual*20*.45);}
function compare(a,b,field){if(field==='manual'){return (manualScore(b)??-1)-(manualScore(a)??-1)||b.metrics.score-a.metrics.score;}
 if(field==='id')return a.id.localeCompare(b.id);
 return b.metrics.score-a.metrics.score||a.id.localeCompare(b.id);}
function metrics(){
 $('#sampleCount').textContent=String(candidates.length);
 $('#validCount').textContent=String(candidates.filter(c=>c.metrics.technicalPass).length);
 $('#ratedCount').textContent=String(ratedCount());
 $('#topScore').textContent=Math.max(...candidates.map(c=>c.metrics.score))+'/100';
}
function initialMotifs(){
 const wrapper=$('#motifList'),sel=$('#filterMotif');
 for(const m of Core.BASE){
  const btn=document.createElement('button');btn.type='button';btn.dataset.motif=m.id;
  btn.innerHTML='<b>'+m.id+' · '+m.name+'</b><br><i>'+m.use+'</i>';
  btn.addEventListener('click',()=>{sel.value=m.id;renderMotifs();renderTable();$('#catalog').scrollIntoView({behavior:'smooth'});});
  wrapper.appendChild(btn);
  const opt=document.createElement('option');opt.value=m.id;opt.textContent=m.id+' · '+m.name;sel.appendChild(opt);
 }
}
function renderMotifs(){
 const v=$('#filterMotif').value;
 document.querySelectorAll('#motifList button').forEach(b=>b.classList.toggle('active',b.dataset.motif===v));
}
function renderTable(){
 const motif=$('#filterMotif').value,filter=$('#filterStatus').value,order=$('#sortBy').value;
 const shown=candidates.filter(c=>(motif==='all'||motif===c.motifId)&&
  (filter==='all'||(filter==='rated'&&manualScore(c)!==null)||(filter==='unrated'&&manualScore(c)===null)||(filter==='technical'&&c.metrics.technicalPass)))
  .sort((a,b)=>compare(a,b,order));
 const body=$('#resultsBody');
 body.innerHTML=shown.map(c=>{
  const m=c.metrics,manual=manualScore(c);
  return '<tr><td><span class="rowTitle">'+c.id+'</span><br><span class="tag">'+c.name+'</span></td>'+
  '<td class="scores">'+m.duration.toFixed(2)+'s</td>'+
  '<td class="scores">'+m.peakDb.toFixed(1)+' dBFS</td>'+
  '<td class="scores">'+m.transition+'</td>'+
  '<td class="scores">'+m.softness+'</td>'+
  '<td class="high scores">'+m.score+'</td>'+
  '<td class="scores '+(manual===null?'pending':'high')+'">'+(manual===null?'待聆聽':manual.toFixed(2)+'/5')+'</td>'+
  '<td><button type="button" data-play="'+c.id+'" title="播放">▶</button> <button type="button" data-wav="'+c.id+'" title="下載 WAV">↓</button></td></tr>';
 }).join('');
 if(!shown.length)body.innerHTML='<tr><td colspan="8">沒有符合篩選條件的樣本。</td></tr>';
}
function nextBlind(){
 const pending=candidates.filter(c=>manualScore(c)===null&&c.id!==blindId);
 const pool=pending.length?pending:candidates.filter(c=>c.id!==blindId);
 const chosen=pool[Math.floor(Math.random()*pool.length)]||candidates[0];
 blindId=chosen.id;heard=false;
 $('#blindLabel').textContent='盲聽候選｜已完成 '+ratedCount()+'/50。先播放，再依自己的感受評分。';
 $('#blindNote').value='';
 for(const id of ['rateTransition','rateMemory','rateComfort'])$('#'+id).value='';
 $('#blindSave').disabled=false;
}
async function play(c){
 try{
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)throw Error('此瀏覽器不支援 Web Audio');
  if(!audioContext)audioContext=new Ctx();
  await audioContext.resume();
  if(playingSource){try{playingSource.stop();}catch(e){}}
  const rate=audioContext.sampleRate,pcm=Core.synth(c,rate),buffer=audioContext.createBuffer(1,pcm.length,rate);
  buffer.copyToChannel(pcm,0);
  const src=audioContext.createBufferSource();src.buffer=buffer;src.connect(audioContext.destination);
  src.onended=()=>{if(playingSource===src)playingSource=null;};
  src.start();playingSource=src;
  return true;
 }catch(e){notice('播放失敗：'+e.message);return false;}
}
function saveBlind(){
 if(!heard){notice('請先播放這個候選音，再儲存人工評分。');return;}
 const vals=['rateTransition','rateMemory','rateComfort'].map(id=>Number($('#'+id).value));
 if(!vals.every(n=>Number.isInteger(n)&&n>=1&&n<=5)){notice('三項主觀評分都需要選擇 1 到 5 分。');return;}
 state.ratings[blindId]={transition:vals[0],memory:vals[1],comfort:vals[2],by:'human-local',ratedAt:today()};
 const text=$('#blindNote').value.trim().slice(0,600);if(text)state.notes[blindId]=text;
 else delete state.notes[blindId];
 state.events.push({action:'blind-rating',sampleId:blindId,at:today()});
 state.events=state.events.slice(-200);
 if(persist()){notice('已記錄 '+blindId+' 的人工評分。');metrics();renderTable();nextBlind();}
}
function wavBytes(pcm,sampleRate){
 const buffer=new ArrayBuffer(44+pcm.length*2),v=new DataView(buffer),bytes=new Uint8Array(buffer);
 function str(p,s){for(let i=0;i<s.length;i++)bytes[p+i]=s.charCodeAt(i);}
 str(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);str(8,'WAVE');
 str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);
 v.setUint16(32,2,true);v.setUint16(34,16,true);
 str(36,'data');v.setUint32(40,pcm.length*2,true);
 pcm.forEach((x,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,x))*32767),true));
 return buffer;
}
function download(name,blob){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();
 setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1000);
}
function csvCell(value){
 let str=String(value??'');
 if(/^[\s]*[=+\-@]/.test(str))str="'"+str;
 return '"'+str.replace(/"/g,'""')+'"';
}
function rawReport(){
 return {schemaVersion:1,experimentId:EXPERIMENT,designVersion:DESIGN_VERSION,
  createdAt:state.createdAt,evaluatedAt:today(),methodology:{
   samples:'5 motifs × 10 deterministic variations',
   technicalGate:'0.6–2.0 seconds; peak <= 0.95; RMS > 0.015',
   structuralScore:'transition .35 + interval/contour proxy .20 + softness proxy .25 + extensibility proxy .20',
   humanScoring:'single-listener subjective ratings, if present',
   limitations:['No Japanese-language phrase timing test','No multiple-listener blind test','No market-performance test','Proxy scores are not measured listener preferences']
  },testResults:candidates.map(c=>({id:c.id,motifId:c.motifId,name:c.name,use:c.use,notes:c.notes,durations:c.durations,tone:c.tone,
   metrics:c.metrics,humanRating:rating(c),humanAverage:manualScore(c),humanNote:state.notes[c.id]||''}))};
}
function downloadJson(){download('jp-transition-50-tests.json',new Blob([JSON.stringify(rawReport(),null,2)],{type:'application/json;charset=utf-8'}));notice('已匯出完整 JSON；可供其他工具檢查與備份。');}
function downloadCsv(){
 const heads=['id','motif','variation','duration_s','peak_dbfs','rms_dbfs','technical_pass','transition_proxy','recognition_proxy','softness_proxy','extension_proxy','design_score','human_transition','human_memory','human_comfort','note'];
 const rows=candidates.map(c=>{const m=c.metrics,r=rating(c)||{};return [c.id,c.motifId,c.variation,m.duration,m.peakDb,m.rmsDb,m.technicalPass,m.transition,m.distinctiveness,m.softness,m.extensibility,m.score,r.transition,r.memory,r.comfort,state.notes[c.id]||''].map(csvCell).join(',');});
 download('jp-transition-50-tests.csv',new Blob(['\uFEFF'+[heads.map(csvCell).join(','),...rows].join('\r\n')],{type:'text/csv;charset=utf-8'}));
 notice('已匯出 CSV。');
}
function chooseByMotif(){
 return Core.BASE.map(m=>{
  const all=candidates.filter(c=>c.motifId===m.id).sort((a,b)=>{
   const ma=manualScore(a),mb=manualScore(b);
   if((ma!==null)!==(mb!==null))return ma!==null?-1:1;
   return effective(b)-effective(a)||a.id.localeCompare(b.id);
  });
  const c=all[0];
  return {motifId:m.id,name:m.name,use:m.use,id:c.id,variation:c.variation,score:c.metrics.score,
    humanAverage:manualScore(c),selectionBasis:manualScore(c)===null?'structural-proxy-only':'human-plus-structural-proxy'};
 });
}
function sendToBrain(){
 const report=rawReport(),choices=chooseByMotif();
 const payload={schemaVersion:1,experimentId:EXPERIMENT,snapshotId:EXPERIMENT+'@'+state.updatedAt,
  evaluatedAt:report.evaluatedAt,designVersion:DESIGN_VERSION,
  totalTests:report.testResults.length,technicalPassCount:candidates.filter(c=>c.metrics.technicalPass).length,
  manualRatingCount:ratedCount(),choices,methodology:report.methodology};
 if(!window.confirm('將這次 50 個短音的摘要和 5 個候選方向新增到主腦。\n不修改舊節點。要繼續嗎？'))return;
 try{localStorage.setItem(PENDING_KEY,JSON.stringify(payload));location.href='./index.html#audio-lab';}
 catch(e){notice('主腦同步準備失敗：'+e.message);}
}
loadState();initialMotifs();metrics();renderMotifs();renderTable();nextBlind();
$('#filterMotif').addEventListener('change',()=>{renderMotifs();renderTable();});
$('#filterStatus').addEventListener('change',renderTable);
$('#sortBy').addEventListener('change',renderTable);
$('#resultsBody').addEventListener('click',async ev=>{
 const p=ev.target.closest('[data-play]'),w=ev.target.closest('[data-wav]');
 if(p){const c=byId.get(p.dataset.play);if(c)await play(c);}
 if(w){const c=byId.get(w.dataset.wav);if(c)download(c.id+'.wav',new Blob([wavBytes(Core.synth(c,22050),22050)],{type:'audio/wav'}));}
});
$('#blindPlay').addEventListener('click',async()=>{if(await play(byId.get(blindId)))heard=true;});
$('#blindNext').addEventListener('click',nextBlind);
$('#blindSave').addEventListener('click',saveBlind);
$('#downloadJson').addEventListener('click',downloadJson);
$('#downloadCsv').addEventListener('click',downloadCsv);
$('#sendBrain').addEventListener('click',sendToBrain);
})();