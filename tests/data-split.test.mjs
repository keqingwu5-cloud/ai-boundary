// 資料拆檔的等價測試：content/*.json + patches/*.json 經過 data.js 載入器合併後，
// 要跟拆檔前的 data.js（tests/fixtures/data.legacy.js，commit 8addd8f 的原檔）產生的種子資料一樣。
//   - QUESTIONS 必須逐字相同（原文永遠不動）。
//   - 其他內容只能「加」：舊的每一筆都還在、內容一字不差；新加的節點／補丁／媒體不算違規。
//   - 用舊版和新版的 applySeedPatch／applySeedMedia 對同一批種子節點跑一次，結果要一樣（migrate() 行為不變）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['QUESTIONS', 'TYPES', 'CONCEPTS', 'SEED_EXTRAS', 'SEED_PATCHES', 'SERIES', 'SEED_MEDIA'];
const plain = v => JSON.parse(JSON.stringify(v));

function legacy(){
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'tests/fixtures/data.legacy.js'), 'utf8') +
    `;this.D={${NAMES.join(',')}};this.applySeedPatch=applySeedPatch;this.applySeedMedia=applySeedMedia;`, ctx);
  return { data:plain(ctx.D), ctx };
}
async function loader(){
  const files = [];
  const ctx = { window:{ __V:'test' }, document:{}, console,
    fetch:async u => { const p = u.split('?')[0]; files.push(p); const t = fs.readFileSync(path.join(ROOT, p), 'utf8'); return { ok:true, status:200, json:async () => JSON.parse(t) }; } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'), ctx);
  await ctx.window.AI_DATA_READY;
  // data.js 用 Object.assign(window, …) 放全域；瀏覽器裡 window 就是全域物件，這裡把它搬進 vm 的全域，讓 applySeedPatch 看得到
  NAMES.forEach(n => { ctx[n] = ctx.window[n]; });
  return { data:plain(Object.fromEntries(NAMES.map(n => [n, ctx.window[n]]))), ctx, files };
}

test('QUESTIONS：content/questions.json 跟舊 data.js 逐字相同', async () => {
  const L = legacy().data, N = (await loader()).data;
  assert.deepStrictEqual(N.QUESTIONS, L.QUESTIONS);
  assert.equal(JSON.stringify(N.QUESTIONS), JSON.stringify(L.QUESTIONS));
  assert.equal(fs.readFileSync(path.join(ROOT, 'content/questions.json'), 'utf8'), JSON.stringify(L.QUESTIONS, null, 2) + '\n');
});

/* 舊資料是新資料的「子集」：物件的每個舊 key 都還在、值相同；陣列的舊元素依序在前面。
   SEED_PATCHES 的某個節點如果後來多了別的 bot 的補丁，會變成陣列，舊補丁必須是第一個。 */
function contains(oldV, newV, where){
  if (Array.isArray(oldV)){
    assert.ok(Array.isArray(newV), where + ' 應該是陣列');
    oldV.forEach((v, i) => assert.deepStrictEqual(newV[i], v, `${where}[${i}] 被改動或刪除了`));
  } else if (oldV && typeof oldV === 'object'){
    Object.keys(oldV).forEach(k => assert.deepStrictEqual(newV[k], oldV[k], `${where}.${k} 被改動或刪除了`));
  } else assert.deepStrictEqual(newV, oldV, where);
}
test('其他種子資料：舊的每一筆都還在、一字不差（只能加，不能改）', async () => {
  const L = legacy().data, N = (await loader()).data;
  assert.deepStrictEqual(N.TYPES, L.TYPES);
  ['patterns', 'tags', 'process'].forEach(k => assert.deepStrictEqual(N.CONCEPTS[k], L.CONCEPTS[k], 'CONCEPTS.' + k));
  contains(L.CONCEPTS.defs, N.CONCEPTS.defs, 'CONCEPTS.defs');
  contains(L.SEED_EXTRAS, N.SEED_EXTRAS, 'SEED_EXTRAS');
  Object.entries(L.SEED_PATCHES).forEach(([id, p]) => assert.deepStrictEqual([].concat(N.SEED_PATCHES[id])[0], p, 'SEED_PATCHES.' + id));
  contains(L.SERIES, N.SERIES, 'SERIES');
  contains(L.SEED_MEDIA, N.SEED_MEDIA, 'SEED_MEDIA');
});

test('拆檔當下：合併結果跟舊 data.js 完全相同（加上新內容之後，這個測試會自動只比對舊的部分）', async () => {
  const L = legacy().data, N = (await loader()).data;
  const added = JSON.stringify(N).length !== JSON.stringify(L).length;
  if (!added) assert.deepStrictEqual(N, L);
  else assert.ok(true, '已經有新內容，改由上一個測試檢查「只加不改」');
});

test('migrate() 用到的 applySeedPatch／applySeedMedia：新舊結果一樣', async () => {
  const { ctx:Lc, data:L } = legacy(), { ctx:Nc } = await loader();
  const nodes = () => L.QUESTIONS.map(q => ({ id:'n_' + q.id, reasoning:q.process.map(s => ({ k:s.k, v:s.v })), assumptions:(q.process.find(s => s.k === '前提') || {}).v || '',
    media:{ video:q.videoUrl || '', image:q.imageUrl || '' }, counterEvidence:[], botNotes:[] })).concat(L.SEED_EXTRAS.map(plain));
  const run = c => { const st = { seedPatches:[] }, ns = nodes(); ns.forEach(n => { c.applySeedMedia(n); c.applySeedPatch(n, st); }); ns.forEach(n => { c.applySeedPatch(n, st); }); return plain({ st, ns }); };
  assert.deepStrictEqual(run(Nc), run(Lc));
});

test('同一個節點有兩個 bot 的補丁：依 patches/index.json 順序都套用，各記一筆', async () => {
  const { ctx } = await loader();
  const merged = ctx.aiMergeContent({ questions:[], types:{}, concepts:{ defs:{ A:{ color:'#fff' } } }, extras:[{ id:'x1' }], series:{}, media:{},
    patches:[{ seedPatches:{ n_a:{ patchId:'p1', counterEvidence:[{ id:'c1' }], botNotes:[] } }, seedExtras:[{ id:'x1' }, { id:'x2' }], conceptDefs:{ A:{ color:'#000' }, B:{ color:'#111' } } },
             { seedPatches:{ n_a:{ patchId:'p2', counterEvidence:[{ id:'c2' }], botNotes:[{ text:'hi' }] } } }] });
  assert.equal(merged.SEED_PATCHES.n_a.length, 2);
  assert.deepStrictEqual(merged.SEED_EXTRAS.map(x => x.id), ['x1', 'x2']);       // 已存在的 id 不重複加
  assert.equal(merged.CONCEPTS.defs.A.color, '#fff');                            // 概念只加不蓋
  assert.equal(merged.CONCEPTS.defs.B.color, '#111');
  ctx.SEED_PATCHES = merged.SEED_PATCHES; ctx.QUESTIONS = [];
  const n = { id:'n_a' }, st = {};
  assert.equal(ctx.applySeedPatch(n, st), true);
  assert.deepStrictEqual(plain(n.counterEvidence).map(c => c.id), ['c1', 'c2']);
  assert.deepStrictEqual(plain(st.seedPatches), ['n_a@p1', 'n_a@p2']);
  assert.equal(ctx.applySeedPatch(n, st), false);
});

test('patches/index.json 跟 patches/ 資料夾一致，載入器真的有讀到每個檔案', async () => {
  const { files } = await loader();
  const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/index.json'), 'utf8')).files;
  const disk = fs.readdirSync(path.join(ROOT, 'patches')).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
  assert.deepStrictEqual([...idx].sort(), disk);
  idx.forEach(f => assert.ok(files.includes('patches/' + f)));
});
