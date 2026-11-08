'use strict';
// Candidate metadata attestation verifier. Trust roots MUST be pinned by an
// authorized independent host, not copied from issue text or request payload.
const crypto=require('node:crypto');
const HEX=/^[a-f0-9]{64}$/;
const B64URL=/^[A-Za-z0-9_-]+$/;
const FIELDS=['sourceId','fingerprint','purposeDigest','evidenceRef','reviewerId','verifiedAtMs','expiresAtMs','policyEpoch'];
const validString=x=>typeof x==='string'&&x.length>0&&x.length<=512;
const validTime=x=>Number.isSafeInteger(x)&&x>=0;
function canonicalReviewBytes(a) {
 const m={};
 for(const k of FIELDS)m[k]=a?.[k];
 return Buffer.from('FIRSTBRAIN_EC_REVIEW_V1\n'+JSON.stringify(m),'utf8');
}
function verifyReviewAttestations({attestations=[],trustedReviewerKeys={},nowMs}={}) {
 if(!Array.isArray(attestations)||attestations.length>1000)throw new TypeError('attestations_bounded_required');
 if(!validTime(nowMs)||!trustedReviewerKeys||typeof trustedReviewerKeys!=='object'||Array.isArray(trustedReviewerKeys))
  throw new TypeError('trusted_verifier_config_required');
 const seen=new Set();const accepted=[];const rejected=[];
 for(const a of attestations) {
  let why=null;
  if(!a||!validString(a.sourceId)||!HEX.test(a.fingerprint||'')||
      !HEX.test(a.purposeDigest||'')||!validString(a.evidenceRef)||
      !validString(a.reviewerId)||!validTime(a.verifiedAtMs)||
      !validTime(a.expiresAtMs)||!validTime(a.policyEpoch)||
      !validString(a.signature)||!B64URL.test(a.signature))why='MALFORMED_ATTESTATION';
  const cfg=!why&&Object.prototype.hasOwnProperty.call(trustedReviewerKeys,a.reviewerId)?
    trustedReviewerKeys[a.reviewerId]:null;
  if(!why&&(!cfg||cfg.revoked===true||cfg.status!=='active'||
     !validString(cfg.publicKeyPem)||!validTime(cfg.minEpoch)))why='UNTRUSTED_OR_REVOKED_REVIEWER';
  if(!why&&(a.policyEpoch<cfg.minEpoch||a.verifiedAtMs>nowMs||
     a.expiresAtMs<nowMs||a.expiresAtMs<a.verifiedAtMs))why='STALE_OR_UNAUTHORIZED_EPOCH';
  if(!why) {
   const bytes=Buffer.from(a.signature,'base64url');
   if(bytes.toString('base64url')!==a.signature||bytes.length!==64)why='INVALID_SIGNATURE_ENCODING';
   else {
    try {if(!crypto.verify(null,canonicalReviewBytes(a),crypto.createPublicKey(cfg.publicKeyPem),bytes))why='INVALID_SIGNATURE';}
    catch {why='INVALID_SIGNING_KEY';}
   }
  }
  if(!why&&seen.has(a.sourceId))why='DUPLICATE_SOURCE_ATTESTATION';
  if(why){rejected.push({sourceId:typeof a?.sourceId==='string'?a.sourceId:null,reason:why});continue;}
  seen.add(a.sourceId);
  accepted.push({sourceId:a.sourceId,fingerprint:a.fingerprint,purposeDigest:a.purposeDigest,
   reviewed:true,evidenceRef:a.evidenceRef,verifiedAtMs:a.verifiedAtMs});
 }
 return {accepted,rejected,signatureVerified:true,trustRootConfigured:Object.keys(trustedReviewerKeys).length>0,
  note:'Configured keys MUST originate from an authorized pinned environment. This verifier does not provision/revoke actual keys.'};
}
module.exports={canonicalReviewBytes,verifyReviewAttestations};
