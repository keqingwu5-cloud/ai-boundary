# 第一大腦 R3｜圖譜及加密記憶寫入競態修補候選 V0.1

**性質**：隔離研究分支；原始基線 main `d2ec331ea4fa68d5a2713f12f5d4706b8effb21a`，上一層 [Draft #154](https://github.com/keqingwu5-cloud/ai-boundary/pull/154) 已用原始函式＋合成雙分頁復現 3/3 風險；本層修補兩個寫入邊界，不修改正式 main，不能宣稱 production fixed。

## 變更摘要
1. `r3-writer-guard.mjs`：最小純函式，要求 Web Locks 獨占寫入；在鎖內比對原始資料版次，在異步 produce 前後再次檢查，寫入後回讀；無鎖或過期皆 fail closed。這是**合作式協定**，不能攔截忽略鎖的舊分頁。
2. `app.js`：`save()` 改成同分頁序列化＋`aiBrain.v1.writer` Web Lock＋舊快照檢查；僅在資料寫入／回讀成功時顯示「已儲存」，否則停寫並提醒先保留備份。既有 `aiBrain.v1.undo` 仍是**第二個非原子資料鍵**；失敗時只標異常並停寫。注意：目前 app 其他 UI 變更仍能在記憶體運作，不能取代真正的只讀 UI／更新衝突提示驗收。
3. `memory.js`：加密保存 `persist()` 將前置比對、await 加密、後置比對和寫入放在同一 `aiBoundary.privateMemory.v1.writer` 鎖；完整還原也在同一鎖內最後檢查並寫入，無鎖時拒絕，不接觸私人實資料。
4. `tests/r3-protected-writers.test.mjs`：實際抽取更新後 app.js/memory.js 原始函式，以 Node vm 模擬兩分頁與 LockManager；測 stale writer、busy、missing Web Locks、legacy writer 交錯、加密中被外部改寫等負例。Web Locks 模擬**不是** Safari E2E。
5. 隔離 GitHub Actions `r3-protected-writer-isolated.yml` 測來源函式與語法；只作候選測試收據。

## 尚未完成的重要 Gate
- **舊 writer 退場**：其他打開的舊版 app.js / memory.js、舊頁面 script 未使用 Web Locks，仍可能覆蓋受鎖保護的資料。未做正式 cutover 前不允許宣布完整修復。
- **圖譜 Undo 原子性**：圖譜與 undo 位於不同 localStorage key，不是可交易寫入。
- **非同步失敗 UI**：圖譜變更在 await 保存之前可先呈現在前端，失敗只發出警告並停寫；需追加對使用者可辨識的 read-only Gate 與匯出/恢復測試。
- **加密儲存的其他路徑**：restore 確有鎖，但實機密碼學、匯入/還原確認跨分頁、密碼使用者流程及非 Web Locks 裝置尚待驗。
- **世界模型**：`worldModel.verify.v1` 的整表覆寫風險仍存在。本候選**沒有修它**；應在另一最小隔離分支複用 #74 的事件 v2/備份與回退設計；不可直接切換 main 資料。
- BOT③ 獨立測試、GPT②/Gemini 反證、實際多分頁 Safari、跨模組根信任與授權、真正 rollback、正式部署均未完成。

## 驗收次序
1. 對相同固定原件做 R3 #154 3/3 **風險重現**。
2. 對本分支固定 SHA 做隔離反向負例，確認違規後寫被阻斷；記 SHA/run/job/log。
3. BOT③ 在其環境獨立 checkout 本分支 SHA 重跑並新增負例；GPT① 比對差異，不自我審查。
4. 實機端到端測試（Safari/iPad，舊分頁/新分頁混用、不可用 Web Locks、全量匯出恢復）；再決定是否要替換原正式 writer。
5. 只有必要的正式整合/部署決策再交使用者批准。

**狀態**：`PATCH_CANDIDATE`、`PARTIAL_SCOPE`、`REAL_USER_DATA_NOT_USED`、`BOT3_REVIEW_NOT_VERIFIED`、`RELEASE_GATE_HOLD`。
