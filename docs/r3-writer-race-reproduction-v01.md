# 第一大腦 R3｜main 寫入競態與世界模型歷史覆寫：原始函式負例重現 V0.1

**類型**：靜態鎖版 + 原始函式在合成雙分頁/儲存環境中的**已知風險重現**。不是修復、不是整體端到端驗收、不是 BOT③ 的獨立結果。 `RESEARCH_ONLY / DRAFT / HOLD`

## 起點與來源

- 固定 **main** HEAD：`d2ec331ea4fa68d5a2713f12f5d4706b8effb21a`。此研究分支從 main 的這個 commit 切出，另有獨立研究 base `research/r3-storage-baseline-main-20261110`。沒有修改 main。
- 此版本與 Draft #152 所在的研究堆疊 **不是相同 blob**：main `app.js` blob `6f69f3e...`，#152 `app.js` blob `747c240...`；main `world-model.html` blob `c7cad5f...`，#152 `world-model.html` blob `7c5aae...`。因此不得在 #152 頭上測試後宣稱覆蓋 main 風險。
- 完整原件位於本 repo；審查室 [Issue #153](https://github.com/keqingwu5-cloud/ai-boundary/issues/153) 的 R2 writer 清冊是需求起點。

## 檢查方法（非文字猜測）

`tests/r3-main-writer-race.repro.test.mjs` 於測試時**直接讀取 checked-out main 版本的程式檔**，截取原本 `save()`、`persist()`、`getVerifyRows()/saveVerifyRows()` 的**原始函式正文**，用 Node `vm` 與兩個合成瀏覽器分頁環境重現。它不複製私人資料、不訪問瀏覽器 localStorage、不發送任何網路或 API 呼叫、不改真實紀錄。

### R3-A 圖譜 `aiBrain.v1`：舊 writer 覆蓋
- 使用 main `app.js` 的 `save(now=true)` 原函式，兩個隔離分頁從同一舊版圖譜各自新增 A、B 節點，先 A 存再 B 存。
- 只有 B 的節點留下，A 的更新被覆蓋；因保存路徑沒有修訂比對與 CAS。
- **聲明**：這是合成環境中對真實函式的確定交錯，不等於真 Safari 兩分頁已發生實際損壞。

### R3-B 加密記憶 `aiBoundary.privateMemory.v1`：await 競態
- 使用 main `memory.js` 的 `persist()` 原函式，兩個合成分頁共用同一儲存。
- 兩方都先通過 `stored() === observedEnvelope`，接著在 `await encryptCurrent()` 暫停；A 先寫入合成密文、B 再完成並覆蓋 A。
- **聲明**：合成密文僅為標識字串，沒有解密真實 vault；不等於所有情況都會發生，揭露可行的覆寫交錯。

### R3-C 世界模型 `worldModel.verify.v1`：版本歷史不可回讀
- 使用 main `world-model.html` 的 `saveVerifyRows()/getVerifyRows()` 原函式。
- 同一筆研究預測狀態從「待驗證」變更為「假設被反例推翻（自評）」，目前 v1 key 只保留後者。
- **聲明**：只證明此 key 沒有事件版本歷史；未檢查使用者是否另有手動匯出備份。

## 執行與判讀

```sh
node tests/r3-main-writer-race.repro.test.mjs
```

**關鍵：輸出 `KNOWN_RISK_REPRODUCED` 並 exit 0 只代表負例在這個原始函式與合成環境被成功重現，**絕不是 `SECURE`、`READY`、`FIXED`、`BOT3_REVIEWED`。未能重現反而必須檢查來源是否漂移、抽取函式是否失效、或是否已真正修補。下一個階段需要在另一個隔離候選做修補後的**反向驗收**（舊版應失敗、新版相同負例應拒絕覆寫），且針對改寫途徑做回退/備份檢查。

## R3 最小修補候選（**尚未實作**）

- 圖譜：單一 writer authority、帶版次的 optimistic concurrency；舊 writer 不懂 version 則禁止 IDB cutover，不能只讓研究橋接層讀 authority。
- 加密記憶：避免僅在加密前比對一次；需要跨分頁寫入協調、加密等待後再確認來源版次，**兩階段的 getItem 比對本身也不能提供原子 CAS**；必須設計真正的互斥寫入者或平台資料交易，並測試無鎖平台的 fail-closed。
- 世界模型：先保留 v1 原始記錄與可恢復備份，再透過 v2 事件版本追加與可回放讀取；舊 UI writer 退役前不可宣告 v2 為唯一 authority。
- **不用新增平行控制/審查核心**，不把三項風險綁定 Grok 六輪博弈。BOT③ 後續只需重現固定 SHA 與提供原始 log。

## 安全與驗收界線

不接正式用戶資料、不涉及私人記憶匯出、不更動 `app.js`、`memory.js`、`world-model.html`、不 main merge、不部署、不啟用付費 API、不聲稱真正 Grok/Gemini/BOT③ 的收件。 R3 證據狀態：`SYNTHETIC_ORIGINAL_FUNCTION_REPRODUCTION`；`PRODUCTION_E2E=NOT_RUN`；`RELEASE_GATE=HOLD`。
