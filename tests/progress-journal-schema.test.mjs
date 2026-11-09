import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createControlCycle} from '../control-cycle-candidate.mjs';
import {createProofAudit,AUDIT_STREAMS,AUDIT_SECTORS} from '../proof-audit-candidate.mjs';
import {createProgressJournals,JOURNAL_SCHEMA,PROGRESS_STATES} from '../progress-journal-candidate.mjs';
const schema=JSON.parse(readFileSync(new URL('../schemas/progress-journal.preview.schema.json',import.meta.url),'utf8'));
async function sample(){
  const c=createControlCycle();c.registerDomain({domain_id:'power',contract_revision:'r1'});
  await c.observe({event_id:'event1',domain_id:'power',source_id:'s1',revision:'r1',source_hash:'a'.repeat(64)});
  const a=createProofAudit({control:c});
  await a.openProof({proof_id:'proof1',event_id:'event1',expected_control_version:1,
    sector:'ELECTRICITY',created_by_claim:'author',scope_ref:'scope'});
  const j=createProgressJournals({audit:a});
  await j.createJournal({journal_id:'j1',project_id:'p1',proof_id:'proof1',sector:'ELECTRICITY',
    stream:'WORLD_MODEL',expected_start:'2026-11-09',expected_due:'2026-11-20',plan_ref:'plan'});
  return j.readJournal('j1');
}
test('01 exact runtime fields correspond to machine schema',async()=>{
  const j=await sample();
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties,false);
  assert.deepEqual(Object.keys(j).sort(),schema.required.slice().sort());
  assert.equal(schema.properties.schema.const,JOURNAL_SCHEMA);
});
test('02 status, sector, stream enumerations preserve prior contract names',async()=>{
  const j=await sample();
  assert.deepEqual(schema.properties.sector.enum,AUDIT_SECTORS);
  assert.deepEqual(schema.properties.stream.enum,AUDIT_STREAMS);
  assert.deepEqual(schema.properties.progress_status.enum,PROGRESS_STATES);
  assert.equal(j.sector,'ELECTRICITY');
  assert.equal(j.stream,'WORLD_MODEL');
});
test('03 candidate cannot assert real approval, durable storage or notification',async()=>{
  const j=await sample();
  assert.equal(j.decision,'HOLD');
  assert.equal(j.authority,'none');
  assert.equal(j.review_approved,false);
  assert.equal(schema.properties.notification.const,'NOT_SENT');
  assert.equal(schema.properties.persistence.const,'IN_MEMORY_ONLY');
  assert.ok(schema.required.includes('expected_due'));
  assert.ok(schema.required.includes('forecast_due'));
  assert.ok(schema.required.includes('days_shifted'));
  assert.ok(schema.required.includes('last_observed_on'));
});
