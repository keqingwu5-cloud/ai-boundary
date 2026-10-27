# R15｜TCP 真連線中斷與 PostgreSQL 邏輯備份還原驗證（2026-10-27）

> **狀態：G1 隔離候選。不是正式授權、主備切換或發布核准。** 遵循 Issue #31 草稿與使用者保留的核准權；所有更動僅在 [Draft PR #69](https://github.com/keqingwu5-cloud/ai-boundary/pull/69)，base 仍是 `test/node-diffusion-p0-20261026`，不是 `main`。不接正式 Supabase／PostgreSQL／Notion、不新增任何真金鑰／private memory、不啟動 worker、不更改原每小時監控，也不冒充獨立 GPT② ACK。

## 任務語意、原始基準與增量優勢

R14 基準 `52e26900e0a945b15b715f7fed3f39e75b8ff1d0` 已驗證單容器 PostgreSQL SIGKILL、WAL 恢復、backend 強制終止及**刻意丟掉 SQL 回覆的模擬**；但沒有真 TCP 斷線、另一個獨立資料庫的備份還原，也沒有驗證復原後的資料庫權限是否保持關閉。

R15 因此只新增：1）**執行中的客戶端 TCP 連線被切斷後，伺服器到底有沒有提交**；2）**客製 schema 的 `pg_dump` 備份還原到另一個 PostgreSQL 容器後，內容與拒收規則是否保持一致**；3）權限恢復核對。這個差異以原始 URL、Runner TAP、SQL 讀回與不同容器的實際行為作證，不拿測試案例數量當工作完成證明。

## 測試邊界與執行細節

- `scripts/test-r15-pg-network-restore.sh` 在 GitHub Hosted Runner 建立 Docker `--internal` 網路、主資料庫、TCP `psql` 客戶端、**另一個全新 PostgreSQL 16** 還原目標。沒有 `-p`/公開 port；資料庫及密碼全部是一次性的合成 fixture，`trap cleanup EXIT` 移除全部容器與網路。
- 先以 `pg_stat_activity` 核對遠端 `psql` 指令正在執行，再從 Docker 中斷客戶端網路；接著**從 DB 伺服器側讀回** `receipt_id` 的持久狀態。此次 Runner 的可觀測結果為 `DB committed after client disconnected; replay blocked`。即使 client link 不可用，已完整送往 server 的 SQL 仍可能提交。**不能僅依 transport error/斷線把同一操作當成未執行，也不得自動重試。** 此案例不是對所有斷線時間點的窮盡測試，也沒有獨立確認 psql 是否取得 SQL success 回應。
- 同輪建立 `pg_dump --format=custom` 邏輯備份（保留 ACL），`pg_restore` 進**獨立新容器**。比較所有候選收據的 receipt/key/project/direction/evidence digest/stage 的聚合雜湊、列數、撤銷鍵數；重放同 receipt 拒絕、撤銷鍵不允許新預留。
- **重要安全反例**：不使用 `pg_restore --no-acl` 或 `--no-privileges`，因資料內容相同**不代表權限狀態安全**。還原後建立 `r15_untrusted NOLOGIN`，用 `SET ROLE` 真 SQL 觀察 `permission denied`；資料仍僅 `review_reserved`，沒有任何批准、dispatch 或 worker side effect。
- `tests/tcvl-r15-network-restore-contract.test.cjs` 新增五項靜態安全契約測試，`.github/workflows/tcvl-node-diffusion-isolated.yml` 在 G1 分支真實跑 Node、R13、R14、R15。沒有更動 R13 權威資料模型，也沒有實際接入 R11/12 的未受信公鑰至正式安全服務。

## 測試歷史：不覆寫失敗與舊正反證

1. **R14 原基準**：[Actions #40467997055](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40467997055) 264/264 Node PASS、R13/R14 PostgreSQL 只在一次性 Docker 中成功。
2. **R15 首次完整 CI 靜態誤報**：[Actions #40469061487](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40469061487) 5 項新 R15 靜態契約中 **3 PASS／2 FAIL**。測試用單行 regex 檢查多行 `pg_dump`，另把註解中的 `--no-acl` 警示誤判為已執行 CLI 旗標。它們是**測試式樣錯誤**，不能當作真 DB 權限外洩或防重播失敗。這兩項已修正，原失敗記錄保留。
3. **R15 固定實際成功版** `5e1976e682cafdcd0587e4466a56146951ff43a1`：[Actions #40469164661](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40469164661) 實際 `completed/success`；R9–R12 64/64、R13 5/5、R14 12/12、R15 5/5、完整 Node **269/269 PASS**。原 Runner 記錄：
   - `R15 REAL_TCP_INTERRUPTION: DB committed after client disconnected; replay blocked`
   - `R15 NO_BLIND_RETRY: observed persistent DB state, no automatic replay`
   - `R15 INDEPENDENT_BACKUP_RESTORE: row digest, row count, revocation and replay matched`
   - `R15 RESTORED_ACL: untrusted DB role denied; no privileged execution stage`
   - `R15 LIMITATION: logical backup/restore test is NOT PITR or HA failover, independent authorization or real G2 ACK`
4. 自 R14 `52e26900e0a945b15b715f7fed3f39e75b8ff1d0` 至 R15 真成功版，**4 個 commits / 3 個候選檔案**。R1–R14 原始失敗、缺陷擴散、版本對照均保留，不覆寫。

## 對長期演化仍不足的驗收

| 關卡 | R15 能證明 | 仍不能證明 |
|---|---|---|
| 網路中斷 | 真 `psql` TCP query 運行中切斷連線；後續 DB 查回已提交、重播拒絕 | 所有 TCP 中斷／部分包／timeout／未知結果的時間點均安全 |
| 備份/還原 | 邏輯備份至**另一個** PostgreSQL 容器，資料摘要／撤銷／ACL 與拒收規則一致 | PITR、WAL 歸檔、異地備援、volume 損壞後實際還原、備份加密、長期留存及 RPO/RTO |
| 主備切換 | **未進行主備 streaming replication 或 promote** | 同步延遲、異步落後、雙主腦 split-brain、failover 後收據唯一性 |
| 信任根 | PostgreSQL 存 review-only metadata，R11 合成驗簽仍分離 | 真 owner 公鑰／授權角色、可不可偽造審核收據、正式不可否認稽核與受保護 dispatcher |
| 獨立驗收 | G1 CI 可回看固定 SHA、來源與反例 | GPT②/G2 真讀取／真正獨立 ACK、使用者的分別核准 |

### 不可因測試綠燈解除的狀態

`R15_EPHEMERAL_PRIVATE_TCP=PASS`；`R15_INDEPENDENT_LOGICAL_RESTORE_AND_ACL=PASS`；`HA_PROMOTION/PITR=NOT_TESTED`；`TRUE_OWNER_TRUST_ROOT=NOT_CONFIGURED`；`INDEPENDENT_G2=WAITING`；`MAIN_MERGE=NO_GO`；`PRODUCTION=NO_GO`。

下一段應優先以**兩個真正的 PostgreSQL 節點建立 physical streaming standby／promote 測試**，分辨已同步與落後的交易、探討 promotion 時狀態分岔，而不是把本次邏輯還原稱為 HA 驗收。正式資料庫、部署、真金鑰與主分支合併需另取得使用者同意。
