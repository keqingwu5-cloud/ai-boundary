# 第一大腦｜第一階段：先修證據與觀測校準（研究隔離 V0.3 候選）

**狀態：DRAFT / ISOLATED / HOLD / NO MAIN MERGE / NO DEPLOY / NO MEMORY WRITE**

## 目的與邊界

依使用者「先讓第一大腦修改，再研究其他開源」的順序，本輪**不安裝或移植任何新開源工具**，只修第一大腦既有三軸狀態轉移 sidecar（父層 PR #139）。

本 PR 只針對兩個可由原始碼指出的內部一致性問題：

1. **過期證明重用**：開啟轉移後，control/proof 若改版，原有五種 append 行為不可繼續引用舊證據。每次 append 前與非同步 digest 後再次比對固定的 control 版本/hash、proof revision/head hash。
2. **無 O1 仍校準**：缺少同一 transition 的 observation O1 時，`calibrate` 必須回 `OBSERVATION_REQUIRED`，不改版本、不追加事件；有 O1 時的校準候選保留來源引用和內容雜湊，但明示 `CLAIM_ONLY`，不宣稱真實觀測來源已受認證。

## 本次刻意不修改的事情

- 不修改正式 main，也不直接改寫父層 #139 既有審查標的。
- 不引入 CARA、OpenSpiel 或其他開源 runtime；參照角色、對手模擬、跨局評分屬**後續獨立評估**。
- 不改現有資料庫、記憶權限、Worker、交易、API、Webhook、證明 authority，也不宣稱跨 AI 真 ACK。
- O1 的 `OBSERVED` 仍只是本地收錄的來源陳述；沒有獨立的身分或來源真實性驗證。
- 本輪不補寫上游 #133–#139 的審核或正式系統接受／部署結論。

## 需要 BOT③ 獨立重現的檢驗

- 控制事件在 `openTransition` 後進版，後續 addDrive / proposeAction / recordObservation / calibrate / addMemoryRef 是否 fail-closed，且版本與 side state 不動。
- proof 的 revision/head 在轉移建立後變動，後續寫入是否 fail-closed；只有 GitHub 作者綠燈不能當作 BOT③ 獨立驗證。
- O1 不存在時校準是否拒絕；O1 存在時 0/1 邊界信心值是否仍可校準，並保留來源引用且不升格 APPROVED。
- SHA 非同步計算期間 control/proof 更新的競爭窗口、容量不足、資料複製、防篡改與四類日誌／父層契約仍待獨立檢查。
- 可用測試：`node tests/cognitive-transition-synthetic.mjs`、`node tests/cognitive-transition-negative.mjs`；原有 workflow 僅包含隔離合成測試，非完整整合驗收。

## 第二階段（暫不執行）

以同樣的已定義狀態及時間截止，才考慮 CARA 的逐步復盤、OpenSpiel 的玩家資訊集／多方策略等**參照角色**。先比較既有方法是否有增益，禁止將棋類分數換算為世界模型可信分數。

**Release Gate: HOLD**。需獨立審查、父層依存確認、正式測試與使用者另行批准才能決定合併或部署。
