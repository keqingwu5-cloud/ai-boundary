/* Memory governance helpers. Local-only; no network, storage or secrets. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MemoryWorkflowCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const PACK_SCHEMA = "ai-boundary.memory-pack.v1";
  const levels = new Set(["hypothesis", "fact", "derived", "inference", "forecast"]);
  const simplify = s => String(s || "").normalize("NFKC").toLowerCase().replace(/[\s.,，。;；:：!?！？"'“”‘’、()\[\]]+/g, "");
  const bounded = (s, n) => typeof s === "string" && s.length > 0 && s.length <= n;
  function validatePack(p) {
    if (!p || p.schema !== PACK_SCHEMA || !Array.isArray(p.items) || p.items.length < 1 || p.items.length > 30)
      throw Error("記憶包格式或筆數不符（1–30筆）");
    const ids = new Set();
    for (const item of p.items) {
      if (!item || !bounded(item.id, 80) || ids.has(item.id)) throw Error("記憶包識別碼無效或重複");
      ids.add(item.id);
      for (const [key, limit] of [["question", 3000], ["purpose", 3000], ["content", 12000], ["reason", 8000]]) {
        if (!bounded(item[key], limit)) throw Error("記憶內容欄位無效：" + key);
      }
      if (typeof item.evidence !== "string" || item.evidence.length > 8000) throw Error("來源欄位無效");
      if (item.eventType && item.eventType !== "new_question") throw Error("目前僅支援新增獨立候選");
      if (!levels.has(item.evidenceLevel || "hypothesis")) throw Error("證據層級無效");
    }
    return p.items;
  }
  function planImport(pack, state) {
    const rows = validatePack(pack);
    const accepted = [], duplicated = [], conflicts = [];
    const seen = new Set();
    const existing = [
      ...(state.candidates || []).map(c => ({id:c.id, question:c.question, content:c.content, originId:c.originId,
        purpose:c.purpose, evidence:c.evidence, evidenceLevel:c.evidenceLevel, originReason:c.originReason})),
      ...(state.memories || []).map(m => ({id:m.id, question:m.question, content:m.versions?.at(-1)?.content}))
    ];
    for (const item of rows) {
      const key = simplify(item.question);
      const same = existing.filter(c => simplify(c.question) === key);
      const oldByOrigin = existing.find(c => c.originId === item.id);
      const exact = same.find(c => simplify(c.content) === simplify(item.content));
      // Reused provenance ID with changed content is not an exact duplicate.
      // The same provenance ID must not hide a changed known evidence record.
      // Legacy rows without these optional fields retain their old duplicate contract.
      const sourceFields={purpose:item.purpose,evidence:item.evidence,
        evidenceLevel:item.evidenceLevel||"hypothesis",originReason:item.reason};
      const knownFieldChanged=oldByOrigin&&Object.keys(sourceFields).some(k=>
        typeof oldByOrigin[k]==="string" && oldByOrigin[k]!==sourceFields[k]);
      if(oldByOrigin && (oldByOrigin.question!==item.question ||
        oldByOrigin.content!==item.content || knownFieldChanged))
        throw Error("相同來源 ID 對應不同內容：來源版本衝突，停止匯入並要求人工核對");
      if (oldByOrigin || exact || seen.has(key + "\u241f" + simplify(item.content))) {
        duplicated.push(item.id);
      } else {
        seen.add(key + "\u241f" + simplify(item.content));
        const possible = same.map(c => c.id).filter(Boolean);
        // Intra-pack conflicts must be visible to BOTH candidates. Previously
        // only the persisted vault was scanned, silently missing batch peers.
        const batchPeers = accepted.filter(row => simplify(row.item.question) === key);
        const batchRefs = batchPeers.map(row => row.item.id);
        for (const row of batchPeers) {
          row.possibleBatchConflictWith.push(item.id);
          if (!conflicts.includes(row.item.id)) conflicts.push(row.item.id);
        }
        accepted.push({item, possibleConflictWith:possible, possibleBatchConflictWith:batchRefs});
        if ((possible.length || batchRefs.length) && !conflicts.includes(item.id)) conflicts.push(item.id);
      }
    }
    return {accepted, duplicated, conflicts};
  }
  function matchScore(q, input) {
    const query = simplify(q), hay = simplify(input);
    if (query.length < 2 || !hay) return 0;
    if (hay.includes(query)) return 50;
    const words = String(q).split(/[\s，,。／\/、；;：:!?！？]+/).map(simplify).filter(x => x.length >= 2);
    let score = 0;
    for (const w of words) if (hay.includes(w)) score += Math.min(20, 4 + w.length * 2);
    if (score > 0) return score;
    if (query.length >= 4) {
      let matching = 0;
      const grams = new Set();
      for (let i = 0; i < query.length - 1; i++) grams.add(query.slice(i, i + 2));
      for (const g of grams) if (hay.includes(g)) matching++;
      return matching >= 2 ? matching : 0;
    }
    return 0;
  }
  function recall(query, state, maxResults = 5) {
    const q = String(query || "").trim();
    if (q.length < 2) return [];
    const rows = [];
    for (const m of state.memories || []) {
      const v = (m.versions || []).at(-1);
      if (!v) continue;
      const score = matchScore(q, [m.question,m.purpose,v.content,v.evidence].join(" "));
      if (score) rows.push({id:m.id,type:"approved",title:m.question,content:v.content,evidence:v.evidence || "",score});
    }
    const rejectionContext = /拒絕|被拒|失敗|阻塞|卡住|錯誤|踩坑/.test(q);
    const pendingContext = /未完成|待辦|進度|任務|阻塞/.test(q);
    // Status hints may boost a TOPIC hit, never manufacture unrelated matches.
    // Pure status queries retain their original "show status" utility.
    const topicQuery = q.replace(/被拒|拒絕|失敗|阻塞|卡住|錯誤|踩坑|未完成|待辦|進度|任務/g," ").trim();
    for (const c of state.candidates || []) {
      if (!["pending","rejected"].includes(c.status)) continue;
      let score = topicQuery
        ? matchScore(topicQuery,[c.question,c.purpose,c.content,c.reason,c.review?.reason || ""].join(" "))
        : 0;
      if (score && c.status === "rejected" && rejectionContext) score += 5;
      if (score && c.status === "pending" && pendingContext) score += 2;
      if (!topicQuery && c.status === "rejected" && rejectionContext) score = 5;
      if (!topicQuery && c.status === "pending" && pendingContext) score = 2;
      if (score) rows.push({id:c.id,type:c.status,title:c.question,content:c.content,evidence:c.review?.reason || c.evidence || "",score});
    }
    for (const p of processLatest(state.audit || [])) {
      let score = matchScore(q,[p.taskTitle,p.reason,p.nextAction,p.actor,p.status].join(" "));
      if ((p.status === "blocked" || p.status === "refused") && /阻塞|拒絕|失敗|卡住/.test(q)) score += 5;
      if (score) rows.push({id:p.ref,type:"process_" + p.status,title:p.taskTitle,content:p.reason,evidence:p.nextAction,score});
    }
    return rows.sort((a,b) => b.score-a.score).slice(0,Math.max(1,Math.min(10,maxResults)));
  }
  function processLatest(audit) {
    // The UI unshifts new events, but restored arrays may be in reverse order.
    // Use the newer dated record when both dates are valid; preserve input order
    // for legacy undated/tied events, without mutating the source audit.
    const latestByRef = new Map(), rows = [];
    for (const x of audit) {
      if (!x || x.kind !== "workflow.recorded" || !x.ref) continue;
      const prior = latestByRef.get(x.ref);
      if (!prior) { latestByRef.set(x.ref, x); continue; }
      const priorTime = Date.parse(prior.at), nextTime = Date.parse(x.at);
      if (Number.isFinite(priorTime) && Number.isFinite(nextTime) && nextTime > priorTime)
        latestByRef.set(x.ref, x);
    }
    for (const x of latestByRef.values()) {
      rows.push({ref:x.ref,taskTitle:x.taskTitle || x.summary || "",actor:x.actor || "",status:x.status || "unknown",reason:x.reason || "",nextAction:x.nextAction || "",at:x.at || ""});
    }
    return rows;
  }
  return {PACK_SCHEMA,validatePack,planImport,recall,processLatest};
});
