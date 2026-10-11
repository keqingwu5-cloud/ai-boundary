#!/usr/bin/env bash
# 更新快取版本：把 index.html / feed.html 裡的 ?v=、window.__V 和 version.json 改成同一個時間戳。
# 已經開著舊版網頁的手機，會在下次載入時讀到 version.json（no-store），發現版本不同就自動重新整理一次。
#
# 只「取代」既有的版本字串，從不插入新的 <script>；跑幾次結果都一樣（tests/bump_version.test.mjs 會檢查）。
# 版本字串可以是數字或 main 用過的 20261012openness01 這種格式，整段換掉、不會留下尾巴。
# 如果某頁的版本檢查 <script> 或 importmap 不是剛好一份（例如合併衝突時被複製了），直接報錯、不改任何檔案。
set -euo pipefail
cd "$(dirname "$0")/.."
V="${1:-$(TZ=Asia/Taipei date +%Y%m%d%H%M%S)}"
if ! [[ "$V" =~ ^[0-9A-Za-z._-]+$ ]]; then echo "版本字串只能用英數字和 . _ -：$V" >&2; exit 1; fi
PAGES=(index.html feed.html)
bad=0
for f in "${PAGES[@]}"; do
  nv=$(grep -c 'window\.__V="' "$f" || true)
  ni=$(grep -c '<script type="importmap">' "$f" || true)
  if [ "$nv" -ne 1 ]; then echo "$f：版本檢查 <script>（window.__V）有 $nv 份，應該剛好 1 份" >&2; bad=1; fi
  if [ "$ni" -gt 1 ]; then echo "$f：importmap 有 $ni 份，最多 1 份" >&2; bad=1; fi
done
if [ "$bad" -ne 0 ]; then echo "先把重複的刪掉再跑；這次沒有改任何檔案。" >&2; exit 1; fi
TOK='[0-9A-Za-z._-]+'
sed -i -E "s/(\.(js|css|json|mjs)\?v=)$TOK/\1$V/g; s/window\.__V=\"$TOK\"/window.__V=\"$V\"/" "${PAGES[@]}"
printf '{"v":"%s"}\n' "$V" > version.json
echo "version → $V"
