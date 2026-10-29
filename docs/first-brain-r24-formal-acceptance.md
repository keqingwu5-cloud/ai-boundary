# 第一大腦 R24｜正式還原、Apple Safari／iPad 實機、獨立審查驗收工作包

**檢核日期：2026-10-29｜整合狀態：BLOCKED｜原 Issue #32／Draft PR #75。**

**授權邊界：** 本檔不是合併或部署授權；目前沒有真人歷史資料操作授權、已批准的正式還原工具、獨立 reviewer ACK、實體 Apple Safari/iPad 測試紀錄。原 #68→#71→#72→#74→#75 PR 堆疊仍保持 Draft。所有測試和報告不得包含私人的 Graph、Undo 原始值、完整裝置識別碼或秘密。

## A. 正式還原 Gate（不能被合成演練取代）

現況：R21 可手動匯出 IDB 主圖/Undo 原始 bytes 與 SHA-256；R22/R23 僅能在 `first-brain-r22-rehearsal-<random-id>` 的隔離資料庫做完整讀回及競態演練，**沒有正式還原 API／UI／權威升格機制**。

本輪新增 `first-brain-formal-recovery-preflight.mjs`，是一個**完全只讀**的候選檢查器：
1. 核查備份 schema、Graph/Undo、revision、SHA-256 與來源 localStorage 位元組指紋。注意 SHA-256 不會證明檔案確實由原設備匯出或沒有被重新製作。
2. 要求在**已授權的獨立唯讀觀測**中記錄正式 IDB 目前是否存在。若存在（不論 revision 大小），都**禁止使用備份覆寫**；未知狀態不能當成遺失。
3. 如果來源 fingerprint 不符或舊版 writer 可能改寫，標記衝突而非自動修復。
4. 即使以上均合格，也只會回傳 `candidateVerified=true` 與 `status=blocked`，明確保留真實 Apple 實機、獨立審查、舊 writer 退場、備份來源證明及擁有者正式還原許可。此檢查器不接觸 IndexedDB／localStorage API，也沒有 restore、merge、deploy 操作。
5. 需另行設計經授權的恢復交易與乾跑／回退證據，並核對原始與目標版本；在此之前**不准執行正式還原**，不允許「目前資料庫為空→自動採用舊備份」。

**供獨立 reviewer 檢核的反例：** 沒有備份簽章、不知現行 revision、現有較新版本、來源指紋不同、非法 Graph/Undo、缺硬體證據、沒有操作人核准。結果與 commit SHA、失敗原因須登錄，不能只有一句「測試綠燈」。

## B. Apple Safari／iPad 真機 Gate

**現在：BLOCKED。** Linux desktop WebKit 是自動測試引擎，不能當成 macOS Safari 或 iOS/iPadOS Safari 的實機。

**實機操作前提：** 先取得已核准的**受控 HTTPS 預覽**，只放入 R17 隔離診斷頁或相同公開合成測試，絕不可把正式主腦快照、私人文字或登入 token 放進測試資料。未獲准發布前不提供自行猜測的 URL。

**人員實測步驟與留證：**
1. 記錄設備種類（iPad／iPhone）、iPadOS/iOS 版本、Safari 版本、實測日期、預覽 URL 與受測 commit SHA（不記錄裝置序號）。測試者需明確標記「真實 Apple 實機」，而不是模擬器。
2. 在一般 Safari 分頁，以合成 Graph/Undo 開始；檢查按鈕前沒有寫入、交易 abort 後兩筆 bytes 不變。
3. 切 App、鎖屏、回到 Safari，手動再次核對；關閉並重開後再次核對，不得偷換成新 seed。
4. 由 reviewer 確認下載的 JSON 報告符合實機步驟。手動清理**隔離測試資料庫**後驗證不能重新建立；故意移除／破壞合成快照時須呈現 fail closed。OS 自動儲存清理政策另列，不能從手動刪除推論永久保存。
5. 若受測者需要開發者檢視，Apple 官方支援連接 Mac 的 Safari Web Inspector。可在 iPad/iPhone 的「設定 → Apps → Safari → 進階 → Web Inspector」啟用，連接受信任 Mac 後在 Safari 開發選單選擇設備；模擬器只能作為補充。參考：https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios 。

**最小證據欄位（每一設備與瀏覽器版本獨立填寫）：**
- testedCommitSHA、previewURL、deviceClass、osVersion、safariVersion、realHardware=true
- syntheticRun.ok、backgroundOrLock.rechecked、reopened.rechecked、abortAtomicity.ok、deleteAndVerifyFailClosed.ok
- timestamp、testerNameOrRole、reviewerNameOrRole、testReportPathOrHash、knownLimitations、conclusion
- 結論只能由實際測試者／獨立審查者填寫。缺任何一項為 **PENDING**，不能把 R17 合成 CI 結果複製過來。

Apple 真機／受控預覽並非當前工具能憑空提供。若無實體設備，應保留此 Gate BLOCKED，不用 Linux WebKit 推論通過。

## C. 獨立審查 Gate

**現在：BLOCKED；PR #75 仍是 Draft，GitHub review 紀錄為空（2026-10-29 已核對）。** 工程作者、同一個 AI 或測試程式產生的評語都**不是獨立 reviewer ACK**。無特定審查者資訊時，不自行猜測身分、發送邀請或偽造核准。

建議分工（並非已指派）：
- **審查 A｜儲存與復原**：`transactional-brain-store.mjs`、`first-brain-idb-adapter.mjs`、`first-brain-formal-recovery-preflight.mjs`、`first-brain-recovery-rehearsal.mjs`。應要求真資料可能遺失、舊版本不合作、還原備份來源不能認證、原子交易與回退的反例。
- **審查 B｜跨頁權威與研究事件**：`app.js`、`feed.js`、`world-verification-ledger.mjs`、`world-verification-ui.mjs`、`research-context-bridge.mjs`。檢查 localStorage 既有舊 writer 與 Web Locks 不合作版本的安全限制。
- **審查 C｜裝置與上線權限**：核對 B 的 iPad/iPhone 真機報告，驗證 R17/R21/R22/R23 CI 的 SHA 是否與待整合的最新 HEAD 相符，以及誰能批准備份復原與正式回退。

**每一審查 ACK 必備**：審查者身分、與作者獨立性、審查 PR 和精確 commit SHA、各項證據 URL、反例與修復、明確的 `APPROVED` 或 `CHANGES_REQUESTED`、審查時間。Code review 的一般 comment 不能當作批准。GitHub 官方審查說明：https://docs.github.com/en/pull-requests/reference/pull-request-reviews 。

在未明確分派 reviewer 之前，只把本檔作為可交付的審查工作包。提交後若程式變動，reviewer 必須核對新的 HEAD，不能沿用舊批准。

## 統一 Release 判定

`formalRestore=BLOCKED`、`physicalAppleSafari=BLOCKED`、`independentReview=BLOCKED`。另保留 `realHistoryDataset`、`uncooperativeOldWriterCompleteQuiescence`、`releasePermissionAndRollback` 等原 R18 阻塞條件。只有收齊外部可追溯證據，才由權責者決定是否進入正式整合；**CI 全綠不會觸發自動合併**。
