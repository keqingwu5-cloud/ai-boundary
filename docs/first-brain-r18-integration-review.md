# 第一大腦 R18｜正式整合前 PR 依賴、審查與放行稽核
**稽核日期：2026-10-29；範圍：隔離 PR #68、#71、#72、#74、#75；正式放行：BLOCKED。**

> 這是具體工程審查的事實快照，不是獨立 reviewer ACK、測試使用者真人資料、真實 Safari 實機或自動合併許可。所有 PR 目前都是 Draft。獨立審查紀錄目前皆為 0。不得將單純 CI success 等同於「完成所有驗收」。

## 1. 相依鏈與 GitHub 即時檢查（稽核時）

| PR | 本身改動 | GitHub base 指向 | 最新受稽核 head SHA | 最新 head 的 GitHub Actions | GitHub PR 狀態 |
|---|---|---|---|---|---|
| #68 | 3D 圖驗證／匯入保存 | `main` | `de9f33f5bc42` | [#40384311895](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40384311895) success | Draft；0 reviews |
| #71 | 3D ↔ Feed ↔ 世界模型來源 | #68 branch | `8a0ddbc8b937` | [#40459535444](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40459535444) success | Draft；0 reviews |
| #72 | 雙軌研究診斷、事件測試 | #71 branch | `d4c762295132` | [#40463783525](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40463783525) success | Draft；0 reviews |
| #74 | 世界模型 v1/v2 事件保存 | #72 branch | `5654ec24ddf8` | [#40467857902](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40467857902) success | Draft；0 reviews |
| #75 | 舊概念兼容、交易式 3D、R07～R17 安全驗收 | #74 branch | `60b4c6652946` | [#40781657907](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40781657907) success（Node／Chrome／WebKit） | Draft；0 reviews |

依 GitHub `compare(base_sha, head_sha)`：每層都是 `ahead` 且 `behind_by=0`，每個 PR 相對目前 base 可合併（`mergeable=true`），但這只是 GitHub 版本依賴與文字衝突訊號，不是安全或功能合格證書。

**累計整體相對 main**：173 commits、50 changed files、merge-base `7b7b77e8c06c`。各層提交數：22＋15＋11＋9＋116＝173。PR #75 一層就有 116 commits、37 changed files；是最大的審查風險，不應只用單一綠燈接受。

**重疊衝突熱點**：五層都修改 `.github/workflows/brain-import-integrity.yml`；`app.js` 在 #68/#71/#75 修改；`world-model.html` 在 #71/#72/#74/#75 修改；`research-context-bridge.mjs` 在 #71/#72/#75 修改。需要逐層檢查最終語意與來源權威，不能依「GitHub mergeable=true」忽略回歸。

## 2. 實際已確認的測試與不應升格的結論

- #68～#75 各自 latest head 的 CI 均有 `success`，但不同 PR 對應測試矩陣不同；前四層只有 Node＋Chromium，#75 的 R17 有 Node＋Chromium＋桌面 Linux WebKit。
- #75 R16 的第一次 3D 測試曾 **31/33、2 FAIL**，找到歷史原始 JSON 開頁遭自動重寫、損壞舊圖誤報 ready；修正後 33/33 全綠。保留首次 FAIL 才能追溯對錯。
- #75 R17 的桌面 WebKit 診斷初次 FAIL，原因是 abort 事件的跨引擎錯誤碼差異；修正後以 abort 後 graph＋Undo 的 durable state 為依據，最終回歸全綠。
- **沒有任何獨立 reviewer 審查證據**。GitHub reviews `[]`；因此不會產生 `APPROVED` 判定，也不會替 GPT② 或 BOT③ 虛構 ACK。
- `world-verification-ledger.mjs` 的 `worldModel.verify.events.v2` 仍使用 `localStorage.setItem`，只有 prewrite 比對而非原子 CAS；跨分頁（含不合作舊版）仍有操作覆寫風險。世界模型日誌的正式併發 Gate 未完成。
- R15 透過 IDB 來源指紋可發現舊程式改寫 `localStorage`，**不能防止未升級的舊 JS 繼續寫**；正式切換前須有移除舊 writer、備份／回退和雙版本比對的運行程序。
- R16 只有合成舊版本資料；尚無使用者授權歷史檔，不能宣稱真歷史相容已驗。
- R17 只有 Chrome/Linux WebKit 合成診斷；尚無真實 Apple Safari／iPhone／iPad 實機測試、背景關閉或 OS 清除容量演練。

## 3. 機器可讀的 Gate

`docs/first-brain-r18-release-gates.json` 保留本次觀測時的 PR SHA、CI、base 鏈、審查數與阻塞項。這是**只讀快照，不是即時批准機制**。任何 PR 新 commit、變更 base、合併 upstream 或收到新 review，都須重新查 GitHub 更新證據。CI 測試 `tests/first-brain-r18-gate-contract.test.mjs` 防止靜態記錄誤把「CI success」升格成「正式可合併」。

以下 Gate 均不得自動變綠：獨立 reviewer、真 Safari／iPad、授權真歷史樣本、舊版本 writer 退場、世界模型 journal 併發安全（或明確封鎖其正式多分頁操作）、正式切換的備份與回退簽核。

## 4. 具體人工審查工作包

### Reviewer A｜圖結構／歷史資料與權威切換
檢查 `brain-import-guard.mjs`、`first-brain-idb-adapter.mjs`、`transactional-brain-store.mjs`、`first-brain-legacy-fence.mjs`、`app.js`。要求從合成 v1/無版本與損毀圖重跑 import／read／write／Undo／reload；驗證 true-old-writer 和 false-CAS、不完整 cutover；把每條反例與輸出 SHA 連在一起。

### Reviewer B｜跨頁資料來源與研究事件
檢查 `research-context-bridge.mjs`、`feed.js`、`world-model.html`、`world-verification-ledger.mjs`、`world-verification-ui.mjs`。要求確認來源 ID 一致、缺失／損壞節點不冒認、研究歷史不改寫原 v1、併發下 journal 的已知非原子限制清楚阻擋正式雙頁寫入。

### Reviewer C｜裝置／恢復／上線授權
根據 `docs/first-brain-r17-device-acceptance.md` 在**實體** Safari／iPhone／iPad 跑背景／重載／鎖屏；使用**受控預覽**而非正式私資料；對照 CI、出具可追溯簽名與授權。備份及回退程序應由正式部署權責人另行批准；R18 工程作者不得自我給出獨立 reviewer ACK。

以上「A/B/C」是**審查責任範圍**，不是已指派、已邀請或已核准的人員。

## 5. 有條件的整合順序（目前不得執行）

只有在獨立 reviewer 和正式 Gate 放行後，才能依序處理 `#68 → #71 → #72 → #74 → #75`。每合併一層，後一層需改基底／重新核對 merge-base 與衝突、重跑其 Node＋Chrome＋WebKit（適用時）以及端到端測試，不能直接將最上層 173 commits 當成一個無審核大包。嚴禁直接推送 main、啟用自動部署或替使用者遷移私人資料。

**最終 R18 判定：結構依賴與 CI 證據盤點 PASS；獨立審查、實機、真資料、跨版本真正安全切換及正式整合驗收 BLOCKED。主線未合併。**
