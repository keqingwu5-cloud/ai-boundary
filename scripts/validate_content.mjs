#!/usr/bin/env node
// 檢查 content/*.json、patches/*.json 是否符合 schemas/*.schema.json，再做幾個跨檔案的檢查。不需要安裝任何套件。
//   node scripts/validate_content.mjs                 # 檢查目前的檔案
//   node scripts/validate_content.mjs --base origin/main   # 另外檢查「只增不減」：questions／activity 的舊內容一字不差
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- 迷你 JSON Schema 驗證器（只支援這個 repo 用到的關鍵字） ---------- */
export function check(schema, v, at = '$', root = schema, errs = []){
  if (schema.$ref){ const ref = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o[k], root); return check(ref, v, at, root, errs); }
  const t = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v;
  const okType = ty => ty === t || (ty === 'number' && t === 'integer');
  if (schema.type && !(Array.isArray(schema.type) ? schema.type : [schema.type]).some(okType)) { errs.push(`${at}: 應該是 ${[].concat(schema.type).join('/')}，實際是 ${t}`); return errs; }
  if (schema.enum && !schema.enum.includes(v)) errs.push(`${at}: ${JSON.stringify(v)} 不在允許的值裡（${schema.enum.join('、')}）`);
  if (t === 'string'){
    if (schema.minLength != null && v.length < schema.minLength) errs.push(`${at}: 太短`);
    if (schema.maxLength != null && v.length > schema.maxLength) errs.push(`${at}: 太長（上限 ${schema.maxLength}）`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(v)) errs.push(`${at}: ${JSON.stringify(v.slice(0, 60))} 格式不對`);
  }
  if (t === 'array'){
    if (schema.maxItems != null && v.length > schema.maxItems) errs.push(`${at}: 最多 ${schema.maxItems} 項`);
    if (schema.items) v.forEach((x, i) => check(schema.items, x, `${at}[${i}]`, root, errs));
  }
  if (t === 'object'){
    (schema.required || []).forEach(k => { if (!(k in v)) errs.push(`${at}: 缺少 ${k}`); });
    Object.entries(v).forEach(([k, x]) => {
      if (schema.propertyNames) check(schema.propertyNames, k, `${at} 的 key`, root, errs);
      if (schema.properties && k in schema.properties) check(schema.properties[k], x, `${at}.${k}`, root, errs);
      else if (schema.additionalProperties === false) errs.push(`${at}: 不認識的欄位 ${k}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') check(schema.additionalProperties, x, `${at}.${k}`, root, errs);
    });
  }
  return errs;
}

const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const schema = n => read(`schemas/${n}.schema.json`);
const taipeiDate = ts => new Date(ts).toLocaleDateString('sv-SE', { timeZone:'Asia/Taipei' });

export function validateAll({ base } = {}){
  const errs = [], warns = [];
  const load = (p, s) => { let v; try { v = read(p); } catch(e){ errs.push(`${p}: 不是合法的 JSON（${e.message}）`); return null; } check(schema(s), v).forEach(e => errs.push(`${p} ${e}`)); return v; };
  const Q = load('content/questions.json', 'questions'), T = load('content/types.json', 'types'), C = load('content/concepts.json', 'concepts');
  const X = load('content/seed-extras.json', 'seed-extras'), SR = load('content/series.json', 'series'), M = load('content/media.json', 'media');
  const IDX = load('patches/index.json', 'patches-index'), A = load('content/activity.json', 'activity');
  if (!Q || !X || !IDX || !A) return { errs, warns };

  const ids = new Set();
  Q.forEach(q => { ids.add('n_' + q.id); (q.extensions || []).forEach((e, i) => ids.add('n_' + q.id + '_e' + i)); });
  const addExtras = (list, where) => list.forEach((x, i) => {
    if (ids.has(x.id)) errs.push(`${where}[${i}]: 節點 id ${x.id} 重複`);
    if (!ids.has(x.parentId)) errs.push(`${where}[${i}]: parentId ${x.parentId} 不存在（要先有父節點）`);
    if (T && !T[x.type]) warns.push(`${where}[${i}]: 類型「${x.type}」不在 content/types.json（會顯示成「其他」）`);
    ids.add(x.id);
  });
  addExtras(X, 'content/seed-extras.json');

  const disk = fs.readdirSync(path.join(ROOT, 'patches')).filter(f => f.endsWith('.json') && f !== 'index.json').sort();
  const listed = [...IDX.files].sort();
  disk.filter(f => !listed.includes(f)).forEach(f => errs.push(`patches/${f}: 沒有列在 patches/index.json，網站不會載入`));
  listed.filter(f => !disk.includes(f)).forEach(f => errs.push(`patches/index.json: 列了 ${f}，但檔案不存在`));
  const patchKeys = new Set();
  IDX.files.filter(f => disk.includes(f)).forEach(f => {
    const P = load('patches/' + f, 'patch'); if (!P) return;
    const m = /^([a-z]+)-(\d{4}-\d{2}-\d{2})/.exec(f);
    if (!m || m[1] !== P.bot || m[2] !== P.date) errs.push(`patches/${f}: 檔名要是 <bot>-<date>.json，而且跟檔案裡的 bot（${P.bot}）、date（${P.date}）一致`);
    addExtras(P.seedExtras || [], `patches/${f} seedExtras`);
    Object.entries(P.seedPatches || {}).forEach(([id, p]) => {
      if (!ids.has(id)) errs.push(`patches/${f}: 補丁的節點 ${id} 不存在`);
      const k = id + '@' + p.patchId; if (patchKeys.has(k)) errs.push(`patches/${f}: ${k} 跟別的補丁重複（patchId 要換一個）`); patchKeys.add(k);
    });
  });
  if (SR) [...SR.episodes, ...SR.extras].forEach(id => { if (!ids.has(id)) errs.push(`content/series.json: ${id} 不存在`); });
  if (M) Object.keys(M).forEach(id => { if (!ids.has(id)) errs.push(`content/media.json: ${id} 不存在`); });
  if (C) Object.entries(C.tags).forEach(([k, list]) => list.forEach(c => { if (!C.defs[c]) warns.push(`content/concepts.json tags.${k}: 概念「${c}」沒有在 defs 定義顏色`); }));

  const seen = new Set();
  A.forEach((e, i) => {
    const at = `content/activity.json[${i}]（${e.id}）`;
    if (seen.has(e.id)) errs.push(`${at}: id 重複`);
    if (e.parentId != null && !seen.has(e.parentId)) errs.push(`${at}: parentId ${e.parentId} 要指向「前面」已經有的一筆`);
    if (!Number.isNaN(Date.parse(e.ts)) && taipeiDate(e.ts) !== e.date) errs.push(`${at}: date ${e.date} 跟 ts（台北時間 ${taipeiDate(e.ts)}）不一致`);
    (e.nodes || []).forEach(n => { if (!ids.has(n)) warns.push(`${at}: 節點 ${n} 不在種子資料裡（可能是雲端才有的節點）`); });
    seen.add(e.id);
  });

  if (base){                                   // 只增不減：跟 base 分支比
    const old = p => { try { return JSON.parse(execFileSync('git', ['show', `${base}:${p}`], { cwd:ROOT, encoding:'utf8', stdio:['ignore', 'pipe', 'ignore'] })); } catch(e){ return null; } };
    const oq = old('content/questions.json');
    if (oq) oq.forEach((q, i) => { if (JSON.stringify(Q[i]) !== JSON.stringify(q)) errs.push(`content/questions.json[${i}]（${q.id}）: QUESTIONS 原文不能改，只能在後面新增`); });
    const oa = old('content/activity.json');
    if (oa) oa.forEach((e, i) => { if (JSON.stringify(A[i]) !== JSON.stringify(e)) errs.push(`content/activity.json[${i}]（${e.id}）: 每日動態只能加在最後，舊的不能改或刪`); });
    if (!oq && !oa) warns.push(`--base ${base}: 那邊還沒有 content/，略過只增不減檢查`);
  }
  return { errs, warns };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])){
  const i = process.argv.indexOf('--base'), base = i > 0 ? process.argv[i + 1] : process.env.BASE_REF || '';
  const { errs, warns } = validateAll({ base });
  warns.forEach(w => console.log('⚠️ ', w));
  errs.forEach(e => console.log('✗ ', e));
  console.log(errs.length ? `\n${errs.length} 個錯誤` : '✓ content/、patches/ 檢查通過');
  process.exit(errs.length ? 1 : 0);
}
