# R13｜PostgreSQL 跨連線交易預留的隔離驗證與正式安全關卡

> G1 候選／2026-10-27／PR #69 Draft／不套用正式環境。本次「下一段開始」沿用先安全、資料完整性、測試前後差異與保留原始反證原則。只在既有隔離分支新增 SQL **草案**、CI 一次性 Docker 測試及 Node 靜態契約測試；無正式信任根、API Token、資料庫、worker、合併或部署變更。

## 為什麼需要 R13，以及真正的基準

R12 已在同一 Node isolate 中讓 30 筆並行請求只預留 1 筆；但 **兩個獨立模擬器各自接受同一收據**。這是已驗證的原設計限制，不是「真正式環境已被重放攻擊」。R13 的任務是將「正在做什麼」基準從單進程延伸到**多個獨立資料庫連線共享一個交易紀錄**，驗證重複提交、撤銷競態及 rollback，而不是宣稱得到 owner/G2 的批准。

## 增量實作與責任界線

- `sql/r13_candidate_review_reservation.sql`：僅候選 schema `tcvl_r13_candidate`，存 `receipt_id`（唯一鍵）、`key_id`、`project_id`、`direction_version`、`evidence_digest`、`expires_at` 與唯一允許的 `stage='review_reserved'`。**完全沒有** `execution_allowed`、`approved` 或 `dispatched` 狀態，也不保留簽章、PEM 私鑰或原始正文。
- `reserve_review_only` 用 `pg_advisory_xact_lock` 按順序鎖 key 與 receipt；檢查撤銷與時間後才 `INSERT ... ON CONFLICT DO NOTHING`。SQL 函式預設呼叫者權限（`SECURITY INVOKER`），schema、表格、函式均撤銷 PUBLIC 權限；**SQL 沒有替 caller 驗 Ed25519、沒有授予任何受信角色**。
- `revoke_key_for_review` 採同一 key 鎖；`revoke_receipt_for_review` 採同一 receipt 鎖。已撤銷不可被新的待審預留跳過；已經預留的紀錄不會因撤銷而變成可執行，未來授權服務必須**使用前再驗證目前撤銷及版本狀態**。
- `scripts/test-r13-pg-ephemeral.sh` 在 GitHub Hosted Runner 啟動**不發布主機 TCP port**的一次性 PostgreSQL 16 Alpine 容器，使用僅為 CI 的測試密碼，測試結束立即移除；未呼叫任何真資料庫。以 24 個獨立 `psql` 連線測同 `receipt_id`；另測跨進程重試、鎖內撤銷競爭、key/receipt 撤銷、過期、回滾與權限拒絕。
- `tests/tcvl-r13-sql-contract.test.cjs` 用 5 個 Node 反例防止意外新增執行權欄位、PUBLIC GRANT、SECURITY DEFINER、跳過撤銷／原子鎖或公開 port。
- 這不是正式 migration；即使 SQL 邏輯成立，沒有經正式角色/IAM、migration/rollback、金鑰託管和維運審核，**不得執行在有資料的正式資料庫**。

## 原始測試證據，不覆寫

1. R12 初始反證：在不同 JS 模擬器實例，重複收據仍可各預留一次（見 [R12 稽核](https://github.com/keqingwu5-cloud/ai-boundary/pull/69#issuecomment-6433754069) 和 [CI #40449728576](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40449728576)）。是 R13 要解的跨隔離工作者限制。
2. R13 最初新 SQL 靜態測試版本曾因測試規則對 SQL 文件中的 `SECURITY DEFINER` **警示註解**一併比對而紅燈（[CI #40454519952](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40454519952)）；這是測試式樣誤報，已修正為只核對非註解程式碼。**不得當成真 SQL 權限缺陷或黑箱攻擊。**
3. R13 第一輪真正 SQL 多連線：[Actions #40454591809](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40454591809)：24 個連線僅 1 筆預留、23 筆被拒；另一連線再用相同 ID 也拒絕；撤銷、過期、回滾與未授權角色拒絕均 PASS。Node 靜態 5/5、原 P1/R10/R11/R12 針對性 64/64、全 Node 252/252 PASS。
4. 新增**撤銷與預留同時競爭的鎖順序反例**後：[Actions #40454760934](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40454760934) 容器 CI 完成 success，且 Runner 原始記錄 `R13 CROSS_SESSION_REPLAY: one reservation, 23 denials`、`R13 CROSS_SESSION_REVOKE_RACE: blocked after lock holder commits`、`R13 UNTRUSTED_ROLE: permission denied as required`、`R13 RECOVERY/REVOCATION/EXPIRY/NO_EXECUTION: PASS`、**64/64 針對性、5/5 靜態及 252/252 全回歸 PASS**。
5. 所有 R9–R12 舊報告、先紅真錯與測試碼誤報都保留；沒有覆寫正式記憶或另一分支歷史。

## 新增能力與尚未過關能力

| 比較面向 | R12 | R13 候選 | 真正正式需求 |
|---|---|---|---|
| 同進程並行 | 1 成功 / 29 拒絕 | 繼續保留 | 長期穩定 |
| **不同連線共享收據** | 各模擬器可能成功 | 同一 PostgreSQL 實例 1/24 成功 | HA / failover / 其他程序與節點 |
| 撤銷競態 | 本機 epoch | SQL key/receipt advisory transaction lock | 真實獨立撤銷權威、跨 DC 傳播 |
| 已提交／失敗交易 | 記憶體不可持久 | SQL commit / rollback 在短暫測試期內有效 | 崩潰重啟、備援復原、PITR、清理與稽核 |
| owner 身分可信度 | 未配置 | **未配置** | 獨立批准、不可偽造身份及金鑰託管 |
| 正式執行權 | 永遠 false | 只能 review_reserved | 獨立 owner + G2 + protected dispatcher 另行核准 |

**未完成必須保留：** R13 SQL 不是交易式真正授權服務：Caller 仍可能以 privileged CI 身分直接呼叫本候選函式並建立純待審 metadata；SQL 沒有驗證簽章或經批准的來源；尚未跨節點/跨 DB 版本/同步備援實測、沒有完整交易持久性故障注入和正式身份/角色政策。**不得把資料庫「REVIEW_RESERVED_ONLY」當作 `AUTHORIZATION_GRANTED` 或 `GPT2_ACK`**。

## G2 前後續順序

先由 G1 用獨立隔離環境證實 crash/restart、唯一約束、transaction retries 與鍵撤銷時序，再由 G2 反證身分託管、讀寫角色、歷史對帳／災難復原，最後由使用者分別決定真 DB 許可、角色/密鑰、有限部署、main 合併及真正執行端。GitHub Issue #31 草稿不能替代這些核准。

**截至此檔：`R13_CROSS_SESSION_DB_TEST=PASS_IN_EPHEMERAL_CI`、`TRUSTED_OWNER_AUTH=NOT_CONFIGURED`、`INDEPENDENT_G2=WAITING`、`PRODUCTION=NO_GO`。**
