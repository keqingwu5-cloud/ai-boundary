/* 📅 每日動態（activity.js）— 大腦（index.html）和短影音（feed.html）共用。
   資料：content/activity.json（只增不減，一個事件一筆：{id, date, ts, bot, kind, title, summary, nodes[], links[], parentId}）。
   新增一筆：scripts/log_activity.mjs（開分支＋PR）。所有文字都經過 esc()，連結經過 cleanUrl()（safe.js），只接受 https。
   兩種看法：📅 依日期（同一天裡的衍生關係縮排顯示）／🌳 衍生樹（整條衍生鏈）。每一筆有子事件就可以 ▾／▸ 收合。
   公開 API：window.AIActivity = { open(), close(), toggle(), reload(), entries() } */
import { esc, cleanUrl } from './safe.js';

const PAGE = document.getElementById('c') ? 'brain' : 'feed';
const BOTS = {
  merlin:     { name:'Merlin',          icon:'🧙', color:'#f5c451' },
  decomposer: { name:'問題拆解師',      icon:'🧩', color:'#f59e0b' },
  radar:      { name:'AI 邊界雷達',     icon:'📡', color:'#9db7ff' },
  director:   { name:'影像導演',        icon:'🎬', color:'#ff7ae0' },
  intp:       { name:'INTP 鏡像研究員', icon:'🪞', color:'#7fe0a8' },
  designer:   { name:'App 設計師',      icon:'🎨', color:'#f0abfc' },
  integrator: { name:'整合師',          icon:'🔧', color:'#67e8f9' },
  reviewer:   { name:'審查',            icon:'🔍', color:'#cbd5e1' },
  unknown:    { name:'未標註',          icon:'❔', color:'#8f98c4' }
};
const KINDS = { content:'內容', video:'影片', code:'程式', fix:'修正', review:'審查', merge:'合併', cleanup:'清理', docs:'文件', design:'設計' };
const WEEK = '日一二三四五六';
const bot = s => BOTS[s] || { name:String(s || '未標註'), icon:'❔', color:'#8f98c4' };
const tpe = ts => new Date(ts).toLocaleTimeString('zh-TW', { timeZone:'Asia/Taipei', hour:'2-digit', minute:'2-digit', hour12:false });
const dayLabel = d => { const [y, m, dd] = d.split('-').map(Number); return `${m}/${dd}（${WEEK[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]}）`; };

let entries = null, view = 'day', collapsed = new Set(), loading = null;

const css = document.createElement('style');
css.textContent = `
.ac-panel{position:fixed;z-index:45;right:10px;top:66px;bottom:10px;width:400px;max-width:calc(100vw - 20px);display:flex;flex-direction:column;border-radius:20px;padding:12px 12px 0;
  background:rgba(12,15,34,.95);border:1px solid rgba(160,180,255,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#eef0ff;
  transform:translateX(112%);transition:transform .4s cubic-bezier(.2,.8,.2,1);font-size:13px}
.ac-panel.open{transform:none}
.ac-panel header{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.ac-panel header h3{margin:0;font-size:15px;flex:1}
.ac-tabs{display:flex;gap:6px;margin-bottom:8px}
.ac-tabs button,.ac-x{border:1px solid rgba(160,180,255,.2);background:rgba(255,255,255,.05);color:inherit;border-radius:99px;padding:4px 11px;font:inherit;font-size:12px;cursor:pointer}
.ac-tabs button.on{background:rgba(157,183,255,.2);border-color:#9db7ff}
.ac-x{width:30px;height:30px;padding:0;display:grid;place-items:center}
.ac-list{overflow:auto;flex:1;padding-bottom:14px}
.ac-day{margin:0 0 8px}
.ac-day>summary{cursor:pointer;font-weight:700;color:#cfd6ff;padding:5px 2px;list-style:none;display:flex;gap:6px;align-items:center}
.ac-day>summary::-webkit-details-marker{display:none}
.ac-day>summary:before{content:"▸";color:#8f98c4;font-size:11px;width:10px}
.ac-day[open]>summary:before{content:"▾"}
.ac-day>summary small{color:#8f98c4;font-weight:400}
.ac-e{position:relative;margin:4px 0 4px calc(var(--d,0) * 16px);padding:7px 9px 7px 10px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(160,180,255,.1);border-left:3px solid var(--c)}
.ac-e.hl{box-shadow:0 0 0 2px #f5c451}
.ac-e.sub:before{content:"";position:absolute;left:-10px;top:-4px;width:8px;height:18px;border-left:1px solid rgba(160,180,255,.3);border-bottom:1px solid rgba(160,180,255,.3);border-bottom-left-radius:6px}
.ac-h{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
.ac-h time{color:#8f98c4;font-size:11.5px;font-variant-numeric:tabular-nums}
.ac-b{font-size:11.5px;font-weight:700;color:color-mix(in srgb,var(--c) 60%,#fff)}
.ac-k{font-size:10.5px;border:1px solid rgba(160,180,255,.25);border-radius:99px;padding:0 6px;color:#aab3dd}
.ac-t{font-weight:700;margin:3px 0 2px;line-height:1.4}
.ac-s{color:#c9cfee;font-size:12.5px;line-height:1.5;margin:0}
.ac-m{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;align-items:center}
.ac-m a,.ac-m button{font:inherit;font-size:11.5px;border-radius:8px;padding:1px 7px;text-decoration:none;cursor:pointer;color:#dfe5ff;background:rgba(157,183,255,.1);border:1px solid rgba(157,183,255,.28)}
.ac-m .nd{font-family:ui-monospace,Menlo,monospace}
.ac-m .par{background:transparent;border-style:dashed;color:#aab3dd}
.ac-m .lk{color:#a9c1ff}
.ac-id{color:#6f789f;font-size:10.5px;font-family:ui-monospace,Menlo,monospace;margin-left:auto}
.ac-tg{border:0;background:transparent;color:#9db7ff;cursor:pointer;font:inherit;font-size:11.5px;padding:0 2px}
.ac-empty{color:#8f98c4;padding:20px 4px}
@media (max-width:700px){.ac-panel{left:8px;right:8px;width:auto;top:auto;height:78dvh;bottom:0;border-radius:20px 20px 0 0;transform:translateY(105%)}.ac-panel.open{transform:none}}
`;
document.head.appendChild(css);

const panel = document.createElement('aside');
panel.className = 'ac-panel'; panel.id = 'acPanel'; panel.setAttribute('aria-label', '每日動態'); panel.setAttribute('aria-hidden', 'true');
panel.innerHTML = `<header><h3>📅 每日動態</h3><button class="ac-x" data-x title="關閉" aria-label="關閉每日動態">✕</button></header>
  <div class="ac-tabs" role="group" aria-label="檢視方式"><button data-v="day" class="on" aria-pressed="true">📅 依日期</button><button data-v="tree" aria-pressed="false">🌳 衍生樹</button><button data-v="all" title="全部展開／收合" aria-label="全部展開或收合">⇕</button></div>
  <div class="ac-list"></div>`;
document.body.appendChild(panel);
const list = panel.querySelector('.ac-list');

const btn = document.createElement('button');
btn.className = 'ib'; btn.id = 'bAct'; btn.type = 'button'; btn.title = '每日動態'; btn.textContent = '📅';
// 固定的 zh-TW 標籤（不跟 title 走）；開關狀態用 aria-expanded 表示
btn.setAttribute('aria-label', '每日動態'); btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-controls', 'acPanel'); btn.setAttribute('aria-expanded', 'false');
const anchor = document.getElementById(PAGE === 'brain' ? 'bHist' : 'bSet');
if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor); else { btn.style.cssText = 'position:fixed;top:12px;right:60px;z-index:40'; document.body.appendChild(btn); }

function load(force){
  if (entries && !force) return Promise.resolve(entries);
  if (!loading || force) loading = fetch('content/activity.json?v=' + (window.__V || Date.now())).then(r => r.ok ? r.json() : []).catch(() => [])
    .then(a => { entries = (Array.isArray(a) ? a : []).filter(e => e && typeof e.id === 'string'); return entries; });
  return loading;
}

function entryHTML(e, depth, kids, extParent){
  const b = bot(e.bot), id = esc(e.id);
  const nodes = (Array.isArray(e.nodes) ? e.nodes : []).map(n => `<button class="nd" data-node="${esc(n)}" title="打開這個節點" aria-label="打開節點 ${esc(n)}">${esc(n)}</button>`).join('');
  const links = (Array.isArray(e.links) ? e.links : []).map(l => { const u = cleanUrl(l && l.url); return /^https:\/\//i.test(u) ? `<a class="lk" href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(l.label || u)}</a>` : ''; }).join('');
  const par = extParent ? `<button class="par" data-goto="${esc(extParent.id)}" title="${esc(extParent.date)}">↳ 衍生自：${esc(String(extParent.title).slice(0, 24))}</button>` : '';
  const tg = kids ? `<button class="ac-tg" data-tg="${id}" aria-expanded="${!collapsed.has(e.id)}">${collapsed.has(e.id) ? '▸' : '▾'} ${kids} 個衍生</button>` : '';
  return `<div class="ac-e${depth ? ' sub' : ''}" id="ac-${id}" style="--d:${depth};--c:${esc(b.color)}">
    <div class="ac-h"><time>${esc(view === 'tree' ? e.date.slice(5) + ' ' : '')}${esc(tpe(e.ts))}</time><span class="ac-b">${esc(b.icon)} ${esc(b.name)}</span><span class="ac-k">${esc(KINDS[e.kind] || e.kind)}</span>${tg}</div>
    <div class="ac-t">${esc(e.title)}</div>${e.summary ? `<p class="ac-s">${esc(e.summary)}</p>` : ''}
    <div class="ac-m">${nodes}${links}${par}<span class="ac-id">${id}</span></div></div>`;
}

/* 把一組事件排成樹：parent 也在這組裡的就縮排到 parent 底下 */
function forest(group, byId){
  const inGroup = new Set(group.map(e => e.id)), kids = {};
  group.forEach(e => { if (e.parentId && inGroup.has(e.parentId)) (kids[e.parentId] = kids[e.parentId] || []).push(e); });
  const out = [];
  const walk = (e, d) => {
    const ext = e.parentId && !inGroup.has(e.parentId) ? byId[e.parentId] : null;
    const ch = (kids[e.id] || []).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    out.push(entryHTML(e, d, ch.length, ext));
    if (!collapsed.has(e.id)) ch.forEach(c => walk(c, d + 1));
  };
  return { out, walk, roots:group.filter(e => !(e.parentId && inGroup.has(e.parentId))) };
}

function render(){
  if (!entries) return;
  if (!entries.length){ list.innerHTML = '<div class="ac-empty">還沒有動態。</div>'; return; }
  const byId = Object.fromEntries(entries.map(e => [e.id, e]));
  panel.querySelectorAll('.ac-tabs [data-v="day"], .ac-tabs [data-v="tree"]').forEach(b => { b.classList.toggle('on', b.dataset.v === view); b.setAttribute('aria-pressed', String(b.dataset.v === view)); });
  if (view === 'tree'){
    const f = forest(entries, byId);
    f.roots.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).forEach(r => f.walk(r, 0));
    list.innerHTML = f.out.join(''); return;
  }
  const days = {};
  entries.forEach(e => (days[e.date] = days[e.date] || []).push(e));
  const keys = Object.keys(days).sort().reverse();
  list.innerHTML = keys.map((d, i) => {
    const f = forest(days[d], byId);
    f.roots.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).forEach(r => f.walk(r, 0));
    const open = !collapsed.has('day:' + d) && (i === 0 || collapsed.has('open:' + d));
    return `<details class="ac-day" data-day="${esc(d)}"${open ? ' open' : ''}><summary>${esc(dayLabel(d))}<small>${days[d].length} 筆</small></summary>${f.out.join('')}</details>`;
  }).join('');
}

function openNode(id){
  close();
  if (PAGE === 'brain' && window.AIBrain && AIBrain.focusNode){ if (!AIBrain.focusNode(id) && AIBrain._toast) AIBrain._toast('找不到這個節點'); return; }
  if (location.hash === '#node=' + encodeURIComponent(id)) dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = 'node=' + encodeURIComponent(id);
}
function gotoEntry(id){
  view = 'tree'; let e = entries.find(x => x.id === id);
  while (e){ collapsed.delete(e.id); e = e.parentId && entries.find(x => x.id === e.parentId); }   // 展開整條祖先鏈
  render();
  const el = document.getElementById('ac-' + id); if (!el) return;
  el.scrollIntoView({ block:'center', behavior:'smooth' }); el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 1800);
}

panel.addEventListener('click', ev => {
  const t = ev.target.closest('button'); if (!t) return;
  if (t.dataset.x !== undefined) return close();
  if (t.dataset.node) return openNode(t.dataset.node);
  if (t.dataset.goto) return gotoEntry(t.dataset.goto);
  if (t.dataset.tg){ collapsed.has(t.dataset.tg) ? collapsed.delete(t.dataset.tg) : collapsed.add(t.dataset.tg); return render(); }
  if (t.dataset.v === 'all'){
    const withKids = entries.filter(e => entries.some(c => c.parentId === e.id)).map(e => e.id);
    const anyOpen = withKids.some(id => !collapsed.has(id));
    withKids.forEach(id => anyOpen ? collapsed.add(id) : collapsed.delete(id));
    if (view === 'day') [...new Set(entries.map(e => e.date))].forEach(d => { collapsed.delete(anyOpen ? 'open:' + d : 'day:' + d); collapsed.add(anyOpen ? 'day:' + d : 'open:' + d); });
    return render();
  }
  if (t.dataset.v){ view = t.dataset.v; render(); }
});
panel.addEventListener('toggle', ev => {           // 記住每一天的展開／收合，重畫時不會跳回去
  const d = ev.target.dataset && ev.target.dataset.day; if (!d) return;
  if (ev.target.open){ collapsed.delete('day:' + d); collapsed.add('open:' + d); } else { collapsed.add('day:' + d); collapsed.delete('open:' + d); }
}, true);

function open(){ panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); btn.classList.add('on'); btn.setAttribute('aria-expanded', 'true'); load().then(render); }
function close(){ panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); btn.classList.remove('on'); btn.setAttribute('aria-expanded', 'false'); }
function toggle(){ panel.classList.contains('open') ? close() : open(); }
btn.addEventListener('click', toggle);
addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });
if (/(^#|&)activity\b/.test(location.hash)) open();

window.AIActivity = { open, close, toggle, reload:() => load(true).then(render), entries:() => (entries || []).map(e => JSON.parse(JSON.stringify(e))) };
