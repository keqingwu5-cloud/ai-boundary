# 託管計畫（NOT_RUN — 需 Merlin 核准後才執行）

**狀態：NOT_RUN。本目錄僅建於本機 `/workspace/f05/r19-safari/`，尚未 `git push`、尚未開 PR、尚未合併。**

## 偏好方案：測試專用分支 + raw.githack（釘選 commit SHA）

不需合併進 main。分支只多這個資料夾，供 iPhone Safari 開靜態頁。

### 精確指令（核准後由人工或代理執行）

```bash
# 0) 變數
REPO=https://github.com/keqingwu5-cloud/ai-boundary.git
BASE=bbf381a6cad340af830d09da55e98ad752ac9a78
BRANCH=test/r19-safari-stale-write
SRC=/workspace/f05/r19-safari
WORKDIR=/tmp/r19-safari-host-$$

# 1) 從產品 SHA 開測試分支（不碰 main）
git clone --no-checkout "$REPO" "$WORKDIR"
cd "$WORKDIR"
git fetch origin "$BASE"
git checkout -B "$BRANCH" "$BASE"

# 2) 只加入本資料夾（可排除 evidence 內大型重跑若要；預設整包）
mkdir -p r19-safari
rsync -a --delete \
  --exclude server.pid --exclude server.log \
  "$SRC/" "$WORKDIR/r19-safari/"
git add r19-safari
git status
git commit -m "test-only(r19): Safari stale-write repro page (bbf381a product; no app change)"

# 3) 推送（不可逆／對外可見 — 必須 Merlin 明示同意）
git push -u origin "$BRANCH"

# 4) 釘選 URL
COMMIT=$(git rev-parse HEAD)
echo "COMMIT=$COMMIT"
echo "INDEX=https://raw.githack.com/keqingwu5-cloud/ai-boundary/${COMMIT}/r19-safari/index.html"
echo "PEER=https://raw.githack.com/keqingwu5-cloud/ai-boundary/${COMMIT}/r19-safari/world-model-r19.html"
```

### 推送後預期 URL 型別

（`COMMIT` 為推送後該分支 tip；**不是**產品 `bbf381a`，除非該 commit 已含本資料夾。）

```
https://raw.githack.com/keqingwu5-cloud/ai-boundary/<PUSHED_COMMIT>/r19-safari/index.html
```

寫入者分頁：

```
https://raw.githack.com/keqingwu5-cloud/ai-boundary/<PUSHED_COMMIT>/r19-safari/world-model-r19.html?role=A
https://raw.githack.com/keqingwu5-cloud/ai-boundary/<PUSHED_COMMIT>/r19-safari/world-model-r19.html?role=B
```

raw.githack 會以正確 MIME 提供 HTML/JS module，適合 iOS Safari。備援：`https://cdn.rawgit.com` 已停用；或 GitHub Pages 另開（非本計畫偏好）。

### 明確不執行

- `git push`
- 開 PR / merge
- 部署到產品主線或正式 hosting
- 任何分析／追蹤腳本

## 備援（同樣 NOT_RUN）

本機 LAN：`python3 -m http.server` + 同 Wi-Fi 開 `http://<mac-ip>:8766/`（需防火牆放行；非 raw.githack）。
