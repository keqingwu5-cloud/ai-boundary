// node --test tests/ ：跳脫、網址／顏色白名單、雲端資料清洗（XSS）
import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, safeUrl, cleanUrl, safeColor, sanitizeEntity } from '../safe.js';

test('esc 跳脫 HTML 與屬性字元', () => {
  assert.equal(esc(`"><img src=x onerror=alert(1)>'\``), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&#39;&#96;');
  assert.equal(esc(null), ''); assert.equal(esc(5), '5');
});
test('safeUrl：只接受 http(s) 與 repo 內相對路徑', () => {
  for (const ok of ['', 'https://example.com/a?b=1#c', 'http://x.y', 'media/videos/n_q1.mp4', './a.jpg', '/ai-boundary/a.mp4', 'a b'.replace(' ', '%20')]) assert.ok(safeUrl(ok), ok);
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.com/x', '/\\evil.com', '\\\\evil.com',
    'https://e.com/"onmouseover="x', 'https://e.com/<script>', 'file:///etc/passwd', 'blob:https://x/1', 'a b']) assert.ok(!safeUrl(bad), bad);
  assert.equal(cleanUrl('javascript:x'), ''); assert.equal(cleanUrl(' media/a.mp4 '), 'media/a.mp4'); assert.equal(cleanUrl(42), '');
});
test('safeColor：只接受 hex 與 hsl()', () => {
  for (const ok of ['#fff', '#9d8cff', '#9d8cffaa', 'hsl(120,85%,72%)', 'hsla(12.5deg, 50%, 50%, .5)']) assert.equal(safeColor(ok), ok);
  for (const bad of ['red', '#ff;background:url(x)', '"><script>', 'url(javascript:x)', 'hsl(1,2,3)', 'expression(alert(1))', '#12345', null, 3]) assert.equal(safeColor(bad, 'FB'), 'FB');
});
test('sanitizeEntity：惡意節點被清乾淨', () => {
  const n = sanitizeEntity('node', 'n_x', { kind:'"><img src=x onerror=alert(1)>', createdBy:'bot" onclick="x', status:'pwned', title:'<b>t</b>',
    source:{ who:'w', url:'javascript:alert(1)', also:[{ label:'l', url:'data:text/html,x' }, 'junk'] }, media:{ video:'javascript:x', image:'//evil/x.png' },
    counterEvidence:[{ text:'c', source:{ url:'vbscript:x' } }, null], flow:{ 各方觀點:[{ stance:'s', source:{ url:'javascript:y' } }] }, pos:'oops', concepts:'nope' });
  assert.equal(n.kind, 'question'); assert.equal(n.status, 'open'); assert.equal(n.createdBy, 'bot" onclick="x');   // createdBy 只是文字，輸出時一律 esc()
  assert.equal(n.source.url, ''); assert.equal(n.source.also.length, 1); assert.equal(n.source.also[0].url, '');
  assert.deepEqual(n.media, { video:'', image:'' }); assert.equal(n.counterEvidence.length, 1); assert.equal(n.counterEvidence[0].source.url, '');
  assert.equal(n.flow['各方觀點'][0].source.url, ''); assert.deepEqual(n.pos, [0, 0.1, 0]); assert.deepEqual(n.concepts, []);
  assert.equal(n.title, '<b>t</b>', 'text is kept as-is; escaping happens at output');
  const b = sanitizeEntity('brain', 'b1', { name:'x', regionColor:'#fff" onmouseover="alert(1)', position:[1, 'a', 2] });
  assert.equal(b.regionColor, '#9db7ff'); assert.deepEqual(b.position, [0, 0, 0]);
  assert.equal(sanitizeEntity('concept', '意識', { color:'red;x:url(//e)' }).color, '#9db7ff');
  assert.equal(sanitizeEntity('link', 'l1', { from:'a', to:'b', kind:'<x>' }).kind, 'derived');
  assert.equal(sanitizeEntity('link', 'l2', { from:'a' }), null);
  assert.equal(sanitizeEntity('node', 'n', 'a string'), null);
  assert.deepEqual(sanitizeEntity('meta', 'seedExtras', ['a', 3]), ['a', '3']);
});
test('sanitizeEntity：bot 寫入缺欄位的節點也補齊（避免頁面崩潰）', () => {
  const n = sanitizeEntity('node', 'n_bot', { title:'只有標題' });
  for (const k of ['media', 'concepts', 'counterEvidence', 'reasoning', 'botNotes', 'pos']) assert.ok(n[k] !== undefined, k);
  assert.equal(n.media.video, ''); assert.equal(n.brainId, 'main'); assert.equal(n.kind, 'question');
});
