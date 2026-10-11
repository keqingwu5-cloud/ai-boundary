/* 日文轉場短音實驗室：原創音序與可重複結構評估。此分數是設計代理指標，並非聽眾／市場評分。 */
(function(){
 const BASE=[{"id":"JP01","name":"月光・Moon Step","use":"安靜換景","notes":[69,72,76,72,67],"ds":[0.16,0.15,0.18,0.16,0.31]},{"id":"JP02","name":"桜・Sakura Lift","use":"輕快轉場","notes":[74,78,81,78,76],"ds":[0.14,0.15,0.16,0.15,0.29]},{"id":"JP03","name":"雫・Drop Echo","use":"回憶／情緒切換","notes":[76,71,74,69,72],"ds":[0.22,0.12,0.17,0.16,0.34]},{"id":"JP04","name":"星・Tiny Spark","use":"揭曉／亮點","notes":[64,67,71,74,71],"ds":[0.13,0.13,0.15,0.17,0.31]},{"id":"JP05","name":"凪・Calm Return","use":"章節結尾","notes":[72,69,67,69,64],"ds":[0.19,0.16,0.18,0.15,0.39]}];
 const VARIANTS=[{"key":"original","name":"原型","factor":1,"tone":"warm","mode":"base"},{"key":"quick","name":"快速切點","factor":0.78,"tone":"warm","mode":"base"},{"key":"slow","name":"舒緩","factor":1.34,"tone":"warm","mode":"base"},{"key":"bell","name":"柔鈴","factor":1,"tone":"bell","mode":"base"},{"key":"glass","name":"清透","factor":1,"tone":"glass","mode":"base"},{"key":"pluck","name":"木質顆粒","factor":1,"tone":"pluck","mode":"base"},{"key":"pause","name":"結尾留白","factor":1,"tone":"soft","mode":"pause"},{"key":"reverse","name":"反向旋律","factor":1,"tone":"warm","mode":"reverse"},{"key":"low","name":"低八度","factor":1.07,"tone":"warm","mode":"low"},{"key":"hold","name":"延長尾音","factor":1,"tone":"soft","mode":"hold"}];
 function clamp(n,lo,hi){return Math.min(hi,Math.max(lo,n))}

function makeCandidates(){
return BASE.flatMap(m=>VARIANTS.map((v,i)=>{
 const ns=v.mode==="reverse"?[...m.notes].reverse():v.mode==="low"?m.notes.map(x=>x-12):[...m.notes];
 const ds=m.ds.map(x=>x*v.factor);
 if(v.mode==="pause")ds[3]+=0.16;
 if(v.mode==="hold")ds[4]+=0.36;
 return {id:m.id+"-"+String(i+1).padStart(2,"0"),motifId:m.id,name:m.name+" · "+v.name,use:m.use,variation:v.key,notes:ns,durations:ds,tone:v.tone,seedNotes:m.notes,seedDurations:m.ds};
}));
}

function synth(c,rate=22050){
const total=c.durations.reduce((a,b)=>a+b,0)+0.12;
const pcm=new Float32Array(Math.ceil(total*rate));
const harmonics={warm:[1,.16,.035],bell:[1,.12,.07],glass:[1,.24,.19],pluck:[1,.34,.11],soft:[1,.08,.015]};
const hs=harmonics[c.tone]||harmonics.warm;
let start=0;
for(let n=0;n<c.notes.length;n++){
 const duration=c.durations[n],hz=440*Math.pow(2,(c.notes[n]-69)/12),count=Math.ceil(duration*rate),idx=Math.round(start*rate);
 for(let j=0;j<count&&idx+j<pcm.length;j++){
  const t=j/rate,p=t/duration,attack=Math.min(1,p/0.12),release=Math.min(1,(1-p)/0.24);
  const env=Math.max(0,attack*release)*Math.exp(-p*(c.tone==="pluck"?2.2:.9));
  let w=0;for(let h=0;h<hs.length;h++)w+=hs[h]*Math.sin(2*Math.PI*hz*(h+1)*t);
  pcm[idx+j]+=env*w*.56;
 }
 start+=duration;
}
let peak=0;for(let i=0;i<pcm.length;i++)peak=Math.max(peak,Math.abs(pcm[i]));
const normalization=peak>0?.67/peak:1;for(let i=0;i<pcm.length;i++)pcm[i]*=normalization;
return pcm;
}

function inspect(c,pcm){
 const duration=c.durations.reduce((a,b)=>a+b,0);
 let peak=0,ss=0;for(const x of pcm){peak=Math.max(peak,Math.abs(x));ss+=x*x}
 const db=peak?20*Math.log10(peak):-120;
 const rms=pcm.length?Math.sqrt(ss/pcm.length):0;
 const jumps=c.notes.slice(1).map((n,i)=>Math.abs(n-c.notes[i]));
 const avgJump=jumps.reduce((a,b)=>a+b,0)/(jumps.length||1);
 const maxJump=Math.max(...jumps);
 const sameContour=c.notes.every((n,i)=>n===c.seedNotes[i]||n===c.seedNotes[i]-12);
 const technicallyValid=duration>=.6&&duration<=2.0&&peak<=.95&&rms>.015;
 const transition=clamp(100-Math.abs(duration-1.05)*58+(c.durations.at(-1)>=.24?5:0)-(c.variation==="pause"?4:0),0,100);
 const contourChanges=c.notes.slice(1).map((n,i)=>Math.sign(n-c.notes[i])); 
 const turns=contourChanges.slice(1).filter((x,i)=>x!==contourChanges[i]).length;
 const distinctiveness=clamp(44+turns*12+Math.min(15,avgJump*2.7)+(c.variation==="reverse"?-6:0),0,100);
 const softness=clamp(102-maxJump*2.6-Math.max(0,Math.max(...c.notes)-80)*2.4-({glass:10,pluck:9,bell:4,warm:0,soft:-3}[c.tone]||0),0,100);
 const extensibility=clamp((sameContour?90:44)-(c.variation==="hold"?4:0),0,100);
 const score=Math.round(transition*.35+distinctiveness*.2+softness*.25+extensibility*.2);
 return {id:c.id,motifId:c.motifId,variation:c.variation,duration:+duration.toFixed(3),peakDb:+db.toFixed(2),rmsDb:+(20*Math.log10(rms||1e-6)).toFixed(2),maxJump,technicalPass:technicallyValid,transition:Math.round(transition),distinctiveness:Math.round(distinctiveness),softness:Math.round(softness),extensibility:Math.round(extensibility),score,status:technicallyValid?"technical-pass":"technical-review"};
}
 window.AudioLabCore={BASE,VARIANTS,makeCandidates,synth,inspect};
})();