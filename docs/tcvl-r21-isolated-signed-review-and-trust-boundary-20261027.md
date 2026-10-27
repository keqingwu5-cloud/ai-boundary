# R21｜合成 Ed25519 待審驗簽與單實例防重放：G1 隔離驗證

> 日期：2026-10-27。**僅研究／隔離候選**。本輪未安裝正式簽章金鑰、公鑰託管、資料庫、Notion、私人記憶、外部派工、正式主備切換或部署。PR #69 保持 Draft，未更動 main、PR #70 或原每小時監控。所有使用者重要核准權與獨立 GPT②/G2 安全驗收仍保留。

## 原始問題與 R20→R21 差異

R20 `tcvl-r20-review-persistence.cjs` 只比對 v2 **自陳**欄位和資料摘要；PostgreSQL `reserve_untrusted_metadata` 也會接受具有資料庫函式權限的呼叫者自行組成、**沒有驗簽**的 JSONB。原 R20 的 318/318 測試通過，只能證明部分單機資料完整性與消費限制，不能證明真 owner 的批准身分。

R21 新增 `tcvl-r21-synthetic-signed-review.cjs` 和測試 `tests/tcvl-r21-synthetic-signed-review.test.cjs`，使用**測試過程產生**的 Ed25519 金鑰組，實際以 `crypto.verify` 檢查 v2 草案所有固定欄位的簽署位元組。這是研究「加密資料完整性」與「有權批准者身分」的必要區分：

- 域隔離：`TCVL-R21-SYNTHETIC-REVIEW-V2\0`＋R19 已固定的 18 欄位 JSON 序列化。**不是 PR #69／#70 舊 v1 的正式互通簽章**。
- 以模擬器建立時的測試公鑰、`key_id` 和 `approver_id` 查核簽章；簽署後修改 `node_id`，或測試 signer 配置被標示 revoked，均拒絕。時間以測試注入的合成時鐘判斷，非法／過期亦拒絕。
- 同一個 Node isolate 的測試模擬器內以 `receipt_id`、`nonce` 兩個 Set 拒絕重用，模擬撤銷 key 的情況；不同模擬器**可以各自接受同一筆收據**，證明未建立跨程序原子防重放。
- 符合格式與合成簽章者最多回 `SYNTHETIC_SIGNATURE_REVIEW_RESERVED_ONLY`。所有回應 `trusted_signer_verified=false`、`verified_owner_approval=false`、`verified_gpt2_ack=false`、`execution_allowed=false`、`cross_process_replay_protection=false`。**不是正式授權收據**。
- 測試所用 `syntheticAuthorities` 與 `syntheticClock` 由建立模擬器的呼叫者提供；這不是受保護 trust root，也沒有角色權限、真實外部撤銷查核、G2 審查或正式 clock。
- **特別不能誤判**：R21 的已驗簽模擬器與 R20 PostgreSQL ledger **仍是兩份不同的隔離實驗**。沒有將受信 verifier、資料庫權限、收據/nonce、撤銷／leader epoch 及外部派工於同一受保護交易中不可繞過地連接；具權限的 DB 測試呼叫者仍可直接寫入未簽候選資料。R17 已證實錯誤切換到沒有收到 WAL 的備援會使收據/撤銷紀錄丟失，單機 Set 不解決此問題。

## 先紅後綠證據（所有失敗歷史追加保留）

| CI | 觀察與正確解讀 |
|---|---|
| [R20 基準 #40484965830](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40484965830) | 318/318 全 Node 測試通過 |
| [R21 首次 RED #40488044274](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40488044274) | 324 total、318 PASS／6 FAIL；新 R21 只有 deny-only stub，新介面尚未實作 |
| [R21 時間與來源負測 RED #40488368656](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40488368656) | 329 total、324 PASS／5 FAIL；發現不合法時鐘、停用測試金鑰／設定及回傳宣告仍未完整 |
| [R21 分類缺口 #40488460593](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40488460593) | 329 total、328 PASS／1 FAIL；不符任務來源遭拒絕，但錯誤歸類為一般 invalid input，而不是 `BLOCKED_TASK_OR_EVIDENCE_MISMATCH` |
| [R21 修正後 #40488691719](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40488691719) | 固定當時 HEAD `d2d2cc29be4bb2de5f74d1a5fde884d84f0314e2`，GitHub `completed/success`，**329/329 Node PASS**，含 11 項 R21 定向測試及 R9–R20 原回歸 |

這些 RED 均指**候選功能／負測尚未滿足契約**，不能指稱正式系統受攻擊。R21 最終合成驗簽成功也**不能**視為真實 owner 或 G2 已核准。

## 本輪未解決的檢查與下一步

1. **簽章文字編碼唯一性**：目前候選僅檢查 base64url 字元及長度、再解碼驗簽，尚未以確定的負測證明非標準等價文字編碼會被拒絕；此項另需測試確認、修正並保留前後差異，不能借用現有 329 綠燈抵銷。追加測試的工具寫入曾被阻擋，沒有形成有效 Runner 證據。
2. **真受信來源**：正式 owner 身分、公鑰託管、憑證輪替、撤銷權、用途分離（「提出審查」與「允許執行」）及獨立受信時間尚未建立。
3. **真正跨交易原子性**：必須由使用者與 G2 先審核服務邊界，防止呼叫者越過驗簽器直接寫資料庫；不同程序／資料庫、恢復後收據及 nonce 只能消費一次。
4. **資料庫分岔與派工**：R17 的錯誤升主仍未被可信 fencing/quorum 阻止，不得授權 worker 或聲稱正式零資料遺失。
5. **獨立審查與制度發布**：Issue #31 的正式批准、G2 真實目的端 ACK、GitHub main merge、真金鑰／DB、15 分鐘監控啟用及部署各需使用者另行核准。

**R21 判定**：`SYNTHETIC_SIGNATURE_INTEGRITY=PASS_IN_G1`；`IN_PROCESS_REPLAY=PASS_IN_G1`；`CROSS_PROCESS_ATOMIC_TRUST=NOT_BUILT`；`OWNER_AUTHORIZATION=NOT_VERIFIED`；`G2_ACK=WAITING`；`MAIN_MERGE/PRODUCTION=NO_GO`。