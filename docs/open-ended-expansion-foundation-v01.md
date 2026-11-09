# 第一大腦｜開放式擴張底層 V0.1（基於 V1.4～V1.6，不另造大腦）

## 1. 無限擴張應指「可組合與可增量」，而非無限記憶

領域 D1、D2、……Dn 可以以不同 domain_id 建立候選觀測，不固定在文化、經濟、能源或世界模型；資料 A、B、C、D……透過已具備的 V1.6 N 元引擎形成 X，後續 X＋E＋F 產生 Y。這是有限資源下可以持續增加命名空間與組合關係的能力。真正的無限容量不可能保證。

### 底層不變式

- 同一個引擎實例，來源和 gap 的 id 必須唯一。新領域不可覆蓋舊領域來源。
- A/B/C/D 的每次計算都必須聲明具名 rule、ruleVersion、context，不以自然語言混用單位、比例或因果。
- X 的來源 revision 變動，舊 X/Y 必須失效或重新驗證，不可默默沿用。
- 六種原始空白狀態保留。缺少資料不能無條件計算成完整答案。
- 原則上先複用既有結果指紋與引用，不重傳整包數據；不能把合成 byte 壓縮率冒稱模型 token 或時間實測。
- 控制器只保存候選事件及 hash 鏈，不與 aiBrain.v1、世界模型、Notion、正式資料庫創造兩份真相。
- 在正式身份／基準簽章與外部監控來源未接上前，觀測、基準、回執、操作與通知一律不得升格。

## 2. 可擴張最小接口

**命名空間**：registerDomain(domain_id, contract_revision)。新增新領域不需要重做核心。

**感測入口**：observe(event_id, domain_id, source_id, revision, source_hash)。事件重試必須冪等；相同 ID 不同來源拒絕。每個事件有單調 version，所有附屬登記共用 event_id。

**組合入口**：registerSource / registerGap / reviseGap / compose。直接呼叫 V1.6 createGapAwareEngine，不另寫算術核心。已知資料可以 A+B+C+D→X；X 與新 C/E 再組合，深度/數量有明確界限。

**規則擴充入口**：registerExpansionRule / planExpansion。未來新增研究規則只需先登記 domain_id、rule_id、rule_version、kind、min_inputs、max_inputs 和 review_ref；缺少真正經核准的執行適配器時，始終只輸出 NOT_PRESENT / NOT_APPROVED 的計畫候選。任何 caller 自述 executable:true 的欄位必須拒絕。

**反證與方向**：proposeBaseline / proposeDirection。可以留下新方向、反問原目標、擱置研究，但都不是核准新的正式基準。

**控制與登記**：requestControl、history、verifyHistory。以本地 STOP 阻擋本實例計算；遠端停止/啟動仍必須等目的端真收據。

**通知出口**：queueNotification(WARNING/FAILURE/EXECUTION/CORRECTION/REVIEW)。所有通知共用 event_id 及去重 ID。它只建立未送出的候選通知，還沒有通知傳輸端。

## 3. 當前真實能力 vs 缺口

| 能力 | V0.1 現況 | 下階段 Gate |
|---|---|---|
| 新領域註冊 | 實作候選 | 版本化 schema 校驗、租戶／領域權限隔離 |
| 多輸入型別運算 | 重用 V1.4～V1.6 | 真實來源可追溯、跨程序 cache、一致性／性能測量 |
| 來源修訂與 gap | 候選，回讀可看到舊結果失效 | Durable CAS、原始 evidence 的保留與回退 |
| 基準候選與身份 | 登記但一律 HOLD | 固定 #128 身分驗證器＋授權簽章與撤權，外部獨立 trusted root |
| 執行／暫停／停止 | 只有本機 STOP、其餘登記請求 | 固定 #97 Worker 與 #116 Watchdog、租約及真遠端停止確認 |
| 五種通知 | 候選出站、去重 | 真實通知通道＋送達證據＋降噪 |
| 真實跨 AI ACK | NOT_VERIFIED | Issue #41 獨立收件者＋回執＋源端核對 |
| 長期記憶 | 不做、避免雙主 | 原權威記憶的授權／備份／歷史相容驗收 |
| 大型無界圖 | 不宣稱具備 | 分片／索引／時間與資源預算／故障降級 |

## 4. 實際資源上限與透明性

- V1.6 核心單次 N 元組合的 maxInputs 介於 2～32；要處理 100 個來源，必須使用可查證的分層組合而不是默默忽略 68 個。
- 新控制實例的 maxDomains、maxEvents、maxHistory、maxDepth 都受限；到達上限回覆 BLOCKED。
- 不可把高熵或高分歧直接當成高可信度。方向選擇器需結合價值、風險、成本、可逆性與反證。
- 計算候選與控制候選只保存在 in-memory Map。重新載入或 Worker 終止後不會恢復，正式自動化需獨立部署且驗證持久化。
- 每個 event_id 可掛接多個通知、審查及候選規則，但不得有五份衝突的權威基準。

## 5. 不擴張的新系統

這個最小版只新增一個薄型控制模組、一套機器狀態契約、回歸測試與兩份研究說明。沒有額外服務、沒有新的 PostgreSQL 表、沒有新的記憶資料庫、沒有為了漂亮而重新生成 3D 系統。

下一步要讓它真正自動運轉，優先做一條合成事件完整閉環（觀測 → 候選基準 → 方向 → 授權 Gate → 執行 → 獨立回執 → 人類核准），每步都要有真實端點或明確標記未測。先 BOT③ 統一工程審核，再請使用者核准；**現在只交付隔離候選，不部署**。
