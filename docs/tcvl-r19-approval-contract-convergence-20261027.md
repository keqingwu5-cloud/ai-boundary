# R19｜PR #69／#70 核准收據契約收斂與受信責任邊界（G1 隔離草案）

> 日期：2026-10-27，資料集中站。**不是正式的單一標準批准，不是新授權服務，不是獨立 GPT②/G2 審查。** 本文件只在 PR #69 隔離分支追加；不覆寫 PR #70 的候選，不合併到 main、不部署、不建立金鑰或資料庫、不變更原本監控。Issue #31 仍屬未正式核准的共同規章草稿；重要變更由使用者核准。

## 1. 固定原始版本，先比較原來正在解決什麼

- PR #69 起始 HEAD `5c8bcb5eaed01a29accf241d5bacf41fce5fafaa`，base `test/node-diffusion-p0-20261026`（不是 main）；其 R11 模組 `tcvl-approval-receipt-core.cjs` blob SHA `b87616718a0ec00710242d30432a5cd558684964`。
- PR #70 起始 HEAD `ce865da3c4da1df2b79a605da84a2d593471b0f7`，base 為 PR #69 隨後持續演進的分支；其另一版 R11 `tcvl-diffusion-approval-receipt.cjs` blob SHA `d2d617add0b1a8285d780bb47c81b234cd2c5631`。比較當時 PR #70 `ahead=6 / behind=56`，**相互獨立演化、不可直接以 PR 測試互相替代**。
- 兩邊都只核對臨時 Ed25519 合成簽章；**都沒有真受保護的 owner trust root、原子收據消費、獨立 G2 ACK 或外部 worker 派工授權**。
- R13 PostgreSQL 16 `sql/r13_candidate_review_reservation.sql` 僅能建立 `review_reserved`，其資料表未持久保存完整核准來源／目標任務所需的身分欄位；不負責核驗任何真實 owner 簽章。

### 逐欄差異及決策

| 面向 | PR #69 R11 | PR #70 R11 | R19 建議，但**未核准** |
|---|---|---|---|
| schema | `tcvl-approval-receipt/v1` | `tcvl.diffusion.approval-receipt.v1` | `tcvl.review-receipt/v2-candidate`，兩種 v1 直接拒絕；不做隱含轉換 |
| 語意 | `decision=approve_reuse_for_review`，僅待審 | `action=approve_node_reuse, decision=approved`，但仍只合成 | `purpose=reserve_for_independent_review, claim_status=review_requested`；避免將「待審」誤寫成「已核准」 |
| 原始任務 | project/node/origin/direction/request | 增加 task_id 和 audience | 全部都要核對，且未認證來源不可執行 |
| scope/evidence | 簽 `permissions_scope`、`evidence_digest` | **未包含** scope、證據 SHA-256 | 同時要求 scope（排序去重）與 evidence digest |
| 反重放 | receipt_id；無 nonce | receipt_id、nonce | 同時要求 receipt_id、nonce，未接原子資料庫 |
| 簽章身分 | signed `key_id` + approver_id | 外層 `signer_id` 與 signed approver_id 分離 | 簽發方、key id、角色、用途須受信綁定；目前只做結構檢查 |
| Ed25519 bytes | 固定欄位順序 + `TCVL-REVIEW-RECEIPT-V1\0` domain prefix，base64url | 依字母排序 JSON，**無相同 domain prefix**，base64 | 舊簽章**不可直接跨版本驗證**；未核准 v2 的 canonical bytes / crypto domain 及金鑰權威 |
| 撤銷 | receipt、key | receipt、signer、node | 至少 receipt/key/signer/node、角色/版本及 policy；需由受保護服務獨立核查 |
| 時效 | receipt 最長一小時，snapshot 五分鐘 | receipt 最長十分鐘，另 signer valid_from/until，snapshot 五分鐘 | 格式草案最長十分鐘；實際 trusted clock、時計容忍政策未核准 |
| 結果 | `CRYPTOGRAPHIC_SIGNATURE_VERIFIED_REVIEW_ONLY`；不執行 | `SYNTHETIC_RECEIPT_INTEGRITY_VERIFIED`；不執行 | `READY_FOR_CONTRACT_REVIEW_NOT_AUTHORIZED`，**甚至不代表驗簽** |

## 2. 本次只新增「待審欄位契約」，不擅自選定正式標準

- 模組：`tcvl-r19-review-envelope.cjs`。**沒有 crypto.verify、沒有私鑰、沒有 signing API、沒有 DB/HTTP I/O、沒有 authority/dispatcher**；純粹檢查候選格式及來源任務欄位是否相同。
- 固定欄位：`schema,purpose,claim_status,project_id,task_id,node_id,origin_command_id,direction_version,request_id,audience,permissions_scope,evidence_digest,approver_id,key_id,receipt_id,nonce,issued_at,expires_at`。
- 拒絕舊 schema／缺欄／多欄／不合法 digest／重複、未排序、過廣的 scope／不合法時間／項目、節點、來源、方向、request、audience、scope、evidence digest 不匹配。
- 即使格式完整也只有 `READY_FOR_CONTRACT_REVIEW_NOT_AUTHORIZED`；所有結果固定 `approved_for_migration=false, verified_signature=false, trusted_source_verified=false, atomic_replay_verified=false, verified_owner_approval=false, verified_gpt2_ack=false, execution_allowed=false, requires_independent_g2=true`。
- **輸入仍由 caller 提供**，其中 `expected` 也不可信；上述欄位相同只證明字面一致，不證明獨立來源或核准。R19 也未做實際的 v1→v2 遷移，未宣稱能持久儲存或驗真正簽章、撤銷或時計 freshness。
- R13 的既有候選 SQL、R11 A/B 及 PR #70 原始程式都**不變**；尚不得把 `review_reserved` 視為任何批准或已簽收。

## 3. 先紅再綠及原始反證

- R18 起始 [#40475573774](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40475573774)：293/293 Node PASS。
- **R19 RED** [#40477343651](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40477343651)：305 total、295 PASS／10 FAIL。12 項新反例中，2 項現有兩 schema 與舊 SQL 差異測試通過，10 項因新 envelope 僅 deny-only stub 尚未實作而失敗。**不是正式越權被證明**，也不拿非預期失敗充當安全通過。
- **R19 初步 GREEN** [#40477486349](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40477486349)：305/305 PASS，包括 12 項新 R19 反例與 R9–R17 全套回歸；正式固定文檔 HEAD 仍須另行 Runner 查核。
- 所有原 R9–R18 紀錄、PR #70 實作與失敗測試不刪改、不以 R19 草案覆寫任何一方。

## 4. 後續真正可能解開的門檻

1. **使用者／G2 批准唯一契約與權限語意**：先判斷 review request 與 owner authorization 是否應用兩類完全不同的簽章，釐清哪些欄位必須簽、哪些外部信任證據必需；R19 不預設 PR #69 或 #70 勝出。
2. **權威認證**：簽署者身分、金鑰有效時段、作用域/角色、正式 clock、可信撤銷來源和 policy 版本，不能任由呼叫者自行附 trustedRoot 清單。
3. **跨層交易原子性**：經驗證的完整 receipt/nonce/node/task/scope/evidence/version 需與同一權威交易中的 consume/revocation/leader-epoch 判定綁定；SQL 既有 review-only 函式不足以授權。
4. **避免 R17 分岔問題**：即使 receipt 交易本地唯一，落後 standby 早升主仍可能丟 WAL；須先有受信 fencing/quorum/synchronous policy/RPO 的證據，再討論任何真執行端。
5. **獨立 G2/真 ACK**：要求對方自行讀 PR #69、#70 固定 SHA 與此文件，回報至少一個可能推翻判斷的反例，使用可追蹤目的端身分回覆，而非由本對話代寫「已確認」。
6. **正式上線不同關卡分別核准**：GitHub main 合併、DB、金鑰、私人記憶、worker、15 分鐘監控及部署，都仍未由本輪授權。

### R19 決策

`G1_CONTRACT_COMPARISON=COMPLETE`；`V2_DRAFT_SCHEMA_TESTED=PASS_IN_ISOLATION`（以最後固定 SHA CI 為準）；`V2_STANDARD_RATIFIED=NO`；`TRUSTED_OWNER_ROOT/ATOMIC_EXECUTION_SERVICE=NOT_CONFIGURED`；`INDEPENDENT_G2=WAITING`；`PRODUCTION/MAIN_MERGE=NO_GO`。
