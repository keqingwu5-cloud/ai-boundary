# R17｜主備資料落差、錯誤切換與權威隔離反例（2026-10-27）

> G1 隔離候選，僅合成測試與短暫 Docker PostgreSQL。不是正式變更核准、真 owner 身分、GPT②/G2 真實 ACK、主備自動切換或正式部署。PR #69 仍 Draft，base 是原隔離候選 `test/node-diffusion-p0-20261026` 而不是 main。

## 目的、起始基準與差異

- 本輪以開始審查時的 `e85bb0cf7287f63e207b960f2a65e47a0c43a84d` 固定為 R16 已通過候選基準，不覆寫原始 PR/Issue/Runner。R16 能在確認備援追上 WAL 後，**先停止**舊主資料庫，再人工升級備援。但這與「無須完整資料就能安全自動切換」是不同的命題。
- R9–R16 逆向檢查先發現：任務去重必須在同專案、不同節點之間保留原身分未驗證；既有 GitHub 主線與正式權限不變。
- R17 分成兩個**獨立**實證範圍：`tcvl-promotion-review-gate.cjs` 是純 Node **不具任何執行權**的語意審查契約；`scripts/test-r17-unsafe-asynchronous-failover.sh` 則在短暫 PostgreSQL 中**故意演示**錯誤升級會如何失去已提交但未送達備援的收據與撤銷。兩者沒有真受保護執行器、fencing service 或可信授權來源。

## 根因：不能把已收到 WAL 與已重播 WAL 混成一種落後

1. **未實作閘門 RED**：[Actions #40471653789](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40471653789)：新 11 項合成審查反例全部 FAIL，原有 277 項 PASS；這證明審查模組原本尚未實作，不代表正式系統遭受入侵。
2. **首版故障假設遭真 PG 反證**：[Actions #40472142426](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40472142426)：曾使用 `pg_wal_replay_pause()` 阻止備援重播，但舊主停止後 `pg_ctl promote` 會將備援**已收到**的 WAL 重播。預期的收據遺失**沒有**重現，故該假設不可採用。它不是備援資料遺失的證據。
3. **修正故障注入**：使用獨立私有 Docker 網路先建立 streaming standby，再直接 `docker network disconnect --force` **中斷備援 WAL 傳輸**；確認網路隔離後才在原主節點提交 review receipt 和 key revocation。隔離備援 SQL 核對兩項均尚未出現。
4. **明確標示的危險實驗**：本測試先停止舊主節點，**再**升級這個仍未收到 WAL 的備援；實測收據與撤銷缺失，新節點會把同 receipt_id 再次接受為 `REVIEW_RESERVED_ONLY`，且接受原已撤銷的 key。這是**原子性只在同一個 WAL 歷史內成立**、切換到落後節點後產生的真實資料完整性缺口。全部僅為 throwaway review-only schema，沒有真 worker、owner key 或正式資料。
5. **靜態規格負測的失敗也保留**：[Actions #40472471251](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40472471251)：R17 靜態測試要求報告明寫沒有受信 fencing，但腳本使用不同文字，導致 1 項測試 FAIL。已精確補上 NO_GO 描述，不能將此測試錯誤說成資料庫被繞過。
6. **修正後 GREEN**：[Actions #40472613391](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40472613391)：**293/293 全 Node PASS**；Runner 真 PG 證據：
   - `R17 WAL_TRANSPORT_PARTITION: committed primary receipt and revocation were never received by standby`
   - `R17 EXPECTED_UNSAFE_ASYNC_FAILOVER: unreceived committed receipt/revocation missing; duplicates were accepted in throwaway DB`
   - `R17 SPLIT_BRAIN_NOT_SIMULATED: old primary stopped; real independent fencing and quorum remain unverified`
   - 同一 CI 仍包含 R16 的安全受控切換與 R13–R15 回歸。

## 防線與不可混同

`assessPromotionReview` 拒絕雙主／未隔離、LSN 落後、收據缺失、撤銷未同步、ID 不一致、過期語意及偽造額外欄位。**即使**所有觀測項都合格，也只回 `READY_FOR_INDEPENDENT_REVIEW_NOT_AUTHORIZED`；固定 `promotion_allowed=false`、`execution_allowed=false`、`trusted_fencing_verified=false`、`requires_independent_g2=true`。本模組的輸入全部 caller-supplied，不能自己證明 old-primary 真的被斷電、鎖定了唯一 leader epoch，也不能驗證簽收身分。

本輪沒有實作兩個同時可寫主節點，更沒有 fencing/quorum service；因而**不能**從本次 CI 宣稱 split-brain prevention／auto failover／zero-RPO／PITR 完成。也未證明任何真實外部副作用或 ACK 通知到達。

## 準備 R18 前必須交接的關卡

1. 獨立可信來源的 primary fencing/fencing receipt、同一權威 epoch、leader lease、舊主復活時的寫入拒絕；真 split-brain 情境必須確保整個測試只在隔離環境。
2. 提交確認與複寫保證：先明定同步 vs 非同步及可接受 RPO；任何 standby replay position 落後或不可確認，都不得把預留紀錄當可安全重用。
3. 真權威授權服務仍未建構：owner identity/key custody/revocation 真源、原子化 replay store 與 protected dispatcher 的安全綁定。不可讓 caller 自述 metadata 變成 authorization。
4. 獨立 G2 審查、跨端真 ACK 與使用者分別核准正式鍵/資料庫/合併/部署。主線 SHA 未改，PR #69 仍 Draft、原每小時監控保留。

**結論：`R17_UNRECEIVED_WAL_LOSS_COUNTEREXAMPLE=REPRODUCED_IN_G1`；`R17_PROMOTION_DECISION_ADVISORY_ONLY=TEST_PASS`；`SPLIT_BRAIN_FENCING=NOT_VERIFIED`；`PRODUCTION/MAIN_MERGE=NO_GO`。**