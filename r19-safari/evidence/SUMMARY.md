# Playwright WebKit 本機證據摘要

產品 commit：`bbf381a6cad340af830d09da55e98ad752ac9a78`  
引擎：`/workspace/f05/pw/node_modules/playwright-core` WebKit（webkit-2215）  
時間區：Asia/Taipei

## 可複現（nonzero L109_true_ne_false）

| 標籤 | N | pass | fail | rate | UA 摘要 |
|------|---|------|------|------|---------|
| wm-desktop-n300 | 300 | 293 | 7 | 2.33% | Macintosh Desktop Safari/WebKit |
| wm-iphone13-n200 | 200 | 198 | 2 | 1.00% | iPhone 13 模擬 |
| bridge-iphone13-n150 | 150 | 147 | 3 | 2.00% | iPhone 13 + world-model-r19 bridge |
| orig-suite-n100（產品 test） | 100 | 99 | 1 | 1% | world-model-writer-lock-browser |

簽名皆為 `L109_true_ne_false`（stale append 回傳 true，應為 false）。

## 未複現／對照

| 標籤 | 結果 |
|------|------|
| iframe-desktop-n200（同頁雙 iframe） | fail=0 — **不採用** |
| writer-frame / product-shell two-page | fail=0 |
| bridge-desktop-n200（單次） | fail=0（间歇；同路徑 iPhone 有 fail） |

## 驅動腳本

- `run-wm.cjs` — 兩個 top-level `world-model.html`
- `run-r19-bridge.cjs` — 兩個 top-level `world-model-r19.html`
- `R19_IPHONE=1` 使用 Playwright `devices['iPhone 13']`
