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
