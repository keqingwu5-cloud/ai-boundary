import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFormalRecoveryCandidate,FORMAL_RECOVERY_GATE} from '../first-brain-formal-recovery-preflight.mjs';
import {verifyTransactionalBackup} from '../first-brain-transactional-backup.mjs';
const sha=async raw=>{
 const bytes=new TextEncoder().encode(raw);
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
};
async function fixture(){
 const graph={version:1,brains:[{id:'main',parentBrainId:null,rootNodeId:'q',position:[0,0,0]}],
  nodes:[{id:'q',brainId:'main',parentId:null,pos:[0,0,0],title:'Synthetic Recovery Only'}],
  links:[],history:[]};
 const mainRaw=JSON.stringify(graph),undoRaw=JSON.stringify([mainRaw]);
 const envelope={schema:'first-brain.transactional.backup.v1',key:'aiBrain.v1',
  revision:3,exportedAt:'2026-10-29T00:00:00.000Z',mainRaw,undoRaw,
  legacyFence:{version:1,mainSha:await sha(mainRaw),undoSha:await sha(undoRaw)}};
 const payload=JSON.stringify({schema:envelope.schema,key:envelope.key,
  revision:envelope.revision,exportedAt:envelope.exportedAt,
  mainRaw:envelope.mainRaw,undoRaw:envelope.undoRaw,legacyFence:envelope.legacyFence});
 envelope.sha256={mainRaw:await sha(mainRaw),undoRaw:await sha(undoRaw),
  payload:await sha(payload)};
 assert.equal((await verifyTransactionalBackup(envelope)).ok,true,'synthetic fixture is valid');
 return {backup:envelope,authority:'idb',currentSnapshot:null,legacyMainRaw:mainRaw,
  legacyUndoRaw:undoRaw};
}
function assertBlocked(r){
 assert.equal(r.schema,FORMAL_RECOVERY_GATE);
 assert.equal(r.status,'blocked');
 assert.equal(r.restoreAuthorized,false);
 assert.equal(r.mergeAuthorized,false);
 assert.equal(r.deploymentAuthorized,false);
}
test('R24 valid candidate never auto-approves real restoration, even with missing IDB',async()=>{
 const f=await fixture(),r=await inspectFormalRecoveryCandidate(f);
 assertBlocked(r);assert.equal(r.candidateVerified,false);
 assert.equal(r.backupBytesVerified,true);
 assert.ok(r.reasons.includes('current_snapshot_trusted_observation_required'));
 assert.ok(r.reasons.includes('independent_reviewer_ack_required'));
 assert.ok(r.reasons.includes('physical_apple_safari_evidence_required'));
 assert.ok(r.reasons.includes('explicit_owner_recovery_permission_required'));
});
test('R24 existing IDB revision 4 cannot be replaced with verified older revision 3',async()=>{
 const f=await fixture();
 const r=await inspectFormalRecoveryCandidate({...f,currentSnapshot:{
  key:'aiBrain.v1',revision:4,mainRaw:'NEWER_GRAPH',undoRaw:'NEWER_UNDO'}});
 assertBlocked(r);assert.equal(r.candidateVerified,false);
 assert.ok(r.reasons.includes('existing_snapshot_preserve_no_overwrite'));
});
test('R24 unknown existing IDB state is not proof of missing data',async()=>{
 const f=await fixture();delete f.currentSnapshot;
 const r=await inspectFormalRecoveryCandidate(f);
 assertBlocked(r);assert.ok(r.reasons.includes('current_snapshot_observation_required'));
});
test('R24 no active authority or old writer divergence blocks candidate',async()=>{
 const f=await fixture();
 const r=await inspectFormalRecoveryCandidate({...f,authority:'legacy',legacyMainRaw:'modified'});
 assertBlocked(r);assert.equal(r.candidateVerified,false);
 assert.ok(r.reasons.includes('transactional_authority_unverified'));
 assert.ok(r.reasons.includes('origin_legacy_bytes_diverged'));
});
test('R24 no source bytes and malformed backup are not promoted',async()=>{
 const f=await fixture(),backup={...f.backup,sha256:{...f.backup.sha256,payload:'0'.repeat(64)}};
 const r=await inspectFormalRecoveryCandidate({...f,backup,legacyMainRaw:undefined});
 assertBlocked(r);assert.equal(r.candidateVerified,false);
 assert.ok(r.reasons.includes('backup_backup_digest_mismatch'));
 assert.ok(r.reasons.includes('origin_legacy_bytes_missing'));
});
test('R24 exported files do not silently become production restore authorization',async()=>{
 const f=await fixture();
 let reads=0,writes=0;
 const storage={getItem:()=>{reads++;return null;},setItem:()=>{writes++;throw Error('must not write')}};
 const r=await inspectFormalRecoveryCandidate({...f,storage,
  reviewer:{approved:true},device:{type:'simulated',passed:true},
  owner:{approved:true},permission:true,merge:true});
 assertBlocked(r);assert.equal(r.candidateVerified,false);
 assert.equal(r.backupBytesVerified,true);
 assert.equal(reads,0);assert.equal(writes,0);
});
test('R24-A self-claimed independent observation cannot certify missing IDB',async()=>{
 const f=await fixture();
 const r=await inspectFormalRecoveryCandidate({...f,observerVerified:true,
   independentObservation:{verified:true,proof:'caller-supplied'}});
 assertBlocked(r);assert.equal(r.candidateVerified,false);
 assert.equal(r.backupBytesVerified,true);
 assert.ok(r.reasons.includes('current_snapshot_trusted_observation_required'));
});
test('R24-B calendar-invalid and far-future timestamps reject recomputed SHA',async()=>{
 for(const exportedAt of ['2099-99-99T99:99:99.000Z','2099-01-01T00:00:00.000Z']){
  const f=await fixture();f.backup.exportedAt=exportedAt;
  const payload=JSON.stringify({schema:f.backup.schema,key:f.backup.key,
    revision:f.backup.revision,exportedAt,mainRaw:f.backup.mainRaw,
    undoRaw:f.backup.undoRaw,legacyFence:f.backup.legacyFence});
  f.backup.sha256.payload=await sha(payload);
  const r=await inspectFormalRecoveryCandidate(f);
  assertBlocked(r);assert.equal(r.candidateVerified,false);
  assert.equal(r.backupBytesVerified,false);
  assert.ok(r.reasons.includes('backup_backup_format_invalid'));
 }
});
