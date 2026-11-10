# 第一大腦｜專案支點、接線、版本相依、合併部署與故障定位 V0.1

**本文件的角色：** 讓人和多個 AI 能從同一張「現況 × 目標 × 缺口」地圖理解專案。它是**設計與現況導覽**，不創造第二套記憶／審批／事件權威，也不代表任何外部 AI 已收到、已執行或已核准。

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
