# R18｜R9–R17 系統級安全驗收與下一步決策（G1 審查，非 G2 簽收）

**審查日期**：2026-10-27（Asia/Taipei）  
**審查範圍**：節點擴散 R9–R17 隔離候選、直接相關 GitHub 治理／跨 PR 資料契約；**不是全倉庫、所有候選分支、全部手機頁面或正式服務的完整驗收**。  
**固定審查基準**：PR #69 `fix/node-diffusion-p1-gates-20261027` commit `aadb9baa1611e5df43b53d51529b1358e79614ca`；成功 CI [#40472942633](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40472942633)；當時 `main` `7b7b77e8c06ce3ed348e2d5c086ff086da64f95a`。本報告自身作為後續 docs-only 追加提交，若出現新 HEAD，需以該 SHA 的 CI 獨立核對，不能把舊 run 當成新 commit 已跑過。  
**決策**：`G1_TECHNICAL_EVIDENCE=PARTIALLY_VERIFIED`；`SYSTEM_SECURITY_ACCEPTANCE=BLOCKED`；`INDEPENDENT_G2_ACK=UNVERIFIED`；`PRODUCTION/MAIN_MERGE/SECRETS/WORKER=NO_GO`。

## 一、可用作驗收證據的範圍，與不能擴大解讀的結論

| 版次 | 已有可回查證據 | 真正被驗到的範圍 | 不得宣稱 |
|---|---|---|---|
| R9 | 原先 RED／GREEN [#40441779238](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40441779238)、[#40441937626](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40441937626) | 候選/拒絕狀態與 scope/跨專案提案排程反例 | 真實獨立批准／遠端執行 |
| R10 | [#40443881687](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40443881687)、[#40444165483](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40444165483) | 舊 `reuse` 不升格，`reuse_proposal` 始終需審 | registry `approved` 即為可信核准 |
| R11 | [#40447869787](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40447869787)、[#40448182563](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40448182563) | 合成 Ed25519 收據資料完整性與欄位簽章 | 金鑰來源／owner 真實身分已核准 |
| R12 | [#40449361231](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40449361231)、[#40449728576](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40449728576) | 單一 JS isolate 預留、撤銷競態；兩個不同模擬器仍會各自成功 | 跨程序耐久防重放 |
| R13 | [#40454969416](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40454969416) | 一次性 PostgreSQL 同實例 24 session 1 勝者，revoke、rollback、限制權限 | 真資料庫／真正授權角色已配置 |
| R14 | [#40467997055](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40467997055) | 單一 PostgreSQL PGDATA 的 SIGKILL/WAL restart、未提交交易中止、未知回應 readback | HA/PITR 或真實任意網路故障均無資料遺失 |
| R15 | [#40469477054](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40469477054)、[#40470456849](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40470456849) | 真隔離 TCP 中斷、獨立邏輯還原、ACL 及全部欄位／撤銷 drift detection | 外部信任、跨叢集 HA 已建立 |
| R16 | [#40470990962](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40470990962)、[#40471545059](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40471545059) | PostgreSQL 實體 standby、WAL 重播、先停原主再人工 promote | 自動 fencing、zero-RPO |
| R17 | [#40472142426](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40472142426)、[#40472942633](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40472942633) | 首版「暫停 replay 即丟失」假設被**否證**；改斷 WAL 傳輸後在 throwaway DB 真的重現提早升主造成已提交收據／撤銷丟失及重複預留；293/293 Node PASS | 風險可重現就等於雙主保護完成；真 G2 已 ACK |

**判讀規則**：測試通過代表在該固定 SHA、特定 fixture、特定 runner，規定的正負案例得到預期結果。**R17 的危險重播在隔離 DB 成功重現，是安全缺口證據，不是安全功能通過**。所有失敗 run、fixture 修正與被推翻的假說仍有效，不能被最後一次綠燈掩蓋。

## 二、跨模組驗收發現與 P0/P1 風險

| ID | 等級 | 目前缺口或實際證據 | 判定／通過條件 |
|---|---|---|---|
| A1 | **P0** | `tcvl-approval-receipt-core.cjs` 在 R11 以**呼叫者提供**的 `trustedKeys`、revocation/consumed snapshot 驗簽；沒有人類 owner 授權來源／受保護 key rotation/revoke。即使簽章正確仍 `verified_owner_approval=false`。 | **BLOCKED**；正式可信 owner 身分、金鑰託管、撤銷政策與使用者核准需獨立證明。 |
| A2 | **P0** | R11 收據簽章涵蓋 `node_id`、`origin_command_id`、`request_id`、`permissions_scope`、`approver_id`、`issued_at` 等；但 R13 `review_reservations` 只存 `receipt_id/key_id/project_id/direction_version/evidence_digest/expires_at/reserved_at/stage`。資料庫函式不驗 R11 簽章，也不保存完整被簽資料的可信 digest/驗證回執。 | **BLOCKED**；先定跨層單一簽收資料契約，受信 verifier 與 atomic consume 必須在受保護交易邊界綁定，不得單憑 SQL `REVIEW_RESERVED_ONLY` 認定有效批准。 |
| A3 | **P0** | R17 已實驗證明未送達的 WAL 在落後備援升主後會使舊收據／撤銷消失、重放重新被接受。現無真正 Fencing/Quorum、權威 leader epoch、受保護 promotion dispatcher；`assessPromotionReview()` 讀 caller-supplied `power_off_claim`、LSN、epoch。 | **BLOCKED**；須指定可接受 RPO/提交保證、可信控制平面及不可雙寫證據，並對舊主恢復、timeline 分岔、切換失敗實測。 |
| A4 | **P0** | PostgreSQL WAL LSN 數值比大小不足以跨**不同 timeline/分叉**證明交易是同一歷史；目前 R17 G1 的 `pgLsn` 對數值做 BigInt 比較，未驗證 timeline ID/共同祖先、提交鏈及權威來源。因函式只給審查建議而非 promotion 命令，尚未直接造成正式越權，但**不可把 READY 字樣當放行**。 | **BLOCKED**；同一 cluster/timeline 的祖先與權威 commit proof、離線反例，以及受保護資料來源獨立查回後才討論 promotion 授權。 |
| A5 | **P0** | Issue [#41](https://github.com/keqingwu5-cloud/ai-boundary/issues/41) 自述 `BLOCKED`，[#56](https://github.com/keqingwu5-cloud/ai-boundary/issues/56) 是待 GPT② ACK；PR #69 GitHub review 目前沒有獨立審查提交。G1 在 Issue #56 增加的文字是索引，不是 GPT② 真 runtime 收件/ACK。 | **BLOCKED**；須由獨立身分讀取固定 SHA 的證據、提出可回溯反證並從真正目的端回執。 |
| A6 | **P0** | 活躍 `main` ruleset #24906639 要求透過 PR，但 `required_approving_review_count=0`；不等於已配置使用者核准與獨立 G2 的強制發布門檻；Issue [#31](https://github.com/keqingwu5-cloud/ai-boundary/issues/31) **仍屬草稿、尚未正式核准整篇規章**，不影響使用者另行明示的個別權限。 | **BLOCKED**；由使用者決定制度版本、獨立審核權與正式分權；不得在本 G1 分支逕自修改 ruleset。 |
| A7 | **P1** | `tcvl-diffusion-bridge.js` 已修跨專案 `requestId` 假重送，但 task 欄位未存 `source_node_id`／原始 payload digest；同專案不同節點時只回 `already_queued_requires_origin_review`，無法獨立驗證是真同一任務。 | **PENDING**；版本化 task identity 四元以上唯一鍵及向下相容測試，嚴禁將「已排隊」當「已批准／已執行」。 |
| A8 | **P1** | [Draft PR #70](https://github.com/keqingwu5-cloud/ai-boundary/pull/70) 的 `tcvl-diffusion-approval-receipt.cjs` 是**另一份**簽章收據候選，base 指向持續演進的 PR #69；現比對 PR #70 相對最新 #69 branch `behind=56, ahead=6`，另有不同測試與 schema。 | **BLOCKED FOR INTEGRATION**；先比較兩份驗證器 field/schema/trust-root/正負測的一一對應，固定主契約，再作隔離衝突/差異測試。不得直接疊合或視為雙重獨立批准。 |
| A9 | **P1** | PR #69 有 31 個變更檔案，base 是 `test/node-diffusion-p0-20261026`，**不是 main**；PR #66 監控與 #68 主腦匯入另有不同 base/head 與風險。R9–R17 此次沒有把全專案 54+ 分支、所有 UI、外部回執及私人資料端點跑完整整合。 | **PENDING**；由變更圖與 shared schema 先做相容性盤點，僅在受控候選合成環境整合，重測真負例，不能直接串主分支。 |
| A10 | **P1** | 缺真正 PITR/跨主機 HA、長期備份可用性、RPO/RTO、不可改稽核及撤銷在恢復後的權威性；R15 邏輯還原和 R16 安全手動 promote 都沒有覆蓋。 | **PENDING**；先定正式所需可靠性指標及驗收，再決定是否值得配置隔離跨節點服務。 |

### 重要判斷

- **A2 與 A3 是最有實質安全影響的跨階段接口缺口。** 再增加隔離 CI 案例數量，不能補上尚不存在的受信服務與交易綁定。
- **A4 是本輪新增的技術設計反例／證據缺口，不是已證實有人成功利用的正式漏洞。** 現有候選函式固定 `promotion_allowed:false`，暫時安全界線由「不執行」而不是「來源已可信」維持。
- **A8 是分支整合依賴風險，不宜將 PR #70 單獨測試當成 PR #69 最新 HEAD 已驗收。**
- **A6 是治理層尚未強制獨立核准的風險**。此報告不自行改規則、不替使用者批准任何部署。

## 三、發布驗收門檻（目前全部不得自動升格）

| Gate | 必需 evidence | 現況 |
|---|---|---|
| G0 目標、版本、原始授權 | 用戶明示的正式目標、政策版本及可讀的 owner 決策 | 候選測試有授權；**正式執行未授權** |
| G1 合成/隔離正負測 | 每次固定 HEAD 的真 Actions log、來源差異與原始失敗 | **候選 R9–R17 局部通過；覆蓋不等於整體** |
| G1.5 完整跨層綁定 | 經認證 verifier→同一 receipt／node／scope→transaction consume→STOP/revoke→受保護派工 | **BLOCKED** |
| G2 獨立安全反證 | 獨立 reviewer 與目的端驗證 ACK，能追原來源 | **WAITING／NOT_VERIFIED** |
| G3 運作安全 | 可信 leader/fence/epoch、HA/RPO、PITR、跨程序恢復及最小權限 | **BLOCKED** |
| G4 使用者發布決策 | 使用者依序核准規章、權限／金鑰、正式資料庫、合併、監控/部署 | **均未由本輪提供正式核准** |

**審查結果**：`RESEARCH_CANDIDATE_CAN_CONTINUE`；`FORMAL_AUTHORIZATION_GATE=NO_GO`；`AUTO_PROMOTION=NO_GO`；`DIRECT_MAIN_MERGE=NO_GO`；`PRODUCTION_DEPLOYMENT=NO_GO`。

## 四、下一階段不應重做原本已完成的事情

建議先進入 **R19 規格收斂與外部獨立反證準備**，而不是再新增一輪「只在 disposable PostgreSQL 測試成功」的功能。優先：**(1)** 對照 PR #69/#70 的重疊授權驗證器，擇一經使用者／G2 審核的單一 `approval_receipt/vN` 標準；**(2)** 以完整 `project_id/node_id/origin_command_id/request_id/permissions_scope/evidence_digest/approver_id/key_id/version` 建立受保護 DB 原子核對的設計與反例；**(3)** 明訂 RPO/主備權威與真 fencing 來源，向真正 G2 請求固定版本的獨立報告。任何要配置真 key、正式 DB、授權者或發動外部 worker 的下一步，均需使用者**逐案**核准。

### 來源回溯

- [PR #69 R17 原始追加稽核](https://github.com/keqingwu5-cloud/ai-boundary/pull/69#issuecomment-6437085954)／[Actions #40472942633](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40472942633)。
- [全流程前置審查 R9–R16](https://github.com/keqingwu5-cloud/ai-boundary/blob/fix/node-diffusion-p1-gates-20261027/docs/tcvl-r9-r16-process-audit-20261027.md)，含錯誤、修復、否決假說及候選對照。
- [共同規章草稿 Issue #31](https://github.com/keqingwu5-cloud/ai-boundary/issues/31)／[真交接 Issue #41](https://github.com/keqingwu5-cloud/ai-boundary/issues/41)／[獨立 G2 待回覆 Issue #56](https://github.com/keqingwu5-cloud/ai-boundary/issues/56)／[全專案發布風險 Issue #65](https://github.com/keqingwu5-cloud/ai-boundary/issues/65)。

> 本報告是 G1 對現有程式、原始測試與治理狀態的**來源審查**，不是外部 G2 的審查結果、不是 GitHub 必需 reviewer 的替代物、不是 owner 批准及正式安全認證。維持原始歷史，不以 doc-only commit 自動授權其他行為。
