# 第一大腦｜世界模型 × 記憶體 × 世界如棋局：共通治理橋樑協議 v1.3

- 協議 ID：`FB-WM-MEM-WAC-BRIDGE-20261108-V13`
- 基礎：V1.2「建築工序／鋼筋混凝土／工具分工／三系統橋樑」；V1.1 速率驗證；V0.6 參照語意
- 既有承接：PR #75 的 `concept-reuse-compat.mjs`、`research-context-bridge.mjs` 與 `world-verification-ledger.mjs`；Issue #32/#41/#54/#55/#77
- 階段：`C1→C4 最小唯讀橋接候選`；**沒有正式 memory 權限、資料遷移、合併、部署或跨 AI ACK**
- 規範字：**MUST 必須**，**MUST NOT 不得**，**SHOULD 建議**。本文件是提案協議，不代表已生效的官方規章。

## 0. 主張與可驗證邊界

鋼筋（記憶追溯）與混凝土（世界事件模型）互補，靠可驗證的「錨定」接口連接，而非把兩種資料混成同一庫；《世界如棋局》產生情境／競爭解釋，但其推演不能自動變成已發生的事實。水電工具類比指：檢索、識別、驗證、模擬、回退分派合適工具。工期類比指：採取有前置依賴的 Gate，而不是按文件數量宣稱完成百分比。物理比喻不作為實際安全係數或時間保證。

## 1. 範圍與權威（MUST）

| 角色/系統 | 已知接口/資料 | 權威能力 | 本協議的權限 |
|---|---|---|---|
| 3D 第一大腦 | `aiBrain.v1` / `readAuthoritativeNodeContext()` | 節點定位、腦區、原始圖歷史 | 唯讀；Node 不是 Claim |
| 世界模型 | `worldModel.verify.events.v2` 日誌 | 研究行、事件版次、自評 | 唯讀；自評不是獨立驗證 |
| 記憶治理 | `memory.js` / PR #28 候選及獨立記憶規範 | 原始來源、審批、歷史回收 | 只能提出候選，不得寫入正式記憶 |
| 世界如棋局 | 參照框架 R、情境與反事實 | 推演、替代解釋 | 不把模擬當成史實 |
| 橋樑 | `research-governance-bridge.mjs` | 檢查／唯讀投影／拒絕 | 沒有自己的權威 DB，不發放批准與真 ACK |
| 使用者及授權審核 | 明示變更授權、獨立審查收據 | 合併、部署、記憶核准決策 | 不由橋樑替代 |

**單一權威**：橋樑沒有任何可寫入的第四份「真相」；投影資料只能作比較、顯示、研究候選。`aiBrain.v1.links.kind` 保持既有 `derived/cross` 語意，不擅自灌入 `causes` 或 `contradicts`。

## 2. 資料身份與最低契約

- `project_id`、`task_id`、`conversation_id`、`correlation_id`、`idempotency_key` 用於工作追蹤，彼此不互為身分。
- `source_id` + `source_revision` + `content_hash` 用於來源重現；URL 只作線索。來源 hash 應由真正讀取的原始 bytes 計算，不能接受人工填入字串就算已驗真。
- `node_id` 定位 3D 視覺節點；`record_id` 定位世界模型研究行；`source_event_id` 與 `journal_version` 定位 journal 事件；正式 `claim_id` 與 `claim_revision_id` 應由有權威的 Claim 系統分配；不得用 `node_id` 冒充。
- `memory_record_id`、`memory_revision`、`memory_authorization` 由記憶治理負責；只有 `null/NOT_APPROVED` 時不能回寫。
- `evidence_id` 應附原始來源、可得時間、可重現摘要及反證關聯；相同來源經世界模型與記憶體兩次引用不得自動重複計權。
- `relation_domain` 必須明確：`navigation`、`evidence`、`world_hypothesis`、`relative_semantics`、`normative`、`simulation`。域內關係不可跳到另一域；尤其 `context_reference` ≠ `related_to` ≠ `depends_on` ≠ 已驗證 `causes`。
- 參照 R 可以包含主體、對象、尺度、單位、觀察者、母體、有效時點、政策範圍；缺 R 應顯示未知，不能硬判矛盾。
- 時間欄位應採帶時區 RFC 3339 時點。`event_at`、`recorded_at`、`source_available_at` 與 `cutoff_at` 必須分開；來源晚於截止不能倒灌歷史。單靠提供日期不等於證明已在當時可取得。

## 3. 唯讀輸入與輸出

**輸入**：既有 PR #75 `previewWorldClaimReference()` 結果 `tcvl.claim-ref-preview.v0.1`；必須由 `readAuthoritativeNodeContext()` 先按當前保存權威辨識 Node，並由 `readWorldLedger()` 回放 Journal。僅 `candidate_only` 狀態允許產出研究候選。

**輸出**：`firstbrain.research-bridge.preview.v1`，保留以下不可升格欄位：

```json
{
  "status": "candidate_only",
  "decision": "HOLD",
  "packet": {
    "schema": "firstbrain.research-bridge.preview.v1",
    "authority": "none",
    "node_id": "nodeA",
    "source_record_id": "studyA",
    "source_event_id": "eventA",
    "journal_version": 1,
    "claim_id": null,
    "memory_record_id": null,
    "memory_approval": "NOT_APPROVED",
    "context_relation": {"type":"context_reference","from":"nodeA","to":"studyA"},
    "relation_domain": "world_hypothesis",
    "semantic_certification":"UNVERIFIED",
    "causal_certification":"NOT_PROVEN",
    "reference_frame": {"comparison_metric":"response_delay"},
    "scenario_ids": ["baseline","alternative"],
    "as_of": "2026-11-08T12:00:00Z",
    "source_available_at_hint": "2026-11-08T11:00:00Z",
    "source_independently_verified": false,
    "evidence_refs": [],
    "ack": {"status":"NOT_VERIFIED","receiver_id":null,"receipt_id":null},
    "proposed_operation": "READ_ONLY_RESEARCH_PREVIEW"
  }
}
```

示例是**合成資料**，不是一次真實交接或可採信的時間證據；實際執行另有 `reason_codes`、`source_preview_schema` 及 `provenance`。

## 4. 狀態與收據協議（僅規格，未連接外部執行端）

1. `CREATED`：候選在來源端建立，含任務及原始意圖。
2. `QUEUED`：具可核對的佇列收件紀錄；不等於已傳送。
3. `SENT`：真正發送端寫出 transport 證據；不等於接收。
4. `RECEIVED`：由經驗證的**目的端**提供接收紀錄；不可自我聲明。
5. `PERSISTED`：目的端回讀一致版本與完整內容後確認保存；不等於審查認可。
6. `ACK_RECEIVED`：可驗證發出者、事件 ID、payload hash、版本、時間、信任通道和回讀。
7. `REVIEWED`：獨立審查結果，包含反對理由及證據；不等於使用者批准。
8. `APPROVED`：必須另走獨立權限、使用者授權、相同版次的審查 Gate；研究橋樑無此狀態轉換能力。

`BLOCKED/FAILED/TIMEOUT/STALE` 是明確失敗分支，禁止從 `SENT` 跳至 `ACK_RECEIVED`。沒有獲信任的目的端驗證接口之前，所有遠端 ACK 固定 `NOT_VERIFIED`。

## 5. 安全規則（不得折衷）

- **I01** 原始圖、Journal 與私人記憶 bytes 不得由研究橋樑修改。
- **I02** Node／Record／Event／Claim／Memory ID 必須分型；比對名稱相同不等於身分相同。
- **I03** 舊圖導航邊與概念相似度不得自動升格因果。
- **I04** 反義／相對句子的 R、量詞、對象與時點不得遺失。
- **I05** as-of 先解析到 UTC instant；缺時區或來源晚於 cutoff fail closed。
- **I06** 修訂、刪除及拒絕仍保留來源歷史；新版本不能直接取代舊證據。
- **I07** 相反研究、規範標準和不確定性保留；不能只選較順耳的推論。
- **I08** 世界模型與記憶共引同一來源不雙重加權；橋樑不自行給可信度總分。
- **I09** 工具採最小權限；純閱讀不取得記憶正式寫入能力。
- **I10** 真實 RECEIVED／ACK 必須來源端與目的端分別舉證。
- **I11** 階段依賴未滿足不得越級宣布 Gate 解除。
- **I12** 各種錯誤拒絕不破壞原始資料；正式寫入前要有完整備份／回退演練。
- **I13** 工具路由優先做最小資料檢索／差異比較，必要時才啟動推理／模擬。
- **I14** 速率設有佇列／流量上限、截止、重試、冪等、P50/P95、錯誤率和成本量測。
- **I15** 使用者批准與 BOT③ 獨立工程審查不可被本地綠燈取代。

## 6. 故障處理與防護

| 故障或攻擊 | 必要處理 |
|---|---|
| ID 相似／冒用／來源指向其他 Node | `blocked`，保留原始紀錄 |
| 提供未知 relation_type | `RELATION_DOMAIN_UNKNOWN` |
| 非法 ISO 字串、缺 offset、來源晚於 cutoff | 拒絕時間確定性，禁止倒填歷史 |
| 模擬結果聲稱真人事實 | 保留 `simulation`，不得變成 `observed` |
| 同一來源反覆回饋 | 來源 ID + digest 去重，禁止回饋放大 |
| 舊版本或改動過的內容 | 固定版本、回讀及差異核對；不能靜默替換 |
| 未經驗證的 ACK 字段 | 不能升級 ACK，不發放批准 |
| 速率超限或 timeout | 有界佇列、429 或背壓、可控重試；逾時後先查是否已處理 |
| 資料儲存失敗 | 不冒稱成功；原始資料不變，提供恢復路径 |
| 工程隔離測試通過 | 只標 `LOCAL_ISOLATED_PASS`，不改 `PRODUCTION` Gate |

## 7. 工期、前置依賴及下一段實作

| 工序 | 實際交付 | 狀態 |
|---|---|---|
| C0 盤點 | PR #75 / #41 / #54 / #55 / #77 原接口與衝突 | 已讀來源（本次範圍） |
| C1 契約 | 本協議、來源分型、時間／域／狀態規則 | 協議候選完成 |
| C2 記憶保護 | `memory_approval=NOT_APPROVED`，阻擋自動升格 | 純函式隔離測試 |
| C3 世界模型 | PR #75 Preview → 保守研究投影 | 隔離候選程式；需真 repo CI |
| C4 水電接口 | 薄型唯讀 adapter，接實際 Node 與 journal | 候選程式；需真 repo CI |
| C5 反證驗收 | BR01～BR15 負例＋舊 PR #75 回歸＋失敗/回退/權限 | 隔離測試；真實資料未執行 |
| C6 正式部署 | 真獨立 BOT③、GPT② 接收/ACK、實機 Safari、歷史兼容、使用者批准 | BLOCKED |

**關鍵路徑**：C0→C1→C4→C5→C6。C2／C3 的候選研究可平行，但 C4 必須接受它們的契約；任何一環有未知來源或不相容都要 HOLD。

## 8. 工具路由與速度、安全係數

- 檢索：只讀原始來源 + SHA / 修訂，按 event ID 比對。
- 鑑別：Node／Record／Claim 身分檢查，缺 canonical Claim 就標 null。
- 理解：解析相對詞、否定範圍與 R；概念相似度只能產生提問。
- 因果：獨立機制、替代解釋、混淆與反證；不可由事件先後自動生成 `causes`。
- 模擬：《世界如棋局》保留多路徑，不反寫實際世界記憶。
- 回退：只在有授權且具交易與備份機制的後續接口中進行；本協議實作沒有 writer。
- 速度：讀取 bytes、P50/P95、吞吐、排隊、超時／重試率及 token 成本，各有 baseline；不得拿 localhost SR01～SR20 代替主腦量測。
- **安全餘裕不能先指定一個固定倍數**：真系統須先有穩定容量上限、峰值負載、故障模式、可恢復承載力，再定目標 headroom 和停機條件。

## 9. 版本／兼容／審批治理

- 本橋樑輸出是 `firstbrain.research-bridge.preview.v1`，**不是** `aiBrain.v1` 圖快照、PR #28 Tcvl 核准記憶或世界模型 journal。
- `context_reference` 只保留為 PR #75 的上下文參照；不得自動改成 PR #28 `related_to`，更不可導出 `depends_on` 和 `causes`。
- `source_event_id` 與 `journal_version` 來自 PR #75 journal，正式 Claim ID 與 Memory ID 尚未獲得；任何升格前需要獨立身份/來源驗證。
- 原始碼修改均放在**隔離新分支 Draft PR**，基於 PR #75 固定 head SHA；不得對 main、正式資料或私人記憶寫入。
- GitHub CI 的 PASS 只說測試套件在該 SHA 下通過。真相還需要不同實際環境、舊歷史資料、瀏覽器及第三方 reviewer。
- 當舊 PR #75 改版、世界 journal 格式升級、資料來源撤回、權限修改時，本橋樑相依版次必須重新核查，不能默默接受。

## 10. 測試與結果分級

1. `tests/research-governance-bridge.test.mjs`：BR01～BR15 型的純函式拒絕與正例；不碰正式資料。
2. `tests/research-governance-integration.test.mjs`：真的使用 PR #75 `readAuthoritativeNodeContext()`、`previewWorldClaimReference()`、`appendWorldLedger()`；合成資料寫入的是本機 Map，橋樑本身不寫入。
3. CI 工作流 `.github/workflows/research-bridge-isolated.yml`：Node 22，執行新測試與 PR #75 既有 `concept-reuse-compat` 回歸。
4. 未執行：真正 GPT②/記憶體讀寫、真私人舊資料導入、實機 Safari、完整原流程速度壓測、權限安全審查、部署。

## 11. 驗收輸出及停止線

- C1～C4 若新模組可回傳 `candidate_only/HOLD` 並保留所有身份與來源而不寫舊資料，記 `ISOLATED_CANDIDATE_PASS`。
- 若發現資料錯配、被冒充的 ACK、錯誤時間、版本失配，記 `BLOCKED`；能正確拒絕是防護測試通過，不代表跨 AI 傳輸成功。
- **不能宣告正式 READY**，除非固定 HEAD SHA 的 CI、獨立 BOT③ 審核、適當舊資料與實機測試、可信 GPT② ACK、可恢復備份/回退，且使用者逐次明示核准。

## 12. 參考原始來源

- PR #75：`https://github.com/keqingwu5-cloud/ai-boundary/pull/75`
- Issue #41：`https://github.com/keqingwu5-cloud/ai-boundary/issues/41`
- Issue #54：`https://github.com/keqingwu5-cloud/ai-boundary/issues/54`
- Issue #55：`https://github.com/keqingwu5-cloud/ai-boundary/issues/55`
- Issue #77：`https://github.com/keqingwu5-cloud/ai-boundary/issues/77`
- JSON Schema 2020-12：`https://json-schema.org/draft/2020-12/`
- RFC 3339：`https://www.rfc-editor.org/info/rfc3339/`
- W3C Trace Context：`https://www.w3.org/TR/trace-context/`

---

**結論：完整協議是「建造圖」，純函式守門是「材料測試」，真 PR #75 路徑整合是「現場接管候選」，BOT③與使用者核准才是「正式使用執照」。**

## 13. 可機器檢查的輸出契約（v1.3 補充）

- `schemas/research-governance-bridge.preview.schema.json` 使用 JSON Schema Draft 2020-12，僅接受 `candidate_only` 或 `blocked`；`decision` 固定 `HOLD`，`claim_id/memory_record_id` 必須為 null，正式批准及真實接收 ACK 不可出現在本版資料類型。
- `tests/research-governance-schema.test.mjs` 在 GitHub CI 檢查結構欄位一致性和禁止權威升格的常數；**不是**完整 JSON Schema 驗證器。完整 Draft 2020-12 語意驗證已在本地 Python `jsonschema` 隔離環境對代表性正例／負例執行。更多正式輸入、異常時間和跨版本相容仍需獨立審查。
- JSON Schema 的 `format: date-time` 在部分實作只作註解，實際 as-of 邏輯必須繼續使用程式層的 UTC 時點檢查與原始來源核對。