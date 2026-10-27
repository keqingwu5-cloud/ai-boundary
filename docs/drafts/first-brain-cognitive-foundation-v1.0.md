# 第一大腦｜認知基礎架構整合 V1.0（候選）
狀態：架構與資料契約草案；未合併、未部署、未連正式記憶、未執行真實跨 AI 交接。
上位：first-brain-architecture-operations-v1.0.md
承接：memory-directed-cognition-v0.1.md、part-cognition-evolution-v0.2.md、task-cognition-engine、brain-part-registry、cognition-exploration。不是平行的新主腦。

## 核心原則
最小實作服從完整架構。每份記憶保存方向；每條行徑保存目的；每個事件保存前提、決策理由、實際行為、證據、後果與下一步。歷史只作判斷材料，不能直接作授權或執行指令。
區分時間先後、相關性、因果假設及經驗證的因果關係。記錄反證與未知。

## 全局分層與既有模組
L0 治理與授權：政策、發布閘門、回滾；不可自授權。
L1 記憶與事件：方向、治理、能力、情境、因果、追加式事件、歷史來源；相容 aiBrain.v1。
L2 認知行徑：察覺、認知、規劃、確認檢查、執行、驗證測試、修正、合併、觀察紀錄；沿用 task-cognition-engine 與 cognition-exploration 候選。
L3 因果與資源：事件/依賴圖、因果狀態、時間觸發、能力/版本/成本/風險/可逆性；沿用 brain-part-registry。
L4 協作交接：task_id/event_id/attempt_id、可信目的端、可回讀 ACK；Issue #41 仍 BLOCKED。
L5 執行驗證：隔離測試、固定 SHA、CI、正式操作分離。
L6 觀測學習：結果回饋、異常根因、歷史修訂提案。
L7 世界模型：角色、力量、供應、政策、資訊等因果網絡；不得先於基礎驗收宣稱可用。

## 行徑是狀態圖，不是固定直線
標準詞彙：DETECTED, UNDERSTOOD, PLANNED, CHECKED, EXECUTED, TESTED, REVISED, INTEGRATED, OBSERVED。
允許回到察覺、認知或規劃；允許暫停、阻塞、分支、並行及終止。每次狀態轉移都產生不可變事件及理由。INTEGRATED 分成認知關聯整合與成果/程式合併；後者必須符合授權與驗收。

## 共同事件資料契約草案 v0.1
{
  "schema_version":"0.1",
  "event_id":"immutable unique ID",
  "task_id":"parent task",
  "attempt_id":"attempt identity",
  "trajectory_id":"cognitive trajectory",
  "stage":"DETECTED|UNDERSTOOD|PLANNED|CHECKED|EXECUTED|TESTED|REVISED|INTEGRATED|OBSERVED",
  "occurred_at":"ISO8601 timestamp",
  "actor":{"id":"source identity","kind":"human|agent|tool|system","trust_status":"unverified|verified"},
  "direction":{"id":"approved direction ID","version":"version"},
  "premises":[{"claim":"statement","kind":"fact|hypothesis|unknown","source_ref":"reference","observed_at":"time","expires_at":"time or null"}],
  "why":{"goal":"intended goal","reason":"decision rationale","alternatives":["other path"],"rejection_reasons":["why not"]},
  "causal_links":[{"event_id":"related event","relation":"precedes|depends_on|hypothesized_cause|validated_cause|contradicts","evidence_refs":["reference"]}],
  "resources":[{"id":"part/bot/tool/data","capability":"required skill","contract_version":"version","selection_reason":"why this resource"}],
  "action":{"kind":"review|draft|isolated_test|handoff|publish|deploy|other","status":"proposed|attempted|completed|blocked"},
  "outcome":{"expected":"expected outcome","observed":"actual observation","verification_status":"not_verified|isolated_pass|source_read|trusted_receipt|e2e_verified"},
  "evidence_refs":["immutable commit/CI/log/receipt references"],
  "authorization_ref":null,
  "next":{"decision":"next step or pause","missing":["prerequisites"],"owner":"responsible party"}
}
欄位是提案，不是既有 DB schema；最小欄位必填/選填及隱私處理在隔離測試時再細化。可信身分與授權不得依呼叫端自行宣稱 verified 即放行。

## 決策循環
1 讀取已核准方向、治理邊界與相關歷史版本。
2 察覺任務/異常/外部變化，確立事件 ID 與來源。
3 定位因果鏈：上游、當前、下游、時間延遲；區分事實/假設/未知。
4 判斷資訊缺口、來源可信度、時效、依賴、契約與可驗證成功條件。
5 比較不做、重用、補證據、隔離測試、替代路徑；依目的、風險、成本、授權選資源。
6 檢查條件後只執行允許的最小步驟，固定版本及操作紀錄。
7 分開驗證動作完成、輸出有效、真實目的端接收、可信 ACK、目的達成。
8 保存不可變事件、產生認知修訂提案與下一輪觀察條件。

## 重要不變式
- 每個事件有唯一 event_id；重試另有 attempt_id；相同 task_id 不等於同次交接。
- 每個決策有 why 與來源；缺來源標示未知，不能假造。
- 歷史記憶不可無痕覆寫；修正用新事件與 contradicts/supersedes 關聯。
- 無可信目的端獨立 ACK，不宣稱 GPT② 收件；模擬 CI/GitHub 發布/Notion 鏡像各自獨立報告。
- 正式 merge/deploy/權限/私有記憶/DB/付費資源等受保護操作不得自動進行。
- 不因循環有九個階段就強制走完九步；依情境與證據跳轉。
- 無實質變化的監控不重複通知。

## 最小整合順序與驗收
P0 先重跑既有 task-cognition 9、part-registry 10、cognition-exploration 9 個測試，固定 SHA 與原始輸出；未執行不稱通過。
P1 新增純函式 event-contract validator + trajectory transition evaluator：正向、缺欄位、過期證據、因果循環、舊資料、重試識別碼、禁止越權。
P2 純函式 resource selector：同一目的不同因果位置選不同資源；資源缺權限/版本不合則阻塞。
P3 隔離記憶 adapter：唯讀解析 aiBrain.v1，追加事件到測試儲存，不動正式資料。
P4 跨模組契約/ACK 信任邊界與獨立 E2E 驗收；未驗收維持 BLOCKED。
P5 經獨立核准後才規劃合併部署及世界模型整合。

## 成果報告
每次報告：方向/事件/階段/為何選此路徑/實際變更 SHA/執行測試及原始證據/未完成與原因/下游影響/下一步/授權需求。


## 動態認知網絡與自主問題求解（V0.2 草案補充；僅候選文件）
### 優先目的與調度
認知首要目的是縮小「模型對現實的理解」與可核對現實之間的差距，進而判斷應做、暫緩、不應做；產生文字答案不是成功的充分條件。認知調度器依當前差距動態調用形成機制、因果力量、角色定位、改變條件，不強制固定順序。每輪保留目標、現實觀測、事實/假設/未知、證據來源與時效、當前定位及不確定性；不以任意百分比取代證據充分性。

### 自主求解觸發條件
當無答案、無可行方法、方法失敗、證據衝突、預測與現實不符、資源/權限不足或結果未經驗證時，觸發問題求解分支；BLOCKED 是診斷狀態，不是自動宣告完成，也不是無限制重試的理由。

### 求解循環（可回跳、可分支）
1. **定位差距**：比較目標/預期與可核對現實，辨識事實、機制、定位、決策、回饋五類缺口；記錄首次失效位置。
2. **重新定義問題**：分辨症狀、根因假設、限制、隱藏前提與可驗證成功條件；不把相關性當因果。
3. **探索方法**：優先重用既有能力與證據，再按需要查詢官方/原始來源、搜尋既有程式與文件、跨領域類比、正向/逆向/側向推演、提出替代路徑。資料過期時先補資料，不盲目增加 BOT。
4. **比較行動**：明確列出「做／暫緩／不做」以及補證據、隔離測試、替代方案的成本、可逆性、風險、時效、授權與機會成本。
5. **認知充分性閘門**：判斷證據是否足以支持*特定*行動，而非要求掌握全部資訊；不足則選擇最有資訊價值的安全查核或暫緩。
6. **最小驗證**：在現有授權範圍內進行唯讀查詢、候選設計或隔離測試；將模擬成功、資料讀取、真實接收、可信 ACK、目標達成分別驗證。
7. **回收與修正**：記錄實際結果、失敗原因、未採用方案與反證，依資訊／因果／結構／認知策略四級提出修正；保留原始歷史，避免重複嘗試已否證方法。
8. **停止或升級**：當證據無增益、成本/時間超出界限、同類重試耗盡、無安全可行路徑、或碰到授權邊界，停止自主執行並回報根因、證據、候選選項與需人類決策事項。

### 行動與治理邊界
自主查詢與分析不等於自主授權。正式合併、部署、修改正式資料/記憶、權限、secrets、付費資源、啟用自動執行或可能影響整體系統的操作，必須**事前告知使用者並取得明確授權**。未取得授權只能停在候選研究、唯讀排查及已核准的隔離測試。候選文件的提交不代表生產流程已啟用。

### 事件契約擴充提案（尚未實作）
保留既有 event_id/task_id/attempt_id/trajectory_id 與 why/outcome/evidence_refs/authorization_ref，候選新增：
- `reality_gap`: {expected, observed, gap_type, evidence_refs, confidence_limits}
- `problem_diagnosis`: {symptom, root_cause_hypotheses, first_breakpoint, missing_evidence}
- `exploration`: {queries, reused_resources, alternatives, rejected_methods, stopping_reason}
- `decision_boundary`: {decision: do|defer|do_not_do, sufficiency_basis, risks, reversibility, authorization_required}
- `learning_revision`: {level: information|causal|structural|strategy, proposal, validation_status}
以上皆為候選資料契約，非既有資料庫欄位，不得直接寫入正式儲存。

### 最小驗收案例
- 方法找不到：先定位缺口，能提出安全查詢/替代路徑，不憑空宣稱解決。
- 資料過期/矛盾：優先查證來源，保留反證，不重複無效推演。
- 模擬 ACK 成功但無真實 GPT② 接收：維持 BLOCKED，不能將 CI PASS 升格為 E2E。
- 方案需部署/修改權限：產生授權請求與影響評估，未授權不執行。
- 重複失敗：有限次重試後輸出已試方法、首次斷點、停止原因與下一步。
- 舊資料相容：既有事件及 aiBrain.v1 不受候選契約新增欄位影響。
