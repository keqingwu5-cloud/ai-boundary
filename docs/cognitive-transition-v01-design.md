# 第一大腦｜三軸認知與可信狀態轉移 V0.1 設計說明

**狀態：RESEARCH / ISOLATED / IN_MEMORY / NOT_APPROVED / NOT_DEPLOYED**

依據：PR #136 研究契約 HEAD `35005b446cea599309fc371480d1b3bc8fff0d1f`

## 實作範圍

- 薄型 sidecar：`cognitive-transition-candidate.mjs`
- 只引用既有 `control-cycle-candidate`、`proof-audit-candidate`、`progress-journal-candidate`
- 不重新建構平台、不寫入私人記憶、不接網路、不啟動 Worker
- 合成資料測試；禁止出現真實 APPROVED

## 三軸共用接口

每個轉移可附：
- **Drive**（需求 / 限制 / 選擇）：人類目的為假說或當事人陳述，物理驅動不擬人化
- **World-as-Chess**：候選行動 + 預測 S1 + 反事實引用
- **Memory**：EVENT / COGNITIVE / PROCEDURAL / COUNTERFACTUAL 只存引用 + 摘要 hash

## 狀態轉移

S0 (OBSERVED) → drivers → actions/scenarios (PREDICTED) → observed O1 (OBSERVED) → calibration candidate (INFERRED)

四時間軸：EVENT / OBSERVATION / APPROVAL / REVISION；未知標 UNKNOWN

## 失敗關閉

來源不足、證據缺失、版本衝突、記憶過期、同名重複、預測/事實混用、跨領域滲漏、超容量 → HOLD / blocked

## 與既有模組的契約一致性

- 共用 event_id / proof_id / project_id
- 四類日誌通過 proof-audit 引用
- 進度日誌不覆蓋原定日期
- 沒有真 ACK、沒有根信任、沒有持久化

## 合成例子：V10 → V11

見 tests/cognitive-transition-synthetic.mjs

**交接給 BOT③ 獨立審核**。
