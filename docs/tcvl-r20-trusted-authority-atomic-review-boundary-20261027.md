# R20｜受信驗證器與原子消費之間的責任邊界：完整欄位待審紀錄候選

> 2026-10-27，G1 隔離測試。使用者「好」承接 R19 的下一段，只授權非正式、無憑證、無個資、無派工候選驗證。**本 R20 尚未真正整合受保護的驗證器與 SQL**；它刻意將未受信資料與有權核准分離。禁止將任何 `UNTRUSTED_` 回應視為執行、批准、獨立 G2 ACK 或 SQL 權威讀回。

## 目的與 R19 基準

- **固定原始 R19**：`f9ee93e99bdcb11bd40fe9a1fcee4f730083acf2`，GitHub [#40477854259](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40477854259) 305/305 Node PASS；R19 `tcvl.review-receipt/v2-candidate` 是純合成格式與 expected 欄位比對，不驗真正簽名，也不能做 v1 自動遷移。
- **R20 要補的具體缺口**：R13 PostgreSQL 原本僅有 `receipt_id,key_id,project_id,direction_version,evidence_digest` 等部分身分；不能保留 task/node/origin/request/permissions/audience/nonce 的原始完整綁定，也無 nonce 唯一性。更深層缺口是 R11／R19 的 caller-supplied 身分與核驗結果還不能成為真正受信的資料庫交易輸入。R20 本輪只解決 **隔離待審紀錄的完整形狀、nonce/ID 唯一性、局部撤銷與失效時窗**，不聲稱解決真正可信授權。
- 原 R9–R19 程式、SQL 與對比 PR #70 均不覆寫，所有新檔案只放在 PR #69 的候選分支上。

## 新候選、允許與禁止

| 模組 | 此輪實際作為 | 明確不具備 |
|---|---|---|
| `tcvl-r20-review-persistence.cjs` | 再用 R19 `assessUnifiedReviewEnvelope` 對照 caller-supplied expected，並用受檢查的 `now` 拒絕未生效或已過期；將 R19 的**固定欄位序**作為 SHA-256 內容識別摘要並加入域隔離文字 | SHA-256 不是 Ed25519 授權簽章；`expected`、`now` 都不是受保護來源；無真資料庫讀寫、無私人憑證 |
| `sql/r20_candidate_untrusted_review_ledger.sql` | 在 `tcvl_r20_candidate` 新的**一次性測試 schema**內以 JSONB 保留 v2 草案全部 18 個欄位，`receipt_id` 主鍵與 `nonce` 唯一鍵；拒絕多欄、錯型別、scope 重複／未排序、到期、已標記撤銷；key→node→receipt transaction advisory locks | SQL **不**驗 Ed25519／真 owner，`envelope` 是 caller 任意提供；JSONB 不等於 JS canonical signing bytes，SQL **不**驗證前端 SHA-256 digest、可信出處或跨 DB timeline；所有結果都是 review metadata |
| `scripts/test-r20-pg-untrusted-review-ledger.sh` | GitHub Hosted Runner 啟動無對外 port 的 disposable PostgreSQL 16、16 個獨立 psql 並行、nonce ID 衝突、key/node/receipt 假撤銷、偽造 `execution_allowed` 和無權 DB role 拒絕 | 不是 HA、真 worker、真授權角色、正式 Token、真 owner 發送或真正 G2 目的端收據 |
| `tests/tcvl-r20-review-persistence.test.cjs`、`tests/tcvl-r20-sql-contract.test.cjs` | 9 項新欄位/時間/假核准負測＋4 項 SQL 安全契約，連同 R9–R19 的完整回歸執行 | 不等於真跨端 E2E，不獨立證明執行權 |

### 強制拒絕的語意

- JS 的 `UNTRUSTED_REVIEW_RECORD_PROPOSAL_ONLY` 可攜帶審查用 `receipt_id,nonce,envelope_digest`；`persist_for_review=true` **僅指可交由隔離測試去記錄資料的草案**，不是已真的寫入 PostgreSQL、不是經受信驗證，更不是可執行。
- SQL 即使寫入成功，唯一回應為 `UNTRUSTED_REVIEW_METADATA_RECORDED_ONLY`。資料表的 `stage` 永遠等於 `untrusted_metadata_only`，沒有 `approved`／`execution_allowed`／`dispatch` 狀態；schema/table/functions 均撤銷 PUBLIC，使用原生 `SECURITY INVOKER`。
- **不可混淆**：R20 的存證唯一性只是同一 DB 歷史上的防重複；R17 已實測**備援未收到 WAL 就錯誤升主仍會讓已提交收據/撤銷遺失**，所以本輪原子性不能延伸到跨主備。
- 同樣不能從 `key_id`、`approver_id` 或 SQLite/PostgreSQL 的「有欄位」推定其身分可信。R20 既沒有真正 key custody，也沒有驗簽與受保護資料庫交易在**同一授權決策**綁定。

## 先紅、修正與固定版本

1. R19 baseline [CI #40477854259](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40477854259) 305/305 PASS。
2. **R20 RED** [CI #40483774455](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40483774455)：314 total／305 PASS／9 FAIL；九項全是新 JS review-persistence 接口仍為 deny-only stub，**不是正式授權曾越權**。這次的失敗可作新功能尚未實作的測試證據。
3. **R20 程式與 SQL GREEN**：[CI #40484604507](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40484604507) 13/13 新定向正負測與 318/318 全 Node PASS；真 PostgreSQL 一次性容器記錄：`R20 CROSS_SESSION: one metadata record, 15 duplicate refusals`；`R20 REVOCATION: key/node/receipt review metadata blocked`；`R20 FALSE_AUTHORITY: forged flags blocked; unauthenticated role denied`。**這是未受信審查資料的資料庫試驗**。
4. 文檔加入後應再核對最終 HEAD 與 GitHub Actions，一律不引用舊 HEAD 的成功 run 當成最終版本通過；原 R9–R19 舊失敗、反例與 PR #70 的獨立歷史全部保留。

## 下一個真正需要的決策和可信資料契約

- **A. 要求正式政策先定義授權語意。** `request_to_review` 與 `owner_authorizes_execution` 應完全分開，不能因資料庫記錄或自述欄位 `approved` 而轉換；任何變更由使用者正式批准。
- **B. 真獨立可信核對。** 哪些人／系統可以簽發、哪個可信 key registry 與撤銷來源、哪份 policy version、時鐘/nonce/key 生命周期、G2 否決權必須交給另一個無法被候選程式任意修改的受保護邊界。
- **C. 原子交易權威。** 真受信驗簽器的接收身分、canon bytes、簽章與完整 claims digest 必須在同一事務中綁定 receipt+nonce、node/task/scope/evidence、revocation、stop、leader/timeline；不得在外部假設已驗簽就直接呼叫候選 `reserve`。未知 transaction 結果須查回與對帳，不得盲目重試或啟動 worker。
- **D. 主備與歷史權威。** 指定 RPO/同步提交策略、fencing/epoch/timeline 的可信讀取與 HA 故障注入；不然資料庫局部唯一鍵不能解決 R17 分岔重放。
- **E. G2 與使用者的正式放行。** 真 GPT②/G2 必須獨立讀固定 SHA 與反例後回 ACK；其後還需分別核准正式信任根、私人 DB、main merge、監控／部署。

**本輪成果判定**：`R20_COMPLETE_REVIEW_METADATA=PASS_IN_G1`；`R20_RECEIPT_AND_NONCE_UNIQUE_IN_SINGLE_PG=PASS`；`R20_TRUSTED_SIGNER_AND_AUTHORIZATION=NOT_BUILT`；`R20_TRUE_ATOMIC_AUTHORIZATION_CONSUME=NOT_BUILT`；`TRUE_G2_ACK=WAITING`；`PRODUCTION/MAIN_MERGE=NO_GO`。