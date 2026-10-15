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

（以上為 PR #4 原始說明；P0 整合後的行為以下一節為準。）

## P0 保護基線（integration/p0-baseline，2026-10-12）

依《主腦與 World Flow Map 共用架構設計稿 v1》§11 P0：整合 PR #4 存檔保護、涵蓋各資料鍵的備份、私人讀取規則。只在本機分支，**未 push、未部署、未在任何 Supabase 專案執行 SQL**。

### 本機存檔（reliability/storage.mjs、app.js、world-model.html）

| 項目 | 行為 |
|---|---|
| 損毀或未知版本 | 原文不覆寫、不以種子覆蓋；顯示 zh-TW 保護橫幅（`#persistBanner`），可「匯出原始存檔」或「從備份還原…」；壞資料不會寫成備份，也不會把好備份輪替掉 |
| 備份範圍 | `aiBrain.*` 的資料鍵＋`worldModel.verify.v1`；排除 `aiBrain.v1.undo`、`aiBrain.audioLab.*`、`aiBrain.auth*`（登入 token）、`aiBrain.sync.*`（可重拉的快取） |
| 備份格式 | `formatVersion:2`，附 manifest（鍵清單、每鍵 SHA-256 與大小、節點／世界模型筆數）；雜湊不符或含未知鍵不能還原；舊 v1 備份仍可還原 |
| 輪替 | 自動備份最多 3 份（相同內容重用）；`quarantine.*`（還原前損毀原文的隔離副本）不參與輪替 |
| 還原 | `AIBrain.listBackups()`、`AIBrain.restoreBackup(key 或物件)`、橫幅按鈕；先備份目前資料（損毀時另存隔離副本），逐鍵寫入驗證、失敗回滾，完成後重新載入 |
| 另一分頁寫入 | 進入 `conflict` 狀態：橫幅＋`AIBrain.on('persistence')`＋`window` 的 `aibrain:persistence`＋`body[data-persist]`；選「載入最新版本」（先把此分頁未存的版本存成備份）或「保留這個分頁的版本」（先備份另一分頁版本再覆蓋）；離開頁面時有未存修改會提示 |
| 容量已滿 | `save-failed`：原文不變、顯示「儲存空間已滿」，可清理舊備份或再試；復原暫存寫不下時自動少存幾步 |
| 輕量復原快照 | 沒有 `history` 的復原快照可通過驗證，復原時沿用目前 history |
| 世界模型頁 | 紀錄無法辨識（損毀、非陣列、含非物件、超過 500 筆）時不覆寫、不截斷，顯示保護提示；載入與匯入前備份（主腦存檔損毀時只備份世界模型） |

`AIBrain.persistenceStatus()` 回傳 `{ mode:'ok'|'blocked'|'conflict'|'save-failed', blocked, conflict, saveFailed, error, lastSavedAt }`。

### 雲端（supabase/schema.sql、sync.js、sync-core.js）

- 私人讀取：四張資料表只有該 graph 的編輯者可讀（`is_graph_editor(graph_id)`）；anon 無任何權限；公開網站未登入時只用內建資料。
- 版本化寫入：`brain_apply(graph, ops)`，每筆帶 `base`；不符 → conflict（不覆寫、存 `brain_proposals`），同內容重送冪等，meta 字串陣列取聯集；接受的修改寫 `brain_revisions`。`brain_reject_proposal()` 記錄「保留雲端版本」。
- 用戶端：衝突顯示 `#syncConflict` 橫幅，`AISync.conflicts()`／`resolveConflict(key,'cloud'|'mine')`，不自動重送衝突中的修改。

### 給 P1 的準備與已知界線

- `brain_proposals`／`brain_revisions` 是 P1 提案＋審核 API 的資料雛形；P1 需加 `operation_id`（冪等鍵）、`task_id`、`base_versions`（多實體依賴）、`source_ids`／`evidence_ids`、`classification`、`reason`、trace_id 與 outbox 事件，並把「接受」移到可信服務端，限人工。
- 目前的「版本」是每列計數器（revision 語意），與 `schema_version`（格式版本）分開；`workspace_id` 尚未建立，只有 `graph_id` 範圍。
- 衝突的「用我的版本覆蓋」由編輯者本人決定，等同人工審核；BOT 不得列入 `brain_editors`。
- localStorage 沒有跨鍵交易；跨分頁衝突偵測依賴 `storage` 事件與寫入前比對，不是多 BOT 交易儲存。
