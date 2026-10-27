# R11｜核准收據驗證：簽章完整性與正式授權分離（隔離候選）

> **階段：G1 純離線合成測試。** 本文件與 `tcvl-approval-receipt-core.cjs` 是受限候選，不是 GitHub/Notion/Supabase/ChatGPT 真正簽核連線、不是正式授權，也不具備任何 worker 啟動接口。Issue #31 的共同規章草稿不能由自動測試自行升格生效。

## 正在做什麼，以及與 R10 基準的差異

R9/R10 阻止 `candidate/rejected` 被複用、阻止 `rejected` 提案排隊、把 `reuse` 改為明確待審的 `reuse_proposal`。但只靠 `approval_status:approved`、`approval_evidence_refs` 字串、`verified_approval:true` 是**不能自證信任根**的。R11 增加獨立檔案，驗證合成收據的**密碼學完整性**，並明確保留正式核准未驗證的狀態。**不修改 planner 或 bridge 的執行權限；不連外；不變更既有正式服務。**

### 候選收據資料契約

- schema `tcvl-approval-receipt/v1`；scope `approve_reuse_for_review`，明確不是 `start_worker`。
- 事件身分：`receipt_id`；任務／工作：`project_id`、`node_id`、`origin_command_id`、`direction_version`、`request_id`、`permissions_scope`；來源：`evidence_digest`。
- 簽發方聲稱：`approver_id`、`key_id`；時效：`issued_at`、`expires_at`。
- `signature` 為 Ed25519 簽署固定欄位次序 JSON 與 domain-separation prefix `TCVL-REVIEW-RECEIPT-V1\0`，拒絕多餘欄位、錯誤演算法、錯誤簽章及欄位篡改。
- 外部輸入另含 `trustedKeys`、`revocationSnapshot` 和 `consumedReceiptIds`。全部都是**呼叫者提供**的資料；此模組只能查語法、驗簽及這份快照是否顯示撤銷／重用，**不能獨立證明這三個輸入來自真正 owner、即時可信來源或原子資料庫**。

### 成功與拒絕意義

- 經測試有效的離線簽章最多回 `CRYPTOGRAPHIC_SIGNATURE_VERIFIED_REVIEW_ONLY`，同時必為 `verified_owner_approval:false`、`execution_allowed:false`、`requires_independent_g2:true`、`trust_anchor_status:EXTERNAL_TRUST_ANCHOR_NOT_ATTESTED`。
- 逾時、未配置 trust key、簽名更換、證據摘要／task ID／方向／scope 不一致、key/receipt 撤銷、缺/過期的撤銷快照、重播 receipt_id、一致性格式違反，都回 `DENIED`（非 throw 後忽略）。
- 不保存私人資料、私鑰、簽章原文或 caller 提供的 PEM 到結果；測試使用即時生成的合成 Ed25519 私鑰。
- `consumedReceiptIds` 是呼叫者快照，不會自動寫入；所以此候選**沒有**耐並行重放的原子性保證，更無跨 runtime 的撤銷保證。

## 原始反證與完成度

- **未實作 RED**：最初 verifier fail-closed stub + 14 個新測試的 GitHub Runner [#40447869787](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40447869787)：全套 233 tests／232 PASS／1 FAIL，失敗為有效合成簽章無法驗證；這代表新功能還不存在，**不是既有正式核准已被繞過的證據**。
- **純離線 GREEN**：[Actions #40447996468](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40447996468)：233/233 Node PASS，包含 14 個核准收據案例，無外部私鑰／真信任根。
- 獨立的 R9/R10 先紅後綠紀錄、Issue #65、Draft PR #69 均保留，不覆寫原錯誤／反證。
- **正式禁止事項**：不改 main、不合併 PR、不啟動正式排程、不授權外部 worker、不配置私有金鑰、不私有資料寫入、不假造 GPT② ACK。

## 下一個必要 Gate，不可自動跳過

1. 使用者決定 owner/獨立 G2 簽核角色、信任根託管位置、金鑰輪替與撤銷管理；必須有真實獨立收件端證據。
2. 在經批准的隔離執行環境部署受保護信任根及**交易式原子收據使用紀錄**，外部不可由 caller 任意覆寫；證明重放、撤銷、並發與失敗恢復。
3. 把既有 `reuse_proposal` 接到未經證實永不執行的真正執行閘門，受保護環境以真正 owner 決策為前提；再跑 UI／接口／跨分支與真 G2 反例。
4. 通過後才請使用者**分別核准**合併、監控排程啟用、正式部署。R11 合成綠燈本身不構成任一批准。

**R11 截至本文件：`CRYPTOGRAPHIC_INTEGRITY_CANDIDATE=PASS`；`TRUSTED_APPROVAL_SOURCE=UNCONFIGURED`；`ATOMIC_REPLAY_STORE=UNCONFIGURED`；`G2_INDEPENDENT_ACK=UNVERIFIED`；`PRODUCTION_NO_GO`。**
