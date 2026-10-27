# R14｜故障中斷、WAL 恢復與未知交易結果對帳（2026-10-27）

> **僅 G1 隔離候選。** 本階段遵守 Issue #31 既有治理邊界與資料完整性優先：不碰正式 PostgreSQL／Supabase／Notion、正式金鑰、私人記憶、外部 Worker、`main` 或既有監控；不自動發布、不冒稱獨立 GPT②/G2 核准。PR #69 仍 Draft，base 指向原本的節點擴散隔離分支，而非 `main`。

## 基準要納入系統正在做什麼

R13 的可驗證優勢是同一 PostgreSQL 實例的 **24 個獨立 SQL 連線，對同一個收據 ID 只有 1 次預留成功**；並以交易鎖阻擋金鑰撤銷競態。R13 未測程序非預期中斷、已提交資料在重啟後是否仍可讀、未提交資料回滾、客戶端不知道交易結果時如何處理。R14 因此將「正在測什麼」分為：交易確實提交、交易中途取消、回覆遺失且結果不明，以及只讀資料恢復核對。上述不同狀態不能靠 `PASS`、timeout 或相同 receipt_id 直接當成可重新執行。

## R14 新增設計（不是正式權威資料庫）

| 測試 | 真正執行的情境 | 正確結論 | 不得推論 |
|---|---|---|---|
| 提交後故障恢復 | 將收據預留及 key 撤銷提交，`docker kill --signal=SIGKILL` 強制停止 PostgreSQL 16，重啟**相同一次性容器** | 收據、撤銷可查回，同 ID 重送被拒 | HA/failover、異地備份、PITR 已驗收 |
| 未提交交易中止 | 在一個 `psql` 的 `BEGIN` 內預留，確認交易尚未提交，另一 SQL 連線 `pg_terminate_backend` | 未提交收據不在資料庫，查證後重新預留成功 | 意外中止必定有完整審計或可自動恢復正式副作用 |
| 模擬回覆遺失 | SQL 提交成功但測試刻意不接收成功輸出，再用新的 SQL 查詢核對收據 ID／project／direction／digest／stage | 可以取得「候選已提交」的查回證據；相同 ID 不可再預留，衝突版本不可覆寫 | 真網路斷線、斷線半提交或跨資料中心一致性已實測 |
| 不明狀態的語意對帳 | `tcvl-review-reconcile.cjs` 對 caller 提供的比對讀回資料做嚴格 ID、來源、版本、digest 核查 | 精確匹配只回 `REVIEW_COMMITTED_OBSERVED_AUTHORITY_UNVERIFIED`；缺失 `REVIEW_UNKNOWN_MANUAL_RECHECK`；衝突 `BLOCKED_CONFLICTING_REVIEW_EVIDENCE` | caller 讀回資料已獨立認證、可自動重試、真正 owner 批准 |
| 權限與停止線 | 原 R13 的 `review_reserved` 單一狀態、無 PUBLIC GRANT、撤銷鎖及非執行權 | `execution_allowed=false`、`automatic_retry_allowed=false`、`verified_owner_approval=false`、`verified_gpt2_ack=false` | 有權啟動 agent／worker 或真 GPT② ACK |

## 實作位置與證據

- `scripts/test-r14-pg-recovery.sh`：在 GitHub Runner 建立無 host port、使用虛構 CI-only 密碼的 PostgreSQL 16 容器，測試結束 `docker rm -f` 清理。容器故障注入及資料查回都只在這個一次性資料庫中發生。
- `tcvl-review-reconcile.cjs`：無 I/O、無資料庫連線、無執行權的「未知結果對帳規格」，只比較 caller supplied readback 的五個固定欄位與 `stage='review_reserved'`；**不具有認證 caller 或資料庫的能力**。
- `tests/tcvl-r14-reconcile.test.cjs`（8）與 `tests/tcvl-r14-recovery-contract.test.cjs`（4）共 12 個新 Node 正反例；舊 R13 測試 5 個、R9–R12 針對性測試 64 個全部保留。

## 原版→失敗→修復的時間序列（追加不覆蓋）

1. **R13 最終基準** `48886a485d3f0642db77367e9908913ae7004fff`，[CI #40454969416](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40454969416)：64/64 針對性＋5/5 R13 SQL 契約＋252/252 全 Node 回歸。
2. **R14 初版 RED** [CI #40467320030](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40467320030)：12 項新 Node 中 8 FAIL（尚未實作的 `reconcileReviewReadback` 只能回報 UNKNOWN），另外 4 項 shell／約束測試通過；這是**新功能不存在**的反例，不代表真資料已遺失。
3. **R14 對帳程式初版** [CI #40467455999](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40467455999)：12/12 新 Node PASS，但一次性 PostgreSQL 第一次啟動時，`pg_isready` 可能在 image 建庫的**暫時 postgres server**上通過，真正 SQL 查詢隨後因暫時服務停止而失敗。這是**測試 fixture 就緒競態**，不是 crash／WAL 耐久失敗的證據。
4. [CI #40467585705](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40467585705)：修補 R14 就緒查詢後，原 R13 測試腳本也暴露相同的 `pg_isready` 時序缺口；完整流程仍失敗，**代表測試契約缺陷擴散到了前一版**。已為 R13 與 R14 同時要求 container PID 1 為正式 `postgres` 主程序、且 SQL `SELECT 1` 真正成功，避免原本的假就緒。
5. **R14 最終隔離 CI** [Actions #40467736506](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40467736506) 原始 Runner log：`R13 CROSS_SESSION_REPLAY`（1/24）、`R13 CROSS_SESSION_REVOKE_RACE`（撤銷後預留拒絕）；`R14 CRASH_RESTART_WAL: committed receipt + revoked key persisted; replay denied`；`R14 ABORTED_TRANSACTION: uncommitted row absent after backend termination`；`R14 UNCERTAIN_COMMIT: durable readback, no blind re-reserve, conflicting payload denied`；`R14 REVIEW_ONLY: no approval, no worker, no external side effects`。同輪 **64/64 舊針對性、5/5 R13、12/12 R14、264/264 完整 Node PASS**。

## 必須保留的未知範圍

- 測試只對**同一容器／同一 PGDATA 的不乾淨重啟**與另一個 backend 中止做故障注入；不是兩個 PostgreSQL 叢集間的 failover、HA、PITR、volume 毀損、持久備份或真跨主機 SLA。
- 「回覆遺失」測試是**刻意丟棄成功輸出後由另一個 SQL 查詢核對**；不是在真 TCP 斷線的任意時間點模擬提交／斷線賽跑，不能聲稱任何真網路故障都已測盡。
- 純 JS `reconcileReviewReadback` 僅核對字面一致性，輸入不是受信 database snapshot；真權威查回、審計追加、DB 身分、回覆簽章與持久化 reconciliation 還沒建成。
- SQL R13 只保留 `review_reserved`，R14 回報永遠 `automatic_retry_allowed=false`／`execution_allowed=false`。真正 owner/G2 信任根、授權發送與撤銷端點、正式最小權限 DB 身分、受保護 dispatcher、跨 GPT 真 ACK 依舊缺失。

**R14 G1 結論**：`EPHEMERAL_POSTGRES_CRASH_RECOVERY=PASS`、`UNCOMMITTED_ABORT_RECOVERY=PASS`、`UNKNOWN_RESULT_READBACK_CANDIDATE=PASS`；`HA_PITR/REAL_NETWORK_FAULT=UNVERIFIED`、`TRUSTED_OWNER_AUTH=NOT_CONFIGURED`、`INDEPENDENT_G2=WAITING`、`MAIN_MERGE=NO_GO`、`PRODUCTION=NO_GO`。本文件和各輪原始反例全部追加，不覆寫 R1–R13。