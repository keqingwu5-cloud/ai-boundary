#!/usr/bin/env bash
# 發佈一集短影音：轉檔 → 放進 media/videos/ → 更新 data.js 的 SEED_MEDIA → commit → push
#
#   scripts/publish_episode.sh <epNN> <nodeId> [--no-push] [--no-encode]
#   例：scripts/publish_episode.sh ep02 n_q2
#
# 環境變數：
#   SRC_DIR   影片來源資料夾（預設 /workspace/影像導演/ai-boundary-series）
#   CRF       H.264 品質（預設 26，數字越大檔案越小）
#   GIT_NAME / GIT_EMAIL  commit 身分（預設 keqingwu5-cloud）
set -euo pipefail

EP="${1:-}"; NODE="${2:-}"; shift 2 || true
PUSH=1; ENCODE=1
for a in "$@"; do case "$a" in --no-push) PUSH=0;; --no-encode) ENCODE=0;; *) echo "未知參數：$a" >&2; exit 2;; esac; done
[[ "$EP" =~ ^ep[0-9]{2}$ ]] || { echo "用法：$0 <epNN> <nodeId> [--no-push] [--no-encode]" >&2; exit 2; }
[[ "$NODE" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "nodeId 只能有英數字、底線、連字號：$NODE" >&2; exit 2; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${SRC_DIR:-/workspace/影像導演/ai-boundary-series}"
SRC="$SRC_DIR/$EP.mp4"
CRF="${CRF:-26}"
OUT_V="media/videos/$NODE.mp4"; OUT_P="media/videos/$NODE.jpg"
[[ -f "$SRC" ]] || { echo "找不到影片：$SRC" >&2; exit 1; }
cd "$ROOT"
mkdir -p media/videos

# 確認 nodeId 存在於種子資料（n_qN、n_qN_eM 或 SEED_EXTRAS 裡的 id）
node -e '
  const fs=require("fs"); const vm=require("vm"); const ctx={}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("data.js","utf8")+";this.Q=QUESTIONS;this.X=typeof SEED_EXTRAS==='undefined'?[]:SEED_EXTRAS;",ctx);
  const ids=[]; ctx.Q.forEach(q=>{ids.push("n_"+q.id);(q.extensions||[]).forEach((e,i)=>ids.push("n_"+q.id+"_e"+i));}); ctx.X.forEach(x=>ids.push(x.id));
  if(!ids.includes(process.argv[1])){console.error("種子資料裡沒有這個節點："+process.argv[1]+"\n可用："+ids.join(" "));process.exit(1);}
' "$NODE"

if [[ $ENCODE == 1 ]] && command -v ffmpeg >/dev/null; then
  echo "▶ 轉檔 H.264/AAC（CRF $CRF，faststart，維持 9:16）"
  ffmpeg -loglevel error -y -i "$SRC" -map 0:v:0 -map '0:a:0?' \
    -vf "scale='min(720,iw)':-2:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset slow -crf "$CRF" -profile:v high -level 4.0 \
    -c:a aac -b:a 128k -ac 2 -movflags +faststart "$OUT_V"
else
  echo "▶ 直接複製（未轉檔）"; cp "$SRC" "$OUT_V"
fi
echo "▶ 封面 $OUT_P"
ffmpeg -loglevel error -y -ss 0.8 -i "$OUT_V" -frames:v 1 -q:v 4 "$OUT_P" 2>/dev/null || rm -f "$OUT_P"

echo "▶ 更新 data.js 的 SEED_MEDIA"
python3 - "$NODE" "$OUT_V" "$( [[ -f $OUT_P ]] && echo "$OUT_P" )" <<'PY'
import json, re, sys
node, video, image = sys.argv[1], sys.argv[2], sys.argv[3]
p = 'data.js'; t = open(p, encoding='utf-8').read()
m = re.search(r'/\* SEED_MEDIA:BEGIN \*/\nconst SEED_MEDIA = (\{.*?\});\n/\* SEED_MEDIA:END \*/', t, re.S)
if not m: sys.exit('data.js 裡找不到 SEED_MEDIA 區塊')
cur = json.loads(m.group(1))
cur[node] = {k: v for k, v in (('video', video), ('image', image)) if v}
body = json.dumps(dict(sorted(cur.items())), ensure_ascii=False, indent=2)
t = t[:m.start(1)] + body + t[m.end(1):]
open(p, 'w', encoding='utf-8').write(t)
print('  ', node, '→', cur[node])
PY

ls -la "$OUT_V" ${OUT_P:+$( [[ -f $OUT_P ]] && echo "$OUT_P")}
git add "$OUT_V" data.js; [[ -f "$OUT_P" ]] && git add "$OUT_P"
if git diff --cached --quiet; then echo "沒有變更，不需要 commit"; exit 0; fi
git -c user.name="${GIT_NAME:-keqingwu5-cloud}" -c user.email="${GIT_EMAIL:-keqingwu5-cloud@users.noreply.github.com}" commit -qm "Publish $EP → $NODE"
git log --oneline -1
if [[ $PUSH == 1 ]]; then git push -q origin HEAD:main && echo "✓ 已推送。GitHub Pages 約 1 分鐘後更新：https://keqingwu5-cloud.github.io/ai-boundary/feed.html#node=$NODE"; fi
