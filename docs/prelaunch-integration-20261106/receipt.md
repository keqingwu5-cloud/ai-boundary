# 第一大腦：上線前隔離整合收據（2026-11-06）

狀態：ISOLATED_INTEGRATION_PASS；不是部署驗收通過。

## 固定版本
- #48：5a235717f8c57b303e142ae968044994be1bea53（含 #96 身分與批次租約防護）
- #93 B1：bcdb3c1d53322ea1123d31120e8475205e7854e3
- #94 B2：a3c51d82067c863811a8c9a5f79dd0e9b770ae8e
- #95 B3：325bcd98a6e4dbf5a6d1435b18f933df597cae91（含 B1）

## 整合與證據
以 #48 固定版本為候選父版本，worker 透過共同基底 6102e523aef88aeed1d6327c1f196181ab37de2f 三方整合 #95；加入 #94 Store/API/HTTP 與讀回測試。保留 #96 身分與批次防護測試。

執行：`node --test tests/mainbrain-*.test.cjs`。
首次 99 項：98 PASS / 1 FAIL。P46 舊斷言只允許 fail，與 B1 在 fail 成功後仍保存證據的契約不相容。修正測試為 fail→report，並加驗唯一 provider 執行、唯一 report、synthetic receipt、attempt/digest 與 unknown outcome；未為迎合舊測試移除 B1 保護。讀回查詢舊斷言同步 B2 limit+1 行為。
修正後 99 PASS / 0 FAIL / 0 SKIP。完整首次失敗及通過日誌附於同目錄。

這是本機擷取檔案的隔離 Node 測試；資料庫使用測試替身，不能證明 PostgreSQL 交易、真實跨 AI ACK 或常駐恢復已上線。manifest 記錄本次所有本機 API/測試檔案 SHA-256；不是整個儲存庫測試。

## 上線前仍需收斂
| 邊界 | 狀態 | 必要證據 |
|---|---|---|
| B1/B2/B3 與 #96 共存 | PASS（隔離） | 本次 99 項與固定來源 |
| B4 PostgreSQL 17 | NOT_RUN | 已授權非正式環境的真實交易與故障證據 |
| #89 新 Worker 接線 | GAP | 七方法 client、輸出目錄、退出收據與候選 SHA 一致 |
| Worker 終止後恢復 | GAP | 外層監督、健康訊號、退避上限、重啟後阻塞預檢的程序級測試 |
| 真實跨 AI ACK | NOT_VERIFIED | 獨立接收者與事件/attempt/digest 對應證據 |
| 上線與回滾 | NOT_RUN | 固定候選版本、停止與還原步驟、明確部署核准 |

沒有合併任何 PR 或 main；沒有部署、啟用付費 API 或新增雲端資源。新隔離候選不覆寫 GPT2 原工作分支。下一批優先沿用 #89 啟動器做程序級復現與恢復接線，先確認既有機制再補最小缺口。
