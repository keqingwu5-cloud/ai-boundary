# R11｜獨立可信授權驗證：模擬收據完整性與正式授權邊界（2026-10-27）

> **G1 隔離候選；未配置任何真正核准者／生產憑證／執行端；一律 execution_allowed=false。** 使用者同意下一輪先驗證可信授權，並未批准上線、合併 main、啟動 worker、使用私人記憶或建立正式外部信任根。

## 1. 任務基準與原始問題

- 來源 [共同規章 Issue #31](https://github.com/keqingwu5-cloud/ai-boundary/issues/31)、[擴散問題 Issue #65](https://github.com/keqingwu5-cloud/ai-boundary/issues/65)、[前一隔離修復 Draft PR #69](https://github.com/keqingwu5-cloud/ai-boundary/pull/69)。
- 原 R10 head `d21b75070eb0d9eed9fc601624ae0f4257c7aa80`，其 planner 只輸出 `reuse_proposal`、`requires_review=true`、`verified_approval=false`、`execution_allowed=false`；bridge 對舊 `reuse` 一律阻擋。
- **真正缺口**：registry `approved` 與 `approval_evidence_refs` 是任意文字及本地資料，無法驗證獨立簽核者身份、範圍、簽名、到期、撤銷、舊 attempt 重放及真實收件端。不能把「有字串」當成「有權執行」。

## 2. 比較「不接信任來源」與「經授權接信任來源」

| 路徑 | 當前做到 | 優勢 | 代價／剩餘風險 | 建議 |
| --- | --- | --- | --- | --- |
| A 不接正式來源（R11 本候選） | 以執行時生成的臨時 Ed25519 測試金鑰核對假收據，所有結果都禁止實際執行 | 可驗證欄位綁定、偽造、到期、撤銷及重放處理而不碰真個資/權限 | 模擬根、撤銷清單與 replay ledger 都可由測試程式自行提供；沒有可信身分證明、原子更新、真遠端執行 | **當前採用** |
| B 真獨立批准與端點 | 尚未設置 | 未來可有真正信任根、核准者分權、撤銷與送達稽核 | 需要使用者指定真核准權責、正式 key registry、儲存/金鑰輪替、受保護狀態來源與獨立 G2 | **NO_GO，待使用者分別核准** |

## 3. R11 模擬契約（安全預設：禁止執行）

檔案：`tcvl-diffusion-approval-receipt.cjs`、`tests/tcvl-diffusion-approval-receipt.test.cjs`。使用 Node `node:crypto` Ed25519 簽署和驗證固定 JSON 欄位的位元組序列。永久憑證／金鑰**未儲存在 GitHub**；每次 CI 才生成短命測試金鑰。

收據身份需匹配：`schema`、`project_id`、`task_id`、`node_id`、`origin_command_id`、`direction_version`、`request_id`、`audience`、`action=approve_node_reuse`、`decision=approved`、`approver_id`、`receipt_id`、`nonce`、`issued_at`、`expires_at`、簽署者 ID／允許角色／測試信任根。

拒絕條件：來源或事件 ID 錯誤、JSON schema 多/少欄位、簽章遭篡改、冒充簽署者、簽署者缺少有效期限/重複 ID、非 Ed25519 金鑰、跨版或跨任務、失效/未生效/超過最長時效、撤銷快照不存在/過舊/格式錯、已撤銷簽章者/收據/節點，以及 replay ledger 不存在/過舊/格式錯/含同 ID 或 nonce。

即使在合成測試下驗證成功，也只回報：
`status=SYNTHETIC_RECEIPT_INTEGRITY_VERIFIED`、`cryptographic_integrity=true`、`independent_authority_verified=false`、`execution_allowed=false`，沒有正式 grants、worker dispatch、部署或私有資料讀寫。

**關鍵真實性邊界：** `trustRoot.source=SYNTHETIC_EPHEMERAL_TEST_ONLY` 是 G1 fixture 標記，不是正式授權者的背書。程式接受呼叫者提供的合成 public key 並不構成真正信任；撤銷快照和已使用 nonce 必須改由**有權限、不可被候選改寫且原子更新的權威來源**提供，否則不可能保證真跨執行者 anti-replay。R11 特意不回傳 `execution_allowed=true`。

## 4. 先紅後綠原始證據（不能覆蓋）

- 早期 [Actions #40446189505](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40446189505)：初版 52/52、235/235 PASS，但覆蓋不完整。
- RED [Actions #40446300346](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40446300346)：補上重複 signer ID、無效 valid_from/valid_until、無效 revocation/replay 清單反例後，**55 tests / 52 PASS / 3 FAIL**。這是 R11 自己發現的真實解析與狀態契約缺口，不是正式來源遭攻擊。
- GREEN [Actions #40446362372](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40446362372)：修正後 **55/55 針對性 PASS + 238/238 全候選 Node 回歸 PASS**，零 FAIL；仍僅隔離 push CI、非 live E2E。
- R9/R10 原失敗與成功紀錄、不同 user 指令版本、反例不覆寫。

## 5. 尚缺的真正正式授權服務（必須獨立核准）

1. **可驗證的審批者身份和正式政策版本**：正式使用者指定核准責任，獨立 G2 做反例，受保護的 signer keyset 版本、角色、最小權限、撤銷時間及效期；由候選程式自行傳入可信名單不合格。
2. **受控密鑰管理與存放**：隔離私有運行環境、簽章金鑰保管/輪換/遺失復原與真環境變更權限；絕不能在公開 GitHub Actions 或私人記憶混存秘密。
3. **持久且原子化的重放與撤銷決策**：收據 `receipt_id` 和 `nonce` 寫入需 compare-and-swap/唯一約束與事務，避免並發兩次皆成功；必須實測拒絕、超時、時鐘偏移及網路分割。
4. **真正 executor 的逐次授權**：每次觸發前由獨立受信端點重新驗證 task/node/version/capability/scope、拒絕/停止/取消與回滾；不能只把 R11 的模擬成功旗標轉為執行許可。
5. **可信 GPT② 收件與 G2 審查**：Issue #41/#56 的實際目的端簽收缺口依然 BLOCKED；此 PR 不替代該端點，也不使用 GitHub 留言假裝 ACK。
6. **跨模組相容性**：PR #69 的 `reuse_proposal` 改名尚待其他候選、UI/adapter 與真正 worker 的獨立驗證；目前不接線以降低風險。

## 6. 准入判定

`G1_RECEIPT_INTEGRITY_TEST=PASS_IN_SYNTHETIC_SCOPE`；`REAL_TRUST_ROOT=NOT_CONFIGURED`；`LIVE_REVOCATION_AND_REPLAY=NOT_TESTED`；`INDEPENDENT_G2=WAITING`；`MAIN_MERGE=NO_GO`；`DEPLOYMENT=NO_GO`；`NOTION/PRIVATE_MEMORY=UNCHANGED`。

**不得把 55/55 PASS、238/238 PASS、任何 GitHub 留言或本候選自行產生的測試公鑰，升格為正式授權／真 GPT② ACK／完成部署。**
