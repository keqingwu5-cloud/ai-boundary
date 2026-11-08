# 第一大腦｜全局問題與修正台帳 V0.1（研究隔離，2026-11-09）

判定日期：2026-11-09（Asia/Taipei）。此檔只是**審查基線**，不是整個儲存庫逐行完整資安稽核或正式運作報告。任何 P0/P1 未具可信驗收證據，總狀態保持 `PRODUCTION_NO_GO`。既有 `main`、所有堆疊 Draft、真記憶、付費服務和正式部署不得由此表自動變更。

| ID | 優先度 | 根本問題與受影響功能 | 可核對原始來源 | 目前判定 | 下一個獨立驗證／修正 Gate |
|---|---|---|---|---|---|
| G-01 | P0 | GPT①↔GPT② 真實目的端讀取、回傳與可驗證 ACK 未形成已證閉環 | Issue #41；PR #114/#116 | `BLOCKED_EXTERNAL_RUNTIME` | 獨立身分、目的端來源讀取、簽署回執、原端回讀；拒絕把 localhost/mock 當真 AI |
| G-02 | P0 | capability/source 身分仍可由 caller 宣告，沒有完整可信金鑰及授權註冊/撤銷 | PR #123/#124/#125/#128 | `NO_TRUSTED_AUTHORITY` | 簽署 key registry 與版本、獨立 pin、撤銷/輪替、存續時間和惡意重放/TOCTOU |
| G-03 | P0 | Worker 超時後遠端副作用未知、STOP/撤權/在途工作不保證跨服務取消，沒有可信外部 supervisor | Issue #41；PR #116 | `DURABLE_RECONCILIATION_MISSING` | durable outbox/inbox、重複寫入/CAS、真 PG 故障注入、crash/restart 恢復和遲到完成對帳 |
| G-04 | P0 | 記憶 commit/UI、歷史還原、取消核准及舊備份重放的一致性未達正式 Gate | PR #102/#103/#104/#107、Issue #55 | `INTEGRATION_NOT_VERIFIED` | 在固定同 SHA 做故障與多分頁、權限及 Safari 真機測試，完成授權舊資料/備份回退 |
| G-05 | P0 | 3D 圖匯入、世界模型 journal 的持久/寫入者退場與回復 | PR #68/#71/#72/#74/#75/#118/#120 | `STACKED_DRAFT` | 正式 Node/Claim/Journal 分型契約、原子寫入、舊 writer 停用、惡意/損壞輸入負例 |
| G-06 | P1 | N-ary 內容重用會掩蓋「世界如棋局」不同生成路徑，不能讓模擬冒充已發生事件 | PR #123/#125；本 Draft world-chess-lineage | `LOCAL_FIX_CANDIDATE` | 獨立 `result_content_id` vs `derivation_event_id`，同 S0/不同 S0 反證，同版 CI 和 reviewer |
| G-07 | P1 | Source/Time/Reference frame 補證與外部真實性，避免未來資訊倒灌或單來源重複計權 | PR #122/#126/#128、Issue #77 | `SOURCE_AND_TIME_GATES_PENDING` | 原始 bytes、source_available_at 真來源、raw digest 原文/語意差異、可撤回來源 |
| G-08 | P1 | 多堆疊 PR 相互重疊，混合不同 SHA 的合成、真 PG、瀏覽器測試會造成假 READY | Issue #65、PR #48/#97/#101/#122–#129 | `STACK_CONFLICT_REVIEW_PENDING` | 固定 base/head 拓撲與 blob 清單、同一最終 head 全套 CI、獨立 reviewer |
| G-09 | P1 | 預覽 UI 對空白轉零、狀態更新後舊證據仍可匯出等已知修復候選尚未正式驗收 | PR #127/#129 | `ISOLATED_FIX_CANDIDATE` | 同版 Chromium，實機 Safari/iPad，變更後證據失效與匯出拒絕 |
| G-10 | P1 | 靜態 Schema 語法或數量測試無法代替完整契約/反證驗證 | PR #124/#125/#122 | `SCHEMA_RUNTIME_GAP` | JSON Schema Draft 2020-12 對實際所有輸出 positive/negative 進行語意驗證，跨模組版本回歸 |
| G-11 | P2 | 本地 bytes 基準未測真 WAN、模型 tokens、營運成本及重算/cache 資源消耗 | PR #117/#119/#124/#125 | `PERFORMANCE_UNVERIFIED` | 同輸入冷/熱啟動與重複負載，P50/P95，查帳單和品質/耗時 A/B |
| G-12 | P2 | 獨立可開源核心與第一大腦私人實作的授權、來源與隱私邊界未證 | PR #123/#124/#125；Issue #65 | `PUBLICATION_NOT_AUTHORIZED` | code + git-history 敏感掃描、第三方著作權/licence、維護界線、使用者集中批准 |

## 修正流水線與每一筆證據最低契約

每個問題都必須綁定 `problem_id`、受影響元件、原始 evidence URL、固定 `head_sha`、修正 commit、可重現負面測試、同 SHA GitHub job/log、剩餘衝突、正式 vs 合成測試分級、獨立 reviewer identity/decision。兩份模組的「各自 PASS」不能代替最終整合 SHA 的 PASS。

**順序**：先隔離資料/權限/STOP，建立真實跨端送收證據；並行修補記憶與 3D 元資料完整性、棋局事件溯源；收斂 PR 依賴後才做真 PG、舊資料、真機、壓測與備援演練；最後才考慮開源、合併、部署，由使用者一次集中審查。

**完成定義**：不以時間、程式碼行數、完成測試數或自己的評論當作完成比例。必要 P0/P1 均有正反證、獨立同版驗收且無未決重大安全缺口前，集中送審 `NOT_READY`。任何無法查到的證據記 `NOT_RUN/UNKNOWN` 而非 PASS。