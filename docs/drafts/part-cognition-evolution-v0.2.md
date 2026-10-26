# 第一大腦｜零件認知與可升級判斷規格 V0.2（研究候選）
狀態：設計與探索草稿；**不代表 V0.2 已實作或測試通過**。不合併、不部署、不改正式記憶。

## 原則
不是只記六個欄位，而是每個零件必須能說明：目的、能力邊界、輸入/輸出契約、啟用條件、依賴關係、歷史解法、缺失後果、反例、證據、回寫與升級方式。
零件可以更新認知；**授權、執行能力及可信 ACK 不得由自我評估自動提升**。

## V0.2 零件認知契約（待實作）
- identity: part_id、version、owner、kind、status、source_ref、source_commit、schema_version。
- intent: problem_id、original_cause、goal、non_goals、success_criteria、alternatives、why_now、cost_of_inaction。
- capability: actions、inputs、outputs、side_effects、permissions、supported_scope、unsupported_scope、known_limits。
- prerequisites: condition_id、required_when、not_applicable_when、evidence_rule、verifier、expiry、missing_impact、severity、fallback。
- dependencies: part_id、version_constraint、interface_contract、dependency_type、cycle_policy、failure_propagation。
- history: immutable_event_id、root_problem_id、related_issue_pr_sha、prior_fixes、regressions、unresolved_blockers、evidence_links。
- reasoning: observations、hypotheses、counterfactuals、alternatives、confidence_basis、unknowns、contradictions、decision_rationale。
- memory_writeback: task_id、attempt_id、input_digest、policy_version、result、evidence、failure_cause、next_action、actor、timestamp、scope、event_type。
- evolution: proposal_id、change_reason、new_evidence、before_after_contract、compatibility、migration、rollback、positive_negative_regression_tests、human_approval。

## 評估次序
1. 先問「這件事不做的後果」與完成定義；缺目標時只允許探索。
2. 確認觀測事實、來源與時間；區分已證實、推論、未知，不把模型猜測寫成事實。
3. 查詢既有零件與歷史問題；區分相似問題、相同根因與相同字句。
4. 做依賴圖與版本/資料契約檢查；檢查循環、上游阻塞及傳播範圍。
5. 對每項條件推演缺失後果：阻斷、安全風險、品質退化、效率下降、可延後。
6. 比較補資料、重用、替代方案、隔離測試、修補或停止；記錄選擇理由與反證。
7. 執行前重新核驗來源、授權、範圍與版本；缺少可信證據時 fail-closed。
8. 以追加事件回寫結果，禁止覆蓋原始前因；新證據觸發重新評估而非盲目重複修補。

## 升級的安全邊界
- DESCRIBED → ISOLATED_TESTED → INTEGRATED_TESTED → OPERABLE → E2E_VERIFIED：每次狀態升級都必須有對應獨立證據，不能由描述或合成測試跳級。
- 記憶事件必須 append-only，版本遷移先備份、可回滾；不要直接改寫 `localStorage['aiBrain.v1']`。
- 重複相同修補但無新證據時提出 ROOT_CAUSE_REVIEW；不是自行修改權限或直接中止人工核准流程。
- 正向、反向、側向、全局視角應產生可追溯假設，不能取代實測或可信來源。
- 跨 AI 交接需真實接收端獨立 ACK；GitHub commit、模擬 CI 及 `verified:true` 不是授權或真實 ACK。

## 建議測試矩陣
- 正向：已註冊零件、條件完整、契約相容、歷史可讀、候選方案可提出。
- 負向：缺身分/授權/來源、來源過期、證據與範圍不符、缺少依賴、依賴循環、相同文字但不同問題。
- 反事實：缺少非必要 UI 只降級；缺少接收端則阻止真實交接；缺少新證據不重複修補。
- 回歸：舊版記憶載入不遺失、前因不被覆蓋、不同 BOT 的相同輸入得到相同結構化結論。
- 跨模組：任務認知 ↔ 零件索引 ↔ 歷史對帳 ↔ ACK ↔ 發布閘門，檢查契約與安全邊界。

## 現況
V0.1 已有獨立候選程式 `modules/task-cognition-engine.js`、`modules/brain-part-registry.js` 和對應測試**原始碼**；尚無可信執行結果。V0.2 本文件是下一階段探索與驗收基準，非已部署功能。
