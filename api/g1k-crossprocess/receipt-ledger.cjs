'use strict';
/* File-based, local-filesystem atomic-exclusion simulator. NOT PostgreSQL WAL/HA. */
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
function mustSafe(v){if(!/^[a-zA-Z0-9_-]{1,128}$/.test(v))throw Error('UNSAFE_LEDGER_ID');return v;}
function reserve(dir,{event_id,attempt_id,nonce,receipt_hash}){
 const key=crypto.createHash('sha256').update([mustSafe(event_id),mustSafe(attempt_id),mustSafe(nonce)].join('\x00')).digest('hex');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const dest=path.join(dir,key+'.receipt');let fd;
 try{fd=fs.openSync(dest,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY,0o600);}
 catch(err){if(err.code==='EEXIST')return {consumed:false,evidence_ref:'synthetic:already-consumed'};throw err;}
 try{const v=JSON.stringify({event_id,attempt_id,nonce,receipt_hash,synthetic:true});fs.writeSync(fd,v);fs.fsyncSync(fd);}
 finally{fs.closeSync(fd)}
 return {consumed:true,verified:true,evidence_ref:'synthetic:local-file-exclusion/'+key};
}
module.exports={reserve};
