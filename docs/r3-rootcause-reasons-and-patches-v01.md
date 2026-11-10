# 第一大腦 R3｜根因標記與最小使用流程修補 V0.1

研究隔離，未合併 main。起點：PR #155 HEAD `e0a094d19376776885e6d09a601ddc5a1cbaac49`，其祖先為原始 main `d2ec331ea4fa68d5a2713f12f5d4706b8effb21a`。本分支修補的源碼與測試不是 BOT③ 已收件／獨立驗收。

| 問題 | 根因 | 本分支處置 | 證據狀態 |
|---|---|---|---|
| P0-01 啟動資料保全 | `load()` 將「不存在」和「存在但損壞／不可讀」統一成 null，`load()||seedState();save(true)` 無條件回寫 | `app.js` 將 `NO_EXISTING_RECORD / EXISTING_VALID / EXISTING_INVALID / READ_UNAVAILABLE` 分開；後兩者停寫、保留原始 raw 並提供原文下載；顯示持續的唯讀狀態；保留 seed 為**僅供畫面預覽**而非正式資料 | `SOURCE_DERIVED`，新合成測試待 CI；非真實資料恢復驗收 |
| P0-02 假成功與拒寫狀態 | #155 的 `graphWriterBlocked` 只阻止 `save()`，`mutate()` 及 undo/reset/import 仍可先改記憶體 | `mutate/undo/reset/import` 在 blocked 時先停；公開 API 補 `getPersistenceStatus / confirmPersistence`；UI 常駐 `READ_ONLY / SAVE_PENDING / SAVE_CONFIRMED / SAVE_FAILED` | `PATCH_CANDIDATE`；其他舊 API 回值仍可能是暫態、不能當持久化證據 |
| P0-03 音訊匯入假 ACK | `audio-lab-import.js` 先從 `getState()` 確認記憶體節點數，再刪 pending，未等非同步寫入/回讀 | `importNow` 非同步等待 `brain.confirmPersistence()`；來源不支持 ACK 或回傳失敗時保留 pending/備份，僅確認存入後刪 pending 與成功提示 | `PATCH_CANDIDATE`；部分寫入與跨版舊頁面仍待真正瀏覽器驗證 |
| P1-04 記憶還原後續失敗誤報 | restore 已覆寫密文後的 `migrateMeta()+persist()` 失敗被外層 catch 當成「原密文未改」 | **本分支尚未修改**，需另做階段化回報與失敗後可恢復性 | `SOURCE_DERIVED / NOT_FIXED` |
| P2-05 Feed 偏好雙分頁覆寫 | 頁面載入偏好快照，後續不比對當前值即整包覆寫 | **本分支尚未修改**；需輕量化偏好冲突合併/拒寫 | `SOURCE_DERIVED / NOT_FIXED` |
| 已知世界模型 v1 歷史 | `saveVerifyRows()` 直接整表覆寫，沒有不可變事件歷史 | 依使用者先前決定維持已知限制，暫不實作重建 | `KNOWN_LIMITATION / NOT_FIXED` |

**不得誤判**：#154 原始缺陷重現 3/3 代表漏洞存在；#155 寫入競態隔離反向 8/8 代表候選；本次使用流程測試通過僅代表另一層候選。兩種結果不相加成「正式修復成功」。

待獨立工程審查的阻斷：
1. 舊版 writer 不遵守 Web Lock（包括仍開著的舊分頁）；不能靠新版一側鎖阻擋全部資料損壞。
2. 主腦讀取資料異常時目前只保留原始值於本地並提供下載；未建立自動完整恢復與「找回來源」流程。
3. `aiBrain.v1` 和 `aiBrain.v1.undo` 跨鍵不具交易原子性。
4. UI 操作先改記憶體，非同步儲存失敗可能產生未儲存變更；持久化確認僅供呼叫者主動等待，未將所有 UI 回傳改成交易語義。
5. 音訊匯入多次建立節點時，任何中途失敗仍需跨分頁／復開後去重與恢復驗證。
6. Safari/iPad 真機、真加密流程、備份 restore、BOT③ 獨立重現仍 `NOT_RUN / NOT_VERIFIED`。

下一步應由 BOT③ 用自己的隔離分支對這些阻斷提出反證或最小補丁，GPT① 比較實際差異。正式整合 `RELEASE_GATE=HOLD`，不合併 main、不部署、不動私密資料、不啟用付費 API。
