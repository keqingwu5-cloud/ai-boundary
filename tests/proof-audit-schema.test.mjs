import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit,PROOF_SCHEMA,AUDIT_STREAMS,AUDIT_SECTORS} from '../proof-audit-candidate.mjs';

const schema=JSON.parse(readFileSync(new URL(
  '../schemas/proof-audit.preview.schema.json',import.meta.url),'utf8'));
async function make(){
  const ctrl=createControlCycle();
  ctrl.registerDomain({domain_id:'water',contract_revision:'r1'});
  await ctrl.observe({event_id:'ev',domain_id:'water',source_id:'src',
    revision:'r1',source_hash:'a'.repeat(64)});
  const audit=createProofAudit({control:ctrl});
  await audit.openProof({proof_id:'proof',event_id:'ev',expected_control_version:1,
    sector:'WATER',created_by_claim:'author',scope_ref:'scope'});
  return audit;
}
test('01 proof bundle schema requires exact output keys, no shadow authority fields',async()=>{
  const audit=await make();
  const p=audit.readProof('proof');
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties,false);
  assert.deepEqual(Object.keys(p).sort(),schema.required.slice().sort());
  assert.equal(schema.properties.schema.const,PROOF_SCHEMA);
});
test('02 schema constants, review states and sector vocabulary match the runtime',async()=>{
  const p=(await make()).readProof('proof');
  for(const [key,s] of Object.entries(schema.properties)){
    if(Object.hasOwn(s,'const'))assert.deepEqual(p[key],s.const,key);
    if(s.enum)assert.ok(s.enum.includes(p[key]),key);
  }
  assert.deepEqual(schema.properties.sector.enum,AUDIT_SECTORS);
  assert.deepEqual(Object.keys(schema.properties.log_coverage.properties),AUDIT_STREAMS);
});
test('03 all actor, review and log record fields follow machine schema',async()=>{
  const audit=await make();
  await audit.recordAction({proof_id:'proof',expected_revision:1,action_id:'a',
    performed_by_claim:'engineer',action_ref:'commit',action_hash:'b'.repeat(64),result_code:'PROPOSED'});
  await audit.recordLog({proof_id:'proof',expected_revision:2,log_id:'l',
    stream:'REASONING_SUMMARY',recorded_by_claim:'assistant',record_ref:'ref',
    record_hash:'c'.repeat(64),summary_code:'DECISION_SUMMARY'});
  await audit.recordReview({proof_id:'proof',expected_revision:3,review_id:'r',
    reviewed_by_claim:'reviewer',review_ref:'review',review_hash:'d'.repeat(64),
    verdict:'RECOMMEND'});
  const proof=audit.readProof('proof');
  for(const [kind,data] of [['action',proof.actions[0]],['log',proof.logs[0]],
      ['review',proof.reviews[0]]]){
    assert.deepEqual(Object.keys(data).sort(),schema.$defs[kind].required.slice().sort(),kind);
    assert.equal(schema.$defs[kind].additionalProperties,false);
  }
  assert.equal(proof.review_status,'REVIEW_CLAIM_ONLY');
});
test('04 no raw reasoning trace or unverified role can become approved',async()=>{
  const audit=await make();
  const p=audit.readProof('proof');
  assert.equal(p.role_independence,'NOT_VERIFIED');
  assert.equal(p.identity_verified,false);
  assert.equal(p.baseline_approval,'NOT_APPROVED');
  assert.equal(schema.$defs.log.properties.raw_text_stored.const,false);
  assert.equal(schema.$defs.review.properties.approval.const,'NOT_GRANTED');
});
