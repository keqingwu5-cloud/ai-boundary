# AI 主腦交接接口契約 V0.3（候選／沙盒）
關聯：[Issue #41](https://github.com/keqingwu5-cloud/ai-boundary/issues/41)。本文件不是已部署的自動化，也不修改正式規章或權威記憶。

## 修補範圍
- 新增 `handoff-contract.js`：從 URL 辨識 `provider`、`scope`、`resource_type`、`resource_id`、`canonical_url`；避免把 GitHub Issue #41 當 PR #41。
- 新增事件契約：`task_id`、`event_id`、`correlation_id`、`attempt_id`、`idempotency_key`、`payload_version`、`payload_digest`（SHA-256）、來源／目的 AI 角色與實際 endpoint、原始目的、狀態與證據。
- 提供重試、重複／版本衝突檢查、送達證據檢查、ACK 事件／版本／目的端身分檢查。
- 發射器對預設 GitHub 任務輸出明確 `resource_ref`、`resource_type`，並標示 endpoint 未驗證、ACK 未取得；自訂任務仍需人工補資源識別。
- 保留既有 `ai-boundary.command.v0.1` 以相容舊草稿；新增 `ai-boundary.handoff.v0.3` 為獨立的跨系統事件契約，兩者不是已接通的網路協定。

## 安全邊界
`trustedContext.verified` **只可由可信的服務端 adapter 在驗證 OAuth / connector 身分與端點綁定後提供**；不能信任 AI 自稱、使用者輸入、GitHub 留言內的 actor 字串或瀏覽器自行傳入的布林值。此模組是資料契約與規則驗證器，**不是**身分驗證服務、事件佇列或網路 transport。GitHub 共用帳號不能直接證明留言由 GPT① 或 GPT② 產生。

## 尚未補齊的外部依賴（維持 BLOCKED）
1. GPT① Notion 頁面在 GPT② 連接器回傳 NOT_FOUND；須核對工作區、分享與 connector scope，再做雙向讀取。
2. 真正的 `source_endpoint_id` / `destination_endpoint_id` 與可信 adapter 尚未註冊；因此不得聲稱送達或真實 ACK。
3. 尚無經驗證的 webhook／worker／排程／目的端 agent runtime；GitHub Actions 不會自動喚醒另一個 ChatGPT 對話。
4. 去重與版本檢查是**純函式**，沒有持久化、交易鎖、跨執行個體並發保護；實際運作需持久化事件庫與唯一鍵。
5. Notion 現有沙盒資料表尚未補新欄位，不能把此 GitHub 候選模組視為 Notion schema migration。

## 本地測試
執行：`node --test tests/handoff-contract.test.cjs`
30 個測試：Issue/PR 區分、Notion URL、錯誤 URL、欄位缺漏、狀態、去重／衝突、重試、送達證據、ACK 身分與版本。原有測試可另外執行 `node --test tests/*.test.cjs`。
GPT② 以隔離 JavaScript 執行環境（URL shim）實際執行同一測試檔 30 項斷言，30/30 通過；這不等於原生 Node CLI 或 GitHub Actions 成功。2026-10-19 首次 GitHub Actions CI 執行失敗（run 39242054701），尚未取得完整測試日誌；已將新舊測試拆分為兩步以便定位。CI 必須重新跑通才能核准合併。

以上是離線規則測試，不等於跨 AI 端到端驗收。真正端到端仍需 Issue #41 的 T01–T08 與實際日志。

## 下一步
先由 GPT① 審查此候選 PR，再由使用者決定是否合併。接著建立經授權的共享入口與 adapter、確認雙方權限、進行真正跨端讀寫／ACK、故障與超時測試；沒有真實證據的項目一律保留 BLOCKED。
