# 第一大腦｜統一證明包與查核端 V0.1（隔離候選）

**依賴與狀態**：以 Draft PR #133（HEAD 187200f89e527e0d9885030b8c89851e6d56926e）的控制循環為父版。這份模組不改 main、不部署、不讀寫正式記憶、不接真實資料，也不提供真實跨 AI ACK。

## 1. 每次審查都要回答

| 問題 | 統一欄位／輸出 | 可信程度 |
|---|---|---|
| **誰建立證明包？** | created_by_claim | 呼叫者聲稱，未驗身 |
| **誰實際做了什麼？** | actions[].performed_by_claim、action_ref、action_hash、result_code | 行為與身份尚需獨立驗證 |
| **誰審查？** | reviews[].reviewed_by_claim、review_ref、review_hash、verdict | 仍是審查聲稱，不是獨立核准 |
| **什麼時候？** | recorded_at_local、clock_status=LOCAL_UNVERIFIED | 當地程序時鐘，沒有可信時間戳 |
| **審查哪版？** | event_id、control_version、observed_hash、proof_id、revision | 固定快照；底層版本變更後標 STALE |
| **各類日誌在哪裡？** | logs[].stream、record_ref、record_hash、summary_code | 僅保留外部日誌引用與內容指紋 |
| **證據完整嗎？** | 本地 hash chain、verifyProof、buildReviewPacket 的 checks | 僅本地一致性，不證明來源真實 |
| **可以核准／部署？** | decision=HOLD、baseline_approval=NOT_APPROVED、actual_ack=NOT_VERIFIED | **不得自動通過** |

**關鍵：** 名稱不同只能證明兩個「身分宣稱」不同，不能驗證兩個獨立真人／AI。審查者和執行者自述相同會拒絕；不同也不代表已核准。完成核准需要外部已授權的身份信任與撤權機制及審核流程。

## 2. 四類日誌共用事件

| 日誌標誌 | 記什麼 | 不記什麼 |
|---|---|---|
| AUTOMATION | 任務、Worker/Watchdog、觸發／故障／通知紀錄的引用 | 假裝任務已送達或遠端已執行 |
| REASONING_SUMMARY | 決策摘要、假設、反證、替代路線、依據文件引用 | **不蒐集 AI 隱藏思考鏈**或敏感內部推理 |
| WORLD_MODEL | 模型節點／關係／版本／反事實研究的證據引用 | 不把模型推演自動升格成事實 |
| MEMORY | 記憶版本／變更提案／拒絕／回退／授權驗收紀錄引用 | 不直接把記憶內容複製到第二資料庫 |

所有日誌一律要求唯一 log_id、record_ref、record_hash、stream、summary_code 和 recorded_by_claim。缺任何一類時，查核包顯示 NOT_RECORDED，不用虛構補滿。若是完全不適用，應由未來正式授權的審查政策標記，不能由單一 Worker 自行免除。

## 3. 工程、基建、數據、水電的標準領域

sector 可選 ENGINEERING（工程項目）、INFRASTRUCTURE（基建）、DATA（數據）、WATER（水）、ELECTRICITY（電力）。

**這是證據分類，不是操作水電設備的權限。** 水量、電力負載、能源系統、傳輸容量等資料未來可進控制循環的 domain_id 和 V1.6 的 A～N 合成引擎。任何單位、來源、測量時間、誤差、修訂版仍必須由上層資料契約各自驗證；不能把 kWh、kW、m³、MB 直接相加。

| 例子（合成） | sector | 日誌與判定 |
|---|---|---|
| 改動一份 API 模組 | ENGINEERING | 程式版本、CI、審查者聲稱、變更結果 |
| 研究資料中心基建 | INFRASTRUCTURE | 設備規格來源、監控任務、假設與待查項 |
| 更新來源資料集 | DATA | 資料集版本、來源指紋、品質／缺失審核 |
| 比較各地供水資料 | WATER | 水量單位、採樣時間、來源版本、未知保留 |
| 比較電網容量及需求 | ELECTRICITY | kW/kWh 分開、來源與假設、反證紀錄 |

## 4. 查核端可調用入口（實作）

在隔離的 control-cycle-candidate.mjs 建立一個候選事件後，由 proof-audit-candidate.mjs 建立 sidecar：

- openProof：釘住 event_id ＋ **當前** control_version，建立證明包；同一事件不同版本可另外建立新 proof_id。
- recordAction：登記 action_id、performed_by_claim、行為引用、內容 hash、結果聲稱。
- recordLog：登記四類日誌之一的引用；紀錄本身不攜帶原文，不洩漏私人資料。
- recordReview：需有執行紀錄、審查者不能等於建立者或執行者的聲稱身份；僅存 REVIEW_CLAIM。
- buildReviewPacket：每次產生一份含執行者、審查者、四類日誌覆蓋、證據與來源版次 Gate 的查核包；即使自測與引用齊備仍為 HOLD。
- verifyProof：本地 SHA hash 鏈一致性確認；不代表簽章、可信時鐘、身份驗證或不可竄改儲存。
- readProof／listProofs：依 proof_id 或 event_id 查詢；**不另建權威記憶體**。

各項操作都在同一進程的 Map 中；資料重新啟動會消失。只保留引用和 digest，不複製世界模型、推理或私人記憶原文。

## 5. 一份審查包應呈現的決策欄位

```json
{
  "proof_id": "proof-v1",
  "event_id": "event-001",
  "sector": "ELECTRICITY",
  "checks": {
    "WHO_PERFORMED": "CLAIM_ONLY",
    "WHO_REVIEWED": "CLAIM_ONLY",
    "INDEPENDENT_REVIEW": "UNVERIFIED_IDENTITY",
    "AUDIT_CHAIN": "LOCAL_CONSISTENT",
    "CONTROL_PIN": "PINNED_LOCAL",
    "REQUIRED_LOGS": "INCOMPLETE",
    "ACTUAL_ACK": "NOT_VERIFIED",
    "BASELINE": "NOT_APPROVED"
  },
  "safe_to_autopromote": false,
  "review_gate": "HOLD_PENDING_IDENTITY_AND_AUTHORITY"
}
```

這只是一段欄位示例，並非正式環境已完成的審查收據。

## 6. CI 提供可實際查看的合成審查附件

- 隔離工作流每輪會執行 scripts/export-proof-audit-synthetic.mjs，生成五個領域的 **合成** JSON 證明包，以及 manifest.json。
- 透過 GitHub Actions artifact firstbrain-proof-audit-synthetic-review 下載。每份內含 created_by_claim、performed_by_claims、reviewed_by_claims、四類 log_coverage、review_gate 和 local_integrity_confirmed。
- 範例身份一律以 synthetic_ 開頭，review_gate 固定 HOLD_PENDING_IDENTITY_AND_AUTHORITY；即使 CI 成功，不能冒稱真實人員已簽核。
- 這個自動產包目前**只適用本隔離候選的 CI 工作流**，尚未串接所有 PR、BOT③ 或正式自動化審查服務；全面接線要另外驗證和批准。

## 7. 人類與 BOT③ 審查門檻

1. 檢查同一 HEAD CI、GitHub Commit/PR、實際身份與憑證來源是否一致；候選模組只能提供 **CLAIM_ONLY**。
2. 檢查「誰做的、誰審查的、審查哪版」皆存在，且新日誌不能冒用舊審查結論。
3. 檢查四類日誌中缺的就是 NOT_RECORDED，推理只記摘要與反證，不能保存秘密或隱藏推理。
4. 檢查版本變更會標 STALE，越權／未知證據／自我審查應阻擋。
5. 確認尚無正式可信身份、PostgreSQL、記憶權威、跨 AI 實際 ACK 或通知發送；**不得將 200 項測試綠燈當正式部署批准**。
6. 需要將查核端接入 #128、#97、#116、#41 時，另做同一 HEAD 整合測試和真實授權審核，不可直接合併多個 Draft。

**本階段只交付最小可執行查核基底和明確的證明包契約**，保留使用者對真實部署／權限的最後決策權。
