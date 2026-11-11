# BOT-B 隔離階段就緒檢查清單

| 項目 | 狀態 | 備註 |
|---|---|---|
| 固定分支與 HEAD | 是 | research/bot-b-inner-drive-v0.1 |
| 主測試可重跑 | 是 | bot-b-min-test.mjs |
| 指紋比對（離線） | 是 | OFFLINE=1 |
| STOP 跨程序 | 是 | 模擬 |
| STOP 跨重啟 | 是 | 模擬 |
| Kernel netns | 是 | unshare --net |
| Kernel mount ns | 是 | unshare --mount |
| 證據清單 | 是 | evidence-manifest.json |
| 清單驗證 | 是 | verify-manifest.mjs |
| 重現指南 | 是 | REPRODUCE.md |
| 變更紀錄 | 是 | CHANGELOG.md |
| 文件索引 | 是 | INDEX.md |
| 非作者實際重跑 | 否 | 僅範例 |
| CI 實際執行紀錄 | 否 | 僅 workflow 檔案 |
| 真實主機重啟證明 | 否 | 僅模擬 |

## 結論
基本證據已齊，可供監督審查。  
正式驗收與部署仍為 HOLD。

**RELEASE_GATE = HOLD**