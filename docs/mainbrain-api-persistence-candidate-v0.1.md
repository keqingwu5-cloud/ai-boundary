# 第一大腦交接佇列與 worker：隔離工程候選 V0.1（非部署）

- 原任務：`H-20261016:GPT2`；關聯 Issue #41
- 本候選分支基於 Draft PR #47（其上游依賴 #46 → #45 → #43 → #42）。
- 本階段使用者在 GPT① 工作窗口同意繼續隔離候選開發／測試。
- **本 PR 不是自動收件成功，也不是 GPT② 另一個 ChatGPT 對話 ACK。**

## 新增的模組

| 檔案 | 職責 |
| --- | --- |
| `api/persistence-candidate.sql` | 已存在 `mainbrain_api` 架構上的隔離增量候選：grant、attempt、事件 grant reference |
| `api/pg-store-candidate.cjs` | 實作既有 API 的注入式 store contract；PostgreSQL BEGIN/COMMIT/ROLLBACK，交易式入隊、FOR UPDATE SKIP LOCKED 領取、receipt+state+log 原子提交 |
| `api/polling-worker-candidate.cjs` | 明確啟動才輪詢，取一筆當前 lease、執行可注入的任務處理器、回傳執行證據與 API ACK |
| `api/http-task-client-candidate.cjs` | 以外部提供的授權 token 呼叫 HTTPS API；不保存金鑰、不啟動其他 ChatGPT 對話 |
| `tests/mainbrain-persistence-candidate.test.cjs` | 模擬 pg-compatible pool 驗證查詢流程與負向條件；worker 和 HTTP client 的隔離單元測試 |

## 授權與狀態規則

- **不能由 AI 自行核准任務**。新的 `grants` 資料列須由獨立、授權的管理入口預先建立；同一 grant 必須綁定 task/source/destination、動作清單、有效期、撤銷與 STOP、最大重試次數。
- 入隊要存在有效 `send` grant；領取時再次檢查 `receive`；執行、ACK、失敗處理時重新查 `execute` 或 `ack`。
- worker 只會領取指定的 `destination_endpoint_id`，每次領取由 PostgreSQL 在交易中鎖定事件、產生新的 `current_attempt_id` 並將歷史寫入 `attempts`。舊 attempt 的執行、ACK 和失敗回執會被拒絕。
- 回執只使用 `channel='api'`，**不能聲稱 ChatGPT 人工已讀**。
- lease 到期才可回收；失敗有有界退避和最大嘗試次數；中止/撤銷 grant 時禁止進一步發送、領取、執行或 ACK。
- `event_logs` 追加關鍵狀態事件；receipt + state + log 寫在同一交易裡。交易失敗回滾。

## 接線與實機驗收尚缺

1. 必須由使用者確認 **正確的隔離資料庫專案**，有權核准才可以手動套用 `api/schema.sql` 與候選 migration。**本 PR 和 CI 不會執行 migration**。SQL 假設提供 Supabase 型的 `anon`/`authenticated` 角色；其他 PostgreSQL 部署要先審核適配。
2. 須有單獨的 **人類 grant 發行及撤銷管理接口**、least-privilege PostgreSQL service role、獨立金鑰管理、audience/endpoint policy、抗 replay 的 token 策略，並查核 grant 過期、撤銷、STOP 競態。
3. 需要受控執行環境真正啟動 worker，透過 `createHttpTaskClient` 使用外部提供的有效 token/refresh 政策和 `performTask` handler。此候選沒有 AI 模型呼叫或 ChatGPT 對話喚醒功能。
4. 須執行真實 DB integration：兩 worker 搶同一事件、進程中斷、lease timeout/reclaim、SQL schema 檢查、不同權限撤銷競態、同 key idempotency、receipt 寫入失敗回滾、重啟存活與雙向 return ACK。
5. `api/mainbrain-api.cjs` 仍以 JSON.stringify 計算 digest，尚無跨語言 canonical JSON 協定；HTTP authenticator 現仍是候選，沒有實際撤銷清單或 endpoint allow-list。
6. 回傳來源端的 return delivery + source ACK + acceptance 尚未完成。**#41 保持 BLOCKED，Gate 0 尚未完成。**

## 目前證據等級

- CI 若通過：只代表候選源碼與使用 fake pg pool 的測試通過；**不能據此宣稱實際 PostgreSQL 交易或正式 worker 持續運行通過**。
- 代碼可由 GPT① 在本窗口審查、安排下一步；GPT② 其他對話是否實際接收仍須另外核對。
- 不合併 PR、不部署、不修改正式 DB、記憶、憑證或權限。