# 第一大腦｜可信控制循環 V0.1：自動化文件、身份與狀態標誌（隔離候選）

版本：2026-11-09。狀態：**DRAFT / IN_MEMORY / SYNTHETIC / NOT_DEPLOYED**。

既有底層：V1.6 [PR #125](https://github.com/keqingwu5-cloud/ai-boundary/pull/125) 固定 HEAD 1535605f096737dfbc3b963cb41d89e9677d93cc。**這次不建立第二份正式記憶或資料庫**。

## 1. 將自動化的文字、狀態標誌統一

原本身份、證據、基準、派工、通知、回執會在不同 Draft 出現相似但不一致的 READY / PASS / ACK。現在一律將觀測、基準、權限、執行、回執和部署分離，不能用一個 PASS 取代所有層級。

機器可讀基準：schemas/control-cycle-flags.preview.schema.json；隔離控制入口：control-cycle-candidate.mjs。

| 維度 | 此隔離版可以宣稱 | 不可推論 |
|---|---|---|
| observation | RECORDED_UNVERIFIED | 看見資料，不等於真實來源已認證 |
| baseline | NOT_APPROVED | 監測游標前進不等於核准新基準 |
| authority / decision | none / HOLD | AI 或測試簽章的自述不是授權 |
| control_mode | OBSERVE、候選本地 STOP | START/RESUME 請求不代表遠端真的執行 |
| execution | NOT_RUN | 程式存在不代表 Worker 已常駐 |
| remote_ack | NOT_VERIFIED | GitHub 留言不等於 GPT② 已收件 |
| notification | WARNING、FAILURE、EXECUTION、CORRECTION、REVIEW | 登記 NOT_SENT 不等於通知送達 |
| direction | REUSE、ALTERNATIVE、CHALLENGE_PREMISE、STOP、RESEARCH_ONLY | 候選方向不是核准部署 |
| blank state | V1.6 的 MISSING、UNKNOWN、UNVERIFIED、INTENTIONALLY_OPEN、NOT_APPLICABLE、REDACTED | 空白不可自動補成零或忽略 |

同一事件的所有紀錄必須共用 event_id；同一事件的來源基準、修正、通知、回執不能生成彼此矛盾的身分。

## 2. 錨點與發動機不能互相冒名

1. observe：只登記已觀測到的版本與來源 hash；身份與來源仍未驗真。
2. proposeBaseline：只產生新基準候選，狀態維持 NOT_APPROVED；此控制器**沒有 approveBaseline 方法**。
3. proposeDirection：保留沿用、替代、反問原問題、停止、研究候選五個方向；不能因此修改正式基準。
4. requestControl：記錄 START / PAUSE / STOP / RESUME / SET_TEST / SET_CONTROLLED 的要求、聲稱操作身份及授權線索。STOP 只影響本地暫存引擎；不得冒稱遠端停止。其餘操作不會啟動 Worker。
5. recordReceiptClaim：只記錄尚未核驗的收件聲稱，永遠標記 NOT_VERIFIED。
6. queueNotification：五種分流同一 event_id、去重；全部 NOT_SENT，不主動發信。
7. history / verifyHistory：本地事件版本鏈 hash 檢查；不是持久不可竄改或數位簽章。
8. registerDomain / registerSource / registerGap / reviseGap / compose：保留不同領域的命名空間及 V1.6 的 N 元組合與空白，**不建立第二個運算引擎**。

## 3. 和現有 Draft 的接口責任（未實際整合）

| 既有模組 | 控制中樞預定角色 | 還缺的實證 |
|---|---|---|
| PR #110 | 來源感測器 | 真來源受信與不重複發現 |
| PR #97 | PostgreSQL / Worker | 正式資料庫遷移、真實執行端與恢復 |
| PR #128 | 來源與核准基準候選驗證 | 獨立授權身分、金鑰撤銷、可確認的 pinned head |
| PR #116 | Watchdog / 異常停機 | 遠端停止與真實 supervisor |
| PR #121 / #126 | 差異審查、方向選擇器 | 同一份真實來源的完整整合驗證 |
| Issue #41 | GPT① ↔ GPT② 真實回執 | **BLOCKED**，沒有可獨立驗證的接收端 ACK |
| PR #123 / #124 / #125 | 通用 A～N、型別換算、未知空白 | 跨程序的持久化與正式審核 |

PR #128 使用合成 Ed25519 身份和兩個角色；它本身不能憑自產鑰匙認定真身份已授權。本案沒有接通 #128 的驗證器，正式來源信任仍為 NOT_VERIFIED。

## 4. 文件與工程共通規範

- 每筆事件有 domain_id、event_id、source_id、observed_revision、observed_hash、history version。
- 所有候選結果 decision=HOLD、authority=none；外部 ACK 未驗真。
- 重複相同 event_id 加入完全相同內容應去重；衝突內容則拒絕。
- 異步寫入歷史以預期版本檢查；hash 鏈只用於本地一致性，不保證抵抗控制程式擁有者修改。
- REDACTED 要拒絕計算／洩漏。INTENTIONALLY_OPEN 不得自動填。
- 暫存 registerDomain 只登記命名空間；不執行陌生外掛程式。
- 不得將合成資料、真實情境、瀏覽器測試、跨平台部署混成同一個 PASS。
- 本隔離程序沒有外部 I/O、背景服務、定時器、發送通知、真資料庫或持久化記憶。

## 5. 安全邊界與審核

目前有 maxDomains、maxEvents、maxHistory、maxInputs、maxDepth 限制，超限明確拒絕。這是**開放式可擴充**，不是物理無限容量。

要接正式身份簽章、真資料、付費服務、更新 main、正式記憶、跨 AI 交接或部署，都必須另行核准。不能將其他 Draft 的綠燈直接合併成整體驗收。

**本次供使用者審查**：狀態語意、操作把手何時需要人類批准、是否將共用 event_id 視為自動化文件的唯一跨模組索引，以及後續如何綁定可信錨點。
