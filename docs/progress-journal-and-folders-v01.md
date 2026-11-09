# 第一大腦｜進度／日期／延期與對應資料夾 V0.1

**隔離候選**｜依賴 PR #134 證明包與 PR #133 控制循環；正式主腦、私人記憶、資料庫、通知和水電系統均未接線。

## 你的新需求已轉換成可操作欄位

| 問題 | 欄位 | 說明 |
|---|---|---|
| 原本預計何時開始和完成？ | expected_start / expected_due | 建立計畫時固定，不因延期改寫 |
| 原本現在應該做到哪裡？ | expected_progress_percent | 0–100 整數，需有計畫引用 |
| 現在實際做到哪裡？ | actual_progress_percent / last_observed_on | 實際觀測日期和證據引用 |
| 有沒有延期？ | progress_status / delay_reason_code | DELAYED 必須有原因和時間事實 |
| 預估何時完成？ | forecast_due / days_shifted | 原定期限與新預測期限分開 |
| 已經超期幾天？ | days_overdue | 以**明示觀測日期**計算，不偷偷使用系統時鐘 |
| 誰更新進度？ | recorded_by_claim | 尚未驗證的更新者自述 |
| 需要下一步做什麼？ | next_action_code / evidence_ref | 必須連回現有證據 |
| 審查資料屬於誰？ | project_id / proof_id / event_id / journal_id | 不同項目不同 ID，各自追溯 |

進度差 = actual_progress_percent - expected_progress_percent；負值代表落後於該時間點的預期（但不直接表示原因或責任）。

## 實際狀態

PLANNED → IN_PROGRESS → COMPLETED；若逾期或另訂較晚的 forecast_due，必須明確轉為 DELAYED 並附上 delay_reason_code、observed_on、evidence_ref。若有阻斷可標 BLOCKED，但若涉及日期延期，也需在後續留下延期解釋。完成需實際 100% 與 completed_on，完成後不可直接修改舊狀態。

所有日誌為 append-only 的**本機候選登記**，hash chain + version CAS；不能因此宣稱不可竄改、可信時間或真實身份。跨程序資料會丟失，正式持久化仍須獨立驗證。

## 資料夾設計

每個項目在 logs/<SECTOR>/<project_id>/ 下有四類日誌分支。每條日誌依 ISO 日期與版本存檔，根目錄 index.json 記錄四個 stream 的最新對應路徑。不同水電研究、工程 PR、資料集不能因為都叫「工程日誌」就合併。所有分支都要保留同一個 proof_id 和 event_id，舊控制快照失效後標 STALE。

- ENGINEERING：工程修改進度、CI、修補預期與延期
- INFRASTRUCTURE：基建配置、容量與驗收
- DATA：來源更新、資料品質、匯入計畫
- WATER：水量／採樣進度、來源與單位
- ELECTRICITY：設備或電網研究進度；kW、kWh 與日期不可混算

系統只登記 metadata。水和電的物理量需由領域特定型別與單位規則處理；此進度日誌不控制任何實體基礎設施。

## 目前實作與驗收

- progress-journal-candidate.mjs：createJournal / recordProgress / readJournal / verifyJournal / folderFor / listProject。
- schemas/progress-journal.preview.schema.json：同一字段的機器契約。
- tests/progress-journal-candidate.test.mjs：計畫 vs 現況、逾期、日期格式、跨領域隔離、版本競爭、快照過期、容量及唯讀查詢。
- scripts/export-proof-audit-synthetic.mjs：由 CI 輸出 5 個項目的 20 個合成日誌，以及項目索引。**這些範例只代表格式，不代表真實工程、用水或電網進度。**

## 未完成前不得宣稱

1. 真正的身份、審查簽名與授權（依然需 #128）。
2. 全部 PR 真正自動寫入日誌或通知使用者（尚無正式 Worker／通知管道）。
3. 持久化或不可竄改的正式儲存、備份、撤權與恢復（尚未整合 #97）。
4. GPT①、GPT② 真正獨立 ACK（#41 持續阻斷）。
5. 對任何使用者既有真實工程期限的推估（合成日期僅示意）。

**審查重點**：你是否同意不同項目不同資料夾、四類日誌獨立、日期變更不覆蓋原期限，以及延期必須提供證據和可追溯原因。
