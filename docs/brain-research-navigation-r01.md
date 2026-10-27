# 第一大腦研究模組最小整合 R01（隔離 Draft）

## 本次目標
在不新增中央資料庫、不修改 GPT② 的記憶體體系、不聲稱 GPT 自動收件的前提下，讓一個**真實的研究節點 ID**在既有 `index.html`、`feed.html`、`world-model.html` 間保留與回查。

## 分工與唯一權威來源
- 3D 主腦 `aiBrain.v1`：節點及關聯的本機權威來源；PR #68 負責其保存完整性。本整合不改動資料治理規則。
- Feed：只按同一 `aiBrain.v1` 提供不同視角。
- 世界模型：獨立保留 `worldModel.verify.v1` 等研究案例，只有**唯讀來源指標**，無權把假設寫入主腦、候選記憶或核心記憶。
- 主腦控制台：導航入口，不複製 PR #28 的專案狀態管理。
- GPT② 記憶治理：由既有 #54/#55 繼續，當前沒有自動接線。

## 已實作資料邊
```text
3D (selected node ID) --href (?node=ID)--> world-model
world-model --read-only id lookup--> aiBrain.v1 node
world-model --#node=ID--> 3D / Feed
Feed (current node ID) --href (?node=ID)--> world-model
world-model manual JSON export --research_reference--> node_id + brain_id + unverified
```
- 使用 `research-context-bridge.mjs` 作為**唯一的來源 ID 解析與 URL 建立函式**，不另外建立保存倉庫、背景 worker 或收件服務。
- 來源為已驗證的 ID（字母、數字、底線、點、冒號、連字號；長度 1~160）；網址不攜帶節點文字或私人記憶。
- 世界模型取得的節點標題以 `textContent` 呈現，失效來源不冒認。
- 世界模型的研究匯出 `research_reference` 僅含 `brain.research-link.v1`、來源、節點 ID、腦區 ID、`local_read_only_unverified`、`reference_only_not_evidence_or_approval`；不代表來源證明或因果驗證。

## 檢查與實際結果
- [GitHub Actions #40459001027](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40459001027)：2026-10-27 原生 Node22 46/46 PASS，Google Chrome / Playwright 7/7 PASS。
- 研究特有測試：Node 9/9 PASS、Chromium 3/3 PASS。涵蓋 3D→世界模型→Feed ID 往返、匯出參照、本機資料不改寫、缺失 ID、無來源研究模式、中央控制台入口。
- 既有 PR #68 回歸：Node 37/37 PASS、Chromium 4/4 PASS。包括資料匯入、保存、Undo、重置、損壞資料及多分頁保護。
- 第一輪 Chromium 發現測試未先建立主腦本機資料而預期 `missing`；實際應為 `not_saved`。已調整測試建立真實資料後查詢未知 ID，並區分空參數與非法參數。保留首次失敗紀錄而非隱藏。

## 尚未完成／正式部署 Gate
1. 來源參照是**網址上的節點 ID**，不包含證據鏈、核准身份、權威版本、跨裝置可驗證快照；使用者更改或刪除主腦節點後，來源可能變成 `missing`，應如實顯示。
2. 世界模型研究假設沒有自動形成可審查的主腦分支、事件 ID 或有版本的研究鏈；需後續設計候選資料合約與審查回合，不能直接寫入正式主腦。
3. 專案治理 PR #28 仍是獨立 Draft；三方 GPT①/GPT②/BOT③ 自動執行與驗證 ACK 未接通。
4. 真正 Safari、iOS、跨設備、舊歷史資料、GPT②/BOT③ 獨立審查仍需證據。
5. 本整合**疊加**在 `fix/brain-import-integrity-isolated-20261027` Draft PR #68 上。兩者未獲獨立審查前，不合併 `main` 或正式部署。

**狀態：第一段跨頁研究來源連接「隔離整合 E2E PASS」，整體主腦正式連線／記憶體審查／部署仍未驗收。**
