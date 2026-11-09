# 第一大腦｜世界如棋局 × N-ary 到隔離預覽部署的工程 Gate V0.4

狀態：`CANDIDATE_STAGED`, `PUBLIC_RELEASE_NOT_AUTHORIZED`, `FULL_SYSTEM_PRODUCTION_NO_GO`。

## 實際完成／新增

- 從 PR #130 沿用 `world-chess-lineage.mjs` 及 T01–T21，移植到 PR #131 的 WebKit/安全修補下游，不動核心 V1.4–V1.6。
- `preview/chess-core.mjs` 透過真 `createTypedTransformEngine()` 建立 X，利用同一 X 在同一固定 S0 的兩條分支生成不同 `derivation_event_id`。輸出只含 `NOT_EXECUTED`, `NOT_APPROVED`, `NOT_VERIFIED`；不是實際世界因果模擬或 AI 運作。
- 公開候選靜態檔案使用固定 allowlist 打包；不用 `cp -r` 複製整個私有 repo。發布包含 `index.html`, `pilot-manifest.json`、既有 N-ary 試用頁、世界如棋局展示頁與必要底層模組，**沒有** `memory.js`, `api/`, credentials, raw conversation 或私有資料。
- `pilot-manifest.json` 是在打包時由確切 `git rev-parse HEAD` 生成，列出 **每一個發布檔案**的 SHA256 和 bytes，而非復用已知過期 `#127` 宣稱。
- 公開網站驗證需要 200 回應、manifest 固定 expected SHA、11 個 allowlist 檔案全數 hash 一致。**404 必須整個 gate 失敗**，不能透過 `exit 0` 偽裝部署完成。
- PR 同版 workflow 只建構可下載的隔離 artifact 並以 WebKit 模擬行動瀏覽器。`workflow_dispatch` 嚴格公網驗收是獨立手動檢查，沒有自動發布。

## 已知外部阻斷

1. 既有 PR #131 public probe run `42521256723` 實際 `HTTP 404`，所以就算 `gh-pages` 存在，仍需查 GitHub Pages Settings / 發布模式 / Domain / Permissions。**不能由本回合工具替使用者切換 Pages 設定。**
2. PR #131 只有 WebKit 模擬，沒有真人 iPad / iPhone Safari 連線及操作錄影；WebKit PASS 不可替代實機。
3. staging 與正式第一大腦是不同 Release；世界模型/記憶 writer、真 AI receiver 身分與 ACK、PG STOP/恢復、正式因果等仍是 P0 阻斷。
4. `source_id`, `capabilities` 及 available_at 在本預覽是呼叫端宣告，不是經外部簽章可信來源；SHA256 只是內容一致性，非身份授權。
5. 若現有公開 Pages 配置仍 404，不得由未經審核的低權限工作流自動開啟 Pages 或繞過 GitHub 權限。修完檢查後，再由有權限者同意部署可回退且已審核的靜態 artifact。
6. 正式對外發布前應補齊第三方授權／依賴審查、安全應變流程、正確的維護頁回退，且獨立審查者必須核對最終 SHA。上一版 `gh-pages` 舊快照有空白轉零缺陷，禁止盲目回退。

## 建議集中審批門檻

A. 隔離預覽：同 SHA Node / WebKit 通過、打包 manifest 正確、無私人資料、安全停用頁審核、Pages Settings 和 HTTP200 全檔讀回、實體 Safari 過關。
B. 正式主系統：另外滿足 #41 真 AI ACK/身份、PG 交易/STOP/撤權、記憶與世界模型持久寫入/歷史/備份/回退、權限審計、真環境失效注入、獨立審查、使用者決定發布範圍。

此文件不授權 merge、公開、雲端採購、連線正式記憶或正式部署。