# R19 stale-write — Safari / iPhone 實機複現頁（本機）

產品碼來源：`keqingwu5-cloud/ai-boundary` @ `bbf381a6cad340af830d09da55e98ad752ac9a78`（#85 樹）。

## 檔案

| 檔案 | 說明 |
|------|------|
| `index.html` | 控制台：N 次重跑、pass/fail、簽名、UA、複製 JSON；引導一鍵開第二分頁 |
| `world-model.html` | 產品頁 verbatim（bbf381a） |
| `world-model-r19.html` | 產品頁 + 測試用 BroadcastChannel / `__r19` bridge（非產品） |
| `world-verification-ledger.mjs` / `world-verification-ui.mjs` | 產品模組 verbatim |
| `vendor/` | 同上複本 + `SOURCE-SHA.txt` |
| `writer-frame.html` / `product-shell.html` | 早期薄 harness（同頁 iframe **未能**複現，保留作對照） |
| `evidence/` | Playwright WebKit 本機證據 |

## 本機伺服

```bash
cd /workspace/f05/r19-safari && python3 -m http.server 8766 --bind 127.0.0.1
# 開 http://127.0.0.1:8766/
```

## 實機步驟（iPhone Safari）

1. 用下方「推送／託管計畫」的 raw.githack URL 開 `index.html`（**目前尚未推送**）。
2. 點「開寫入者 A」，再點「開寫入者 B（第二分頁）」。
3. 兩分頁都連線後設 N（預設 100）→ 開始重跑 → 複製結果 JSON 貼回。

## 為何不用同頁雙 iframe

同頁兩個 iframe 共享 localStorage 但在 Playwright WebKit 上 **fail=0**（見 `evidence/iframe-desktop-n200.summary.txt`）。  
可複現路徑：兩個 **top-level** `world-model` 分頁（見 `evidence/result-wm-*.json`、`result-bridge-iphone13-n150.json`）。
