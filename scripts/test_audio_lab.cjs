#!/usr/bin/env node
/* Run: node scripts/test_audio_lab.cjs */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'..','audio-lab-core.js'),'utf8');
const win={};
vm.runInNewContext(code,{window:win,Math,Float32Array,Array,Number});
const {makeCandidates,synth,inspect,BASE,VARIANTS}=win.AudioLabCore;
const samples=makeCandidates();
assert.equal(BASE.length,5);assert.equal(VARIANTS.length,10);assert.equal(samples.length,50);
assert.equal(new Set(samples.map(x=>x.id)).size,50,'all sample IDs unique');
let passed=0,failures=[],top=null;
for(const sample of samples){
 try{
  const a=synth(sample,22050),b=synth(sample,22050),m=inspect(sample,a);
  assert.equal(a.length,b.length,'same length');
  assert(a.length>0,'not empty');
  assert.equal(m.id,sample.id,'provenance');
  assert(m.technicalPass,'technical hard gate');
  assert(m.duration>=.6&&m.duration<=2,'transition duration');
  assert(m.peakDb<=0&&m.peakDb>=-30,'reasonable peak range');
  assert(m.rmsDb>-40,'non silent');
  assert(Number.isInteger(m.score)&&m.score>=0&&m.score<=100,'design proxy score bounded');
  for(let i=0;i<a.length;i++){
   assert(Number.isFinite(a[i]),'finite samples');
   assert.equal(a[i],b[i],'reproducible synthesis');
   assert(Math.abs(a[i])<=1,'no sample clipping');
  }
  if(!top||m.score>top.score)top=m;
  passed++;
 }catch(e){failures.push({id:sample.id,error:e.message});}
}
assert.equal(failures.length,0,JSON.stringify(failures));
assert.equal(passed,50);
for(const motif of BASE)assert.equal(samples.filter(x=>x.motifId===motif.id).length,10,'10 per motif');
console.log(JSON.stringify({samples:50,technicalPassed:passed,motifs:5,variationsPerMotif:10,top:{id:top.id,score:top.score},
 note:'Synthetic structural test only; no blind listeners or market validation.'},null,2));
