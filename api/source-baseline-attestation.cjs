'use strict';
// Local candidate: verify two separated Ed25519 roles against injected trust policy.
// This module contains NO private keys, key enrollment, storage, source fetching,
// human grant issuance, AI execution, or remote ACK handling.
const crypto=require('node:crypto');
const stable=require('../vendor/fast-json-stable-stringify-v2.1.0.cjs');
const {scanEntry}=require('./auto-review-router.cjs');
const HEX=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9_.:-]{1,80}$/;
const SCOPE=/^github:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+:issue:[1-9][0-9]*$/;
const MAX_SOURCE_SIZE=1_000_000;
const MAX_SOURCE_LIFETIME_MS=5*60*1000;
const MAX_CLOCK_SKEW_MS=30*1000;
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&ID.test(x);
const hex=x=>typeof x==='string'&&HEX.test(x);
const sha=x=>crypto.createHash('sha256').update(x,'utf8').digest('hex');
const bytes=(role,p)=>Buffer.from('ai-boundary:attested-'+role+':v1\n'+stable(p),'utf8');
function sealDigest(record){
  if(!isObj(record)||!isObj(record.statement)||typeof record.signature!=='string')
    throw new TypeError('invalid attestation');
  return sha('ai-boundary:attestation-seal:v1\n'+stable(record.statement)+'\n'+record.signature);
}
function denied(reason){
  return {state:'QUARANTINED',reason,action:'NO_EXTERNAL_EFFECT',review_required:true,
    approved:false,local_source_signature_valid:false,local_baseline_signature_valid:false,
    real_source_verified:false,actual_remote_ack:false};
}
function policyOverlap(trust){
  if(!isObj(trust)||!isObj(trust.source_readers)||!isObj(trust.baseline_curators))
    return 'TRUST_POLICY_INVALID';
  const src=new Set(Object.values(trust.source_readers).map(v=>v?.public_key_pem).filter(x=>typeof x==='string'));
  for(const row of Object.values(trust.baseline_curators)){
    if(typeof row?.public_key_pem==='string'&&src.has(row.public_key_pem))return 'TRUST_ROLE_OVERLAP';
  }
  return null;
}
function validKeyPolicy(group,issuer,scope){
  const k=group[issuer];
  if(!k)return {error:'UNTRUSTED_ISSUER'};
  if(!Array.isArray(k.allowed_scopes)||!k.allowed_scopes.includes(scope))
    return {error:'SCOPE_DENIED'};
  if(typeof k.public_key_pem!=='string'||!k.public_key_pem.includes('PUBLIC KEY'))
    return {error:'INVALID_PUBLIC_KEY'};
  return {key:k.public_key_pem};
}
function verify(role,record,trust,scope){
  const issuer=record.statement.issuer_id;
  const policy=validKeyPolicy(trust,issuer,scope);
  if(policy.error)return policy.error;
  const signature=record.signature;
  if(typeof signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(signature))
    return 'BAD_SIGNATURE';
  let valid=false;
  try{
    const key=crypto.createPublicKey(policy.key);
    if(key.asymmetricKeyType!=='ed25519')return 'INVALID_PUBLIC_KEY';
    const buf=Buffer.from(signature,'base64url');
    if(buf.length!==64||buf.toString('base64url')!==signature)return 'BAD_SIGNATURE';
    valid=crypto.verify(null,bytes(role,record.statement),key,buf);
  }catch{return 'BAD_SIGNATURE';}
  return valid?null:'BAD_SIGNATURE';
}
function sourceContract(p){
  return isObj(p)&&p.format==='attested-source-v1'&&id(p.issuer_id)&&
    typeof p.scope==='string'&&SCOPE.test(p.scope)&&id(p.source_id)&&
    id(p.source_revision)&&id(p.purpose_id)&&hex(p.raw_source_digest)&&
    typeof p.issued_at==='string'&&typeof p.expires_at==='string'&&
    Number.isFinite(Date.parse(p.issued_at))&&Number.isFinite(Date.parse(p.expires_at));
}
function baselineContract(p){
  return isObj(p)&&p.format==='attested-baseline-v1'&&id(p.issuer_id)&&
    typeof p.scope==='string'&&SCOPE.test(p.scope)&&id(p.source_id)&&
    Number.isSafeInteger(p.sequence)&&p.sequence>0&&
    id(p.source_revision)&&id(p.purpose_id)&&
    hex(p.content_digest)&&hex(p.history_digest)&&hex(p.raw_source_digest)&&
    typeof p.review_ref==='string'&&p.review_ref.trim().length>0&&p.review_ref.length<=300&&
    (p.previous_seal_digest===null||hex(p.previous_seal_digest))&&
    typeof p.issued_at==='string'&&Number.isFinite(Date.parse(p.issued_at));
}
async function reviewTrustedSource({source,baseline=null,head=null,trust,now=new Date().toISOString()}={}){
  const overlap=policyOverlap(trust);
  if(overlap)return denied(overlap);
  if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))return denied('CLOCK_INVALID');
  if(!isObj(source)||typeof source.raw!=='string'||source.raw.length>MAX_SOURCE_SIZE||
    !isObj(source.attestation)||!sourceContract(source.attestation.statement))
    return denied('SOURCE_INVALID_CONTRACT');
  const s=source.attestation.statement;
  const sVerify=verify('source',source.attestation,trust.source_readers,s.scope);
  if(sVerify)return denied('SOURCE_'+sVerify);
  const nowMs=Date.parse(now),iat=Date.parse(s.issued_at),exp=Date.parse(s.expires_at);
  if(iat>nowMs+MAX_CLOCK_SKEW_MS)return denied('SOURCE_FUTURE');
  if(exp<=nowMs)return denied('SOURCE_EXPIRED');
  if(exp<=iat||exp-iat>MAX_SOURCE_LIFETIME_MS)return denied('SOURCE_INVALID_LIFETIME');
  if(sha(source.raw)!==s.raw_source_digest)return denied('SOURCE_DIGEST_MISMATCH');
  const entry={source_id:s.source_id,source_revision:s.source_revision,
    purpose_id:s.purpose_id,raw:source.raw};
  if(baseline===null){
    if(head!==null)return denied('BASELINE_MISSING_WITH_TRUSTED_HEAD');
    const out=await scanEntry(entry);
    return {...out,local_source_signature_valid:true,local_baseline_signature_valid:false,
      real_source_verified:false,actual_remote_ack:false,approved:false,action:'NO_EXTERNAL_EFFECT'};
  }
  if(!isObj(baseline)||!isObj(baseline.statement)||!baselineContract(baseline.statement))
    return denied('BASELINE_INVALID_CONTRACT');
  const b=baseline.statement;
  const bVerify=verify('baseline',baseline,trust.baseline_curators,b.scope);
  if(bVerify)return denied('BASELINE_'+bVerify);
  if(b.scope!==s.scope||b.source_id!==s.source_id)return denied('BASELINE_SOURCE_SCOPE_MISMATCH');
  if(Date.parse(b.issued_at)>nowMs+MAX_CLOCK_SKEW_MS)return denied('BASELINE_FUTURE');
  if(head===null)return denied('BASELINE_HEAD_UNPINNED');
  if(!isObj(head)||head.scope!==b.scope||head.source_id!==b.source_id||
    head.sequence!==b.sequence||!hex(head.seal_digest)||
    head.seal_digest!==sealDigest(baseline))return denied('BASELINE_HEAD_MISMATCH');
  // No writes or promotions; source and baseline were verified only against
  // caller-supplied keys and head (which still need external authenticated custody).
  const old={source_id:b.source_id,source_revision:b.source_revision,purpose_id:b.purpose_id,
    content_digest:b.content_digest,history_digest:b.history_digest,raw_source_digest:b.raw_source_digest};
  const out=await scanEntry(entry,old);
  return {...out,local_source_signature_valid:true,local_baseline_signature_valid:true,
    real_source_verified:false,actual_remote_ack:false,approved:false,action:'NO_EXTERNAL_EFFECT'};
}
module.exports={reviewTrustedSource,sealDigest};
