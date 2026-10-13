# 主腦可靠性增補（獨立草稿，未部署）

## 查核與缺口

基準：main `0572d46849d34ad55a574c2c0773e7cfffafffb5`。原站是無建置步驟的 Three.js 靜態網站。

| 能力 | 原有實作 | 本次增補／界線 |
|---|---|---|
| 3D、影片、子腦、概念線、研究歷史 | app.js、data.js、feed.js | 保留原 UI、媒體、種子資料與資料鍵 |
| 本機存檔、undo、JSON 匯入匯出 | aiBrain.v1、aiBrain.v1.undo | 遷移前原文備份、拓樸驗證、失敗保護；保留原 graph 匯出 |
| 偏好與知識評分 | aiBrain.feed.v1、aiBrain.knowledge.v1 | 完整備份包含所有 aiBrain.* 非備份鍵 |
| 遷移 | 既有 v1 → v2 與 seed patches | 包住原遷移；不另訂節點產品版本規則；備份格式獨立為 1 |
| 來源／研究欄位 | source、createdBy、createdAt、botNotes、counterEvidence | 後端提案帶來源、分類、依據版本，接受後保留完整前後修訂 |
| BOT 審核／衝突 | main 無可信後端 | 新增 server-only 核心；**未接入正式 API／登入／審核 UI** |
| 任務、重試、配額 | main 無執行器 | 可測試隔離核心，尚無供應商呼叫與實際帳單整合 |

另已檢查未合併草稿 PR #2（supabase-sync）與 #3（bot-workflow，基於 #2）。#2 已有實體同步、tombstone、歷史去重、editor RLS；#3 已有內容拆檔、schema、CI 與協作規範。本分支基於 main，沒有重做這些能力。#2 的公開讀取 policy 與同 ID 覆寫行為，仍需在未來整合前修正；不能把目前草稿當成私人多 BOT 的安全後端。

## 瀏覽器資料安全

`reliability/storage.mjs` 在呼叫原 migrate 前備份原始字串；驗證支援的 graph v1/v2、唯一 ID、主腦、父節點循環、關聯端點，以及遷移後原節點／子腦／關聯仍在、history 前綴未變。既有 seed patches 可增加預設資料；備份仍完整保存遷移前內容。

格式未知、損毀、備份額度不足或驗證失敗時阻擋 graph 存檔，保留原始資料；使用可用舊資料或記憶體種子展示。顯示保護提示。既有 feed／評分功能仍是本機功能，不受這個 graph guard 管理。

相同快照重用備份。備份不自動刪除；空間不足會阻止遷移，應先離線匯出並由使用者決定保留期限。一般同分頁存檔維持原行為；可偵測另一分頁已變更存檔，但 localStorage 沒有原子 compare-and-swap，**不是多 BOT 交易儲存**。

既有匯出按鈕仍匯出 graph。完整原文備份可於瀏覽器 console 執行 `AIBrain.exportBackup()`；`AIBrain.getBackup()` 回傳備份物件，`AIBrain.persistenceStatus()` 可查看保護狀態。

還原由 `restoreBackup(storage, backupObject)` 明確呼叫：先驗證輸入並備份目前資料，再逐鍵寫入及驗證；中途失敗反向回滾；若裝置連回滾也拒絕，回報 `RESTORE_ROLLBACK_REQUIRED` 和原始備份鍵。完成後必須重新載入頁面，不可沿用舊記憶體。模組不自動觸發還原。備份包含私人研究，請存放在使用者控制的位置。

## 可信後端整合契約

`server/knowledge-service.mjs` 不可匯入前端。注入的 `authenticate(request)` 必須由服務端驗證 session／token，回傳 `{id, kind, graphIds, permissions}`；**不可把 body／任意 header 中的身分視為已驗證**。測試的 session fixture 只是測試替身，不是登入實作。

權限為 read、propose、review；僅 human 可以 review。所有資料讀寫皆檢查 graph 範圍與權限。BOT 只寫 proposals，不能直接改 graph；使用者可 accept／reject／hold。讀取 ledger 亦包含私人研究，正式部署需私有儲存、TLS 與驗證，不能放在靜態網站目錄。API 金鑰只由未來的後端供應商 adapter 取得。

提案必須有穩定 operationId、taskId、nodeId、action（add/update）、node、sources、baseVersions，以及分類 fact／hypothesis／inference／counter_evidence／unverified。分類為研究內容標籤，**不等於驗證通過**。不把既有 status 自動重新解釋成新分類。

baseVersions 是 `versionOf(node)` 的 SHA-256 內容指紋，新增目標使用 null。它只作並行修改偵測，不是使用者可見的版本命名規則；來源所依據的其他節點也須列入。服務端記錄提交者與時間，不信任 BOT 自填身分。接受修改保留未提供的既有節點欄位與原始建立者；明確提供的欄位按審核結果更新。完整 before/after 保留於 revisions，提案獨立於 graph；不能把整份 ledger 當成 app 的 graph 匯入。

同一 actor 的 operationId 或 taskId 重複會重用既有提案；相同 ID 搭配不同內容回 409，不新增。不同 BOT 若執行同一邏輯任務，協調者須提供共同任務身分／明確分派規則；本次不擅自把不同 BOT 的獨立研究合併。接受前在同一交易重新核對版本；衝突保留 conflict，不自動合併，需根據最新資料建立新提案。

`store.transaction(fn)` 必須序列化同 graph 的交易，回呼失敗不得提交。`server/file-store.mjs` 是可選的單機原子檔案 adapter：排他 lock、0600 暫存檔、fsync、rename。鎖競爭與未知格式 fail closed；崩潰遺留 lock 需操作人員先確認沒有執行中的程序，再恢復。不能用在不保證這些檔案語意的共享磁碟或多主機部署。

後端 ledger 與任務檔必須放在 repo／web root **之外**。離線備份時停止寫入或持有同一鎖，複製完整 JSON 並驗證 formatVersion、graph、提案及 revisions；在隔離路徑開啟驗證後才切換。此版測試檔案重開與失敗不覆寫，尚未提供生產用排程備份、保留策略或 ledger 還原端點。

## 任務與觀測

`createTaskRunner` 使用獨立 transactional store；初值可為 `{formatVersion:1}`。呼叫端必須明確提供 maxAttempts、timeoutMs、maxCalls、maxCost；不預設幣別與額度重置週期。狀態包含 queued/running/succeeded/failed/timed_out/budget_blocked，有限重試；相同任務 ID 不重新執行。

每次呼叫前保守預留 costCeiling，未知成本不退還。此值必須是可信後端 adapter 強制限制的上界，不可信任 BOT 報價；真正供應商支出上限仍需要 token／模型／供應商限制。逾時送出 abort、不重試、忽略晚到回傳；無法強迫不支援取消的上游停止計費。run 不應直接修改正式知識，應把結果轉成經驗證的提案。程序重啟後 running 任務不自動重送，需人工確認上游狀態。

ledger 事件僅記錄時間、事件類型與系統 ID；任務事件記錄時間、類型、attempt，不儲存原始 exception、金鑰、prompt 或研究文字。研究內容只存在權限保護的 graph/proposals/revisions，不是日誌。正式監控告警、事件輪替與拒絕請求計數仍需後端 adapter 整合。

## 驗證與待決事項

執行 `node --test tests/reliability.test.mjs`（Node 22+，無新增 npm 相依）。涵蓋原文備份、拓樸與 history、損毀／未知版本／quota、失敗還原、跨頁變更、去重、權限、衝突、不可變修訂、原子檔案恢復、有限重試與額度、逾時隔離，以及實際 data.js 種子／migrate。測試不操作正式 localStorage 或雲端資料。

尚需使用者決定：

- #2／#3 的整合先後、是否採既有 Supabase 草稿，或另一後端；本版不選雲端。
- 正式帳號／BOT 身分與角色授權、私人讀取範圍、審核入口。
- 研究分類與「已驗證」的產品規則、版本顯示、跨 BOT 共用 taskId 的分派方式。
- 配額單位／上限／重置週期、備份保留期限與恢復目標。

這是可測試的基礎模組與本機保護增補，不是已上線的多 BOT 系統。未合併 main、未部署、未碰 World Flow Map。

本次執行結果：20 項 Node 測試通過，app.js 語法檢查通過。Chromium 未安裝且下載失敗，未完成瀏覽器 3D／影片端對端驗證；合併前仍需實機驗收。
