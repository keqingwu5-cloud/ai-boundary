import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {AUDIT_SECTORS,AUDIT_STREAMS} from '../proof-audit-candidate.mjs';

const base='artifacts/proof-audit-synthetic';
const get=x=>JSON.parse(readFileSync(join(base,x),'utf8'));
const sectors=[...AUDIT_SECTORS];
test('01 artifact contains exactly five different sector entries',()=>{
  const m=get('manifest.json');
  assert.equal(m.synthetic_only,true);
  assert.equal(m.real_identities_verified,false);
  assert.equal(m.deployment_approval,false);
  assert.deepEqual(m.items.map(x=>x.sector),sectors);
  assert.equal(new Set(m.items.map(x=>x.project_id)).size,5);
});
test('02 every sector/project index points to all four distinct stream folders',()=>{
  const m=get('manifest.json');
  let count=0;
  for(const item of m.items){
    const ix=get(item.project_index);
    assert.equal(ix.sector,item.sector);
    assert.equal(ix.project_id,item.project_id);
    assert.equal(ix.event_id,'synthetic:'+item.sector.toLowerCase());
    assert.deepEqual(Object.keys(ix.streams),AUDIT_STREAMS);
    for(const [stream,meta] of Object.entries(ix.streams)){
      const expectedDir='logs/'+item.sector+'/'+item.project_id+'/'+stream;
      assert.equal(meta.relative_folder,expectedDir);
      assert.ok(meta.current_file.startsWith(expectedDir+'/2026-11-13__revision-'));
      assert.ok(existsSync(join(base,meta.current_file)));
      const file=get(meta.current_file);
      assert.equal(file.synthetic_only,true);
      const j=file.journal;
      assert.equal(j.sector,item.sector);
      assert.equal(j.project_id,item.project_id);
      assert.equal(j.event_id,ix.event_id);
      assert.equal(j.stream,stream);
      assert.equal(j.proof_id,item.proof_id);
      assert.equal(j.revision,2);
      assert.equal(file.local_verification.local_chain_consistent,true);
      assert.equal(j.expected_due,'2026-11-20');
      assert.equal(j.last_observed_on,'2026-11-13');
      assert.equal(j.review_approved,false);
      assert.equal(j.identity_verified,false);
      assert.equal(j.notification,'NOT_SENT');
      count++;
    }
  }
  assert.equal(count,20);
});
test('03 water and electricity delays have dated reason and separate due dates',()=>{
  for(const sector of ['WATER','ELECTRICITY']){
    const p='pilot_'+sector.toLowerCase();
    const ix=get('logs/'+sector+'/'+p+'/index.json');
    for(const stream of ['AUTOMATION','REASONING_SUMMARY']){
      const f=get(ix.streams[stream].current_file).journal;
      assert.equal(f.progress_status,'DELAYED');
      assert.equal(f.expected_due,'2026-11-20');
      assert.equal(f.forecast_due,'2026-11-26');
      assert.equal(f.days_shifted,6);
      assert.equal(f.delay_reason_code,'SYNTHETIC_EXTERNAL_DEPENDENCY');
      assert.ok(f.expected_progress_percent>f.actual_progress_percent);
      assert.equal(f.progress_variance_percent,f.actual_progress_percent-f.expected_progress_percent);
    }
  }
});
test('04 all other synthetic records are not silently labelled delayed',()=>{
  for(const sector of sectors){
    const ix=get('logs/'+sector+'/pilot_'+sector.toLowerCase()+'/index.json');
    for(const [stream,item] of Object.entries(ix.streams)){
      const j=get(item.current_file).journal;
      if(['WATER','ELECTRICITY'].includes(sector)&&
         ['AUTOMATION','REASONING_SUMMARY'].includes(stream))continue;
      assert.equal(j.progress_status,'IN_PROGRESS');
      assert.equal(j.delay_reason_code,null);
      assert.equal(j.days_shifted,0);
      assert.equal(j.forecast_due,'2026-11-20');
    }
  }
});
test('05 same stream name in different projects does not share a path or journal ID',()=>{
  const m=get('manifest.json');const paths=new Set(),ids=new Set();
  for(const item of m.items){
    const ix=get(item.project_index);
    for(const info of Object.values(ix.streams)){
      assert.ok(!paths.has(info.current_file));paths.add(info.current_file);
      assert.ok(!ids.has(info.journal_id));ids.add(info.journal_id);
      assert.ok(!info.current_file.includes('..'));
    }
  }
  assert.equal(paths.size,20);
  assert.equal(ids.size,20);
});
test('06 exported progress journals contain no raw source data or private model reasoning',()=>{
  const m=get('manifest.json');
  for(const item of m.items){
    const ix=get(item.project_index);
    for(const x of Object.values(ix.streams)){
      const file=get(x.current_file);
      assert.equal(file.journal.persistence,'IN_MEMORY_ONLY');
      assert.ok(!('private_chain_of_thought' in file.journal));
      assert.ok(!('memory_payload' in file.journal));
      assert.ok(file.journal.entries.every(e=>e.kind==='PLAN_REGISTERED'||e.kind==='PROGRESS_OBSERVATION'));
    }
  }
});
