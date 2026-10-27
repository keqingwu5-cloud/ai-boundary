"use strict";
/*
 * R11 candidate verifier. Cryptographic integrity checks for synthetic
 * approval receipts; NEVER authorizes a real worker, permission grant or merge.
 * There is deliberately no production trust root or execution integration.
 */
const crypto=require("node:crypto");
const SCHEMA="tcvl.diffusion.approval-receipt.v1";
const TEST_TRUST_SOURCE="SYNTHETIC_EPHEMERAL_TEST_ONLY";
const MAX_AGE=5*60*1000;
const MAX_RECEIPT_LIFETIME=10*60*1000;
const FIELDS=Object.freeze([
 "action","approver_id","audience","decision","direction_version",
 "expires_at","issued_at","node_id","nonce","origin_command_id",
 "project_id","receipt_id","request_id","schema","task_id"
].sort());
const ID=/^[A-Za-z0-9_.:-]{1,120}$/;
const bad=(reason)=>({status:"REJECTED",reason,cryptographic_integrity:false,
 independent_authority_verified:false,execution_allowed:false});
const utc=(v)=>typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))?
 Date.parse(v):NaN;
const isId=v=>typeof v==="string"&&ID.test(v);
function canonicalBytes(payload){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||Object.keys(payload).sort().join("|")!==FIELDS.join("|"))
  throw Error("RECEIPT_SCHEMA_INVALID");
 for(const name of FIELDS)if(typeof payload[name]!=="string"||!payload[name].length)throw Error("RECEIPT_FIELD_INVALID");
 return Buffer.from(JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,payload[k]]))),"utf8");
}
function validateSnapshot(snapshot,when,fields){
 if(!snapshot||typeof snapshot!=="object"||!fields.every(f=>Array.isArray(snapshot[f])&&
   snapshot[f].every(isId)&&new Set(snapshot[f]).size===snapshot[f].length))return false;
 const at=utc(snapshot.checked_at);
 return Number.isFinite(at)&&at<=when+60000&&when-at<=MAX_AGE;
}
function assessReceipt({receipt,expected,trustRoot,revocations,replayLedger,now}={}){
 try{
  const when=utc(now);
  if(!Number.isFinite(when))return bad("CLOCK_INVALID");
  if(!expected||![
    "project_id","task_id","node_id","origin_command_id","direction_version","request_id","audience"
   ].every(k=>isId(expected[k])))return bad("EXPECTED_IDENTITY_MISSING");
  if(!receipt||!receipt.payload||typeof receipt.signer_id!=="string"||
    typeof receipt.signature_b64!=="string")return bad("RECEIPT_MISSING");
  const p=receipt.payload;
  canonicalBytes(p);
  if(p.schema!==SCHEMA||p.action!=="approve_node_reuse"||p.decision!=="approved")
    return bad("WRONG_RECEIPT_PURPOSE");
  for(const k of ["project_id","task_id","node_id","origin_command_id","direction_version","request_id","audience"])
   if(p[k]!==expected[k])return bad("IDENTITY_OR_VERSION_MISMATCH");
  if(!["approver_id","receipt_id","nonce"].every(k=>isId(p[k])))return bad("RECEIPT_ID_INVALID");
  const issued=utc(p.issued_at),expires=utc(p.expires_at);
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||expires<=issued||
   expires-issued>MAX_RECEIPT_LIFETIME||issued>when+60000||when>=expires)
   return bad("EXPIRED_OR_INVALID_RECEIPT");
  // A caller-provided key is not a production trust root.
  if(!trustRoot||trustRoot.source!==TEST_TRUST_SOURCE||
    !Array.isArray(trustRoot.signers)||trustRoot.signers.length<1)
   return bad("NO_APPROVED_TRUST_ROOT");
  // Ambiguous trust identities must be rejected, never let array order pick
  // one of two conflicting public keys.
  if(trustRoot.signers.some(x=>!x||!isId(x.id))||
    new Set(trustRoot.signers.map(x=>x.id)).size!==trustRoot.signers.length)
   return bad("SIGNER_REGISTRY_AMBIGUOUS");
  const signer=trustRoot.signers.find(x=>x.id===receipt.signer_id);
  const from=utc(signer?.valid_from),until=utc(signer?.valid_until);
  if(!signer||signer.approver_id!==p.approver_id||signer.role!=="independent_reviewer"||
     !Number.isFinite(from)||!Number.isFinite(until)||from>issued||until<expires)
   return bad("SIGNER_IDENTITY_OR_LIFETIME_MISMATCH");
  if(!validateSnapshot(revocations,when,["revoked_receipt_ids","revoked_signer_ids","revoked_node_ids"]))
   return bad("REVOCATION_EVIDENCE_MISSING_OR_STALE");
  if(revocations.revoked_receipt_ids.includes(p.receipt_id)||
    revocations.revoked_signer_ids.includes(receipt.signer_id)||
    revocations.revoked_node_ids.includes(p.node_id))return bad("APPROVAL_REVOKED");
  if(!validateSnapshot(replayLedger,when,["consumed_receipt_ids","consumed_nonces"]))
   return bad("REPLAY_EVIDENCE_MISSING_OR_STALE");
  if(replayLedger.consumed_receipt_ids.includes(p.receipt_id)||
    replayLedger.consumed_nonces.includes(p.nonce))return bad("REPLAY_DETECTED");
  if(!/^(?:[A-Za-z0-9+/]{4}){21}[A-Za-z0-9+/]{2}==$/.test(receipt.signature_b64))
   return bad("SIGNATURE_ENCODING_INVALID");
  let key;
  try{key=crypto.createPublicKey(signer.public_key_pem);}catch{return bad("SIGNER_KEY_INVALID");}
  if(key.asymmetricKeyType!=="ed25519")return bad("SIGNER_KEY_TYPE_INVALID");
  const signature=Buffer.from(receipt.signature_b64,"base64");
  if(signature.length!==64||!crypto.verify(null,canonicalBytes(p),key,signature))
    return bad("SIGNATURE_INVALID");
  return {
   status:"SYNTHETIC_RECEIPT_INTEGRITY_VERIFIED",
   reason:"NO_INDEPENDENT_RUNTIME_AUTHORITY",
   cryptographic_integrity:true,
   independent_authority_verified:false,
   execution_allowed:false,
   // No signer key, personal content, approval payload or private token in logs.
   receipt_digest:crypto.createHash("sha256").update(canonicalBytes(p)).digest("hex")
  };
 }catch{return bad("INVALID_OR_UNTRUSTED_RECEIPT");}
}
module.exports=Object.freeze({SCHEMA,TEST_TRUST_SOURCE,canonicalBytes,assessReceipt});
