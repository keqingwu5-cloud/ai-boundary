'use strict';
// Isolated F05 ↔ AUTO-TRUST contract probe; synthetic records, no network or IO.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash,generateKeyPairSync,sign}=require('node:crypto');
const stable=require('../vendor/fast-json-stable-stringify-v2.1.0.cjs');
const {assessF05Interface}=require('../api/f05-attested-interface-bridge.cjs');
const {sealDigest}=require('../api/source-baseline-attestation.cjs');
const expected_scope='github:keqingwu5-cloud/ai-boundary:issue:41';
const date='2026-11-09T12:00:00.000Z';
const reader=generateKeyPairSync('ed25519'),curator=generateKeyPairSync('ed25519');
const pem=k=>k.export({type:'spki',format:'pem'});
const trust={source_readers:{'reader-1':{public_key_pem:pem(reader.publicKey),allowed_scopes:[expected_scope]}},
  baseline_curators:{'curator-1':{public_key_pem:pem(curator.publicKey),allowed_scopes:[expected_scope]}}};
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const signStatement=(role,statement,key)=>sign(null,Buffer.from('ai-boundary:attested-'+role+':v1\n'+stable(statement)),key).toString('base64url');
function graph(title='A'){
  return {version:2,brains:[{id:'main',parentBrainId:null,rootNodeId:null,position:[0,0,0]}],
   nodes:[{id:'n1',brainId:'main',parentId:null,pos:[0,0,0],title}],links:[],history:[]};
}
function source(title='A'){
  const raw=JSON.stringify(graph(title)),statement={
    format:'attested-source-v1',issuer_id:'reader-1',scope:expected_scope,
    source_id:'src-1',source_revision:'r1',purpose_id:'purpose-1',
    raw_source_digest:sha(raw),issued_at:'2026-11-09T11:59:00.000Z',
    expires_at:'2026-11-09T12:04:00.000Z'
  };
  return {raw,attestation:{statement,signature:signStatement('source',statement,reader.privateKey)}};
}
function message(s=source()){
  return {
    schema_version:'f05-bridge-v0.1',project_id:'AI-BOUNDARY-TCVL',
    case_id:'case-41',task_id:'task-41',event_id:'ev-2',attempt_id:'at-2',
    sender_endpoint_id:'GPT1',receiver_endpoint_id:'GPT2',message_kind:'SUBMIT',
    source_ref:expected_scope,source_version:s.attestation.statement.source_revision,
    source_digest:s.attestation.statement.raw_source_digest,purpose_id:'purpose-1',
    original_goal:'Observe source change without authorization',
    sequence:2,previous_event_id:'ev-1',
    placement:{container:'review_queue',slot:'pending',ordinal:2},
    links:[{type:'depends_on',target_id:'ev-1',target_version:'v1'}],
    citations:[{citation_id:'cite-1',source_ref:expected_scope,source_version:'r1',
      source_digest:s.attestation.statement.raw_source_digest,
      locator:'synthetic:1',claim_id:'claim-1',readback_ref:'readback-1',
      usage:{use_id:'use-1',sequence:1,previous_use_id:null,used_in_event_id:'ev-2',
        used_in_attempt_id:'at-2',used_by_endpoint:'GPT1'}}]
  };
}
const context=()=>({
 project_id:'AI-BOUNDARY-TCVL',case_id:'case-41',task_id:'task-41',
 sender_endpoint_id:'GPT1',receiver_endpoint_id:'GPT2',expected_scope,
 placement:{container:'review_queue',slot:'pending',ordinal:2},
 last_sequence:1,last_event_id:'ev-1',
 known_events:{'ev-1':{version:'v1',kind:'SUBMIT'}},
 known_citations:{'cite-1':{source_ref:expected_scope,source_version:'r1',locator:'synthetic:1',source_digest:sha(JSON.stringify(graph()))}}
});
const assess=async({s=source(),m,ctx=context(),...other}={})=>
 assessF05Interface({message:m||message(s),source:s,context:ctx,trust,now:date,...other});
const codes=r=>(r.reasons||[]).map(z=>z.code);
test('F05-BRIDGE-00 preflight can reach read-only source validation without pretending real ACK',async()=>{
 const r=await assess();
 assert.equal(r.result,'LOCAL_REVIEW_ONLY');assert.equal(r.review.state,'WAIT_BASELINE');
 assert.equal(r.action,'NO_EXTERNAL_EFFECT');assert.equal(r.independent_sender_identity_verified,false);
 assert.equal(r.actual_remote_ack,false);assert.equal(r.approved,false);
 assert.equal(r.checks.length,12);
});
test('F05-BRIDGE-01 case and task mismatch cannot be accepted',async()=>{
 const m=message();m.case_id='case-other';m.task_id='task-other';
 const r=await assess({m});assert.equal(r.result,'QUARANTINE_NO_VERIFIED_SENDER');
 assert.ok(codes(r).includes('CASE_ID_MISMATCH'));assert.ok(codes(r).includes('TASK_ID_MISMATCH'));
 assert.ok(r.reasons.every(x=>x.field_path&&x.reason&&x.suggested_correction));
});
test('F05-BRIDGE-02 signed-source digest and revision must agree with interface',async()=>{
 const m=message();m.source_digest='0'.repeat(64);m.source_version='r2';
 const r=await assess({m});assert.ok(codes(r).includes('SOURCE_DIGEST_MISMATCH'));
 assert.ok(codes(r).includes('SOURCE_VERSION_MISMATCH'));
});
test('F05-BRIDGE-03 different claimed endpoints rejected against preconfigured binding',async()=>{
 const m=message();m.receiver_endpoint_id='BOT3';m.sender_endpoint_id='GPT2';
 const r=await assess({m});assert.ok(codes(r).includes('ENDPOINT_ROUTE_MISMATCH'));
 assert.equal(r.actual_remote_ack,false);
});
test('F05-BRIDGE-04 bad slot, ordinal, sequence and predecessor yield explained returns',async()=>{
 const m=message();m.sequence=4;m.previous_event_id='ev-unknown';
 m.placement.slot='effective_memory';m.placement.ordinal=7;
 const r=await assess({m});assert.ok(codes(r).includes('SEQUENCE_MISMATCH'));
 assert.ok(codes(r).includes('PREVIOUS_EVENT_MISMATCH'));
 assert.ok(codes(r).includes('PLACEMENT_MISMATCH'));
});
test('F05-BRIDGE-05 dangling relation and wrong relation version block',async()=>{
 const m=message();m.links=[
   {type:'depends_on',target_id:'ev-gone',target_version:'v1'},
   {type:'depends_on',target_id:'ev-1',target_version:'v999'}
 ];
 const r=await assess({m});assert.ok(codes(r).includes('LINK_TARGET_MISSING'));
 assert.ok(codes(r).includes('LINK_VERSION_MISMATCH'));
});
test('F05-BRIDGE-06 same event_id with different body is conflict, not a duplicate success',async()=>{
 const m=message(),ctx=context();ctx.known_events['ev-2']={version:'v1',digest:'0'.repeat(64)};
 const r=await assess({m,ctx});assert.ok(codes(r).includes('EVENT_ID_REUSED_WITH_NEW_CONTENT'));
});
test('F05-BRIDGE-07 repeat with same event digest returns dedup without mutation',async()=>{
 const m=message(),ctx=context();ctx.known_events['ev-2']={version:'v1',digest:sha(stable(m))};
 const r=await assess({m,ctx});assert.equal(r.result,'DUPLICATE_NO_EFFECT');
 assert.equal(r.action,'NO_EXTERNAL_EFFECT');assert.equal(r.approved,false);
});
test('F05-BRIDGE-08 incorrect citation locator is a structural block, not proof of factual support',async()=>{
 const m=message();m.citations[0].locator='synthetic:wrong';
 const r=await assess({m});assert.ok(codes(r).includes('CITATION_REGISTRY_MISMATCH'));
 assert.equal(r.actual_remote_ack,false);
});
test('F05-BRIDGE-09 forged citation usage event id is blocked',async()=>{
 const m=message();m.citations[0].usage.used_in_event_id='ev-foreign';
 const r=await assess({m});assert.ok(codes(r).includes('CITATION_USAGE_MISMATCH'));
});
test('F05-BRIDGE-10 forged ACK_CLAIM cannot become RECEIVED_ACK',async()=>{
 const m=message();m.message_kind='ACK_CLAIM';
 const r=await assess({m});assert.equal(r.actual_remote_ack,false);
 assert.equal(r.approved,false);assert.notEqual(r.result,'RECEIVED_ACK');
});
test('F05-BRIDGE-11 no trusted route: quarantine with no guessed destination',async()=>{
 const r=await assess({ctx:{...context(),receiver_endpoint_id:null}});
 assert.equal(r.result,'QUARANTINE_NO_ROUTE');assert.equal(r.action,'NO_EXTERNAL_EFFECT');
});
test('F05-BRIDGE-12 malformed source signature remains quarantined even if F05 looks valid',async()=>{
 const s=source();s.attestation.signature='bogus';
 const r=await assess({s,m:message(s)});assert.equal(r.result,'QUARANTINE_NO_ROUTE');
 assert.equal(r.review.reason,'SOURCE_BAD_SIGNATURE');
});
test('F05-BRIDGE-13 raw source text does not appear in issue-facing return summary',async()=>{
 const s=source('VERY_PRIVATE_GRAPH_TEXT_123'),m=message(s);
 m.source_digest='0'.repeat(64);
 const r=await assess({s,m});
 assert.doesNotMatch(JSON.stringify(r),/VERY_PRIVATE_GRAPH_TEXT_123/);
});
test('F05-BRIDGE-14 no unverified text/citation semantics is classified as fully passed',async()=>{
 const r=await assess();
 const byId=Object.fromEntries(r.checks.map(c=>[c.id,c]));
 assert.notEqual(byId['09'].status,'PASS'); // actual endpoint identity
 assert.notEqual(byId['11'].status,'PASS'); // semantic text sequencing
 assert.notEqual(byId['12'].status,'PASS'); // citation supporting claim
});
test('F05-BRIDGE-15 signed source and F05 message belong to separate cases: reject',async()=>{
 const m=message();m.source_ref='github:keqingwu5-cloud/ai-boundary:issue:32';
 const r=await assess({m});assert.ok(codes(r).includes('SOURCE_SCOPE_MISMATCH'));
});
test('F05-BRIDGE-16 return reasons themselves must include fixed original identity',async()=>{
 const m=message();m.sequence=99;
 const r=await assess({m});assert.equal(r.return_event.original_case_id,'case-41');
 assert.equal(r.return_event.original_task_id,'task-41');
 assert.equal(r.return_event.rejected_event_id,'ev-2');
 assert.equal(r.return_event.status,'HELD_UNVERIFIED_SENDER');
});

test('F05-BRIDGE-17 RETURN must identify rejected event and give concrete causes',async()=>{
 const m=message();m.message_kind='RETURN';
 const r=await assess({m});
 assert.ok(codes(r).includes('RETURN_CONTEXT_MISSING'));assert.equal(r.result,'QUARANTINE_NO_VERIFIED_SENDER');
});
test('F05-BRIDGE-18 RESUBMIT must retain superseded event link',async()=>{
 const m=message();m.message_kind='RESUBMIT';
 const r=await assess({m});
 assert.ok(codes(r).includes('RESUBMIT_CONTEXT_MISSING'));assert.equal(r.result,'QUARANTINE_NO_VERIFIED_SENDER');assert.equal(r.approved,false);
});
test('F05-BRIDGE-19 citation can reference a different registered source, still no semantic acceptance',async()=>{
 const m=message(),ctx=context(),otherRef='github:keqingwu5-cloud/ai-boundary:issue:32',otherHash='a'.repeat(64);
 m.citations[0].source_ref=otherRef;m.citations[0].source_version='r-other';
 m.citations[0].source_digest=otherHash;
 ctx.known_citations['cite-1']={source_ref:otherRef,source_version:'r-other',
  source_digest:otherHash,locator:'synthetic:1'};
 const r=await assess({m,ctx});
 assert.equal(r.result,'LOCAL_REVIEW_ONLY');
 assert.equal(r.checks[11].status,'UNKNOWN');assert.equal(r.actual_remote_ack,false);
});
test('F05-BRIDGE-20 citation digest must match cited registered version, not main source digest',async()=>{
 const m=message();m.citations[0].source_digest='c'.repeat(64);
 const r=await assess({m});
 assert.ok(codes(r).includes('CITATION_REGISTRY_MISMATCH'));
});
test('F05-BRIDGE-21 stated sender route is not proof of authenticated endpoint identity',async()=>{
 const r=await assess();
 assert.equal(r.independent_sender_identity_verified,false);
 assert.equal(r.checks[8].status,'UNKNOWN');
});

test('F05-BRIDGE-22 local signed source is not F05 sender identity proof',async()=>{
 const m=message();m.placement.slot='wrong-slot';
 const r=await assess({m});
 assert.equal(r.result,'QUARANTINE_NO_VERIFIED_SENDER');
 assert.equal(r.independent_sender_identity_verified,false);
 assert.equal(r.return_event.route_verified,false);
 assert.equal(r.return_event.return_to,null);
 assert.equal(r.return_event.status,'HELD_UNVERIFIED_SENDER');
 assert.ok(codes(r).includes('PLACEMENT_MISMATCH'));
});
