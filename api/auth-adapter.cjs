'use strict';
const crypto=require('node:crypto');
function timingEqual(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function createHmacAuth({keys,clock=()=>Date.now(),audience='mainbrain-api',maxAgeSeconds=300}){
 if(!keys||typeof keys!=='object')throw Error('keys required');
 return async function authenticate(req){
  const h=req.headers?.authorization||'';if(!h.startsWith('Bearer '))throw Error('UNAUTHORIZED');
  const token=h.slice(7),parts=token.split('.');if(parts.length!==2)throw Error('UNAUTHORIZED');
  const [encoded,signature]=parts;let claims;
  try{claims=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));}catch{throw Error('UNAUTHORIZED');}
  const secret=keys[claims.endpoint_id];if(typeof secret!=='string'||secret.length<32)throw Error('UNAUTHORIZED');
  const expected=crypto.createHmac('sha256',secret).update(encoded).digest('base64url');
  if(!timingEqual(expected,signature))throw Error('UNAUTHORIZED');
  const now=Math.floor(clock()/1000);
  if(claims.aud!==audience||!Number.isInteger(claims.iat)||!Number.isInteger(claims.exp)||claims.iat>now+30||claims.exp<=now||claims.exp-claims.iat>maxAgeSeconds||!Array.isArray(claims.scopes))throw Error('UNAUTHORIZED');
  return {verified:true,endpoint_id:claims.endpoint_id,scopes:claims.scopes};
 };
}
module.exports={createHmacAuth};
