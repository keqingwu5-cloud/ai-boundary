# 世界如棋局 × N-ary｜分支走法溯源隔離候選 V0.1

- 研究階段：`ISOLATED_IN_MEMORY`, `READ_ONLY_OUTPUT`, `PRODUCTION_NO_GO`
- 上游：PR #125 @ `1535605f096737dfbc3b963cb41d89e9677d93cc` → PR #124 → #123 → #122 → #75。不同分支 SHA 的驗證不可直接相加。
- 修正問題：V1.4 `collect(A,B,C)` 和 `collect(collect(A,B),C)` 可能共用同一內容快取 ID，但「世界如棋局」每條生成路徑需要不同事件證據。相同結果不能代替不同走法。

## 契約與分層

1. `board:<sha256>`：把 `id/revision/as_of/reference_frame/source_refs/gap_refs` 固定為一個不變的研究基準。各項輸入由呼叫端宣告，**尚無可信來源身分驗證**。來源可得時間晚於棋盤 `as_of` 一律拒絕；REDACTED 整份候選拒絕而不回傳受限 ID。
2. `branch_id`：一條獨立假設／候選行動／反事實分支。不同分支可以有相同 `result_content_id`，但不能混用板面快照。
3. `result_content_id`：V1.4 `cmp:<sha256>` 或 V1.6 `gapcmp:<sha256>` 的參照身分。此候選**只接受宣告的摘要與不可升格狀態，不自行證明該內容確實來自 GitHub 或真世界**。
4. `derivation_event_id`：對棋盤、分支、step ID、結果 ID/hash、引用集合做確定性摘要。相同 step 重送冪等、同 step 不同內容拒絕，不同分支或 step 的事件 ID 各自不同。這是**單程序示範事件 ID**，無全域唯一時序、沒有持久化 ledger 或遠端 ACK。
5. `compareBranches`：只能比較相同 `board_id` 的事件引用，不聲稱已執行或哪個策略正確。

## 停止線與反證

- 無法從任意 caller-provided `content_hash` 證明內容來源/真實性。**不要把 SHA-256 當成來源簽章或權限核准。**
- `capabilities` 沒有由可信 identity service 發證，不能給此模組寫入權。不存在 writer、network、部署、真雙端 GPT ACK、真 CAS、資料庫或正式持久化。
- `board.as_of`、`source.available_at` 仍是外部宣告；要與真來源的時間戳/修訂、撤權資料比對才能升級驗證。
- 本演算法做單程序分支元資料隔離，不是多程序 sandbox，不會真正執行世界模擬；不能在此宣稱模型/經濟/社會因果成立。
- 使用 JSON 抽象結果不能涵蓋 V1.6 空白部分輸出的 `content_hash` 語義，未補可信適配層前只接受完整受控摘要；不要直接開通此接口到正式資料。
- 相關候選仍維持原 Draft，不寫 `main`、個人記憶、世界模型 journal 或交易接口。

## 本地研究檢查與工程 Gate

`node --test tests/world-chess-lineage.test.mjs`

包含 T01–T21：同內容雙分支不同走法、重送冪等、不同資料拒絕、不同 S0 阻斷、晚到資訊、時間缺 offset、未知/REDACTED、假 APPROVED、盤外來源、來源修訂改 board 指紋、容量界限，以及實際 V1.4 `createCompositionEngine` 內容 ID 可與本層配合。需另在本 Draft 固定 HEAD 取得 GitHub Actions 原始日誌，不能只沿用本機測試。

**正式整合 Gate**：同版本來源真實性、可信授權、獨立 reviewer、跨程序 durable CAS/冪等、真實端對端 ACK、舊資料相容、Safari/iPad、故障與恢復，以及使用者集中一次核准；任何一項缺失皆 `NOT_READY`。