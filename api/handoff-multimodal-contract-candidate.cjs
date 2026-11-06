'use strict';
// Candidate only: preserve structured text as authority, images as independently verified references.
const crypto=require('node:crypto');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
function canonical(x){
  if(x===null||typeof x==='string'||typeof x==='boolean'||(typeof x==='number'&&Number.isFinite(x)))return JSON.stringify(x);
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
  if(x&&typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype)return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
  throw Error('non_json_value');
}
function packageHandoff({event_id,correlation_id,source,destination,version,structured,images=[]}){
  const errors=[];
  for(const [k,v] of Object.entries({event_id,correlation_id,source,destination,version}))if(typeof v!=='string'||!v.trim())errors.push('missing_'+k);
  if(source===destination)errors.push('same_endpoint');
  if(!structured||typeof structured!=='object'||Array.isArray(structured))errors.push('invalid_structured_payload');
  if(!Array.isArray(images))errors.push('invalid_images');
  else for(const [i,img] of images.entries()){
    if(!img||typeof img!=='object'||typeof img.ref!=='string'||!img.ref.trim()||typeof img.sha256!=='string'||!/^[a-f0-9]{64}$/.test(img.sha256)||typeof img.purpose!=='string'||!img.purpose.trim())errors.push('invalid_image_manifest_'+i);
  }
  if(errors.length)return {state:'blocked',errors};
  try{
    const payload={event_id,correlation_id,source,destination,version,structured,images};
    return {state:'candidate_ready',payload,sha256:digest(canonical(payload)),actual_ack:false};
  }catch(e){return {state:'blocked',errors:[String(e.message)]}}
}
function inspectHandoff({sent,received,availableImages=[]}){
  const errors=[];
  if(sent?.state!=='candidate_ready'||!sent.payload)errors.push('sender_not_ready');
  if(!received||typeof received!=='object'||Array.isArray(received))errors.push('missing_received_payload');
  else try{if(digest(canonical(received))!==sent?.sha256)errors.push('content_mismatch')}catch(e){errors.push('invalid_received_json')}
  const manifests=received?.images;
  if(!Array.isArray(manifests))errors.push('missing_image_manifest');
  else for(const img of manifests){
    const found=Array.isArray(availableImages)?availableImages.find(x=>x&&x.ref===img?.ref):null;
    // Never trust a supplied sha256 assertion: compute digest from actual bytes.
    if(!found||!Buffer.isBuffer(found.bytes)||digest(found.bytes)!==img?.sha256)
      errors.push('image_unverified:'+String(img?.ref));
  }
  return {state:errors.length?'blocked':'reviewed_candidate',errors,actual_ack:false};
}
module.exports={canonical,packageHandoff,inspectHandoff};
