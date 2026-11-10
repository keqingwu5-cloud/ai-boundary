import assert from 'node:assert/strict';
import {auditTriadSixRounds, TRIAD_MATCH_SCHEMA, TRIAD_PLAYERS,
  TRIAD_FAMILIES} from '../triad-six-round-audit-candidate.mjs';

const SHA='b'.repeat(40);
const make=(winners=['CARA_PROXY','OPENSPIEL_PROXY','FIRST_BRAIN_PROXY',
  'CARA_PROXY','OPENSPIEL_PROXY','FIRST_BRAIN_PROXY'])=>({
  schema: TRIAD_MATCH_SCHEMA, match_id:'synth-m01', origin:'SYNTHETIC_PROXY',
  environment_sha:SHA,
  rounds:Array.from({length:6}, (_,i)=>({
    round:i+1, family:TRIAD_FAMILIES[Math.floor(i/2)],
    seats:Object.fromEntries(TRIAD_PLAYERS.map((p,j)=>[p,(i+j)%3])),
    declared_winner:winners[i], round_ref:'synth-round-'+(i+1),
    record_type:'SYNTHETIC_DEMONSTRATION'
  }))
});
const inspect=(x, expectedEnvironmentSha=SHA)=>auditTriadSixRounds(x,{expectedEnvironmentSha});
let passed=0;
function test(name,check) {
  try {check();passed++;console.log('PASS: '+name);}
  catch(e) {console.error('FAIL: '+name);throw e;}
}
function reject(name,mutate,code) {
  test(name,()=>{
    const x=make(); mutate(x);
    const out=inspect(x);
    assert.equal(out.status,'blocked'); assert.equal(out.reason,code);
    assert.equal(out.promotion,'NOT_GRANTED');
  });
}
test('2:2:2 tie does not generate an official champion',()=>{
  const out=inspect(make());
  assert.equal(out.status,'candidate_only');
  assert.deepEqual(Object.values(out.round_wins),[2,2,2]);
  assert.equal(out.sole_wins_leader_candidate,null);
  assert.equal(out.tie_status,'TIE_PENDING_PREDECLARED_TIEBREAK');
  assert.equal(out.promotion,'NOT_GRANTED');
});
test('unique wins leader is only a candidate; not an approval',()=>{
  const out=inspect(make(['CARA_PROXY','OPENSPIEL_PROXY','FIRST_BRAIN_PROXY',
    'CARA_PROXY','FIRST_BRAIN_PROXY','FIRST_BRAIN_PROXY']));
  assert.equal(out.sole_wins_leader_candidate,'FIRST_BRAIN_PROXY');
  assert.equal(out.tie_status,'UNIQUE_WINS_LEADER_CANDIDATE');
  assert.equal(out.promotion,'NOT_GRANTED');
  assert.equal(out.real_software_execution,'NOT_VERIFIED');
});
test('CARA can also be a unique wins leader',()=>{
  const out=inspect(make(['CARA_PROXY','CARA_PROXY','FIRST_BRAIN_PROXY',
    'CARA_PROXY','OPENSPIEL_PROXY','CARA_PROXY']));
  assert.equal(out.sole_wins_leader_candidate,'CARA_PROXY');
});
test('OpenSpiel can also be a unique wins leader',()=>{
  const out=inspect(make(['OPENSPIEL_PROXY','OPENSPIEL_PROXY','FIRST_BRAIN_PROXY',
    'CARA_PROXY','OPENSPIEL_PROXY','OPENSPIEL_PROXY']));
  assert.equal(out.sole_wins_leader_candidate,'OPENSPIEL_PROXY');
});
test('draw is not counted as individual win',()=>{
  const out=inspect(make([null,null,null,null,null,null]));
  assert.deepEqual(Object.values(out.round_wins),[0,0,0]);
  assert.equal(out.drawn_rounds,6);
  assert.equal(out.sole_wins_leader_candidate,null);
});
test('external expected environment SHA required',()=>{
  assert.equal(auditTriadSixRounds(make()).reason,'EXPECTED_ENVIRONMENT_SHA_REQUIRED');
});
test('source SHA changed after run is stale',()=>{
  assert.equal(inspect(make(),'a'.repeat(40)).reason,'ENVIRONMENT_SHA_STALE');
});
reject('reject claimed official promotion field', x=>x.official_winner='FIRST_BRAIN_PROXY','MATCH_CONTRACT_INVALID');
reject('reject missing sixth round', x=>x.rounds.pop(),'SIX_ROUNDS_REQUIRED');
reject('reject swapped round order', x=>{x.rounds[0].round=2;},'ROUND_CONTRACT_INVALID');
reject('reject wrong scenario family', x=>{x.rounds[2].family='ASYMMETRIC_INFO';},'ROUND_CONTRACT_INVALID');
reject('reject two seats equal in same round', x=>{x.rounds[0].seats.OPENSPIEL_PROXY=0;},'ROUND_CONTRACT_INVALID');
reject('reject globally imbalanced seat rotation', x=>{
  x.rounds[1].seats= {...x.rounds[0].seats};
},'SEAT_BALANCE_INVALID');
reject('reject missing first-brain seat', x=>{delete x.rounds[0].seats.FIRST_BRAIN_PROXY;},'ROUND_CONTRACT_INVALID');
reject('reject extra hidden truth field', x=>{x.rounds[0].secret_utility=999;},'ROUND_CONTRACT_INVALID');
reject('reject fake player claimed as winner', x=>{x.rounds[0].declared_winner='GROK';},'ROUND_CONTRACT_INVALID');
reject('reject duplicate evidence round ref', x=>{x.rounds[1].round_ref=x.rounds[0].round_ref;},'ROUND_CONTRACT_INVALID');
reject('reject real-world fact assertion', x=>{x.rounds[0].record_type='OBSERVED_REALITY';},'ROUND_CONTRACT_INVALID');
test('reported summaries do not mutate source input',()=>{
  const x=make(),before=JSON.stringify(x);
  const out=inspect(x);out.round_wins.CARA_PROXY=100;
  assert.equal(JSON.stringify(x),before);
});
console.log('SUMMARY: '+passed+' passed, 0 failed (static six-round audit only)');
