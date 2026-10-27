# 第一大腦 R02｜舊概念轉換模組相容性與最小重用 Gate（隔離 Draft）

日期：2026-10-27。本次回查私人規劃中「語意／邏輯尺度／證據版本」三種轉換，沿用 PR #4/#13/#28；此公開 GitHub 文件只登記一般技術欄位與合成資料，不貼出私人第一大腦規劃或記憶庫原文。

## 分工與邊界
- 使用者的第一大腦：研究方向、概念判定與核准權；GPT①：工程相容性與測試；GPT②：記憶與來源證據；另一線：概念發散。
- 本 PR base 為 PR #74 隔離分支（再疊 PR #72、#71、#68）；不合併 main、不部署、不付費、不開遠端 AI 自動化。

## 舊程式重用列表
| 舊 PR | 來源與功能 | 真正可重用 | 必留界線 |
|---|---|---|---|
| #13 （671079ab） | question-gate-v2.js | 定義、前提、替代原因、反例、測量與時間五道反問 | 填完不是已證因果 |
| #28 （75e93c6d） | tcvl-candidate-core.js | 來源、上下文、對照、證據、因果引用的候選門檻 | 缺證據必須待審；不能寫 GPT② 的私人記憶 |
| #28 | tcvl-traceback-core.js | 回溯、依賴影響、同條件重測比較 | 必須先轉換資料及關係型別 |
| #4 （b32c6aa8） | reliability/storage.mjs | 備份、拓樸驗證、回復保護 | validateGraph() 的 graph.version 是另一個格式前提；不可直接與 PR #68 兩套保護器疊加 |

## 最小唯讀概念映射
新增 concept-reuse-compat.mjs 是純唯讀投影器，不建立新資料庫。只在下列來源身份一致時，提供「待審查的概念參照」：
1. readNodeContext() 驗證的 aiBrain.v1 節點；
2. readWorldLedger() 驗證的 worldModel.verify.events.v2 日誌；
3. 研究建立當時就記下與目前相符的 sourceNodeId（後續狀態修改的來源 ID 也不得衝突）。

輸出 schema tcvl.claim-ref-preview.v0.1：node_id、world-model record locator、假設原句、反例條件、版本事件 ID、日誌版本、研究狀態；正式 canonical Claim ID、真正內容修訂 ID 及證據獨立驗證都**未獲得**。關聯型別為 context_reference 而非已證因果。即使來源是 https URL，也只視為線索，不自動放入 evidence_refs。

舊 v1 記錄、整批匯入、建立時缺 sourceNodeId、損壞圖／損壞日誌均不可冒稱已有可信 node↔claim 身分。轉成 PR #28 候選輸入仍需手動選 ID 與登錄時間，保留 context/memory/causal 的個別缺口，由舊候選規則決定是否 hold；不得自動核准。

## 相容性測試目的
- 一 Node 可對應多個獨立 Claim；Node ID 不等於 Claim ID。
- status 更新不等於因果或內容修訂已通過審核。
- 來源連結與證據認證不能混；世界時間、事件記錄時間也不能混。
- 舊 TCVL-04 只接受 depends_on/related_to/supersedes 等已定義關聯種類；context_reference 不可直接匯入。
- PR #4 要求 graph.version；同格式的明確遷移與保護責任去重仍待真正設計。
- 五道反問完成可以顯示「題目可審查」，但必須保持 certified=false。
- 外部憑證、真實資金、私人記憶、付費來源及遠端 AI 交接均不在測試內。

## 完成等級
當前目標是「隔離 contract/adapter 的正反測試」；正式 Node ↔ Claim ↔ Revision 權威後端、實機 Safari、真正多端同步、PR #28 UI 全整合、獨立 reviewer ACK 均未完成。

使用現有 CI 配額與合成資料先驗證，避免為尚未證明的相容性購買工具或新增系統。

## 2026-10-27 真實執行證據 R02
- [GitHub Actions #40470391333](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40470391333)，受測程式 SHA：`bb60e42f0187ef24b0389fdd693128f42bfafe52`，結論 **completed/success**。
- Node.js 22：**108 / 108 PASS**（原 86 + 新 17 純投影測試 + 新 5 個對**舊 PR 原程式**的直接相容測試；0 FAIL）。
- Chromium：**19 / 19 PASS**，原先 3D / Feed / 世界模型 / 保存 / 還原 / 雙分頁與模擬觸控回歸持續無失敗。
- Node CI 測試前從 PR #28/#13/#4 的 GitHub PR refs 讀入檔案，先驗證它們的 commit SHA 分別固定在 `75e93c6d...`、`671079ab...`、`b32c6aa8...`，才執行原版 `TcvlCandidateCore.candidate/evaluate`、`TcvlTracebackCore.validateHistory/compareRetests`、`QuestionGateV2.build/review` 和 `validateGraph`；**不是憑新模組自行聲稱舊 PR 相容**。
- 明確保留的相容問題：舊 PR #4 需圖資料 `version`，而當前部分有效主腦資料沒有此欄；PR #28 對關係種類 `context_reference` 的校驗會拒絕，必須保守轉成 `related_to` 且不得假稱 `depends_on`／已證因果。
- 新的 read-only Claim preview 與 TCVL 候選輸入確實可連，但即使構造出資料格式，PR #28 審核仍是 `hold`（因未提供證據、比較和可確認的研究上下文），**這是測試預期的安全結果**，不是待修錯誤。
- 文件增補不更動已受測功能碼。PR #75 保持 Draft，無法取代獨立審查、真實 Safari／iOS、可信正式 Claim 版本庫／已核准記憶或真正跨 AI ACK。

## R03 逆向查核：舊／新驗證規則與已確認競態風險
- 採用 [Issue #32 R03 待辦](https://github.com/keqingwu5-cloud/ai-boundary/issues/32#issuecomment-6436892968)，不新建平行主腦工程。
- 從舊 PR #4 與目前 PR #68 守門器的實際程式反推：新守門器原先對 brain-parent 只確認存在、不確認祖先循環；且顯式未支援的 `graph.version=999` 會先被接受再由 `migrate()` 改寫到 v2。已在 **PR #75 隔離分支**修補 `brain-import-guard.mjs`：拒絕 `brain_parent_cycle` 及 `unsupported_graph_version`。這不代表原 PR #68 branch/main 已修補，未授權合併。
- 新舊 validator 差異矩陣 **17 組合成圖**：其中 5 類不同判定（缺 graph.version、缺 node.pos、缺 node.title、無效 media、同節點 self link）；新版不盲從舊版，舊版也不直接覆蓋新版。另以真正 Chromium 檢查未來版本／父腦循環是否被拒絕，且原資料不變。
- **重要風險**：此前 Chromium 跨分頁測試曾在另一分頁 commit 後、此分頁還沒有收到更新通知時接受了更新（[run #40471786165](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40471786165) 的世界模型第 09 測試 FAIL）。這符合 `localStorage` 非原子同步的已知限制；未直接修改測試期待來假稱安全。後續將「已收到 `storage` 通知的過期寫入」列為可測的現有防護，另新增模擬延遲跨分頁可見性的**明確資料遺失反例**。這個反例測試即使通過也代表風險確實存在，**不代表已修復真正並發競態**。
- **後續 Gate**：若要支持真正同時寫入而非單分頁或已有更新通知後寫入，需要具交易保證的單一權威保存協調機制（原子鎖／序列化後端等）及跨瀏覽器負向測試；採購、部署、合併都需另外審核。

## R03 隔離驗收補證與仍未修正的高優先風險（2026-10-27）
- [Actions #40472181215](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40472181215)，程式 commit **`0fc59cf5580a59dff9b41a5d8312dd444cc6d1df`**：Node.js **127/127 PASS**、真實 Chromium **20/20 PASS**。
- 新增 PR #4 與 PR #68 guard 的 **17 組合成圖差異比較**，發現 5 種判定不同：舊圖沒有 version、沒有節點 pos/title、無效 media、self link。原因是舊版與新版 schema 的寬鬆程度不同，不可視為彼此可直接替換。
- 新守門器的 **brain-parent cycle** 與顯式 **未來 graph.version=999** 已在 PR #75 隔離程式修補；原始 Chrome 導入反例拒絕後、localStorage 與記憶體主圖保持不變（`GRAPH_FUTURE_SCHEMA_AND_BRAIN_CYCLE_BROWSER_REJECTED`）。缺 version 的歷史候選暫維持兼容，若要改政策需先有授權舊資料樣本和人工批准。
- **真跨分頁競態未修復（BLOCKED）**：早期 Actions [#40471786165](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40471786165) 實際 Chrome 測到 world-model 分頁在尚未收到另一分頁最新狀態時，過期寫入未被攔截；後續 Node 模擬 `KNOWN_CROSS_TAB_RACE_UNPROTECTED` 也明確再現資料被覆蓋。現成功的 `WORLD_MODEL_STALE_TAB_REFUSED` 只證明**另一分頁的 storage 通知已送達**後能拒絕過期寫入，不能充作同時寫入有交易保證。
- 關聯原待辦 R03-05、#09/#12/#15：要真正容許同時編輯，需另外驗證一種原子序列化保存機制（有完整鎖或後端交易）及 crash/reload/回滾 E2E，不在本次 Draft 安全聲明範圍。
- **本次完整測試綠燈不能解讀為所有問題已解決**；其中有明確的「缺陷成功重現」測試。正式 main/原 PR #68 尚未收到這個 PR #75 的修補，也沒有合併、部署、實機 Safari 或獨立審查 ACK。


## R05｜並發寫入時失敗回復的最小保護（2026-10-27；原 R03-01／05）

**問題分類**：E／concurrency_integrity（主要 R03-05）；A／persistence_failure（關聯 R03-01）。在 `commitBrainImport()` 發生主/Undo 雙鍵寫入後的讀回失敗時，舊版 rollback 無條件用先前快照還原鍵值。如果另一分頁在此期間已寫入新值，回復操作本身可能再次覆寫他人的新資料。

**隔離修補**：PR #75 的 `brain-import-guard.mjs` 改用 `restoreIfOwned()`。嘗試回復前先讀取鍵值：只有仍等於本次寫入內容才可進行補償還原；若內容不同，保持新值不動、傳回 `ok:false, rollbackOk:false`，由既有 UI 顯示未回復及備份警告。這是**盡力降低額外覆寫**，不是原子比較與交換。若檢查與還原之間再有另一寫入，仍有競態。

**新增負向測試**：`tests/brain-import-integrity.test.cjs` 的 #21 模擬主資料及 Undo 寫完後被另一寫入者取代，再引發讀回不一致；#22 模擬主資料寫入例外、另一寫入者已更新 Undo。兩項均要求「不再覆寫他人的值」並回報 rollback 未能安全完成。

**真實 CI**：程式修補提交 `6620116eedaa203f043098656762a9e917998566`，測試提交 `a1f5944c67d39574da86aea47dd3cf34a209817b`；[GitHub Actions #40509586613](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40509586613) Node **129/129 PASS**、Chromium **20/20 PASS**，兩個 job 均 success。**Chromium 20 項為既有整合回歸，新增的 #21/#22 是 Node 合成競態注入，並非 Chromium 真正同時寫入安全驗收。**

**未解除 Gate**：`localStorage` 沒有跨分頁原子 CAS；世界模型真正競爭寫入、崩潰/回復及多裝置的原子一致性仍 **BLOCKED**。PR #75 Draft、未合併 main；PR #68 上游分支沒有本修補；GPT②/BOT③ 獨立 reviewer ACK、Safari 實機及授權舊資料相容 Gate 未證實。不得把局部補償修正標成全平台並發修復。


## R06｜交易式單一權威保存候選：IndexedDB 兩分頁競爭（2026-10-27）

**歸類**：R03-05／E 並發一致性（P0）；涉及 R03-01／A 保存一致性。此版本只有**隔離基礎能力證明**，不是 3D／世界模型正式接線或合併授權。

- 新增 `transactional-brain-store.mjs`：每筆 `snapshots` 資料使用**同一個 IndexedDB readwrite transaction** 讀取目前 `revision`、比對 `expectedRevision`、寫入同一物件中的 `mainRaw + undoRaw + revision`。只有交易 `oncomplete` 才回傳成功；`onabort` 返回失敗。版本過期返回 `stale_revision` 並不覆寫已提交內容。
- 新增 `tests/fixtures/transactional-store.html` 與 `tests/transactional-brain-store-browser.test.cjs`：真 Chromium 兩分頁、同一 origin、分別在 revision 0 和 1 發起兩輪競爭；各只有一方成功，主資料和 Undo 的 owner 相同；另外測過期寫入拒絕、**原生 IndexedDB 寫入後 abort**、刷新後回查、舊 localStorage 主資料及 Undo 原始 bytes 未被動到。
- GitHub Actions workflow 將新瀏覽器案例納入原隔離回歸；沒有另開部署或第二套驗證室。

### 實際證據及完成分級

- 被測提交：`4aca865d69e7722414b851fbda18ca3354b9a761`。
- [GitHub Actions #40512209070](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40512209070) 的兩個工作均 `success`：Node **129/129 PASS**；真 Chromium **21/21 PASS**。
- 新增 log：`R03_IDB_TRANSACTION_CANDIDATE_PASS two_tabs=2 collisions=2 aborted=1 revision=2 legacy_bytes_preserved=1`。
- **已證**：隔離 IndexedDB 單筆主資料/Undo 原子版本更新，在已測雙分頁條件下不允許兩個過期寫入一起成功；中止回復、重載保持資料。
- **未證／仍 BLOCKED**：目前 `app.js` 和 `world-verification-ledger.mjs` 還在同步使用 localStorage，並沒有轉接交易式來源。原本真並發遺失風險因此**仍存在於正式入口**；本次不可宣稱整體 R03-05 修復。

### 下一階段最小安全接線 Gate（未執行）

1. 定義單一權威：所有 3D 的 import／mutate／undo／reset／load，以及世界模型 create／status／delete／import／restore，必須要麼全走交易接口，要麼維持阻塞；不得讓部分舊 localStorage 寫入和新 IndexedDB 權威同時競爭。
2. 將同步 UI 函式調整成明確的非同步確認流程；只有 IndexedDB `transaction.oncomplete` 才可更新畫面成功狀態，並支援在 `stale_revision` 時回載／比對或拒絕變更。
3. 先做合法舊快照格式分類、原始 bytes 備份、唯讀預覽與可逆遷移；不自動覆寫、不自行以新版 schema 拒絕歷史有效資料。不可依賴真實私人檔案而未經授權。
4. 補瀏覽器意外關閉、quota、資料庫不可用、版本衝突、並行交易排隊、儲存讀回及 Safari／行動實機。交易原子不等於跨裝置同步、備份、不可竄改或外部資料庫交易。
5. 仍需獨立 reviewer、授權正式合併與部署。只有隔離 proof-of-concept 通過；**正式 Gate 保持 BLOCKED**。

與前一輪 `restoreIfOwned()` 互補：R05 只是局部避免錯誤回復再覆寫別人；R06 的真正交易候選消除單一 IndexedDB 記錄內的讀寫競爭。兩者均不代表未改造的既有 localStorage 流程已具交易保證。


## R07｜第一大腦 3D 真實資料接入：從純交易原型進到現有主腦格式（2026-10-27）

**問題：R03-05/E 並發一致性；R03-04/A 舊資料格式相容（相鄰），不是整個主腦已上線。**

R06 已以合成快照證明 IndexedDB 在相同 object store 的交易式版本比對有效。本輪增加 `first-brain-idb-adapter.mjs`，將既有 `aiBrain.v1` 的**真 3D 圖資料、Node ID、History 與 Undo 字串陣列**驗證、無損複製進隔離 IndexedDB 的原子記錄，而不是自建另一個圖 schema。

### 最小安全工程

- `inspectLegacy3D(storage)`：唯讀檢查既有 main 與 Undo 原始 bytes；以原 `validateBrainImport()` 驗證節點及拓樸，拒絕壞 JSON、未知未來版本、壞 Undo。**不自動 seed、不替錯誤資料補版本、不覆寫**。
- `stageLegacy3D(databaseName,storage,{confirmed:true})`：沒有明確 `confirmed` 直接拒絕；如果新交易快照已存在也拒絕重蓋。成功後保留舊 localStorage 逐位元組原值；目前只在隔離測試明示確認，並非使用者對真實舊資料的正式遷移授權。
- `readTransactional3D()`、`commitTransactional3D()`：完整圖及 Undo 驗證後，將 mainRaw、undoRaw、revision 送入 R06 的**同一筆 IndexedDB readwrite 交易**。版本過期拒絕而不是最後寫入者覆蓋。

### 真 3D 瀏覽器整合證據

[GitHub Actions #40519811581](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40519811581)，測試提交 `61c0498ae906a147dc945a65c437a884627b6f12`：Node **129/129 PASS**、Chromium **22/22 PASS**，0 FAIL。

新增 `tests/first-brain-idb-browser.test.cjs` 直接開啟兩個真實 `index.html` + `window.AIBrain.getState()`，以隔離合成/seeded 3D 資料：
1. 未明確確認的複製拒絕；新 DB 保持空；壞 JSON 與 version=999 拒絕。
2. 對現有 3D graph／Node ID 的 legacy bytes 完全保留，不自動重建；重複 stage 不可覆寫既存交易版本。
3. 兩分頁同時從 revision 1 編輯實際 3D graph，只有一筆 commit；另一筆回 `stale_revision`。Undo 保存之前真圖、同版本提交。
4. Reload 後 IDB revision/圖仍一致；舊正式 UI 的 localStorage main/Undo 原始 bytes 不變。

日誌標記：`R03_FIRST_BRAIN_IDB_ADAPTER_PASS real3D=1 concurrent_edits=2 committed=1 stale=1 undo=1 legacy_preserved=1`。

### 接下來的第一大腦實作（尚未完成）

- `app.js` 中 `save()`、`commitChange()`、`mutate()`、`undo()`、`resetAll()`、`importJSON()` 仍直接同步呼叫 localStorage，且多處 UI 事件假設同步返回；**此輪沒有改造成異步 IndexedDB writer，也沒有啟用 transaction authority**。
- 真正遷移必須先給使用者非破壞式備份、預覽差異、授權開關；後續選定單一權威後，全入口 read/write/Undo/reset/import 及渲染成功提示要依交易 commit 結果同步改造。
- 必須補新舊格式歷史樣本、失敗回滾、崩潰恢復、真 Safari/行動裝置與獨立審查。舊世界模型仍獨立，本輪不動 GPT② 記憶體。
- **Gate：3D 真實格式的交易接入層候選 PASS；第一大腦正式 UI/持久化切換 BLOCKED，main 未合併、未部署。**

## R08｜第一大腦實際 3D 操作介面交易化與跨頁驗收（2026-10-27）

**定位**：優先完成現有第一大腦（3D 主腦、Feed 唯讀對照、世界模型唯讀來源）的隔離工程，不是新增第二套主腦、資料庫或 Bot 規則。延續 R03-01/03/04/05 與原 #09/#12/#15；正式 main/部署/真實用戶資料遷移仍未獲批准。

### 真正整合到現有 3D 介面（僅隔離分支）

- `app.js` 新增**明確選用**的 `index.html?brainTx=1` 交易模式。無 IndexedDB 快照時只顯示舊資料唯讀預覽；必須先按「下載舊主腦原始備份」，再人工確認，才允許在本機隔離複製並設置舊寫入阻擋標記。不自動重置、刪除或偷遷舊資料。
- 交易模式由 `readTransactional3D()` 取得真正的圖／Undo／revision，並透過 `commitTransactional3D()` 在同一 IndexedDB readwrite 交易完成後才更新 state／Undo 並提示已保存。現有 `mutate`、`undo`、`resetAll`、`importJSON` 入口已處理非同步保存和 stale revision；提交中會拒絕重疊寫入，抑制舊 UI 的提前成功提示。預設 legacy 模式沒有擅自改成新版。
- 開始啟用後，**本候選程式版本**的 legacy writer 讀到 authority 標記會拒絕更新；已打開的交易分頁若收到版本廣播也會提示刷新。注意：任何*舊程式版本*或未遵守標記的其他 writer 仍可能寫 localStorage，不能宣稱跨版本、跨裝置達成同一個全域交易權威。
- `feed.js` 在 authority 已切至 IDB 時只讀交易資料，不能以過期 localStorage 假裝來源正常；BroadcastChannel 通知更新；`research-context-bridge.mjs` 與 `world-model.html` 的**主腦來源參照**同樣從有效交易圖查 node ID，且會連回 `?brainTx=1` 3D 頁面。這**沒有**更改世界模型自身的研究日誌權威或獨立的因果/記憶 Gate。
- 功能回歸檢查真實 3D 存檔格式的新增問題、子分支、子腦分裂/併回、概念、研究進度、匯入、復原、重置、重置後復原、刷新；兩個交易分頁同時以相同 revision 修改時一方成功一方 `stale_revision`，老式分頁被阻擋。所有新增案例使用**合成/seed 圖資料**，並未讀取私人歷史檔案。

### 最終實測證據（隔離候選）

- [GitHub Actions #40527834817](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40527834817)，測試程式 SHA `3be88972f2216e5f3263d6c249070061a8dabeb6`：Node.js **129/129 PASS**，真 Chromium **23/23 PASS**，各 0 FAIL。
- 日誌：`FIRST_BRAIN_TX_UI_ROUNDTRIP_PASS native3D=1 old_tab_blocked=1 competing_tabs=2 grow=1 branch=1 subbrain=1 merge=1 concept=1 import=1 undo=2 reset=1 feed_linked=1 world_source_linked=1 legacy_bytes_unchanged=1`。
- 原有兩項交易式 adapter/純儲存 Chromium 案例仍持續通過，測試並非僅文字報告；本次 docs 提交在程式測試後，不改變受測 SHA。

### 狀態與不能冒稱完成的事

- **完成（隔離）**：第一大腦的現有 3D 操作介面到 IDB 交易的主要通道、跨分頁競爭、Feed／研究來源唯讀一致性及 Chrome E2E。
- **未完成（正式 Gate）**：授權真實舊資料樣本相容與備份/回退演練、真實 iOS/Safari 裝置、IDB quota 與突然關閉全失敗矩陣、不同程式版本共存過渡期的單一權威切換、獨立 reviewer ACK、PR 疊接整理、正式合併／部署／使用者驗收、長期備份及多裝置同步。
- **旁支仍阻塞**：世界模型的 `worldModel.verify.events.v2` 仍使用 localStorage，沒有自動升級為交易式保存；R03-05 不能全域結案。Node ID 一致不能當 Claim、因果或記憶已核准。

**結論**：第一大腦 3D 主要功能及單機交易候選已完成可驗證的隔離實作，但「第一大腦所有工作正式完成」仍不成立，不能替使用者跳過真實資料與正式發布的 Gate。

## R09｜第一大腦交易故障注入：IDB 禁用與原生 Abort（2026-10-27）

**分類**：R03-01/A 保存失敗假成功、R03-05/E 並發與交易安全；R03-12/D 測試替身／證據歸因。沿用原 #09/#12/#15，只有隔離分支的合成資料，主線、私人歷史、GPT② 記憶和世界模型 journal 未改。

- 新增 `tests/first-brain-transactional-failure-browser.test.cjs`，並納入既有 `.github/workflows/brain-import-integrity.yml` 的真 Chromium 套件。
- **負例 1：資料庫無法開啟**。在真瀏覽器攔截 IndexedDB open 並擲出 `SecurityError`，確認 `?brainTx=1` 沒有可讀交易快照時 `persistence.ready=false`、只能唯讀、修改被拒、不寫 legacy raw，也不宣告保存成功。標記 `FIRST_BRAIN_IDB_UNAVAILABLE_READONLY_PASS`。
- **負例 2：原生 IDB 交易中途 Abort**。從已備份並明確切換的合成主腦副本，在 object store put 時觸發原生 transaction.abort()，驗證 `setStatus` 提交失敗、畫面不冒稱成功、graph/Undo 交易版本不變、原 legacy bytes 不變，頁面刷新後仍讀回舊版本。標記 `FIRST_BRAIN_IDB_NATIVE_ABORT_ROLLBACK_PASS revision_unchanged=1 legacy_unchanged=1`。
- **測試資料兩次修正有保留失敗證據**：
  1. [#40530078531](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40530078531) Node PASS、Chromium **24/25**，新案例未先建立 legacy 快照，備份按鈕正確拒絕，測試等待下載超時。主責 `test_fixture`。
  2. [#40530573498](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40530573498) Node PASS、Chromium **24/25**，新案例在切換頁面 reload 的瞬間提早讀取 `window.AIBrain.persistence`，測試自身 throw。主責 `test_fixture`／等待條件。
  3. 修正為先從既有 legacy 3D 畫面建立合成快照，並用 optional-chain 等待 reload 後的 API，未關掉故障注入、未放寬原有安全斷言。
- **最後隔離 CI 證據**：[Actions #40531000448](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40531000448)，受測提交 `c63a1880dad083b322479890eaece028e58f6848`：Node **129/129 PASS**、Chromium **25/25 PASS**、0 FAIL。R08 真 3D UI 閉環同時重跑 PASS。

**已證範圍**：現有第一大腦選用的 IndexedDB 保存模式可在這兩種真瀏覽器異常下拒絕錯誤成功、保留資料與原版本。**未證**：不同程式版本同時寫入、停電/程序崩潰的完整耐久性、Safari/iOS 真機、儲存空間壓力長期矩陣、法定/真實舊資料授權遷移、獨立 reviewer、main 合併與部署。仍不可宣稱第一大腦已正式完成或 R03-05 全域解除。

## R10｜權威標記失效與同步寫入例外防護（2026-10-27）

**歸屬**：R03-01/A 保存失敗不冒稱成功、R03-05/E 單一保存權威、R03-12/D 異常證據。接續 R09，不另造並行工作室。僅測試既有 PR #75 隔離程式及合成瀏覽器資料。

### 程式風險與修正
1. 舊 `legacyMayWrite()` 曾以「權威標記不是 `idb`」決定允許舊寫入，對意外標記如 `unexpected_migration_state` 仍可能產生錯誤雙權威。現改為**必須標記嚴格缺席（null）**才允許舊版寫入，其他值 fail-closed。
2. 交易模式即使讀到有效 IndexedDB 快照，也必須**同時看到 `idb` authority marker** 才視為可修改；否則顯示不可用並禁止交易寫入。這不代表能保護尚在執行、根本不遵守該標記的過時程式版本。
3. `transactional-brain-store.mjs` 的原生 `IDBObjectStore.put()` 在 request callback 中同步擲出錯誤時，現在明確 `abort`，回報失敗，而非冒泡未捕捉例外或顯示成功。
4. `feed.js` 與 `research-context-bridge.mjs` 的主腦**唯讀來源**一律拒絕未知 marker，不得把舊 `localStorage` 的節點偽裝成 IDB 權威。這不修改世界模型研究事件 journal。

### 原生瀏覽器測試
- 新增 `tests/first-brain-failure-gates-browser.test.cjs`：未知權威不准 legacy 寫入、Feed 不顯示舊節點、世界模型來源返回 unreadable；模擬 `QuotaExceededError` 觸發 IDB put 中止、已提交快照仍一致；模擬 IndexedDB open `SecurityError` 回報不可用。
- 擴充 `tests/first-brain-transactional-ui-browser.test.cjs`：從真 3D 介面進行已啟動交易模式的修改，向 IDB put 注入配額例外，確認 UI 狀態與 revision 原封不動、未冒稱提交成功。
- **最新已確認**：[Actions #40531796812](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40531796812)，受測 SHA `12077d347d547472a97f7a984cccf3a61ea047b0`，Node **129/129 PASS**、真 Chromium **27/27 PASS**，0 失敗。測試標記：
  - `R09_UNKNOWN_AUTHORITY_FAIL_CLOSED_PASS app=1 feed=1 world_source=1`
  - `R09_IDB_WRITE_FAILURE_ABORT_PASS revision=1 legacy_unchanged=1`
  - `FIRST_BRAIN_TX_UI_ROUNDTRIP_PASS ... idb_quota_failed_safe=1 ...`
- **完成定義**：R10 的隔離負向矩陣已通過；未授權真歷史資料遷移、真實 Safari/iOS、跨版本仍未更新的 legacy writer、持久容量/崩潰與長期備份、獨立 reviewer / main 合併 / 部署仍需獨立 Gate。世界模型自身 journal 並發仍非本輪完成。


## R11｜成功與失敗都形成可追溯經驗：第一大腦回饋閉環（2026-10-28）

**分類**：延續 R03-12／D 測試和反覆修復歸因；R03-09／C 將「觀察、人工審閱、具體證據、結論」分層，避免測試 PASS／個人認可變成普遍真理。不是新增第四個大腦、平行資料庫或 GPT② 記憶體。仍歸第一大腦 3D 主腦與原有 #09/#12/#15。

### 核心方案（隔離 PR #75）

- 新增 \`brain-learning-feedback.mjs\`：同時接受 worked／failed **結果觀察**。每筆記錄保存 nodeId（由所屬 Node 歸屬）、適用條件、觀察、成功關鍵／失敗原因（可能性）、下次做法、證據索引、建立時間、審閱階段。輸入及集合長度有上限；舊版沒有 \`learningRecords\` 的 Node 不被要求補欄位或重寫原始檔。
- \`brain-import-guard.mjs\` 驗證可選 \`node.learningRecords\` 的欄位、ID 去重、資料大小及審閱依據。缺少證據者只准停留在 \`observed\`，不可成為 \`person_reviewed\`。
- \`app.js\` 繼續使用原 \`mutate()\`、Node history、Undo 和已實作 IDB 交易通道，不另建記憶庫；公開 API \`recordLearningFeedback\`、\`reviewLearningFeedback\`、\`findLearningLessons\`。附 \`brain-learning-ui.mjs\` 顯示於原節點面板，使用者可手動記錄、核對、搜尋。
- **保守重用**：只回傳**完全相同的標準化適用條件**、已人工審閱、附證據的紀錄；成功／失敗都可顯示為參考，不自動執行、不自稱證實或訓練模型權重。不同時間、尺度、背景必須重新判斷，並可另保留反例。

### 本輪吸收的真實流程錯誤

一開始新瀏覽器測試檔案雖列入 GitHub Actions 監看路徑，執行指令**沒有**納入，導致先前 CI 27/27 PASS 不能視為新 UI 測試完成。工程把原因分類為 **test_fixture／ci_wiring**，修正後新 Chromium 28/28 PASS，並新增 \`tests/ci-execution-contract.test.mjs\`，以明確斷言確保 workflow 監控的各個 browser test 都存在於實際執行清單。這是從錯誤產生可重用預防規則的工程例證。

### 測試證據與限制

- [GitHub Actions #40539872062](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40539872062)（加入新 Browser E2E）：Node **131/131 PASS**、Chromium **28/28 PASS**，新增 log \`FIRST_BRAIN_LEARNING_FEEDBACK_PASS legacy_record=1 evidence_review=1 exact_match=1 idb_roundtrip=1 undo=1 no_false_truth=1\`。
- 後續 \`tests/ci-execution-contract.test.mjs\` 已在另一筆提交納入 Node 套件，最新單獨測試結果需以對應最後 SHA / CI 判定，不拿先前 PASS 遮蓋尚未執行的改動。
- **已證**：合成 3D 頁面可紀錄正反經驗、條件與證據、明確人工審閱、拒絕無證據提升；相同條件檢索，Legacy→IDB 無損複製、保存及 Undo 均可用。
- **未證**：AI 自動客觀判斷對錯、跨情境泛化、外部證據真偽檢查、GPT② 自動收件、真實個人資料、Safari 實機與正式 main 部署。使用者仍是最終研究判斷者。

**第一大腦實作方向**：從「每次出錯只修局部」走向「結果分類 → 條件及證據 → 根因 → 人工審閱 → 預防性回歸／同條件提醒」。獨立的模型與研究真理 Gate 保留，不能因主腦出現經驗提示就省略驗證。


## R12｜對立結果不等於可直接推薦：第一大腦矛盾經驗審查（2026-10-28）

**歸類**：R03-09（C：觀察／證據／審閱不等於普遍真理）、R03-12（D：根因追溯與不重複犯錯），延續原 R11 成功／失敗回饋。為原 3D Node 的**保守建議層**，不是新增模型訓練、記憶庫或自動決策引擎。

### 已確認的 R11 風險
R11 的 \`findReusableLessons\` 只檢索已審閱的經驗：如果在**相同適用條件**下同時存在一筆「已審閱成功」及一筆「尚未審閱失敗」反例，原實作可能只展示成功、忽略相反觀察；反過來亦然。即使雙方均被審閱，也不能自動選任一為真。這會違背第一大腦「理解對與錯、減少同類問題」的本意。

### 隔離修復
- 在 \`brain-learning-feedback.mjs\` 新增 \`analyzeLearningEvidence(graph,conditions)\`，綜合相同條件下所有**格式有效**的成功和失敗記錄，區分 \`none/pending_review/contextual_candidate/conflicted\`，統計已審閱／待查證與雙方數量。
- 若同條件下同時出現成功與失敗，**即使一邊待審閱**，\`findReusableLessons\` 也禁止回傳單一結果當建議；原雙方結果、觀察、證據與審閱狀態完整保留，不刪除、不修改結論。
- \`app.js\` 保留原 \`findLearningLessons\` API，另提供 \`analyzeLearningLessons\`；\`brain-learning-ui.mjs\` 在 3D 節點側欄顯示「成功與失敗同時存在」及雙方證據，提示使用者核對版本、日期、時間、上下文和來源差異。**不自動推薦或下發工程任務**。
- Undo、保存、原 graph 歷史版本全部沿用原有交易系統；偵測是衍生查詢結果，不建立額外的持久化權威。

### 驗證與不應擴大宣稱
- Node 增加 R12 反例：已審閱成功＋尚待查證失敗、雙方都已審閱、不同適用條件及經驗原文完整保留。
- Chromium E2E 延伸 R11 真 3D UI 案例：先審閱失敗，再在相同條件新增成功觀察，應同時顯示雙方證據、禁止單向建議；撤銷該觀察後恢復原先單情境提示；須以本輪最新 Actions 實際日誌判斷。
- **重要限制**：完全相同的文字條件也可能漏掉實際背景差異，衝突警告只提醒深入研究；不是 AI 自行判斷客觀真偽、推論因果或隱式更改模型權重。舊瀏覽器、正式用戶資料、Safari、獨立 reviewer 和 main 併入仍各自需要 Gate。


## R13｜第一大腦正式驗收：備份一致性與桌面 WebKit（2026-10-28）

**優先級**：第一大腦原 R03-01／A、R03-04／A、R03-05／E 的正式驗收依賴；沿用 PR #75／Issue #32，不擴張 BOT 或記憶服務，不合併、部署或讀取私人歷史原檔。

### 1. 舊主腦備份 → 遷移來源一致性（隔離修補）

- 舊流程可能在下載原始備份後、按下遷移前，從**已被另一分頁修改**的 localStorage 取得不同主圖或 Undo，造成「備份不是實際遷移來源」的隱性版本偏差。
- \`first-brain-idb-adapter.mjs\` 的 \`stageLegacy3D\` 現接受可選的 \`expectedMainRaw／expectedUndoRaw\`；來源原始 bytes 不等於備份即拒絕，絕不覆寫已存在的 IDB 主圖。
- \`app.js\` 僅在下載按鈕取得原始快照後記住該份 bytes，並在明確確認啟用交易權威時交給 staging 驗證。若 staging 非同步期間又**觀察到**不同版本，回 \`legacy_source_changed_during_stage\` 並停止啟用；先前暫存的候選副本保留以利審查，不擅自刪除、重寫或宣稱已完成。
- \`tests/first-brain-idb-browser.test.cjs\` 補真 Chromium 負例：備份後主資料變更／Undo 變更；在 \`put\` 與交易完成之間注入外部變更；都必須拒絕錯誤完成，舊資料保持可回查。**此檢查不是跨版本/外部舊 Writer 的原子 CAS**。

### 2. WebKit 驗收前置（不是實際 iOS Safari）

- 新增 \`tests/first-brain-webkit-browser.test.cjs\`；以 Playwright **Linux 桌面 WebKit** 的另一引擎執行：舊 v1 原始位元組保存、無版本圖相容、明確複製授權、主圖/Undo 同交易、兩分頁 revision 競爭只允許一方成功、重新載入。
- 現有 workflow 新增 \`webkit-isolated\` job，使用固定 Playwright 1.56.1 的 WebKit/runtime。更新 \`tests/ci-execution-contract.test.mjs\`，防止新增 WebKit 檔只進監看清單未真正執行。
- Playwright 官方：[Browsers](https://playwright.dev/docs/browsers)、[Continuous Integration](https://playwright.dev/docs/ci)。官方明確：Playwright 的 WebKit **不是 Apple 品牌 Safari**，Linux WebKit 不能替代 macOS／iOS 平台差異。
- MDN：[Storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)；瀏覽器本機保存預設可能是 best-effort。**即使 WebKit 測試全綠，也不能宣稱資料永遠不會被清除或替代使用者定期備份**。

### 驗收界線

- **程式狀態**：隔離分支已提交修補與測試。請以本 R13 之後的 GitHub Actions 對應 SHA/Run 查驗 Node、Chromium、WebKit **三個 job**，不可沿用 R12 的兩 job 綠燈推定第三者。
- **仍需人員與實體條件**：授權且匿名化的真實歷史快照、真 Safari/iPhone/iPad 實機、跨版本舊 app Writer 的安全切換、全斷電/程序崩潰/持久化政策、真正獨立 reviewer ACK、正式合併/部署及使用者驗收。以上都不能由合成資料與 Linux WebKit 取代，**正式 Gate 仍 BLOCKED**。


### R13 最終隔離 CI（已回讀確認）

- [GitHub Actions #40544148733](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40544148733)；受測程式＋workflow SHA \`098ee2d08b9a48e42d66dead53418139a01706ba\`：\`node-regression\` **133/133 PASS**、\`chromium-smoke\` **29/29 PASS**、\`webkit-isolated\` **1/1 PASS**；全部三個 jobs success，0 FAIL。
- 真 Chromium 新測試標記 \`FIRST_BRAIN_LEGACY_BACKUP_MATCH_GATE_PASS changed_main=1 changed_undo=1 during_stage=1\`：備份與搬移來源不一致、Undo 不一致、搬移中可觀察的新寫入均拒絕宣稱已完成；舊資料未被系統主動覆寫。
- 桌面 WebKit 新測試標記 \`FIRST_BRAIN_DESKTOP_WEBKIT_TRANSACTION_PASS 2tabs=1 CAS=1 v1=1 unversioned=1 legacy_bytes=1 reload=1\`：兩頁同時提交單筆 IDB 修訂，過期交易被拒，v1/無版本舊圖可唯讀驗證且原始 bytes 不變，重新載入一致。
- **正式 Gate 未解除**：本測試不是 iOS 原生 Safari／真 iPhone/iPad，未檢查使用者授權真歷史檔、跨版本未遵守標記的舊程式、作業系統強制退出與儲存清理後耐久性，也未取得獨立 reviewer ACK。正式合併/部署仍未執行。
