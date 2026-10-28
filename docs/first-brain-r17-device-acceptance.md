# 第一大腦 R17｜實體 Safari／iPhone／iPad 儲存安全驗收

**狀態：實機 Gate BLOCKED；隔離診斷程式已實作，待自動 CI 與實體操作核對。**

## 定位

本 R17 是 R03-01/R03-04/R03-05 的實體瀏覽器驗收項目，不是新主腦、產品上線、私人資料遷移或 GPT②/BOT③ 記憶測試。Linux desktop WebKit 和 Chrome 不能視為 Apple 品牌 Safari 或 iOS/iPadOS 的實機證據。

診斷頁（隔離候選程式）：`tests/fixtures/first-brain-device-diagnostics.html`。目前只在 PR #75 隔離分支；未授權公開部署，因此**沒有可直接要求使用者在手機打開的已驗證正式 URL**。部署到受控預覽環境之前，不要求使用者上傳任何資料或開放正式主腦。

## 隱私與作用範圍

- 只使用隨機測試 ID 命名的 `first-brain-r17-isolated-probe-<32 hex>` IndexedDB。合成測試建立兩個可辨識的值（graph、undo），在同一 transaction 寫入、讀回；模擬交易 abort，確認兩筆保持原內容。
- 不使用任何真實 `aiBrain.v1`、`aiBrain.v1.undo`、主腦權威標記或 GPT② 記憶；不發送網路上傳、不自動要求 persistent-storage 權限。
- 只有點「開始合成資料測試」才寫入測試 IDB；點「查詢儲存狀態」只讀取 `navigator.storage.estimate()` / `persisted()` 能提供的提示。
- 重新讀取不建立新測試 DB；手動「刪除本次隔離測試資料」只刪除命名符合 R17 隔離 prefix 的 DB。
- 匯出的 JSON 是使用者主動下載的**本地測試結果**，`reviewerAcknowledged=false`、`realFirstBrainDataTested=false` 固定保留，不能自動構成獨立審查／真實歷史資料驗收。

## 實機驗收步驟（需由有裝置的人執行）

1. 在**受控、已審查**的 HTTPS 預覽環境，用非私人瀏覽模式開啟 R17 診斷頁；記下 Apple 裝置類型、iOS/iPadOS 與 Safari 版本，以及預覽 commit SHA。先確認頁面不是正式主腦、沒有真實資料。
2. 點「開始合成資料測試」：原子交易、刻意 abort 後的重讀均須通過。未按鈕前不得有任何測試寫入。
3. 切至其他 App、鎖定裝置後再回 Safari，點「重新讀取驗證」；應讀到同一 graph 與 undo，否則標 FAIL 並保留錯誤原因。
4. 重新整理並關閉後重新開啟診斷頁（保留測試識別碼的 URL），再次執行「重新讀取驗證」；不得因重新開啟而重新 seed、偽稱之前有存檔。
5. 使用「查詢儲存狀態」收集 persisted 與估計容量（不是資料永久安全的證明）。手動勾選確實完成的環節，再下載 JSON 報告，**不要貼私人資料、裝置識別碼或正式主腦快照**。
6. 點「刪除本次隔離測試資料」，確認測試 DB 已清除且重新驗證不可重新建立。把報告交予獨立 reviewer，核對實機、版本、操作鏈、缺失和來源後再手動簽核。

## 必須保留未通過的正式 Gate

| 驗收條件 | 本診斷能否證明 |
|---|---|
| Chrome/Linux WebKit 自動測試原子交易、abort、重載、隔離 | 可以，需 CI PASS |
| 真 Apple Safari/iPhone/iPad 背景暫停與重新啟動 | **不能自動證明，需實機** |
| 真實歷史圖與 Undo 完整保存（使用者授權後） | **不能，另由 R16 真檔 Gate** |
| 系統容量壓力、OS 主動清除 best-effort 儲存 | **不能，需另外安全驗收** |
| 跨版本舊 writer 的全面阻止或資料衝突自動合併 | **不能，R15 正式 Gate 仍 BLOCKED** |
| main 合併、部署、使用者或獨立 reviewer 驗收 | **不能，另行審核** |

**參考**：WebKit [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)；MDN [Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)；Playwright [Browsers](https://playwright.dev/docs/browsers)。Safari/ WebKit 的 storage quota、最佳努力保存與 OS 清除情境需要單獨評估；CI 中 Linux WebKit 不是 Apple Safari。

## 測試結果登錄

- 工程提交：隔離 Draft PR #75。
- R17 Chrome probe CI：**待對應最新 Run 最終完成**。
- R17 desktop WebKit probe CI：**待對應最新 Run 最終完成**。
- Safari 實體裝置：**未執行／BLOCKED**。
- 使用者真實歷史資料：**未獲驗收授權／BLOCKED**。
- Reviewer ACK：**未取得／BLOCKED**。
