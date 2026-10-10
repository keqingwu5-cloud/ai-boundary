#!/usr/bin/env bash
# 發佈一集短影音：開分支 → 轉檔 → 放進 media/videos/ → 更新 content/media.json → 記一筆每日動態 → commit → push 分支 → 開 PR
# 不會直接推到 main：PR 由整合師合併後，GitHub Pages 才會更新。
#
#   scripts/publish_episode.sh <epNN> <nodeId> [--local] [--no-encode] [--parent <動態 id>]
#   例：scripts/publish_episode.sh ep02 n_q2
#
#   （預設）   git fetch → 從 origin/main 開分支 episode/<epNN>-<YYYY-MM-DD> → … → push 分支 → gh pr create
#   --local    只在目前分支 commit，不開分支、不 push、不開 PR（舊的 --no-push 也還能用）
#   --no-encode 不轉檔，直接複製
#   --parent   每日動態的 parentId（例如這集是從哪一筆動態衍生的）
#
# 環境變數：
#   SRC_DIR   影片來源資料夾（預設 /workspace/影像導演/ai-boundary-series）
#   CRF       H.264 品質（預設 23，數字越大檔案越小；另有 maxrate 2.5M 上限）
#   BASE      PR 的目標分支（預設 main）
#   GIT_NAME / GIT_EMAIL  commit 身分（預設 keqingwu5-cloud）
set -euo pipefail

EP="${1:-}"; NODE="${2:-}"; shift 2 || true
LOCAL=0; ENCODE=1; PARENT=""
while [[ $# -gt 0 ]]; do case "$1" in
  --local|--no-push) LOCAL=1;; --no-encode) ENCODE=0;;
  --parent) PARENT="${2:-}"; shift;;
  *) echo "未知參數：$1" >&2; exit 2;; esac; shift; done
[[ "$EP" =~ ^ep[0-9]{2}$ ]] || { echo "用法：$0 <epNN> <nodeId> [--local] [--no-encode] [--parent <動態 id>]" >&2; exit 2; }
[[ "$NODE" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "nodeId 只能有英數字、底線、連字號：$NODE" >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${SRC_DIR:-/workspace/影像導演/ai-boundary-series}"
SRC="$SRC_DIR/$EP.mp4"
CRF="${CRF:-23}"
# 手機（iPhone Safari）順暢串流的轉檔設定；影片長度不變，60 秒以上也可以
encode_mobile(){  # $1 in  $2 out
  local has_audio extra_in=() amap=(-map 0:a:0)
  has_audio=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$1" | head -1)
  if [[ -z "$has_audio" ]]; then extra_in=(-f lavfi -i anullsrc=r=44100:cl=stereo); amap=(-map 1:a:0 -shortest); fi
  ffmpeg -loglevel error -y -i "$1" "${extra_in[@]}" -map 0:v:0 "${amap[@]}" \
    -vf "scale='min(720,iw)':-2:flags=lanczos,fps=30,format=yuv420p" -fps_mode cfr \
    -c:v libx264 -preset slow -profile:v main -level:v 3.1 -crf "$CRF" -maxrate 2500k -bufsize 5000k \
    -g 30 -keyint_min 30 -sc_threshold 0 \
    -c:a aac -b:a 128k -ar 44100 -ac 2 -movflags +faststart "$2"
}

OUT_V="media/videos/$NODE.mp4"; OUT_P="media/videos/$NODE.jpg"
[[ -f "$SRC" ]] || { echo "找不到影片：$SRC" >&2; exit 1; }
cd "$ROOT"
mkdir -p media/videos

export GIT_NAME="${GIT_NAME:-keqingwu5-cloud}" GIT_EMAIL="${GIT_EMAIL:-keqingwu5-cloud@users.noreply.github.com}"
BASE="${BASE:-main}"; DATE=$(TZ=Asia/Taipei date +%F); BRANCH="episode/$EP-$DATE"
if [[ $LOCAL == 0 ]]; then
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then echo "工作目錄有還沒 commit 的修改，先 commit 或 stash（或用 --local）" >&2; exit 1; fi
  git fetch -q origin "$BASE"
  if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1 || git show-ref --quiet "refs/heads/$BRANCH"; then BRANCH="$BRANCH-$(TZ=Asia/Taipei date +%H%M%S)"; fi
  git switch -q -c "$BRANCH" "origin/$BASE"
  echo "▶ 分支 $BRANCH（從 origin/$BASE）"
fi

# 確認 nodeId 存在於種子資料（n_qN、n_qN_eM、content/seed-extras.json 或 patches 裡的 seedExtras）
node -e '
  const fs=require("fs"); const J=p=>JSON.parse(fs.readFileSync(p,"utf8"));
  const ids=[]; J("content/questions.json").forEach(q=>{ids.push("n_"+q.id);(q.extensions||[]).forEach((e,i)=>ids.push("n_"+q.id+"_e"+i));});
  J("content/seed-extras.json").forEach(x=>ids.push(x.id));
  (J("patches/index.json").files||[]).forEach(f=>(J("patches/"+f).seedExtras||[]).forEach(x=>ids.push(x.id)));
  if(!ids.includes(process.argv[1])){console.error("種子資料裡沒有這個節點："+process.argv[1]+"\n可用："+ids.join(" "));process.exit(1);}
' "$NODE"

if [[ $ENCODE == 1 ]] && command -v ffmpeg >/dev/null; then
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC" || echo 0)
  echo "▶ 轉檔（手機串流用）：H.264 Main@3.1、30fps 固定、每 1 秒一個關鍵格、CRF $CRF、maxrate 2.5M、AAC 128k/44.1kHz、faststart，長度維持 ${DUR}s"
  encode_mobile "$SRC" "$OUT_V"
else
  echo "▶ 直接複製（未轉檔）"; cp "$SRC" "$OUT_V"
fi
echo "▶ 封面 $OUT_P"
ffmpeg -loglevel error -y -ss 0.8 -i "$OUT_V" -frames:v 1 -q:v 4 "$OUT_P" 2>/dev/null || rm -f "$OUT_P"

echo "▶ 更新 content/media.json"
python3 - "$NODE" "$OUT_V" "$( [[ -f $OUT_P ]] && echo "$OUT_P" )" <<'PY'
import json, sys
node, video, image = sys.argv[1], sys.argv[2], sys.argv[3]
p = 'content/media.json'
cur = json.load(open(p, encoding='utf-8'))
cur[node] = dict(cur.get(node, {}), **{k: v for k, v in (('video', video), ('image', image)) if v})  # 保留 subtitles／subtitlesBurnedIn 等其他欄位
open(p, 'w', encoding='utf-8').write(json.dumps(dict(sorted(cur.items())), ensure_ascii=False, indent=2) + '\n')
print('  ', node, '→', cur[node])
PY

ls -la "$OUT_V" ${OUT_P:+$( [[ -f $OUT_P ]] && echo "$OUT_P")}
node scripts/validate_content.mjs >/dev/null || { node scripts/validate_content.mjs; exit 1; }
"$ROOT/scripts/bump_version.sh"
git add "$OUT_V" content/media.json index.html feed.html version.json; [[ -f "$OUT_P" ]] && git add "$OUT_P"
if git diff --cached --quiet; then echo "沒有變更，不需要 commit"; exit 0; fi
git -c user.name="$GIT_NAME" -c user.email="$GIT_EMAIL" commit -qm "Publish $EP → $NODE"
SHA=$(git rev-parse HEAD)
# 每日動態（同一個分支、同一個 PR）
node scripts/log_activity.mjs --here --bot director --kind video --title "發佈 ${EP^^} → $NODE" --summary "用 scripts/publish_episode.sh 發佈。" \
  --node "$NODE" --link "commit ${SHA:0:7}|https://github.com/keqingwu5-cloud/ai-boundary/commit/$SHA" ${PARENT:+--parent "$PARENT"} --id "$DATE-director-$EP-$(echo "$NODE" | tr '_A-Z' '-a-z')"
git log --oneline -2
if [[ $LOCAL == 1 ]]; then echo "✓ 只在本機 commit（--local）。"; exit 0; fi
git push -q -u origin "$BRANCH"
BODY="影像導演發佈 ${EP^^} → \`$NODE\`（由 scripts/publish_episode.sh 產生）。

- 影片：\`$OUT_V\`$( [[ -f $OUT_P ]] && printf '\n- 封面：`%s`' "$OUT_P")
- 更新 \`content/media.json\`、每日動態 \`content/activity.json\`、快取版本
- 合併後 GitHub Pages 約 1 分鐘更新：https://keqingwu5-cloud.github.io/ai-boundary/feed.html#node=$NODE

請整合師確認 CI 通過後合併。"
if command -v gh >/dev/null; then gh pr create --base "$BASE" --head "$BRANCH" --title "🎬 Publish $EP → $NODE" --body "$BODY"
else echo "沒有 gh。到這裡開 PR：https://github.com/keqingwu5-cloud/ai-boundary/compare/$BASE...$BRANCH?expand=1"; fi
