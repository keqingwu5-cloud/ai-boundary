/* safe.js — 輸出到 innerHTML 前的跳脫、網址與顏色白名單，以及雲端資料的清洗／補欄位。
   大腦（app.js）、短影音（feed.js）、同步（sync-core.js）共用；node 測試也直接 import。 */
export const esc = s => String(s ?? '').replace(/[&<>"'`]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;', '`':'&#96;' }[c]));
/* 只接受 http(s):// 或 repo 內相對路徑；javascript:、data:、vbscript:、//外站、/\外站 一律拒絕。空字串＝沒有網址（合法） */
export function safeUrl(u){
  u = String(u ?? '').trim(); if (!u) return true;
  if (/[\u0000-\u001f\u007f]/.test(u)) return false;
  if (/^https?:\/\/[^\s<>"'`\\]+$/i.test(u)) return true;
  return /^[^\s:<>"'`\\]+$/u.test(u) && !u.startsWith('//');
}
export const cleanUrl = u => (typeof u === 'string' && safeUrl(u)) ? u.trim() : '';
/* 顏色只接受 #rgb(a)/#rrggbb(aa) 與 hsl()/hsla() */
const COLOR = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|hsla?\(\s*\d{1,3}(\.\d+)?(deg)?\s*,\s*\d{1,3}(\.\d+)?%\s*,\s*\d{1,3}(\.\d+)?%\s*(,\s*(0|1|0?\.\d+))?\s*\))$/i;
export const safeColor = (c, fb = '#9db7ff') => (typeof c === 'string' && COLOR.test(c.trim())) ? c.trim() : fb;
export const playable = u => !!u && safeUrl(u) && /\.(mp4|webm|m4v|mov|ogv)(\?|#|$)/i.test(u);

const NODE_KINDS = ['question', 'extension', 'direction'], STATUSES = ['open', 'researching', 'resolved'], LINK_KINDS = ['derived', 'cross'];
const str = (v, max = 4000) => typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max);
const num = (v, fb = 0) => Number.isFinite(+v) ? +v : fb;
const vec = (v, fb) => Array.isArray(v) && v.length === 3 && v.every(x => Number.isFinite(+x)) ? v.map(Number) : fb;
const arr = v => Array.isArray(v) ? v : [];
const URL_KEYS = new Set(['url', 'video', 'image', 'subtitles', 'href', 'src', 'poster']);
/* 遞迴：任何叫 url/video/image… 的字串欄位都要過 safeUrl */
function cleanUrls(v, depth = 0){
  if (depth > 8 || v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(x => cleanUrls(x, depth + 1));
  const o = {}; for (const [k, x] of Object.entries(v)) o[k] = URL_KEYS.has(k) && typeof x === 'string' ? cleanUrl(x) : cleanUrls(x, depth + 1);
  return o;
}
/* 雲端（或任何外來）實體 → 安全、欄位齊全的物件。不合法的回傳 null（當作不存在）。 */
export function sanitizeEntity(kind, id, data){
  if (kind === 'meta') return Array.isArray(data) ? data.map(x => str(x, 200)) : data && typeof data === 'object' ? cleanUrls(data) : null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = cleanUrls(JSON.parse(JSON.stringify(data)));
  if (kind === 'node'){
    const n = Object.assign(d, { id:str(id, 200), brainId:str(d.brainId || 'main', 200), parentId:d.parentId ? str(d.parentId, 200) : null,
      kind:NODE_KINDS.includes(d.kind) ? d.kind : d.kind === 'split' ? 'extension' : 'question', title:str(d.title, 500), type:str(d.type || '其他', 40),
      oneLiner:str(d.oneLiner), assumptions:typeof d.assumptions === 'string' ? d.assumptions : '', reasoning:arr(d.reasoning).filter(r => r && typeof r === 'object'),
      counterEvidence:arr(d.counterEvidence).filter(c => c && typeof c === 'object'), status:STATUSES.includes(d.status) ? d.status : 'open',
      createdBy:str(d.createdBy || 'merlin', 40), createdAt:num(d.createdAt), collapsed:!!d.collapsed, pos:vec(d.pos, [0, 0.1, 0]),
      botNotes:arr(d.botNotes), concepts:[...new Set(arr(d.concepts).map(c => str(c, 40)).filter(Boolean))], processPattern:str(d.processPattern, 80) });
    n.media = Object.assign({ video:'', image:'' }, d.media && typeof d.media === 'object' && !Array.isArray(d.media) ? d.media : {});
    if (d.source != null && typeof d.source !== 'object') n.source = null;
    if (n.source) n.source.also = arr(n.source.also).filter(a => a && typeof a === 'object');
    return n;
  }
  if (kind === 'brain') return Object.assign(d, { id:str(id, 200), name:str(d.name, 200), parentBrainId:d.parentBrainId ? str(d.parentBrainId, 200) : null,
    position:vec(d.position, [0, 0, 0]), scale:num(d.scale, 1) > 0 ? num(d.scale, 1) : 1, regionColor:safeColor(d.regionColor), rootNodeId:d.rootNodeId ? str(d.rootNodeId, 200) : null, createdAt:num(d.createdAt) });
  if (kind === 'link') return d.from && d.to ? Object.assign(d, { id:str(id, 200), from:str(d.from, 200), to:str(d.to, 200), kind:LINK_KINDS.includes(d.kind) ? d.kind : 'derived', createdAt:num(d.createdAt) }) : null;
  if (kind === 'concept' || kind === 'pattern') return Object.assign(d, { color:safeColor(d.color, kind === 'pattern' ? '#e2e8f0' : '#9db7ff'), desc:str(d.desc, 500), createdBy:str(d.createdBy || 'merlin', 40) });
  return null;
}
