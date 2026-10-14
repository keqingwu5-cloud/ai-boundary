/* TCVL traceback evaluation helpers: isolated, deterministic, no I/O or vault access. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TcvlTracebackCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'tcvl.traceback-case.v1';
  const OUTCOMES = new Set(['pass', 'fail', 'unknown', 'invalid']);
  const KINDS = new Set(['submitted', 'reviewed', 'approved', 'rejected', 'suspended', 'restored', 'corrected']);
  const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
  const validTime = value => typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value.slice(0, 19));
  const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 120;
  const known = (id, ids) => validId(id) && ids.has(id);
  const caseRecord = x => x && typeof x === 'object' && !Array.isArray(x);

  function validateHistory(h) {
    const errors = [];
    if (!caseRecord(h) || h.schema !== SCHEMA) return ['schema_invalid'];
    for (const field of ['records', 'events', 'edges']) {
      if (!Array.isArray(h[field]) || h[field].length > 5000) errors.push(field + '_invalid');
    }
    if (errors.length) return errors;
    const ids = new Set(), eventIds = new Set();
    for (const r of h.records) {
      if (!caseRecord(r) || !validId(r.id) || ids.has(r.id) || !validTime(r.createdAt) || !validTime(r.recordedAt) || Date.parse(r.recordedAt) < Date.parse(r.createdAt) || !['evidence','claim','memory','task','revision'].includes(r.type)) {
        errors.push('record_invalid'); continue;
      }
      ids.add(r.id);
      if (r.source && (!caseRecord(r.source) || typeof r.source.claimedActor !== 'string' || typeof r.source.verified !== 'boolean')) errors.push('source_invalid:' + r.id);
    }
    for (const e of h.events) {
      if (!caseRecord(e) || !validId(e.id) || eventIds.has(e.id) || !known(e.recordId,ids) || !KINDS.has(e.kind) || !validTime(e.happenedAt) || !validTime(e.recordedAt) || Date.parse(e.recordedAt) < Date.parse(e.happenedAt)) {
        errors.push('event_invalid'); continue;
      }
      eventIds.add(e.id);
    }
    for (const edge of h.edges) {
      if (!caseRecord(edge) || !known(edge.from,ids) || !known(edge.to,ids) || edge.from === edge.to || !['depends_on','related_to','supersedes'].includes(edge.type) || !validTime(edge.recordedAt)) errors.push('edge_invalid');
    }
    return errors;
  }

  function ensureHistory(h) {
    const errors = validateHistory(h);
    if (errors.length) throw Error('歷史資料驗證失敗：' + [...new Set(errors)].join(', '));
  }
  function ensureCutoff(cutoff) {
    if (!validTime(cutoff)) throw Error('截止時間格式錯誤（必須為 UTC ISO 時間）');
    return Date.parse(cutoff);
  }
  function replayAt(history, cutoff) {
    ensureHistory(history);
    const t = ensureCutoff(cutoff);
    const records = history.records.filter(r => Date.parse(r.createdAt) <= t && Date.parse(r.recordedAt) <= t);
    const ids = new Set(records.map(r => r.id));
    const events = history.events.filter(e => ids.has(e.recordId) && Date.parse(e.happenedAt) <= t && Date.parse(e.recordedAt) <= t)
      .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || Date.parse(a.happenedAt) - Date.parse(b.happenedAt) || a.id.localeCompare(b.id));
    const latest = new Map();
    for (const e of events) latest.set(e.recordId, {eventId:e.id,kind:e.kind,recordedAt:e.recordedAt});
    const edges = history.edges.filter(e => Date.parse(e.recordedAt) <= t && ids.has(e.from) && ids.has(e.to));
    return {cutoff, records:records.map(r=>({...r, latest:latest.get(r.id) || null})), events, edges};
  }

  function impactOf(history, recordId, cutoff) {
    const snapshot = replayAt(history, cutoff);
    if (!snapshot.records.some(r => r.id === recordId)) throw Error('指定資料於此截止時間不存在');
    const visited = new Set([recordId]);
    let frontier = [recordId];
    const affected = [];
    for (let depth=1; frontier.length; depth++) {
      const next = [];
      for (const target of frontier) for (const link of snapshot.edges) {
        if (link.type !== 'depends_on' || link.to !== target || visited.has(link.from)) continue;
        visited.add(link.from);next.push(link.from);
        const record = snapshot.records.find(r => r.id === link.from);
        affected.push({id:link.from, depth, status:record.latest?.kind === 'suspended' ? 'paused' : 'needs_review'});
      }
      frontier = next;
    }
    return {source:recordId, affected, unaffected:snapshot.records.map(r=>r.id).filter(id=>!visited.has(id))};
  }

  function tripleCheck(tests) {
    const names = ['direction','evidence','variations'];
    const details=[];
    for (const name of names) {
      const v=tests && tests[name];
      if (!caseRecord(v) || !OUTCOMES.has(v.outcome) || !validId(v.reason)) throw Error('三項測試缺少結果或具體原因：' + name);
      details.push({name,outcome:v.outcome,reason:v.reason});
    }
    let decision;
    if (details.some(x=>x.outcome==='invalid')) decision='test_invalid';
    else if (details.some(x=>x.outcome==='fail')) decision='return_for_revision';
    else if (details.some(x=>x.outcome==='unknown')) decision='hold_for_evidence';
    else decision='eligible_for_human_review';
    const targets = [];
    if (tests.direction.outcome !== 'pass') targets.push('GPT1');
    if (tests.evidence.outcome !== 'pass') targets.push('GPT2');
    if (tests.variations.outcome !== 'pass') targets.push('BOT3');
    return {decision, details, returnTargets:targets, canAutoApprove:false};
  }

  function reviewRejectedReuse(history, proposal, cutoff) {
    const snapshot = replayAt(history, cutoff);
    const prior = snapshot.records.find(r=>r.id===proposal?.reusesRecordId);
    if (!prior || prior.latest?.kind !== 'rejected') return {decision:'invalid_reference',reasons:['未找到截止時間前已被拒絕的原始紀錄']};
    const reasons=[];
    if (!validId(proposal.purpose)) reasons.push('缺少重新使用目的');
    if (!validId(proposal.originalRejectionReason)) reasons.push('缺少原始否決理由');
    if (!Array.isArray(proposal.newEvidenceIds) || !proposal.newEvidenceIds.length || proposal.newEvidenceIds.some(id=>!snapshot.records.some(r=>r.id===id && r.type==='evidence'))) reasons.push('缺少可追溯的新證據');
    if (!Array.isArray(proposal.remainingCounterEvidenceIds)) reasons.push('未聲明仍然成立的反證');
    if (!validId(proposal.retestScope)) reasons.push('缺少重測範圍');
    if (!validId(proposal.responsibleActor)) reasons.push('缺少歸因責任欄位');
    return {decision:reasons.length?'hold_for_repair':'eligible_for_recheck',reasons,canAutoApprove:false};
  }

  function compareRetests(baseline, candidate) {
    const fields=['caseId','protocolId','datasetCutoff'];
    if (!caseRecord(baseline)||!caseRecord(candidate)||fields.some(k=>!validId(baseline[k])||baseline[k]!==candidate[k]) || !OUTCOMES.has(baseline.outcome) || !OUTCOMES.has(candidate.outcome))
      return {comparable:false,change:'incomparable',reason:'研究案例、測試標準、資料截止時間或結果格式不一致'};
    if ([baseline.outcome,candidate.outcome].some(s=>s==='unknown'||s==='invalid'))
      return {comparable:false,change:'undetermined',reason:'存在未判定或無效測試，不可宣稱改善'};
    const change=baseline.outcome===candidate.outcome?'unchanged':candidate.outcome==='pass'?'improved':'regressed';
    return {comparable:true,change,reason:'僅代表指定同條件測試結果的比較，不能直接外推其他情境'};
  }

  function validateMovement(event) {
    const errors=[];
    if (!caseRecord(event)||!validId(event.id)||!validId(event.recordId)) errors.push('movement_identity_invalid');
    if (!['import','export','feedback','backup','restore'].includes(event?.direction)) errors.push('movement_direction_invalid');
    if (!validId(event?.from)||!validId(event?.to)) errors.push('movement_path_invalid');
    if (!validTime(event?.happenedAt)||!validTime(event?.recordedAt)||Date.parse(event.recordedAt)<Date.parse(event.happenedAt)) errors.push('movement_time_invalid');
    if (!validId(event?.version)||!validId(event?.checksum)) errors.push('movement_version_or_integrity_missing');
    if (!validId(event?.validationResult)) errors.push('movement_validation_missing');
    return {valid:errors.length===0,errors};
  }

  return {SCHEMA,validateHistory,replayAt,impactOf,tripleCheck,reviewRejectedReuse,compareRetests,validateMovement};
});