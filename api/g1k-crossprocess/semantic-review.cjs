'use strict';
/* EXPLICITLY a lexical negative-case oracle, NOT natural-language understanding. */
const fs=require('node:fs');
const norm=s=>String(s||'').normalize('NFKC').toLowerCase();
function inspectAfterBlindPrecommit({sourcePath,receiverSummary,g1Understanding,g1Plan,precommitPublishedAt,g1RevealAt}){
 const t1=Date.parse(precommitPublishedAt),t2=Date.parse(g1RevealAt);
 if(!Number.isFinite(t1)||!Number.isFinite(t2)||t1>=t2)return {
  status:'BLOCKED',reason:'SEMANTIC_REVIEW_ORDER_UNPROVEN',actual_gpt2_ack_verified:false};
 const source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
 if(source.synthetic_only!==true||!Array.isArray(source.must_preserve))return {
  status:'BLOCKED',reason:'SOURCE_CONSTRAINTS_MISSING',actual_gpt2_ack_verified:false};
 const terms=source.must_preserve.filter(s=>typeof s==='string'&&s.length>2);
 const g1text=norm(String(g1Understanding||'')+' '+String(g1Plan||''));
 const g2text=norm(receiverSummary);
 const g1_missing=terms.filter(term=>!g1text.includes(norm(term)));
 const synthetic_receiver_missing=terms.filter(term=>!g2text.includes(norm(term)));
 return {status:'NEEDS_HUMAN_SEMANTIC_REVIEW',
  lexical_gap_detected:g1_missing.length>0||synthetic_receiver_missing.length>0,
  g1_missing,synthetic_receiver_missing,source_goal:source.original_goal,
  actual_gpt2_ack_verified:false,semantic_alignment_verified:false,
  note:'Exact-term coverage is NOT an independent semantic assessment.'};
}
module.exports={inspectAfterBlindPrecommit};
