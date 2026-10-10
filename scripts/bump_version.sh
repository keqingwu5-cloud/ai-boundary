#!/usr/bin/env bash
# 更新快取版本：把 index.html / feed.html 裡的 ?v=、window.__V 和 version.json 改成同一個時間戳。
# 已經開著舊版網頁的手機，會在下次載入時讀到 version.json（no-store），發現版本不同就自動重新整理一次。
set -euo pipefail
cd "$(dirname "$0")/.."
V="${1:-$(TZ=Asia/Taipei date +%Y%m%d%H%M%S)}"
sed -i -E "s/\?v=[0-9]+/?v=$V/g; s/window\.__V=\"[0-9]+\"/window.__V=\"$V\"/" index.html feed.html
printf '{"v":"%s"}\n' "$V" > version.json
echo "version → $V"
