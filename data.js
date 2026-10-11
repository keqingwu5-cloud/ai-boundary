/* 共用資料載入器：index.html（3D 大腦）與 feed.html（短影音）都載入這個檔案。
   內容已經拆成各自的 JSON 檔（見 CONTRIBUTING.md），每個 bot 只改自己的檔案：
     content/questions.json   QUESTIONS（原文不動）          content/types.json    類型 → 顏色與圖示
     content/concepts.json    概念層（defs／patterns／tags／process）
     content/seed-extras.json 種子節點補充（SEED_EXTRAS）      content/series.json   影集順序（SERIES）
     content/media.json       種子媒體（SEED_MEDIA，scripts/publish_episode.sh 自動維護）
     patches/index.json       列出 patches/<bot>-<YYYY-MM-DD>.json；每個檔案可以有 seedPatches／seedExtras／conceptDefs
   載入完成後，全域變數（QUESTIONS、TYPES、CONCEPTS、SEED_EXTRAS、SEED_PATCHES、SERIES、SEED_MEDIA）跟以前 data.js 裡寫死的一模一樣，
   app.js／feed.js 先 await window.AI_DATA_READY 再開始。 */

/* 把各個 JSON 檔合併成以前 data.js 的那組全域資料（純函式；tests/data-split.test.mjs 也直接呼叫它） */
function aiMergeContent(f){
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const out = { QUESTIONS:f.questions, TYPES:f.types, CONCEPTS:f.concepts, SEED_EXTRAS:f.extras.slice(), SEED_PATCHES:{}, SERIES:f.series, SEED_MEDIA:f.media };
  (f.patches || []).forEach(pf => {
    Object.entries(pf.seedPatches || {}).forEach(([id, p]) => {          // 同一個節點有好幾個 bot 的補丁 → 變成陣列，依 patches/index.json 的順序套用
      if (!own(out.SEED_PATCHES, id)) out.SEED_PATCHES[id] = p;
      else out.SEED_PATCHES[id] = [].concat(out.SEED_PATCHES[id], p);
    });
    (pf.seedExtras || []).forEach(x => { if (!out.SEED_EXTRAS.some(y => y.id === x.id)) out.SEED_EXTRAS.push(x); });
    Object.entries(pf.conceptDefs || {}).forEach(([k, v]) => { if (!own(out.CONCEPTS.defs, k)) out.CONCEPTS.defs[k] = v; });   // 只加不蓋
  });
  return out;
}

window.AI_DATA_READY = (function(){
  const V = window.__V || String(Date.now());
  const get = p => fetch(p + '?v=' + V).then(r => { if (!r.ok) throw new Error('載入 ' + p + ' 失敗（' + r.status + '）'); return r.json(); });
  return Promise.all(['content/questions.json', 'content/types.json', 'content/concepts.json', 'content/seed-extras.json', 'content/series.json', 'content/media.json', 'patches/index.json'].map(get))
    .then(([questions, types, concepts, extras, series, media, idx]) =>
      Promise.all((idx.files || []).map(n => get('patches/' + n))).then(patches => aiMergeContent({ questions, types, concepts, extras, series, media, patches })))
    .then(d => { Object.assign(window, d); return d; })
    .catch(e => {
      const m = document.createElement('div');
      m.style.cssText = 'position:fixed;inset:auto 10px 10px 10px;z-index:99;padding:10px 14px;border-radius:12px;background:#3b0d16;color:#ffd5dc;font:13px system-ui';
      m.textContent = '⚠️ 種子資料載入失敗，請重新整理：' + e.message;
      (document.body || document.documentElement).appendChild(m); throw e;
    });
})();

/* 種子補丁：bot 對既有種子節點的補充（QUESTIONS 原文不動）。
   載入時合併：推理流程（flow）、反證（依 id 追加，不刪使用者的）、botNotes；
   reasoning／assumptions 只有在仍是 QUESTIONS 原始內容時才換成補丁版本。
   已套用的補丁記在 state.seedPatches（"節點id@patchId"），不會重複套用。 */
function applySeedPatch(n, st){
  const list = [].concat(SEED_PATCHES[n.id] || []); if (!list.length) return false;
  let any = false; list.forEach(p => { if (applyOnePatch(n, st, p)) any = true; }); return any;
}
function applyOnePatch(n, st, p){
  st.seedPatches = Array.isArray(st.seedPatches) ? st.seedPatches : [];
  const key = n.id + '@' + p.patchId;
  if (!n.flow) n.flow = p.flow;                       // flow is display data; re-attached every load if missing
  if (st.seedPatches.includes(key)) return false;
  const q = QUESTIONS.find(x => 'n_' + x.id === n.id);
  if (q){
    const orig = q.process.map(s => ({ k:s.k, v:s.v }));
    if (!Array.isArray(n.reasoning) || !n.reasoning.length || JSON.stringify(n.reasoning) === JSON.stringify(orig)) n.reasoning = JSON.parse(JSON.stringify(p.reasoning));
    const origA = (q.process.find(s => s.k === '前提') || {}).v || '';
    if (!n.assumptions || n.assumptions === origA) n.assumptions = p.assumptions;
  }
  n.counterEvidence = Array.isArray(n.counterEvidence) ? n.counterEvidence : [];
  (p.counterEvidence || []).forEach(c => { if (!n.counterEvidence.some(x => x.id === c.id)) n.counterEvidence.push(JSON.parse(JSON.stringify(c))); });
  n.botNotes = Array.isArray(n.botNotes) ? n.botNotes : [];
  (p.botNotes || []).forEach(b => { if (!n.botNotes.some(x => x.text === b.text)) n.botNotes.push(JSON.parse(JSON.stringify(b))); });
  st.seedPatches.push(key);
  return true;
}

/* 種子媒體：只有在節點的 media 是空的（或仍是 QUESTIONS 原本的 videoUrl/imageUrl）才會填入，使用者自己設定過的網址不會被覆蓋。 */
function applySeedMedia(n){
  const m = SEED_MEDIA[n.id]; if (!m) return false;
  if (!n.media) n.media = { video:'', image:'' };
  const q = QUESTIONS.find(x => 'n_' + x.id === n.id) || {};
  let changed = false;
  if (m.video && (!n.media.video || n.media.video === (q.videoUrl || ''))){ if (n.media.video !== m.video){ n.media.video = m.video; changed = true; } }
  if (m.image && (!n.media.image || n.media.image === (q.imageUrl || ''))){ if (n.media.image !== m.image){ n.media.image = m.image; changed = true; } }
  if (m.subtitles && !n.media.subtitles && n.media.video === m.video){ n.media.subtitles = m.subtitles; n.media.subtitlesBurnedIn = !!m.subtitlesBurnedIn; changed = true; }
  return changed;
}
