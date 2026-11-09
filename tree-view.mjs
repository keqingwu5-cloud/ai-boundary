import { buildTree, readSnapshot, STORAGE_KEY } from './tree-view-model.mjs';
import { syntheticBrainSnapshot } from './tree-view-demo.mjs';

const $ = id => document.getElementById(id);
const treeEl = $('tree'), detailEl = $('detail'), countsEl = $('counts');
const statusEl = $('status'), errorsEl = $('errors'), searchEl = $('search');
let view = null, selectedId = null;
const collapsed = new Set();

function el(tag, value, className = '') {
  const result = document.createElement(tag);
  result.textContent = String(value ?? '');
  if (className) result.className = className;
  return result;
}
function button(label, className, action) {
  const b = el('button', label, className);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
}
function message(str, error = false) {
  statusEl.textContent = str;
  statusEl.dataset.error = String(error);
}
function urlForNode(id) { return './index.html#node=' + encodeURIComponent(id); }
function parseNodeHash() {
  if (!location.hash.startsWith('#node=')) return null;
  try { return decodeURIComponent(location.hash.slice(6)); } catch { return null; }
}
function matches(node, query) {
  if (!query) return true;
  return [node.title, node.oneLiner, node.type, node.id]
    .some(v => String(v || '').toLocaleLowerCase().includes(query));
}
function containsNode(node, query) {
  return matches(node, query) || node.children.some(child => containsNode(child, query));
}
function containsBrain(brain, query) {
  return String(brain.name || '').toLocaleLowerCase().includes(query) ||
    brain.nodeForest.some(n => containsNode(n, query)) ||
    brain.children.some(child => containsBrain(child, query));
}
function addField(parent, label, value) {
  if (value == null || value === '') return;
  const dl = el('dl', '', 'field');
  dl.append(el('dt', label), el('dd', value));
  parent.append(dl);
}
function safeSourceUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null;
  } catch { return null; }
}
function showDetail() {
  detailEl.replaceChildren();
  if (!view || !selectedId || !view.nodeIndex.has(selectedId)) {
    detailEl.append(el('p', '選擇左側節點查看來源、前提與相關連結。', 'empty'));
    return;
  }
  const n = view.nodeIndex.get(selectedId);
  detailEl.append(el('span', n.kind === 'direction' ? '新方向' : n.kind === 'extension' ? '延伸問題' : '主問題', 'pill'));
  detailEl.append(el('h3', n.title || '未命名節點'));
  addField(detailEl, '節點 ID', n.id);
  addField(detailEl, '研究狀態（本機自述）',
    ({ open:'待研究', researching:'研究中', resolved:'已有結論' })[n.status] || n.status || '未知');
  addField(detailEl, '簡述', n.oneLiner);
  addField(detailEl, '所屬腦區', view.brainIndex.get(n.brainId)?.name || n.brainId || 'UNKNOWN');
  addField(detailEl, '父節點 ID', n.parentId || '無');
  addField(detailEl, '前提假設', n.assumptions);
  const source = n.source && typeof n.source === 'object' ? n.source : null;
  if (source) {
    addField(detailEl, '來源', [source.who, source.outlet, source.date].filter(Boolean).join(' · ') || '未填寫');
    const target = safeSourceUrl(source.url);
    if (target) {
      const dl = el('dl', '', 'field'), dd = el('dd', '');
      const a = el('a', '開啟原始來源');
      a.href = target;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      dd.append(a);
      dl.append(el('dt', '來源連結'), dd);
      detailEl.append(dl);
    }
  } else addField(detailEl, '來源', '未附來源；此節點內容不視為已驗證事實');
  addField(detailEl, '既有反證數量', Array.isArray(n.counterEvidence) ? String(n.counterEvidence.length) : 'UNKNOWN');
  const cross = view.crossLinks.filter(l => l.from === n.id || l.to === n.id);
  if (cross.length) addField(detailEl, '跨領域連結（非因果）',
    cross.map(l => l.from === n.id ? l.to : l.from).join('、'));
  const a = el('a', '在原 3D 大腦開啟此節點', 'button');
  a.href = urlForNode(n.id);
  detailEl.append(a);
  detailEl.append(el('p', '此頁呈現既有本機資料，不驗證來源真實性、不修改節點或記憶。', 'small'));
}
function selectNode(id) {
  selectedId = id;
  // URL view state is not a write to aiBrain.v1.
  const dest = new URL(location.href);
  dest.hash = 'node=' + encodeURIComponent(id);
  history.replaceState(null, '', dest.href);
  showDetail();
  treeEl.querySelectorAll('.node-button').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.nodeId === selectedId)));
}
function renderNode(n, query) {
  if (!containsNode(n, query)) return null;
  const li = el('li', '');
  const row = el('div', '', 'tree-row');
  const hasChildren = n.children.some(x => containsNode(x, query));
  const toggle = button(collapsed.has(n.id) && !query ? '＋' : '−', 'toggle', () => {
    if (collapsed.has(n.id)) collapsed.delete(n.id);
    else collapsed.add(n.id);
    renderTree();
  });
  toggle.disabled = !hasChildren;
  toggle.setAttribute('aria-label', (collapsed.has(n.id) ? '展開 ' : '收合 ') + (n.title || n.id) + ' 子節點');
  toggle.setAttribute('aria-expanded', String(hasChildren && (!collapsed.has(n.id) || Boolean(query))));
  const label = button('', 'node-button', () => selectNode(n.id));
  label.dataset.nodeId = n.id;
  label.setAttribute('aria-current', String(selectedId === n.id));
  label.append(el('span', n.kind === 'direction' ? '◇' : n.kind === 'extension' ? '↳' : '●', 'node-marker'));
  label.append(document.createTextNode(n.title || n.id));
  row.append(toggle, label);
  li.append(row);
  if (hasChildren && (!collapsed.has(n.id) || query)) {
    const ul = el('ul', '');
    n.children.forEach(child => {
      const childEl = renderNode(child, query);
      if (childEl) ul.append(childEl);
    });
    li.append(ul);
  }
  return li;
}
function renderBrain(brain, query) {
  if (!containsBrain(brain, query)) return null;
  const li = el('li', '', 'brain-entry');
  const head = el('div', '', 'brain-summary');
  head.append(el('span', '🧠', 'brain-icon'));
  head.append(el('span', brain.name));
  head.append(el('span', String(brain.nodeCount) + ' 節點', 'brain-meta'));
  li.append(head);
  const ul = el('ul', '');
  const showAll = !query || brain.name.toLocaleLowerCase().includes(query);
  const localQuery = showAll ? '' : query;
  brain.nodeForest.forEach(n => {
    const nodeEl = renderNode(n, localQuery);
    if (nodeEl) ul.append(nodeEl);
  });
  brain.children.forEach(child => {
    const childEl = renderBrain(child, query);
    if (childEl) ul.append(childEl);
  });
  li.append(ul);
  return li;
}
function renderTree() {
  treeEl.replaceChildren();
  if (!view) return;
  const query = searchEl.value.trim().toLocaleLowerCase();
  const ul = el('ul', '');
  view.brainForest.forEach(brain => {
    const childEl = renderBrain(brain, query);
    if (childEl) ul.append(childEl);
  });
  if (view.unassignedForest.length) {
    const li = el('li', '', 'brain-entry');
    li.append(el('strong', '⚠ 找不到所屬腦區的節點'));
    const list = el('ul', '');
    view.unassignedForest.forEach(n => {
      const nodeEl = renderNode(n, query);
      if (nodeEl) list.append(nodeEl);
    });
    if (list.childNodes.length) { li.append(list); ul.append(li); }
  }
  treeEl.append(ul);
  if (!ul.childNodes.length) treeEl.append(el('p', '沒有符合條件的節點。', 'empty'));
}
function reload() {
  const demoMode = new URLSearchParams(location.search).get('demo') === '1';
  let storage = null;
  if (!demoMode) {
    try { storage = window.localStorage; } catch { /* restricted storage */ }
  }
  const r = demoMode ? { ok:true, tree:buildTree(syntheticBrainSnapshot()) } : readSnapshot(storage);
  view = r.ok ? r.tree : null;
  if (!r.ok) {
    treeEl.replaceChildren();
    countsEl.textContent = '0 節點';
    errorsEl.replaceChildren();
    message(r.reason === 'NO_LOCAL_SNAPSHOT'
      ? '本瀏覽器尚未存有 3D 大腦資料。請先在 3D 主腦載入節點；本頁不自動建立資料。'
      : '本機資料無法安全讀取：' + r.reason + (r.detail ? ' · ' + r.detail : ''), true);
    showDetail();
    return;
  }
  selectedId = selectedId && view.nodeIndex.has(selectedId) ? selectedId :
    (parseNodeHash() && view.nodeIndex.has(parseNodeHash()) ? parseNodeHash() : null);
  countsEl.textContent = String(view.brainCount) + ' 腦區 · ' + String(view.nodeCount) + ' 節點';
  message(demoMode ? '合成示範資料 · 不讀取也不寫入本機記憶' :
    '已讀取本機快照 · 資料版本 ' + String(view.sourceVersion ?? '未知') + ' · 未寫入');
  errorsEl.replaceChildren();
  if (view.diagnostics.length) {
    errorsEl.append(el('p', '⚠ 發現 ' + String(view.diagnostics.length) +
      ' 項缺失／異常關聯。已盡量保留可見節點，不自動修復來源資料。'));
    view.diagnostics.slice(0, 8).forEach(d =>
      errorsEl.append(el('p', d.code + ' · ' + d.kind + ' · ' + d.id)));
    if (view.diagnostics.length > 8) errorsEl.append(el('p', '其餘診斷未展開。'));
  }
  renderTree();
  showDetail();
}
$('reload').addEventListener('click', reload);
searchEl.addEventListener('input', renderTree);
window.addEventListener('storage', e => { if (e.key === STORAGE_KEY || e.key === null) reload(); });
window.addEventListener('hashchange', () => { selectedId = parseNodeHash(); renderTree(); showDetail(); });
reload();
