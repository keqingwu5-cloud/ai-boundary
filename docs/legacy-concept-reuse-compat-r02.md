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
