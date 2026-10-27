# R12｜受保護核准來源與原子防重放：隔離模擬／真環境仍 NO-GO

> 2026-10-27，資料集中站，PR #69（Draft，base 為原節點擴散隔離分支）。本文件是 G1 工程實驗與 G2 待審契約，**不是正式受信來源已建成的證明**。不建立正式金鑰、不接資料庫/外部 worker、不寫入私人記憶、不修改 main 或排程。

## 原始任務目的與 R11 → R12 差異

R11 的 `verifyReceiptForReview` 已能離線驗證 Ed25519 簽章與任務、來源、版本、權限、期限、撤銷和消費快照；但其 `trustedKeys`／`revocationSnapshot`／`consumedReceiptIds` 都由**呼叫者直接提供**。安全簽名與格式正確不代表來自真正 owner，不具跨程序／跨節點的原子防重放，也不代表有權執行。

R12 新增 `tcvl-protected-review-port.cjs` 和 14 個反例。它建立一個 **in-memory、單一 Node 執行緒的隔離端口模擬器**：

- `port.snapshot()` 返回測試公鑰清冊、撤銷狀態、曾預留收據 ID、epoch。純合成金鑰，不是真 owner 或 G2 的驗證身分。
- `reserveForIndependentReview` 對 R11 真驗簽成功的結果進行跨快照 epoch 重查，再使用同步 `port.reserve()` 將同一 `receipt_id` 只記錄一次（僅單一 JS isolate）。
- 如收據重複使用、在檢查與預留之間被撤銷、金鑰撤銷、信任根缺失、資料庫 mock 丟出錯誤或快照已過期，結果一律拒絕。
- **成功最多是 `ISOLATED_REVIEW_RESERVATION_ONLY`；每個結果仍帶 `environment=ISOLATED_SIMULATION_ONLY`、`verified_owner_approval=false`、`execution_allowed=false`、`requires_independent_g2=true`、`cross_process_replay_protection=false`。** 不寫出簽章、公開金鑰或原始 evidence digest。
- `port` 本身並無防止任意程式建立或偽造，不能以 `port.kind` 或呼叫者自稱作為可信身分。成功只表示「測試用端口成功預留待審紀錄」，不是可執行權限。
- **已刻意加入一項邊界反證**：兩個不同的模擬器實例可以各自預留同一筆簽章有效的收據。這代表即使每個單機測試顯示防重放成功，沒有共用持久且原子化的權威儲存仍然會跨程序重放。

## R12 來源證據與測試次序

- 舊 R11 固定 HEAD `8f81c8d2eeeaa889eacfada5364f9399432d64ad`；當時真 CI [#40448182563](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40448182563) 50/50 針對性、233/233 完整測試綠燈。
- **首次新增測試檔的失敗** [#40449269576](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40449269576)：測試檔語法括號錯誤，只有載入失敗。這是開發工具錯誤，**不可當作 P1 安全負例**。
- **修正語法後，有效先紅** [#40449361231](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40449361231)：247 項中原 233 項通過、新 R12 14 項 FAIL，當時接口仍是 deny-only stub。**這證明新功能尚未實作，不等於真環境已被入侵。**
- **首版修補** [#40449478777](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40449478777)：246/247 PASS；重複收據已拒絕，但統一歸類 `BLOCKED_CRYPTO_OR_SOURCE`，未區分 `BLOCKED_REPLAY_OR_REVOKED`；歸類缺口保留。
- **修復拒絕分類** [#40449564097](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40449564097)：247/247 PASS，包含 30 個並行提交只有 1 次單機預留、撤銷競態、跨專案任務、另簽者金鑰及兩份獨立端口會各成功的限制反例。
- R12 原始歷史不覆蓋 R9/R10/R11，最新經擴充 CI 的結果需再核對真 Runner 固定 SHA。

## 上線前必須另行核准／由獨立 G2 證實

1. **真正授權主體**：owner 人工確認批准的操作範圍、project/task/node ID、雙方 reviewer 身分與最小權限。GitHub Issue/PR 自陳、合成公鑰或機器標記 `approved` 不具核准力。
2. **受保護金鑰託管**：公鑰／可信身份的權威發布及輪替、撤銷管理、不可自行變更；需獨立於送件者及驗證客戶端，來源認證和 audit 必須由另一個受保護邊界提供。
3. **真正原子存放**：在安全授權的 PostgreSQL 或等效 transaction store 上，使用 `receipt_id` 唯一限制與單次原子 compare-and-consume，於同一交易內檢查版本、撤銷、權限、狀態與有效期；提供可回溯拒絕證據及故障後 reconciliation。此文件沒有連線或建立該資料庫。
4. **確實的執行能力隔離**：僅另行授權的 protected dispatcher 可依已驗證 owner 決策給執行許可，隔離 candidate/reuse_proposal 不可直接對 worker 送件；操作側必須對 STOP/revoke 及重試結果 fail-closed。
5. **真獨立 G2**：另一端點自己讀取固定版與原始資料，提出反證並以可驗證收據回覆；本專案 Issue #41/#56 仍 `BLOCKED`，不可假定 GitHub 留言便是真 GPT② ACK。
6. **正式發布分權**：G2 完成後使用者另核准合併及部署、Notion/資料庫權限與 15 分鐘監控 schedule。既有每小時監控不變。

**R12 判定：`IN_PROCESS_REPLAY_SIMULATION=PASS`（待最終 CI 核對）；`CROSS_PROCESS_DURABILITY=FAIL_BY_DESIGN`；`TRUSTED_IDENTITY_ROOT=NOT_CONFIGURED`；`ATOMIC_EXTERNAL_LEDGER=NOT_CONFIGURED`；`LIVE_G2_ACK=UNVERIFIED`；`MAIN/PRODUCTION=NO_GO`。**
