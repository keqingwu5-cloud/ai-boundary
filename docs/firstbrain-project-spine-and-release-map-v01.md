# 第一大腦｜專案支點、接線、版本相依、合併部署與故障定位 V0.1

**本文件的角色：** 讓人和多個 AI 能從同一張「現況 × 目標 × 缺口」地圖理解專案。它是**設計與現況導覽**，不創造第二套記憶／審批／事件權威，也不代表任何外部 AI 已收到、已執行或已核准。

- 第 1–11 節為 2026-11-10 歷史基線；最新底層連結優先順序與結構見第 14 節；第 13 節保留先前接手與實跑結果，不把歷史狀態當成今日驗收。
- 讀取日期：2026-11-10（Asia/Taipei）。寫入前基線：`main@d2ec331ea4fa68d5a2713f12f5d4706b8effb21a`。
- 需求／狀態總索引：[Issue #150](https://github.com/keqingwu5-cloud/ai-boundary/issues/150)；跨 AI 審查與反證：[Issue #153](https://github.com/keqingwu5-cloud/ai-boundary/issues/153)；R3 根因與修復：[Issue #156](https://github.com/keqingwu5-cloud/ai-boundary/issues/156)；真正跨 AI ACK：[Issue #41](https://github.com/keqingwu5-cloud/ai-boundary/issues/41)。
- 本文件來源是固定 SHA 的主幹檔案、README、`testenv/` 部署包與當前研究 Draft；**不把網頁上線 URL 的存在當作目前部署版本／真機安全已驗證**。
- 許可邊界：`RESEARCH_ONLY / NO_MAIN_MERGE / NO_DEPLOY / NO_REAL_SECRETS / NO_PAID_API / NO_PRIVATE_DATA_COPY / RELEASE_GATE=HOLD`。

## 一、先辨認四種不同的「連線」

| 類型 | 定義 | 如何證明 | 本輪實際狀態 |
|---|---|---|---|
| `A CODE_CONNECTED` | 同頁腳本呼叫／共同讀寫相同資料鍵 | 原始程式檔、明確入口/回傳/副作用、同一 SHA | 主腦↔Feed 同一圖譜鍵；Audio Lab 匯入透過 `window.AIBrain` 修改主腦；其他頁各有自己的儲存鍵 |
| `B TEST_CONNECTED` | 在特定 SHA 的合成環境／MOCK worker 相通 | 指定 run/job、測試代碼、原始失敗/成功 log | 研究 Draft 有合成 CI；`testenv/loop` 有 MOCK API/Worker，**不等於真外部 AI** |
| `C REVIEW_CONNECTED` | 文件／GitHub Issue 讓人可以讀取同一份審查內容 | 文件可回讀、事件 ID/版本、誰貼上 | #150/#153/#156 與 Google Docs 是審查入口；由人轉入的 Grok/Gemini 意見仍 `MANUAL_BRIDGE` |
| `D RUNTIME_ACK_CONNECTED` | 真目的端自行發現、讀取、處理、回簽，可在來源端查證 | 身份綁定、correlation ID、收件端證據、重試/超時日誌 | **Issue #41 BLOCKED**；沒有足夠證據聲稱 GPT②/Grok/Gemini/BOT③ 已自動相連 |

這四種等級不可互相升格。`Source file exists` → `running`、`post` → `ACK`、`CI green` → `deployable` 都是錯誤跨級。

## 二、六個專案支點：不要重造六個服務

| 支點 | 最小單一責任 | 已在 main 的代表物 | 研究／未接通部分 | 必須保留的邊界 |
|---|---|---|---|---|
| S1 **使用者交互／視圖** | 呈現節點、內容、記憶、狀態與錯誤 | `index.html/app.js`、`feed.html/feed.js`、`memory.html`、`world-model.html`、`launcher.html`、`mainbrain.html` | 持久化成功提示、手機 Safari 驗收為候選或待驗 | UI 回傳「已點擊/已更新畫面」≠ 資料已寫入 |
| S2 **資料與權威** | 每個資料域決定唯一 writer、讀者、版本、備份與回退 | 各個 localStorage 資料鍵、加密記憶 vault | IDB bridge、event v2、transactional store 是 Draft，不是 main 已切換 | 私人密文≠公開圖譜；舊分頁 writer 未退役前不得切 authority |
| S3 **認知／世界模型** | 保存來源與假設，區分觀測／推論／預測／反事實／核准 | `world-model.html` 研究台、`knowledge-score.js` | `control-cycle`、`proof-audit`、`progress-journal`、`cognitive-transition` 候選；#139/#149 | 同源推演不會自然變成獨立 O1 觀測；v1 驗證列表仍可覆寫 |
| S4 **AI 任務／交接** | 明確送件、接收、拒絕、審核，留下真 provenance | `launcher.html` 人工草稿；`testenv/loop` MOCK | #41 真 ACK、#48 Worker/PG、#151 Grok 任務、#152 入站格式；均非 main 的真跨 AI Runtime | GitHub 留言≠接收者簽章；MOCK≠REAL；不得自動喚醒其他聊天視窗 |
| S5 **工程與獨立反證** | 定位根因、記版本、測競態、查可恢復性 | `tests/`、`testenv/evidence/`，GitHub Actions | R3 #154～#158、BOT③ 與 GPT②/Gemini 待驗 | 作者自己跑完不等於 reviewer 獨立復現；綠燈可能是「漏洞成功重現」 |
| S6 **整合／發布** | 依賴順序、完整性 Gate、最小發布與必要回退 | main 靜態頁、`version.json`、原影像發布腳本，README 記載 Pages 網址 | 合併 Draft 堆疊、實機驗收、可能的真 API/PG Worker、Secrets/成本均另 Gate | 代碼回退不會自動回退瀏覽器 localStorage；未批准不可部署 |

## 三、目前真實連線圖（實線＝main 源碼；虛線＝研究／待驗）

~~~mermaid
flowchart TD
    U["使用者 / 瀏覽器"] --> I["index.html / app.js 3D 圖譜"]
    U --> FE["feed.html / feed.js"]
    U --> M["memory.html / memory.js"]
    U --> W["world-model.html"]
    U --> LA["launcher.html 人工交接"]
    U --> AU["audio-lab.html / audio-lab.js"]

    D["data.js 種子"] --> I
    D --> FE
    I --> G[("aiBrain.v1 + undo")]
    FE -->|"唯讀圖譜"| G
    FE --> PF[("aiBrain.feed.v1")]
    M --> VM[("aiBoundary.privateMemory.v1")]
    W --> WH[("worldModel.verify.v1")]
    AU --> PN[("aiBrain.audioLab.pending.v1")]
    PN -->|"同頁 audio-lab-import.js"| API["window.AIBrain"]
    API --> I
    I --> KS[("aiBrain.knowledge.v1 / knowledge-score.js 的獨立資料域")]
    LA --> LD[("launcher drafts")]
    ISSUE["#150 需求 / #153 審查 / #156 修復"] -.-> REVIEW["GPT① / GPT② / BOT③ / Grok / Gemini：人工或文件回件"]
    REVIEW -.->|"真 receiver 未確認"| ACK["#41 跨 AI 真 ACK：BLOCKED"]
    SIDE["#139/#149/#152 研究 sidecar"] -.->|"非 main 正式 writer"| I
    TEST["testenv/loop 本機 MOCK HTTP/Worker"] -.->|"未接正式 Pages / 非真 AI"| ACK
    R3["#154→#155→#157→#158 R3 修補研究"] -.->|"待驗收，未升級 main"| I
~~~

**重要**：圖中「使用者→各頁」代表手動開啟不同網頁，不代表它們有統一後端。`knowledge-score.js` 有自身儲存；它會讀圖譜但不應被當成主腦權威 writer。虛線只表示計畫／研究證據，不是已部署通路。

## 四、真正的資料接線與寫入者：先避免腦裂

| 資料域 | 主要鍵、檔案與 write | 消費者 / 誰可以讀 | 仍缺甚麼 |
|---|---|---|---|
| 圖譜 | `aiBrain.v1`，main `app.js save()`；`aiBrain.v1.undo` 另鍵 | `feed.js`、`knowledge-score.js` 讀；`audio-lab-import.js` 經 `window.AIBrain` 間接寫 | 舊 writer 退場／多分頁 CAS、undo 跨鍵原子性、真 Safari、負例時使用者怎麼保全資料 |
| 加密記憶 | `aiBoundary.privateMemory.v1`，`memory.js` 加密 vault | 僅本機已授權的記憶管理流程 | 完整密文備份/恢復、密碼學 E2E、並發、撤權；不可私自公開到 Issue 或交給 agent |
| 世界模型 | `worldModel.verify.v1`，`world-model.html saveVerifyRows()` 整表寫 | 世界模型工作台 | 目前沒有主幹不可變歷史，#74 事件 v2 尚須舊 writer 退場/回滾；**已知限制** |
| Feed 偏好 | `aiBrain.feed.v1`，`feed.js savePrefs()` | Feed 介面 | 多分頁舊偏好互覆仍待修；不能反向改圖譜 |
| 掌握度 | `aiBrain.knowledge.v1`，`knowledge-score.js` | 3D/Feed 評分顯示 | 獨立於圖譜，來源與版本對齊需明確 |
| 音訊研究與 pending | `aiBrain.audioLab.jpTransitions.v1`、`aiBrain.audioLab.pending.v1`、`aiBrain.audioLab.backup.*` | 音訊工作台 → 主腦 API | 防重複匯入、部分成功恢復、持久化 ACK、跨分頁覆寫 |
| Launcher 草稿 | `aiBoundary.launcher.drafts.v1`、`.backup` | 人工交接 | UI 草稿≠真收件及外部 AI 執行紀錄 |
| 任務／審查／證據 | GitHub #150/#153/#156、研究 Draft 的純函式與文件 | 人工或授權 connector 讀 | 尚無可認證的統一事件權威，不得把 Issue 成功張貼改寫成 `ack_received` |

**現有風險：** 本機不同 `localStorage` 鍵不是一筆原子交易；Web Locks 僅協作式，舊版分頁可繞開；GitHub Pages 發布新 JavaScript 也不會讓所有舊分頁立即換版。

## 五、任務、證據、回件該如何串聯（「共同資訊最小包」候選）

先定資料契約，不急著創建新服務：

~~~json
{
  "project_id": "AI-BOUNDARY",
  "task_id": "R3-EXAMPLE-001",
  "event_id": "unique-event-id",
  "correlation_id": "links-request-review-fix",
  "parent_event_id": null,
  "entrypoint": "github_issue_or_ui",
  "owner_role": "BOT3",
  "source": {
    "kind": "SOURCE_CODE",
    "url": "https://github.com/keqingwu5-cloud/ai-boundary/pull/157",
    "head_sha": "94321e211bd7313d0b293eaaf5233ac111279eb2"
  },
  "scope": {
    "read_domains": ["graph"],
    "write_domains": [],
    "data_class": "SYNTHETIC_ONLY"
  },
  "status": "HANDOFF_POSTED",
  "actual_ack": "NOT_VERIFIED",
  "claim": "The proposed patch addresses a defined source-derived risk",
  "evidence_urls": [],
  "test_result": "NOT_RUN",
  "review_origin": "UNKNOWN",
  "review_status": "UNREVIEWED",
  "rollback_ref": "immutable-prior-sha-or-NOT_AVAILABLE",
  "approval": "NOT_APPROVED"
}
~~~

**這是文件格式候選，並非已部署的 JSON Schema。** 最低要留：任務 ID、事件 ID、父事件 ID、角色、來源網址＋固定完整 SHA、資料寫入權限、證據級別、原始結果、失敗原因、回退參照；不要把五份文件都變成各自的真相來源。

**狀態語義切開：**
- 交接：`HANDOFF_POSTED → RECEIVED_CLAIM → RECEIVER_VERIFIED → INDEPENDENT_REVIEWED`。沒有可驗的真目的端證據，停在 claim。
- 工程：`CODE_PRESENT → SYNTHETIC_TESTED → INDEPENDENT_REPRODUCED → BROWSER_E2E_VERIFIED → RELEASE_CANDIDATE`。各轉移須用相同固定 SHA 的證據。
- 發布：`DRAFT → REVIEWED_FOR_MERGE → USER_APPROVED → DEPLOYED → OBSERVED_HEALTHY`，任何欄位均不得由「測試 pass」自動填滿。

## 六、目前 Draft 的依存樹（非常重要）

~~~text
研究線 A：認知／證據
 #138 → #139 (HEAD 39338c4) → #149 (HEAD 36b5f5e) → #152 (HEAD 7f16115)
                     │                    │
                     └ 不能只測末端 #152 就宣告父層 #139/#149 全部安全

研究線 B：主腦資料修補（起點 main@d2ec331）
 main 研究基線 → #154 (HEAD dcfebda，漏洞重現)
                   ↳ #155 (HEAD e0a094d，合作式寫入鎖)
                       ↳ #157 (HEAD 94321e2，啟動保全/匯入回執)
                           ↳ #158 (HEAD bb69e44，操作提示/音訊重試)

其他隔離候選
 #74  世界模型事件版次/回退（尚未切 main）
 #48  Worker / PostgreSQL 候選（不等於 REAL worker 上線）
 #41  真實跨 AI 接收／ACK（BLOCKED）
 #151 Grok G01–G10 與另一本隔離 V0.2 分支（不能自證真三方比較）
~~~

**需立即留意的依存錯位：** 本輪 GitHub metadata 查到 `#154 HEAD=dcfebdad...`，但 `#155 的 PR base SHA=ee78280...`（#154 較早版本）；它們不是「同一筆最新父版測試」的證據。後續要合併先重驗父 HEAD 是否更新、比較共同基底、rebase/cherry-pick 的差異與全套 CI；**不能照 PR 號碼順序按 Merge 就當整合成功**。#157 的描述亦可能落後於實際新增的 vault restore 修正，應以 diff、固定 SHA 為準。

## 七、合併與部署應如何走：兩條發布線，不混在一起

### A. 主腦靜態前端／GitHub Pages 候選

1. **鎖定來源**：`main HEAD`、修補 Draft 各自 HEAD、所有前置 PR / base、真正部署來源設定（Pages Source / Actions / cache）。
2. **保全資料**：用合成、可重現的舊格式資料驗證讀取／匯出／還原；另由使用者於自己的裝置安全匯出原始備份，不把私人記憶傳 GitHub。**代碼回退≠localStorage 資料回退**。
3. **精確整合**：從已審核的共同基底新開 integration Draft，逐次只帶一組相依變更；不要直接堆疊誤差已擴散的 branch，也不要部署整棵研究樹。
4. **CI**：以「最終整合 HEAD」驗證受影響功能與全部必要 workflow；R3 `KNOWN_RISK_REPRODUCED` 的綠燈是**舊版缺陷存在**，新版要跑 `PATCH_REJECTS_OVERWRITE` 與真使用者路徑，而不是同一測試一體兩用。
5. **獨立審查**：BOT③ 檢工程與安全、GPT②/Gemini 有具體認知/框架風險時才進行針對性反證；所有角色身份與 ACK 等級分開。
6. **瀏覽器驗收**：至少真 Apple Safari/iPad（含兩分頁、鎖不支援、舊 JS 分頁、匯入、復原、密文解鎖、網路中斷、cache 刷新）；不碰私密資料，用合成測試帳／備份。
7. **發布決策 Gate**：提供使用者「相對於 main 的檔案 diff、功能變更、失敗證據、成本、資料風險、備份/回退、誰驗收、要批准甚麼」。沒有此 Gate 就 HOLD。
8. **經授權才部署／觀測**：預先保存可回退的 deployed commit / version；發布後檢查實際頁面版本、錯誤、使用者資料相容。失敗先 STOP、保留資料、按批准的回退預案作業。

### B. 真 AI 任務 API / PostgreSQL / Worker（**未授權部署**）

目前 `testenv/loop/server.cjs` 是本機 MOCK API/輪詢 worker，使用 file-store 與受限制的 executor；`testenv/docs/openai-wiring-plan.md` 明確標 `NOT_CONNECTED`。真 AI 端到端需要**另行批准**：
- 可存取的正式目的端 runtime、獨立身份與最小權限、可稽核 ACK、冪等／停止／撤權與重啟保護、持久化資料庫與恢復、可觀測性、秘密管理、成本上限、API 計費授權。
- [Issue #41](https://github.com/keqingwu5-cloud/ai-boundary/issues/41) 的「真的讀取／回 ACK」仍不能用 GitHub Issues 或 MOCK runner 替代。
- `testenv/loop/server.cjs` 的 `ensureBootstrapGrant()` 在本輪靜態讀取中可見：遇既有 grant 已 stopped/revoked 時會尋求建立同一固定 grant ID；這是**需要重啟＋STOP 負例證據核對的候選風險**，不是已部署的現況，也不是可直接拿來上線的授權方案。

**禁止把 B 類 Worker／付費 API／Supabase 隨 A 類靜態頁的修補一起啟用。**

## 八、當前缺少哪些資料，才能形成可靠的統一地圖？

| 資訊類別 | 下一次要取得的具體欄位 | 優先度 |
|---|---|---|
| 版本／發佈 | 最新 main SHA、各 Draft HEAD/base、已實際服務的 Pages SHA/時間、cache/version.json 與部署來源設定 | P0 |
| 資料寫入者 | 每個 key 的 writer/reader/間接 API、版本、舊分頁退場機制、是否有備份與可回讀 | P0 |
| 程式接口 | 頁面觸發入口、參數/回傳、async ACK、哪些操作有副作用、失敗會留下甚麼 | P0 |
| 測試與根因 | 失敗操作序列、受影響 source lines、原始 run/job SHA、預期 vs 實際、是否可用合成資料重現 | P0 |
| 合併相依 | parent SHA、patch diff、file overlap、schema migration、完整整合 HEAD 的 CI | P0 |
| 恢復 | 原始/新版本備份格式、刪改/解鎖/STOP 回退操作、是否已在 Safari 真正演練 | P0 |
| AI 接收 | 真 endpoint ID、origin、destination、correlation ID、最小權限、收件端 ACK 證據、重試/超時/停權紀錄 | P1；#41 BLOCKED |
| 成本與責任 | 執行環境、費用上限、權限批准者、審查角色、退出與回退責任 | P1，正式部署必填 |

此表不是要求使用者一次提供全部資訊；只在下一個實際 Gate 需要時向相應 owner 索取。**任何金鑰值、私人記憶明文、個人資料不可放進共用報告**。

## 九、找問題不用重讀整套對話：故障定位索引

| 使用者可見症狀 | 第一個查的支點／來源 | 必須證實的事 | 最常見錯誤推論 |
|---|---|---|---|
| 新節點消失／被覆寫 | S2 `app.js save()`、`aiBrain.v1`；R3 #154～#158 | 同版本圖譜? 雙分頁? 第二個 writer? 寫入成功回讀? | 按下新增就等於永久儲存 |
| 頁面出現種子但舊內容不見 | S2 `load() / seedState()`，啟動錯誤 | 原始資料是不存在、損壞還是無法讀取? 原始字串是否保留? | 顯示預設節點代表舊資料不存在 |
| 音訊匯入重複／pending 不見 | S1/S2 `audio-lab-import.js`＋主腦 API | 原快照 ID、根子節點、ACK、跨分頁 pending 是否更版、是否部分匯入 | `getState()` 看見節點等於磁碟已存 |
| 加密記憶還原後無法開啟 | S2 `memory.js` 階段、vault 密文 | 失敗在寫前或寫後? 是否曾 migration? 可否重新解鎖與回復? | catch 顯示失敗就代表完全沒更動 |
| 世界模型原預測找不到 | S3 `world-model.html`、`worldModel.verify.v1` | 是否整表覆寫? 有無其他外部備份? #74 v2 是否真正接線? | 列表中曾有就等於留有不可變歷史 |
| GPT②/Grok/Gemini「沒收到」 | S4 #41/#151/#153 | GitHub 已 POSTED? 真目的端讀取/ACK? 憑證來自誰? | 同帳號留言=多 AI 已收件 |
| CI 一片綠但功能沒動 | S5 SHA→workflow→job→test 输入→實際部署 SHA | 執行的是漏洞重現還是修復反向測試？父層依存跑了沒？ | 兩個 PR 的 pass 可相加成整合證據 |
| 網頁更新後舊版資料壞掉 | S6 GitHub Pages/cache/version.json、localStorage | 真實服務版本、舊 JS 分頁、備份是否還能用、已部署/回退 SHA | 回退前端 commit 就能回退瀏覽器資料 |
| Worker 重啟後 STOP 失效 | S4/S5 `testenv/loop/server.cjs` 和 #41 | grant 重建、STOP/REVOKE、restart 日誌、身份完整性 | MOCK 測試能代表正式 Worker 已安全 |

**最短調查順序**：`症狀 → 入口檔 → write key/API → 固定 SHA → 原始 log／操作回放 → 權限與副作用 → 根因 → 最小改動 → 對應反向測試 → 回退演練`。

## 十、下一批可執行工作（盡量節省用量）

1. **一個支點索引即可**：#150 保持唯一需求／工作索引；#153 保持獨立審查室；#156 處理 R3 根因。此份 doc 是閱讀地圖，**不另造第四套審批帳本**。
2. **優先一條垂直使用者流程**：`audio-lab pending → window.AIBrain → aiBrain.v1 writer → 讀回 ACK → 清 pending → 失敗仍可安全恢復`。配合 R3 #158 還需要真多分頁/部分匯入負例與 BOT③ 審查。
3. **再處理圖譜 boot/undo/import 的 UI 持久化成功語義**，最後才考慮世界模型事件遷移；世界模型暫列已知限制，不能作不可變事實審計。
4. **等 Gate 再提合併方案**：每一批都有 source vs target diff、受影響鍵、版本圖、同 SHA CI、獨立 reviewer、Safari/恢復及人類必要批准。
5. **跨 AI 只追新差異**：Grok、Gemini、GPT②、BOT③ 回件只需帶上次已知 SHA、變動、反證與殘餘問題；不得因交接量大而反覆重建完整歷史。

## 十一、讀這份文件時要避免的四種幻覺

- `README` 提供 Pages 網址或發布指令，**不是**可以推論今日線上 SHA、部署狀態、裝置真實 localStorage 已安全。
- `testenv` 的本機 MOCK 工作者、測試環境 grant、過去 DEPLOY-PACK 是**研究證據**，不是有權限的雲端 Production 服務。
- #154 的 `3/3` 表示漏洞可重現；#155/#157/#158 的合成綠燈表示候選流程在受控環境通過；**都不等於正式已修復**。
- 文件、GitHub Issue、同帳號的 AI「回件」只可被當成來源聲稱；真身份、收件與獨立審查證據各自核對。

**結論：先讓同一份可查的系統地圖成為大家的閱讀基準；只在正式需要時才新增程式、AI 服務與審批 Gate。**


## 十二、最新角色運作分工 V0.2（使用者 2026-11-10 決定）

**本節保留 2026-11-10 歷史分工；最新使用者分工見第 14 節 G：Gemini 核對技術條件與限制、BOT 工程實作與測試、Grok 去重與整合。不改歷史作者歸屬。**

| 角色 | 主責 | 向下一站交付 |
|---|---|---|
| 使用者＋GPT① | **共同創作**：願景、產品功能、系統構想、操作體驗、設計權衡、需求與驗收準則 | 具有目標、範圍、權威邊界、風險與最小驗收的創作／工程需求包 |
| Gemini | **搜尋與證據調查**：官方文件、替代方案、版本／相容性、技術先例、漏洞線索、相反研究 | URL／日期／版本／來源可驗程度／待查矛盾；不直接宣布工程就緒 |
| Grok | **工程實作**：架構接線、改程式、測試與 CI 除錯、候選 PR，包含 #151／#156／#160 對應工程 | 固定 HEAD、可讀 diff、重現／修後證據、失敗與回退路徑 |
| BOT③ | **工程整合與驗證**：跨模組相依、安全測試、獨立重現、性能與恢復；必要時自有修補 | 原始日志、獨立失敗案例、整合 gate；**若自己是作者，該部分改由非作者審核** |
| GPT② | 按具體爭議協助創作反證／方法挑錯，避免同源共識 | 有針對性的反例和最小驗證，不做重複一般工程 |

**標準管線**：使用者＋GPT① 提案／設計 → Gemini 按需搜尋查證（可在任何階段介入） → 使用者＋GPT① 形成最小驗收規格 → Grok 在隔離分支實作 → BOT③ 從原始碼／固定 SHA 做工程驗證與整合 → GPT① 整理創作意圖、差異和殘餘風險 → 只有當確實需要正式合併／部署／費用／權限決策時請使用者批准。

對小型低風險研究不強制五方會議；對資料寫入、記憶、授權和正式部署維持**非作者驗收＋可恢復證據**。GitHub 任務發布只是 `HANDOFF_POSTED`，不表示 Gemini／Grok／BOT③ 真的在外部收到或執行。原 Issue #41 跨 AI ACK 與全部正式發布 Gate 不變，`HOLD`。

**對應主入口**：[工程與角色分工更新 #160](https://github.com/keqingwu5-cloud/ai-boundary/issues/160#issuecomment-6766370151)；[獨立審查 #153](https://github.com/keqingwu5-cloud/ai-boundary/issues/153#issuecomment-6766371090)；[R3 工程 #156](https://github.com/keqingwu5-cloud/ai-boundary/issues/156#issuecomment-6766371939)。


## 十三、整體運作抽象與接手批次 V0.3（2026-11-13）

使用者本輪指示：「我們開始以抽象處理，你如果要整個系統跑起來，接下來交給你處理，需要審核叫我。」本節把既有圖紙收斂成工作流程與施工先後；不新建規章、帳本、任務佇列或模型服務。GPT①／Work 可在已授權隔離範圍自主調查、修補及整理可審查候選；正式合併、部署、費用、新憑證及正式資料寫入仍於具體方案完成後交使用者審核。未設定背景監控或常駐執行。

### A. 全系統共用的六項行為

| 行為 | 輸入與輸出 | 既有承接位置 | 最小完成條件 |
|---|---|---|---|
| 接收 | 使用者內容／來源事件 → 帶來源版本的輸入 | Launcher、R04 S0/S1、D03/E01 | 原件可定位，同版不重建、新版不覆寫；收件不等於派工 |
| 保存 | 輸入／結果 → 可讀回資料 | graph writer、vault、inbox、D02/E02 | 寫入失敗保留原件；重開仍可讀回；不同資料域不混寫 |
| 決定 | 任務候選＋範圍 → 可執行／待決／拒絕 | 現有 grant／STOP、D04/D05 | 內容聲稱批准不產生權限；停止記錄不得由啟動流程洗掉 |
| 執行 | 已授權任務 → 產物或明確失敗 | 原 Worker／executor、D03/E01/E03 | 有產物、有原因；結果不明時先對帳，避免重複副作用 |
| 回報 | 產物／失敗 → 可追溯工作狀態 | 現有 view、E04/E05 | 區分本機完成、真外部收件、審查與部署；可點回來源 |
| 恢復 | 中斷＋已保存狀態 → 接續／停止／人工處理 | 原 R01/R02/R03 | 不丟原件、不復活撤權、不把未完成報完成 |

這六項是責任分界，不要求新增六個服務。認知研究、圖譜、世界模型、音訊、跨 AI 和工作台沿用各自的內容與資料域。

### B. 依影響範圍安排施工

1. **使用者資料線**：沿 R01/#161 與 R3 修補保存、讀回、Undo、失敗保留。對實際使用價值最高，真跨 AI 未接通不阻止它的隔離修正。
2. **接收線**：保持 #166 最新 R04 S0/S1 整批交付安排；「真實留言」執行、「可可」獨立審查、Grok 整合。GPT① 不重寫這條已分工的 S1。S2 原件與 S3/S4 條件仍照既有 Gate。
3. **執行線**：R02 停止／撤權與 R03 結果不確定，是啟用自動執行前的直接條件；與前兩線分別收斂，不要求等待美化或高階推理研究。
4. **版本與回報**：每批沿 D06/E05 固定受影響版本和原始輸出；只補本次有影響的驗證，不重做全部歷史審查。
5. **後續應用**：上述可用範圍確認後，再接單一真實用途，先由使用者選定的既有研究／工作台需求承接。多 BOT 擴張、模型排名、16 指標實驗及世界模型正式遷移沿原延後決定。

局部試用的設計原則：一條路徑的未知只阻止依賴它的功能；已知資料破壞或越權風險則阻止相關寫入／執行。這是拆分候選與審查範圍，不是自行豁免既有發布門檻。

### C. 本輪實際執行結果

- main 讀回：d2ec331ea4fa68d5a2713f12f5d4706b8effb21a；既有 queue 依賴：a99f48a1cf3a848ef770b77701bf1e6283f11bad。11 個來源檔案逐一核對 Git blob，再重建既有 localhost MOCK 路徑。
- 三筆「提交 → 保存 → 模擬執行 → 精確讀回」完成；終止及重新啟動後，三筆事件內容保留。這證明本機機械流程可跑，不代表 AI 已思考、前端已整合或遠端已 ACK。
- 原版 STOP/revoke 在真本機程序重啟後消失，已從靜態風險進到限定範圍的動態重現。
- [Draft #168](https://github.com/keqingwu5-cloud/ai-boundary/pull/168)，固定候選 bf8eeadec4d22d5752261152a38031541ae79fad：bootstrap 保留已有 grant；FileStore 拒絕重複 grant_id 覆寫。STOP-only/revoke-only/expired-only 的重啟、拒絕派工，以及顯式新 grant 正向路徑均在本機檢查成立。
- 來源、重現方式、baseline 與修後原始紀錄：該候選 testenv/evidence/r02-20261113/README.md 與 local-run.json。16 筆為操作／檢查紀錄，非 16 個全系統測試。
- 沒有使用付費 API、正式資料或真 AI 執行器；所有本輪啟動的本機服務已終止。

### D. 下一步與審核觸發點

| 項目 | 下一個具體動作 | 目前是否需使用者決策 |
|---|---|---|
| R02 #168 | 原工程線核對 createGrant 契約影響、PgStore/舊 lease/競態與非作者覆驗；不能以本機 PASS 全面結案 | 否，仍是隔離工程審查 |
| R01 #161 | 沿最新 41506f9 反證補真 mutate→save→undo 行為及回復路徑；不把舊缺陷當新狀態 | 否，沿既有範圍 |
| R04 S0/S1 | 取得原執行者固定完整交付包後做差異整合；目前僅查到任務發布，未聲稱已開工 | 否；缺不可替代原件時集中提出 |
| 真來源／真 AI runtime | 固定接入方式、可用環境、身份、儲存、成本、停止及退出方式後提出最小啟用方案 | 真正要新增權限／資源或部署時才審 |
| 首個可用版本 | 提交實際 diff、可用功能、已知限制、必要驗證、回退方式與待批准動作 | 準備完整後請使用者審核 |

目前未具備「整套系統已運轉」的證據。抽象層完成責任對應，本機流程已實跑並形成一個修補候選；其他工作保留原 owner、來源及未驗狀態。


## 十四、底層連結結構 V0.4：完整循環優先（2026-11-13）

**本節優先於第十節與第十三節 B 的施工順序。** 使用者已指定先完成底層連結完整結構化，優先沿用開源，再串通 AI → 輸出 → 審核 → 部署 → 啟動 → 回報 → 修正。這次是設計整合交付，不是已接線、已部署或新增發布授權。前面各節保留為歷史與來源。

### A. 系統邊界與唯一責任

六部分是責任，不新建六個服務。沿用原 #150 索引、#166 工程整合與 #41 真 ACK 邊界。本文件是設計導覽，不成為第二個 runtime 帳本。

| 部分 | 操作入口與目的 | 權威寫入者（目標設計） | 輸出與相依 |
|---|---|---|---|
| 身份與權限 | 收件驗證、批准、撤權、派工前核對 | 授權服務；AI 原文不能寫入批准 | principal、scope、grant/version；依賴真身份 |
| 任務與版本 | 登記任務、來源修訂、交付產物 | 任務/產物儲存接口；版本新增不覆蓋 | task_id、revision、artifact digest；沿用 R04 契約 |
| 傳遞與收件 | 投遞、讀回、補收、去重 | inbox/outbox 儲存接口 | 已保存收件回執；收件不觸發執行 |
| 狀態與保存 | 執行進度、中斷續接、查詢 | 流程引擎寫 runtime 狀態；應用儲存寫業務記錄 | engine_run_id 對應 task_id；避免兩邊各自改同一狀態 |
| 審核與執行 | 審查固定產物、部署、啟動 | 審核者寫決定；受授權 executor 寫執行結果 | review、deployment、activation 各自回執 |
| 回報與恢復 | 讀回結果、分類失敗、停止、對帳 | 執行端寫結果；整合視圖只投影 | result_ref、error、next_action；不得把顯示狀態當權威 |

Hatchet 為**唯一優先試接候選**，尚未選定採用版本、安裝或替換現有 queue。其流程狀態與業務產物分開：引擎記錄調度/等待/重試，應用記錄任務、產物、審核與來源版本；視圖由 ID 關聯讀取，不複製成另一個可修改狀態帳本。先不疊加 Temporal 或 LangGraph。

### B. 每個連結的契約

| 連結 | 輸入與檢查 | 保存及回執 | 失敗去向 |
|---|---|---|---|
| 來源 → 收件 | source_key、revision、原文摘要；驗身份、重算 digest | R04 原來源修訂及獨立觀測；RECEIVED_STORED | 格式/身份拒絕；同版異內容 CONFLICT；不派工 |
| 收件 → AI 任務 | 任務目標、限制、來源引用；另驗派工授權 | task_id、run_id、輸入版本、DISPATCH_ACCEPTED | 缺授權停 BLOCKED；保留已收件內容 |
| AI → 交付產物 | 產物引用、來源版本、模型/工具來源標記 | immutable artifact_ref、digest、OUTPUT_STORED | 產物缺失或不可讀回不進入審核 |
| 產物 → 審核 | 固定產物、差異、測試證據、已知限制 | review_id、reviewer、decision、綁定 digest | REJECTED/CHANGES_REQUESTED 返回原 task 的新 revision |
| 審核 → 部署 | 通過的具體版本＋部署授權＋目標環境 | deployment_id、實際 artifact digest、環境、DEPLOYED | 已知失敗 FAILED；副作用不明 UNKNOWN，先對帳 |
| 部署 → 啟動 | 已安裝版本、啟動授權、必要設定與健康檢查 | activation_id、runtime 身份、版本、STARTED | 啟動失敗保留部署記錄；不顯示 RUNNING |
| 啟動 → 回報 | run_id、結果、錯誤、資源紀錄 | RESULT_STORED 與來源端獨立讀回 | ACK 遺失先查結果；不直接重做外部操作 |
| 回報 → 修正/結案 | 預期與實際差異、原任務與產物引用 | ACCEPTED 或同 task 下的新 revision | 保留已完成結果，不另造無關母任務 |

上述操作名稱與回執為**目標語義**，不是新增 HTTP route，也不是要求改名既有狀態。實作需建立原欄位對照，尤其不能直接覆蓋 R04 的 recordSourceRevision、version_ref、dispatch:false 契約；其完整最新原件仍待對照。

### C. 最小共同資訊與版本綁定

沿用第五節資訊包，新增內容以 adapter 映射，避免重寫既有 schema：

- 關聯：project_id、task_id、event_id、correlation_id、causation_id；engine_run_id / attempt_id 不能代替穩定 task_id。
- 版本：source_ref、source_revision、artifact_ref、artifact_digest、contract_version；digest 演算法及序列化方式須在契約固定，不能由不同端自由重算。
- 身份：principal_ref、destination_ref、scope_ref；不在包內放密鑰。顯示角色名不等於驗證身份。
- 決定：review_ref、approval_ref、approved_artifact_digest、environment、allowed_action、expiry/revocation_ref。審核通過與執行授權分開。
- 回報：receipt_id、receipt_kind、status、evidence_ref、error_code、retry_class、observed_at。接收端時間是觀測，不覆蓋來源時間。
- 所有狀態更新須帶預期 revision 或等效原子條件，拒絕過期 writer 覆寫。

產物變更後，舊批准僅對舊 digest 有效。部署與啟動可同屬一個批准範圍，但必須明確列出 allowed_action，仍分別記錄結果。任務原文包含「已批准」不能產生 approval_ref。

### D. 狀態分軸，避免一個完成覆蓋全部階段

| 軸 | 目標狀態示例 | 不可推論 |
|---|---|---|
| 收件 | RECEIVED_STORED / CONFLICT / REJECTED | 收到 ≠ 已派工 |
| 審核 | PENDING / APPROVED / CHANGES_REQUESTED / REJECTED | APPROVED ≠ 有部署權限 |
| 部署 | NOT_DEPLOYED / DEPLOYING / DEPLOYED / FAILED / UNKNOWN | DEPLOYED ≠ 已啟動 |
| 執行 | NOT_STARTED / RUNNING / SUCCEEDED / FAILED / UNKNOWN | SUCCEEDED ≠ 真 AI 身份已驗證或獨立驗收 |
| 停止 | NONE / STOP_REQUESTED / STOP_CONFIRMED | 本機取消 ≠ 遠端副作用撤銷 |
| 驗收 | UNREVIEWED / ACCEPTED / REJECTED | 作者自測 ≠ 非作者覆驗 |

這些為設計投影；實作以原狀態機合法轉移映射，不能任意添加文字狀態繞過 guard。UNKNOWN 在對帳前不得走普通重派；本機執行已停止但遠端結果不明時，兩項資訊並存。

### E. 傳遞、重試與重啟的最小規則

1. **先保存再承認收件**：只有儲存交易成功才回 RECEIVED_STORED。若來源收件已成功但回執遺失，重送同版回既有收件 ID；新版新增修訂。
2. **保存與投遞間不可留無法追查的空隙**：業務交易與待投遞記錄須具備原子 outbox 或經驗證的等效機制。引擎接收 run_id 成功後保存映射；超時先查既有 run，不盲目再建。
3. **重送不等於重新執行**：事件去重鍵與執行冪等鍵分開；同 idempotency key 異 payload 拒絕。外部副作用仍需目的端冪等或對帳，不能把引擎恢復宣稱為外部 exactly-once。
4. **重試按失敗分類**：確認未產生副作用的暫時錯誤才可有界重試；格式/授權錯誤待修正；結果不明進 reconciliation。
5. **撤權與停止跨重啟保留**：新程序不得以 bootstrap 重建舊 grant；舊 attempt 不得借新 grant 完成。停止確認只能由具體執行端證據更新。
6. **回復保留歷史**：代碼回退不等於資料回退；批准版本、停止記錄和未知結果均不得為通過測試而刪除。補償操作另記授權和結果。
7. **大產物用引用**：流程事件只存必要摘要與受權限保護的產物引用；不把私人記憶或密鑰寫進流程歷史與公開日誌。

此為必須滿足的行為設計，不預先指定另建消息佇列、資料庫或新服務。

### F. 既有工程位置與證據範圍

| 現有來源 | 放回結構的位置 | 已知證據／缺口 |
|---|---|---|
| R04 S0/S1 | 來源版本與純收件 | 使用者跨對話最新回報 ACCEPT_TECHNICAL，限本地合成；此輪未取得完整覆驗原件，不能宣稱已納入整合 |
| #168 @ de83d07f4ec6d7cc616071b7e8307737950c0e2c | STOP/revoke 跨重啟、授權不可覆寫 | 本對話已執行本機修補與聚焦檢查；不代表 PG/遠端部署 |
| #169 @ 959b24763eb13c65e07b153f283320fcf23f6600 | 共用 client、scope、接口能力檢查 | 5 項接口測試及舊 loop 回歸；新版路徑使用 recording store，不是持久化接通 |
| #97 @ 3962de8b4ab2696b4764b10d802b979b182aa500 | intent/authorize/report、PG 候選 | 已讀接口；不能直接換入舊 FileStore；與開源引擎的責任重疊須先去重 |
| Hatchet | 調度、等待、執行歷史與恢復候選 | 官方能力初選；未固定版本/部署設定、未實跑、未取代上述工程 |
| #41 | 真接收者身份與 ACK | 仍不能以 connector 讀取、留言張貼或合成回執取代 |

以上 SHA 是本對話查讀/產生的固定證據版本，不是聲稱所有遠端分支目前仍在同一 HEAD。進入實作前增量查差異。

### G. 開源採用方式與下一個整合批次

沿用先前官方查閱來源：
- https://github.com/hatchet-dev/hatchet
- https://docs.hatchet.run/self-hosting
- https://docs.hatchet.run/v1/durable-execution

初選依據：可自架、PostgreSQL 持久化、TypeScript/Python、生存於中斷的工作流及事件等待。這些是官方文件能力，不能取代本專案驗證。引擎不自動供應我們的 reviewer 身份、批准與 artifact 綁定、部署目標權限或真 AI 接入。

下一批只做一條合成任務完整循環：
1. Grok 核對現有成果，固定一個整合基準和 Hatchet 候選版本，列 KEEP/REPLACE/ADAPT；不要讓自建 queue 與 Hatchet 同時派送同一任務。
2. BOT 沿既有隔離工程補 adapter：純收件 → 已授權流程啟動 → 合成交付 → 綁定版本的審核 → 本機隔離產物安裝/啟動 → 結果保存讀回。批准由測試身份提供，標 SYNTHETIC_APPROVAL；不冒充使用者批准或真 AI。
3. 在同一批整合中檢查必要邊界：重送、版本變更、審核拒絕、停止及中斷恢復。以同一固定候選與原始輸出交付，不將不同 SHA 的 PASS 拼成全通。
4. Gemini 核對沿用技術的適用條件及限制；GPT①維護此契約、來源與未解缺口。非作者審核依實際作者歸屬安排，不以角色名自證獨立。
5. 先完成可審查候選，再於真部署、費用、新權限或正式資料涉及時集中交使用者決定。

此處為更新工程規格，未向其他代理發布訊息，未證明其收件或已開工。沒有新增常駐程序或背景任務。

### H. 本批完成與未完成

- **已完成：結構設計與現有工程對照。** 已統一交接契約、狀態分軸、責任、重試與恢復規則，以及開源替換範圍。
- **尚未完成：機器契約對照、Hatchet 接入、同版完整循環實測、真身份/來源/部署與啟動。**
- 完成判準：同一 task_id、固定產物版本與整合候選，從收件走到結果讀回；中途停止或重啟有可查去向，結果返回原任務。這是目標，不是本次執行結果。
