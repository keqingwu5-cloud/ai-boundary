#!/usr/bin/env node
// 新增一筆「每日動態」到 content/activity.json（只加在最後），預設開一個分支＋PR，交給整合師合併。
//
//   node scripts/log_activity.mjs --bot director --kind video --title "發佈 EP07 → n_q7" \
//        [--summary "…"] [--node n_q7 --node n_x_foo] [--link "PR #12|https://github.com/…/pull/12"] \
//        [--parent <前一筆的 id>] [--id <自訂 id>] [--ts 2026-10-12T09:30:00+08:00] [--author "…"]
//
// 模式（三選一）：
//   （預設）  從 origin/main 開分支 activity/<date>-<id>（在暫時的 git worktree 裡做，不動你目前的工作目錄），
//            commit → push → gh pr create。沒有 gh 的話會印出開 PR 的網址。
//   --here   只寫進目前資料夾的 content/activity.json 並 commit 在目前分支（給 publish_episode.sh 這類腳本在自己的分支裡用）。
//   --local  只改檔案，不碰 git。
// 其他：--base <分支>（預設 main）、--dry-run（只印出要加的那一筆）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOTS = ['merlin', 'decomposer', 'radar', 'director', 'intp', 'openness', 'designer', 'integrator', 'reviewer', 'unknown'];
const KINDS = ['content', 'video', 'code', 'fix', 'review', 'merge', 'cleanup', 'docs', 'design'];

const argv = process.argv.slice(2), opt = { node:[], link:[] }, flags = new Set();
for (let i = 0; i < argv.length; i++){
  const a = argv[i];
  if (['--here', '--local', '--dry-run'].includes(a)){ flags.add(a.slice(2)); continue; }
  const m = /^--([a-z]+)$/.exec(a); if (!m || i + 1 >= argv.length) die('看不懂的參數：' + a);
  const k = m[1], v = argv[++i];
  if (k === 'node') opt.node.push(...v.split(',').map(s => s.trim()).filter(Boolean));
  else if (k === 'link') opt.link.push(v);
  else opt[k] = v;
}
function die(msg){ console.error('✗ ' + msg + '\n用法見 scripts/log_activity.mjs 開頭的說明'); process.exit(2); }
const sh = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, encoding:'utf8', stdio:['ignore', 'pipe', 'inherit'] }).trim();
const has = cmd => { try { execFileSync('sh', ['-c', 'command -v ' + cmd], { stdio:'ignore' }); return true; } catch(e){ return false; } };

if (!BOTS.includes(opt.bot)) die('--bot 要是其中之一：' + BOTS.join(' '));
if (!KINDS.includes(opt.kind)) die('--kind 要是其中之一：' + KINDS.join(' '));
if (!opt.title) die('需要 --title');

/* ts／date 一律用台北時間 */
const now = opt.ts ? new Date(opt.ts) : new Date();
if (Number.isNaN(now.getTime())) die('--ts 不是合法的時間');
const tpe = new Date(now.getTime() + 8 * 3600e3).toISOString();
const ts = opt.ts || tpe.slice(0, 19) + '+08:00', date = new Date(Date.parse(ts) + 8 * 3600e3).toISOString().slice(0, 10);
const slug = String(opt.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
const id = opt.id || [date, opt.bot, slug || Math.random().toString(36).slice(2, 7)].join('-');
const links = opt.link.map(s => { const j = s.lastIndexOf('|'); return j > 0 ? { label:s.slice(0, j), url:s.slice(j + 1) } : { label:s, url:s }; });
const entry = { id, date, ts, bot:opt.bot, kind:opt.kind, title:opt.title, summary:opt.summary || '', nodes:opt.node, links, parentId:opt.parent || null };
if (opt.author) entry.author = opt.author;

async function writeAndValidate(dir){
  const p = path.join(dir, 'content/activity.json');
  const list = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (list.some(e => e.id === entry.id)) die('已經有同樣 id 的動態：' + entry.id + '（用 --id 換一個）');
  list.push(entry);
  fs.writeFileSync(p, JSON.stringify(list, null, 2) + '\n');
  const { validateAll } = await import(path.join(dir, 'scripts/validate_content.mjs'));
  const { errs } = validateAll();
  if (errs.length){ errs.forEach(e => console.error('✗ ' + e)); list.pop(); fs.writeFileSync(p, JSON.stringify(list, null, 2) + '\n'); die('驗證沒過，已經還原 content/activity.json'); }
  console.log('✓ 已加入 content/activity.json：' + entry.id);
}
const commitMsg = `📅 動態：${entry.title}`;
const cfg = (k, cwd) => { try { return sh('git', ['config', k], cwd); } catch(e){ return ''; } };
const gitId = cwd => ['-c', 'user.name=' + (process.env.GIT_NAME || cfg('user.name', cwd) || 'keqingwu5-cloud'), '-c', 'user.email=' + (process.env.GIT_EMAIL || cfg('user.email', cwd) || 'keqingwu5-cloud@users.noreply.github.com')];

if (flags.has('dry-run')){ console.log(JSON.stringify(entry, null, 2)); process.exit(0); }
if (flags.has('local')){ await writeAndValidate(ROOT); process.exit(0); }
if (flags.has('here')){
  await writeAndValidate(ROOT);
  sh('git', ['add', 'content/activity.json']);
  sh('git', [...gitId(ROOT), 'commit', '-qm', commitMsg]);
  console.log('✓ 已 commit 在目前分支：' + sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']));
  process.exit(0);
}

/* 預設：暫時的 worktree → 分支 → commit → push → PR */
const base = opt.base || 'main', branch = `activity/${date}-${id.replace(/^\d{4}-\d{2}-\d{2}-/, '')}`.slice(0, 90);
sh('git', ['fetch', '-q', 'origin', base]);
const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-activity-'));
try {
  sh('git', ['worktree', 'add', '-q', '-b', branch, wt, 'origin/' + base]);
  await writeAndValidate(wt);
  sh('git', ['add', 'content/activity.json'], wt);
  sh('git', [...gitId(wt), 'commit', '-qm', commitMsg], wt);
  sh('git', ['push', '-q', '-u', 'origin', branch], wt);
  const body = `新增一筆每日動態（只加在 content/activity.json 最後）。\n\n- bot：${entry.bot}\n- 類型：${entry.kind}\n- 標題：${entry.title}\n${entry.summary ? '- 摘要：' + entry.summary + '\n' : ''}${entry.nodes.length ? '- 節點：' + entry.nodes.join('、') + '\n' : ''}${entry.parentId ? '- 衍生自：' + entry.parentId + '\n' : ''}\n由 scripts/log_activity.mjs 產生，請整合師確認後合併。`;
  if (has('gh')) console.log('✓ PR：' + sh('gh', ['pr', 'create', '--base', base, '--head', branch, '--title', commitMsg, '--body', body], wt));
  else { const url = sh('git', ['remote', 'get-url', 'origin'], wt).replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
    console.log(`沒有 gh。到這裡開 PR：${url}/compare/${base}...${branch}?expand=1`); }
} finally {
  try { sh('git', ['worktree', 'remove', '--force', wt]); } catch(e){}
}
