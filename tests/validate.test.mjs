// scripts/validate_content.mjs：目前的檔案要通過；常見錯誤要被抓到。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { check, validateAll } from '../scripts/validate_content.mjs';

const S = n => JSON.parse(fs.readFileSync(new URL(`../schemas/${n}.schema.json`, import.meta.url), 'utf8'));
const A = () => JSON.parse(fs.readFileSync(new URL('../content/activity.json', import.meta.url), 'utf8'));

test('目前 repo 裡的 content/、patches/ 全部通過', () => {
  const { errs } = validateAll();
  assert.deepStrictEqual(errs, []);
});
test('每日動態 schema：欄位、類型、連結只能 https', () => {
  const ok = { id:'2026-10-12-radar-x', date:'2026-10-12', ts:'2026-10-12T09:00:00+08:00', bot:'radar', kind:'content', title:'t', summary:'', nodes:['n_q1'], links:[{ label:'PR', url:'https://github.com/a/b/pull/1' }], parentId:null };
  assert.deepStrictEqual(check(S('activity'), [ok]), []);
  assert.ok(check(S('activity'), [{ ...ok, links:[{ label:'x', url:'javascript:alert(1)' }] }]).length);
  assert.ok(check(S('activity'), [{ ...ok, bot:'hacker' }]).length);
  assert.ok(check(S('activity'), [{ ...ok, kind:'party' }]).length);
  assert.ok(check(S('activity'), [{ ...ok, nodes:['"><img>'] }]).length);
  assert.ok(check(S('activity'), [{ ...ok, extra:1 }]).length);
  const { title, ...noTitle } = ok; assert.ok(check(S('activity'), [noTitle]).length);
});
test('每日動態：每一筆都有 PR 或 commit 連結（回填的資料都查得到出處）', () => {
  A().forEach(e => assert.ok(e.links.length || e.kind === 'review', e.id + ' 沒有連結'));
  A().forEach(e => e.links.forEach(l => assert.match(l.url, /^https:\/\/github\.com\/keqingwu5-cloud\/ai-boundary\/(commit\/[0-9a-f]{40}|pull\/\d+)$/)));
});
test('媒體／補丁 schema：網址、顏色、bot 名稱', () => {
  assert.deepStrictEqual(check(S('media'), { n_q1:{ video:'media/videos/n_q1.mp4' } }), []);
  assert.ok(check(S('media'), { n_q1:{ video:'javascript:alert(1)' } }).length);
  assert.ok(check(S('media'), { n_q1:{ video:'//evil.example/x.mp4' } }).length);
  assert.ok(check(S('types'), { 其他:{ color:'red;background:url(x)', icon:'x' } }).length);
  assert.ok(check(S('patch'), { bot:'someone', date:'2026-10-12' }).length);
  assert.deepStrictEqual(check(S('patch'), { bot:'radar', date:'2026-10-12', seedExtras:[{ id:'n_x_a', parentId:'n_q1', kind:'direction', title:'t', type:'其他' }] }), []);
});
