# R9–R16 全流程逆向稽核與下一階段判斷（2026-10-27）

> **使用者指示**：先查全部已建構歷程中的錯誤／差異、主動推演新負例，再修正；依**目前真實工作及安全關卡**判斷下一段是否值得做，不可一味升級測試數或把舊證據覆蓋掉。
>
> **適用邊界**：G1 隔離候選 [Draft PR #69](https://github.com/keqingwu5-cloud/ai-boundary/pull/69)，base `test/node-diffusion-p0-20261026`，不是 main；不能替代 Issue #31 未完成的正式制度核准、真正獨立 GPT②/G2 或使用者的正式資料庫、金鑰、merge、部署核准。原每小時監控保留。不接正式 Notion、Supabase、私人記憶及外部 agent/worker。

## 1. 先把歷史能力和不能宣稱的事情對齊

| 版次 | 本階段實際建立的候選能力 | 仍無法推論 |
|---|---|---|
| R9 | candidate／rejected／scope 不足不可複用；已拒絕 proposal 不再 queue | 真獨立核准、跨模組完成與遠端執行 |
| R10 | `reuse_proposal` 永遠只能待審，偽造 `execution_allowed:true`／舊 `reuse` 不被升格 | 公開 registry 核准字串已被真 owner 簽核 |
| R11 | Ed25519 合成收據的格式、任務、版本、權限、到期、撤銷與簽章一致性 | caller 提供的公鑰／撤銷／已消費清冊來源可信 |
| R12 | 單一 Node isolate 30 個並行預留只 1 成功；另兩個 instance 卻可各成功 | 跨程序 durable atomic ledger |
| R13 | 一個一次性 PG 實例 24 個獨立 SQL session 只有 1 成功，另有撤銷競爭與 ACL | 真 owner DB 身分、雙資料庫／高可用與真授權服務 |
| R14 | 同 PGDATA `SIGKILL`／WAL 恢復、backend 中途終止、回覆遺失後 readback | 真 TCP 任意時序或跨主機備援 |
| R15 | 真 TCP client 連線中斷，DB 已提交並拒絕重放；另容器邏輯 backup/restore 與 ACL | streaming standby、實體 failover、PITR、DB 來源不可否認 |
| **R16** | 真 PG16 physical standby 接收 WAL，先確認新收據與撤銷已 replay，**人工停舊主、再 promote** | 預設非同步複寫零遺失、雙主 split-brain 自動防護、真跨主機 HA |

這個對照不等於全部歷史分支均已審過。此前曾對整庫多條候選與 54 個分支名做抽查，但沒有逐一跑完 54 條安全測試。本輪精確範圍是 **PR #69 及其與 R13–R16 直接相依的節點／資料庫候選**，未覆核每個其他 PR。

## 2. R16 之前實際找出的兩項「局部真 → 全局誤判」

### A. Cross-project request ID 歸屬錯誤：確定缺陷，已修 G1 候選

**原始程式** `tcvl-diffusion-bridge.js` 的 `planChildTask` 以 `task:diffusion:<requestId>` 做唯一 key；在確認 proposal 所屬 project 後，檢查到 `workspace.tasks.some(t => t.id===id)` 就直接回 `already_queued`，**沒有再次核對既有 task 的 `projectId`**。

**反例**：專案 p1 先 queue `r1`；專案 p2 的不同候選帶來 `r1` 時，會對 p2 回「已排隊」，實際既有 task 卻屬於 p1。雖無 worker 外部副作用，但會污染任務進度、跨專案 attribution 與後續證據鏈。

- [RED Actions #40470205350](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40470205350) 和 [#40470242691](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40470242691)：新增的真反例導致 P1/R10/R11/R12 靶向測試失敗；原程式不符合跨專案身分契約。
- **修正**：遇既有 task 時先檢查既有 `projectId`。跨專案衝突直接 `task_identity_conflict_cross_project`，workspace 原資料保持不變；同專案的重送因當前 task 模型**沒有保存來源 node ID**，不再宣稱已獨立證實是同一節點，而回 `already_queued_requires_origin_review`、`verified_same_node:false`、`execution_allowed:false`。這是兼顧既有 ID 格式的最小保守修補，**不是完整 node-level idempotency**。
- 後續長期改進需版本化 `task_source_node_id/project_id/request_id/payload_digest`，在合法升級的 schema 中一次性約束，不能偷偷從 title/reason 推論同一請求。

### B. R15 邏輯還原的「部分欄位一致」誤作完整一致：驗收缺口，已加反例修補

舊 R15 核對的 receipt digest 不含 `expires_at`、`reserved_at`，撤銷只確認一筆指定的 key 計數；因此若到期被改、其他 `receipt` revoke 遺失，原判定**可能依然綠燈**。這是驗收覆蓋缺口，**不是正式備份已毀損**。

- **修正**：對收據包括 receipt/key/project/version/evidence/timestamp/stage 的**全部持久欄位**做 deterministic row JSON aggregation 的一致性摘要；對**所有** revoke(key/receipt ID 與 revoked_at) 做另一個完整摘要；再比對數量、重放規則與還原後 ACL 拒絕。
- **刻意反向污染一次性還原環境**：成功核對後修改 `expires_at`、刪除一筆 receipt revoke，確認新的兩個摘要各自產生差異。真 Runner [#40470456849](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40470456849) `R15 INDUCED_DRIFT_DETECTION` PASS、**272/272 全 Node PASS**。舊版測試未單獨跑到 R15 新紅燈（先被跨專案 P1 測試阻斷），因此不冒稱每個反例均先紅。
- **保守結論**：摘要是同一隔離 fixture 的相等性檢查，不是外部簽章、不可竄改來源證明或跨叢集備份正確性的證據。
- TCP case 若 DB 查回 0 筆，現在回 `R15_INCONCLUSIVE_COMMIT_CASE` 並 `exit 2`，**不得拿沒提交的分支當「斷線後仍成功提交」的綠燈**。

## 3. 經過前置審查後，才進行 R16 受控實體複寫測試

- R16 新增 `scripts/test-r16-pg-physical-standby.sh`：建立**只有 Docker internal network、無 host port**的兩個 PostgreSQL 16 實例，另用合成、僅供測試的 REPLICATION role/password 透過 `pg_basebackup -X stream -R` 建立真正的 standby；確認 `standby.signal`、`pg_stat_replication` 及 `pg_is_in_recovery()=true`，而非把兩個獨立 `pg_restore` 誤作 standby。
- 在 basebackup **之後**於 primary 真提交一筆新收據與一筆 revoked key，直到 standby 直接讀到這兩筆 WAL 重播結果；如果沒追上就 fail closed `R16_STANDBY_NOT_CAUGHT_UP`。
- 只有 standby 已追上，才能**先 `docker stop` 原 primary 且確定不在運行**，再 `pg_ctl promote -w`；promote 後驗證原、新收據重播仍被拒、revoked key 仍然拒絕預留、候選資料只有 `review_reserved`。
- 新增 `tests/tcvl-r16-physical-standby-contract.test.cjs` 4 項安全契約，明確不能用這個測試宣稱自動 fencing、split-brain 防護或非同步零 RPO。
- **R16 第一版真 Runner** [#40470990962](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40470990962)：`completed/success`。真日誌顯示 `PHYSICAL_REPLICATION`、`WAL_REPLAY`、`CONTROLLED_PROMOTION`，並保留 `NO_AUTOMATIC_FENCING` 限制，**276/276 Node PASS**。測試容器退出後全部刪除，不使用正式資料庫。

## 4. 仍有風險，優先順序不可倒置

| 項目 | 當前判斷 | 是否准許升格 |
|---|---|---|
| **真正 owner 身分／受信簽署來源／授權角色** | 未配置受保護信任根；registry/模擬器的自陳欄位不足 | **NO** |
| **獨立 GPT②/G2 真讀取與 ACK** | Issue #56 只追加交接索引，沒有可核實另一個 GPT runtime 已回覆 | **NO** |
| **同 receipt 真跨主機 fencing 與雙主競爭** | 僅人為「先停舊主→再升備援」，沒有獨立 STONITH/租約/仲裁 | **NO** |
| **非同步未追上 WAL 的已提交資料／零資料遺失** | R16 刻意等到觀測新 WAL 才 promote，不是測真正落後的故障切換 | **NO** |
| **PITR/備份/HA 災難恢復** | R15 為邏輯還原，R16 是物理 basebackup + catch-up；沒有正式 archive/PITR 或跨主機 RPO/RTO | **NO** |
| **授權服務 ↔ 持久 DB ↔ protected dispatcher** | 三者還未以經核准的端點、受保護角色及原子規格接通 | **NO** |
| **任務原始身分與授權來源** | 已解決跨 project key 錯綁，但同 project 不同 node 的真 idempotency 仍缺資料契約 | **待 G2 與版本化 schema** |

## 5. 下一步決策（不因為 R16 PASS 就直接發布）

現階段不應先做自動主備切換、任務自動擴散或替換正式記憶，因為 **fencing／真 owner 授權與資料契約身分尚未落實**。可繼續在隔離環境設計：先為 `task/project/node/request/payload` 的完整唯一鍵建立版本化資料模型，並新增一個「備援未追上就要求人工對帳、不得自動升主」的負測，後由真正獨立 G2 逐條評估；若要正式授權測試 DB 或部署，須使用者另行分別核准。

**結論：`PRE_R16_DATA_PROVENANCE_FIX=PASS_IN_G1`，`R16_CONTROLLED_PHYSICAL_STREAMING=PASS_IN_G1`；`AUTO_HA/FENCING=NOT_TESTED`，`PITR=NOT_TESTED`，`REAL_OWNER_TRUST=UNCONFIGURED`，`G2_ACK=WAITING`，`PRODUCTION=NO_GO`。歷史 PR #69 R9–R15 原始失敗、反例與成功 CI 全部保留，不覆寫。
## 6. R16 第二輪「正常 streaming 卻存在實際資料落差」負例（追加，不覆蓋）

第一輪 physical streaming [CI #40470990962](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40470990962) 成功，但**只看 streaming 已建立、再等待兩筆資料到達**，尚未實際誘發可見的資料落差。為避免未來有人把 `pg_stat_replication.state=streaming` 當「已同步可升主」，再增加一個真 PostgreSQL 16 反例：

1. standby `pg_wal_replay_pause()`，用 `pg_get_wal_replay_pause_state()=paused` 核對實際暫停；
2. primary 提交**基礎備份後新增的收據及金鑰撤銷**，在仍暫停重播的 standby 確認兩筆都不可見（`0:0`）。此時**不得 promote**；
3. standby `pg_wal_replay_resume()`，直到直接查到新收據與 revoked key（`1:1`）才通過 Gate；
4. 再先停止原 primary、確認 `Running=false`，才以 `pg_ctl promote` 進行受控升級。

[Actions #40471545059](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40471545059) 原始 Runner 記錄 `R16 ASYNC_REPLAY_LAG_NEGATIVE: primary committed, standby has 0:0; promotion withheld`；隨後 `WAL_REPLAY`、`CONTROLLED_PROMOTION` 正常。新加 1 項負測後 **277/277 Node PASS**、無任何正式 side effect。這精確證明**只憑「streaming 有連線」不能宣稱無資料落差**。但此測試是主動暫停 WAL 的單主機容器實驗，仍**未**驗證網路分割時的自動分散式 fencing、真正異步 commit 在不經確認的 failover 中不遺失、跨主機 RPO/RTO 或 PITR。
