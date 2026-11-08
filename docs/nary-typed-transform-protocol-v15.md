# 第一大腦｜通用 N 輸入「換算 → 結果 X → 重用」協議 V1.5

- 日期：2026-11-08（Asia/Taipei）
- 研究 ID：`FB-NARY-TYPED-TRANSFORM-V15-20261108`
- 父版：PR #123（V1.4 通用 N-ary 底層），再上游 PR #122（V1.3 規範橋），PR #75（唯讀 Node / Claim 相容）
- 狀態：`ISOLATED_TYPED_TRANSFORM_CANDIDATE / NOT_PRODUCTION / NOT_REMOTE_ACK / NO_MEMORY_AUTHORITY`
- 核心宗旨：**A+B+C+D+… 是通用形式，＋是具版次的規則，不必限制 A/B 是世界模型、記憶體或特定學科。**

## 1. 把「＋」升級為可測規則

V1.4 能把 N 份資料建成可追溯引用、精確的安全整數相加。V1.5 新增通用「可插入經審查規則的結構」（本輪只有固定允許的五個可運算操作），並**實際產生具型別的 X 值**，不只是關聯邊。

```
A@r1 + B@r1 + C@r1 + D@r1 --F(ruleId,version,context)--> X
X + E + F --G(otherRule,otherVersion,otherContext)--> Y
```

無限擴張在數學上指可繼續組合；工程上仍需明確的每次輸入上限、層數、總來源數、負載與成本界線。V1.5 沿用 V1.4 最多 32 個直接輸入與既有容量限制；不假定所有規則皆交換律、結合律、分配律或冪等。

## 2. 五個真正執行的轉換操作（可增加經審核新規則）

| 規則 | 輸入 | 結果 X | 保守限制 |
|---|---|---|---|
| `quantity_sum` | N 個**同量綱**的量 | 帶指定單位的**精確分數** | 拒絕不同量綱和未知單位 |
| `quantity_mean` | N 個同量綱的量 | 精確平均，不隱藏小數誤差 | 缺測量條件時不推論研究結論 |
| `quantity_ratio` | 兩個同量綱的量 | 無單位比值 | 除以零或量綱不同拒絕 |
| `data_rate` | 資料量、正的持續時間 | `bit/s` | **不**表示任何真實裝置測速結果 |
| `record_project` | N 筆結構化記錄 | 僅選定欄位的保守預覽 | `lossy:true`；缺上下文不驗證真實語意 |

輸入可涵蓋不同資料來源，如文件元資料、設備測量、研究結果、業務統計和第三方報告，但**必須先轉換為帶明確型別的來源**。不允許用純文字任意推導 `causes`、`true` 或已批准記憶；未審核的 JS 程式不是合法規則。

單位採十進位與二進位的明確區別：`MB = 8,000,000 bit`，`kB = 8,000 bit`，`KiB = 8,192 bit`。時間以 `ms` 為內部基數，`s/min/h` 轉換為 `1,000/60,000/3,600,000 ms`。內部以 `BigInt` 整數相乘、再作最簡分數 `numerator/denominator`，不靠浮點四捨五入。每份原始量值須先是 JS safe integer，輸出精度受上限保護。**這些是合成計算，不是物理證據。**

## 3. 與 V1.4 引擎共用來源、版本、依賴失效及權限

- 來源透過既有 `registerSource()` 寫入**隔離、記憶體內的 Map**，仍需 `id/revision/sourceId`、內容指紋及呼叫端宣告的 `capabilities[]`。
- `transform` 在 V1.4 以 `derive` 建立規則版本、輸入引用和 context 所對應的 deterministic ID；V1.5 在**獨立內存結果表**存 `typed_result`，不改 V1.4 來源或 `aiBrain.v1`。
- `read(X)` 先通過 V1.4 的來源修訂/間接相依/權限檢查，才公開 `typed_result`。上游來源新版本會讓 X、Y 自動變成 stale；不能只拿舊 ID 讀出最新結果。
- 資料來源安全性由呼叫端主張；目前沒有可信的登入、簽名或授權服務，**不能將它當成正式 ACL**。
- 權威狀態固定 `authority:none`、`evidence_certification:UNVERIFIED`、`memory_approval:NOT_APPROVED`、`real_ack:NOT_VERIFIED`、`semantic_claim:NOT_EVALUATED`。
- `record_project` 不替代真實語言理解，只是可驗證的欄位選擇。遺漏欄位的投影一律標記 `FIELDS_OMITTED`，原文與原始版本必須可回讀。
- 規則語意例如兩個欄位相加、文字轉摘要、資料去重等，**不能用同一個未定義的 `+` 當成已證正確**；新規則須單獨指定名稱、版次、作用域、先決條件及反例測試。

### 工程已知限制（應向 BOT 審查）

`transform()` 即使命中 V1.4 快取，也會為了檢查本次輸入型別和結果範圍重新執行一遍局部純運算，再回收已存的結果；因此本輪**可證明沒有新增重複節點或保存副本，不能宣稱所有 CPU 計算已省掉**。後續若要真正消除重算，需要建立可信的操作成本模型和在驗證輸入後安全命中快取的接口。

`quantity_sum`/`quantity_mean` 接受組合結果再次當作輸入，但目前只允許在輸出單位中仍是 safe integer 的結果回用；如果是分數，須先明確轉換，不能偷偷取整數。這是保守的精度防護，非數學不可擴充。

## 4. 速率、傳輸與重用：什麼情況真的省？

**只有當接收端已持有或可合法取得同版原始來源及 X 的快取/定義**時，之後才能只傳 `X_id + content_hash + version`。若對端無法回讀，不可以把短 ID 稱作已傳送完整內容。

本輪唯一執行的量測是單程序 Node.js 的 UTF-8 JSON payload bytes、in-memory cache 次數、單程序 `performance.now()` CPU 延遲；不測 USB/WAN、GPT Token、跨 AI 交接或正式主腦 P95。

| 本地合成負載 | 數據 |
|---|---:|
| 4 份合成文件，含繁體中文字 | 每次完整 JSON 約 `51,116 B` |
| 只傳 X 引用 | 約 `210 B/次` |
| 第一次來源與 X 定義合計 | `51,116 + 1,475 B`，且每次引用另計 |
| 50 次全部重新傳來源 | `2,555,800 B` |
| 首次載入後，50 次只傳引用 | `63,091 B` |
| 重用節省（以此假設負載計） | `2,492,709 B`，約 `97.5%` |
| 真實 Token／網路吞吐／實際用戶成本 | **NOT_RUN / UNKNOWN** |

*注意：位元組估算不計 HTTP/TLS、連線重試、身分認證、資料回復、快取 TTL 與遠端落盤費用；需要真接收端協議測試才能聲稱跨節點節省。* 

案例計算中 `quantity_sum` 的四輸入：`1 MB + 500 kB + 1 KiB + 8 bit = 12,008,200 bit`。若問「為何得到 C」，必須能反查每項原值與單位，不能只看最後數字。

## 5. 測試與拒絕門檻

- 新版 `tests/nary-transform.test.mjs`：38 個例子，包含四輸入精確換算、巢狀 X→Y、版本變更失效、量綱衝突、未知單位、資料／時間方向、除零、分數安全、欄位投影與遺漏標籤、capability 漏洩、規則白名單及單位成本。
- `tests/nary-transform-schema.test.mjs`：3 個最低契約一致性及不可升格規則，**不是**完整 JSON Schema 驗證器。
- `schemas/nary-transform.preview.schema.json`：Draft 2020-12 候選 Schema，將權威與 ACK 限制為否定狀態；本地 `jsonschema` 執行 schema 本身驗證，GitHub 工作流僅作 JSON 語法與程式測試（除非另補完整語意驗證依賴）。
- 原本 `tests/nary-composition.test.mjs`：42 項前版回歸維持。合計目標 **83 項隔離 Node.js 檢查**，加上獨立 benchmark；以固定 GitHub HEAD 下實際 CI 成功/失敗為準，不能把文件寫的「目標」當已通過。
- 真實第一大腦、記憶核准、GPT② 來源/ACK、BOT③ 獨立審查、Safari/iPad、故障恢復、正式網路/Token 成本、私人舊資料相容：**尚未測**。

## 6. 下一階段 V1.6 前置條件與停損

1. 用一個固定版次的真來源唯讀投影接到 V1.3/PR #122，先確保橋樑與 V1.5 的 ID/版本/來源語意相容。
2. 增加可信規則註冊入口（人工審查、測試與 hash/版號鎖定），但**不要**開放任意 JS 執行或自行給予寫入記憶權限。
3. 把 `X_id` 在兩個獨立測試程序真正傳遞：對端先查有無同版來源/結果；若無必須 fallback 獲取合法原資料或拒絕，保留接收回執和讀回驗證。
4. 比較冷啟動、重複請求、規則改版、來源撤回與權限撤銷時的 P50/P95、bytes、重算與拒絕率；不得只報成功樣本。
5. 原 PR #123/#122/#75 維持 Draft；不改 `main`、不部署、不寫正式記憶、不同步實盤或不可撤回的遠端狀態。

## 7. 版本與原始依賴

- PR #123：`https://github.com/keqingwu5-cloud/ai-boundary/pull/123`，基準 HEAD `b1f8b1973b6714fcc5e640462808156f6701384f`。
- PR #122：`https://github.com/keqingwu5-cloud/ai-boundary/pull/122`。
- PR #75：`https://github.com/keqingwu5-cloud/ai-boundary/pull/75`。
- 通用合成試驗依賴：`nary-composition.mjs`，`sha256()` 使用 Web Crypto，來源、規則及上下文固定為可追溯引用。
- 本版報表原始資料：`benchmarks/v15-measurements.json`，生成指令 `node benchmarks/nary-transform-bench.mjs <output.json>`。

**結論：底層的「＋」已可由指定型別的可驗證操作執行，但任意內容的理解、真理、跨節點協作和權威批准，仍須分別設 Gate。**