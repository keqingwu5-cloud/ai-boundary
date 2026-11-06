# L2 / L3 推進收據與下一步（2026-11-06）

父版本：72e0683e685c6a6e7277c47d49fb1c258027d4f1。原 #48/#89 未合併；本候選不覆寫其分支。

## L2：有限恢復候選
新增前景 supervisor，預設初次啟動加最多 3 次重啟，退避 1/2/4 秒、上限 30 秒。未安裝常駐服務，未建立排程。
啟動命令（僅隔離 MOCK）：`node testenv/loop/supervisor.cjs`。
SIGINT/SIGTERM 取消重啟、轉送停止給子程序，2 秒仍未結束則 SIGKILL。子程序 stdout/stderr 保存於資料目錄 supervisor-child.log；supervisor 事件輸出 stderr。
每次啟動先預檢：store.lock、損壞資料、未知事件狀態、無效 lease、存活 runtime 均阻擋。supervisor.lock 防止同目錄兩個 supervisor；不自動刪除其他程序或不明來源鎖檔。停止/達上限後釋放自己持有的 supervisor.lock。
預檢本身唯讀，恢復後的 FileStore receive 將過期 leased/executed 隔離為 blocked，沒有解封或重派未知結果。

8 項 supervisor 測試通過，包含真實 server SIGKILL 後由 supervisor 重啟；不確定租約仍 blocked、attempt 保持 1、沒有 MOCK 執行或成本紀錄。
整合命令：`node --test tests/mainbrain-*.test.cjs tests/testenv-new-worker-wiring.test.cjs tests/testenv-wired-process.test.cjs tests/testenv-supervisor.test.cjs`。
結果：117 PASS / 0 FAIL / 0 SKIP。這不是 #89 原有 4 項目錄隔離測試或完整儲存庫驗收；各證據範圍分開。

## L3：已確認的真實隔離庫
專案 first-brain-r03-postgres-isolated-20261104，ref ukpandnmxdyvozjuhhnw，東京 ap-northeast-1，ACTIVE_HEALTHY；SQL 讀回 PostgreSQL 17.11。
因此先前「未確認有可用隔離庫」已過時。但本機 Node pg client 的連線與 B4 交易/故障測試仍未完成；管理 SQL 工具能連線不等於 Worker runtime 已接通。

本輪依使用者指示做一筆最小儲存探針：在既有 mainbrain_api.events 插入 synthetic blocked event，再用獨立 SQL 請求讀回。未新增 schema、授權或金鑰，未啟動外部模型。
事件：L3-READBACK-20261106-0555d788-abea-4a44-b5f1-d01c5cd5487c。
交易識別 xmin：1248；寫入時間 2026-11-06T02:37:42.766682Z；獨立讀回 2026-11-06T02:37:50.192062Z。
資料庫重新計算 probe 字串 SHA-256 與儲存 digest 一致；non_dispatchable=true、attempt_count=0、grant_id=null、ACK receipts=0。保留此單筆作為稽核樣本，沒有刪除既有資料。
結果：DB_WRITE_READBACK_PASS；不是跨 AI ACK、不是 #48 Worker + PgStore 的端到端通過。

安全預檢：7 張 mainbrain_api 表 RLS=false；實際權限查詢顯示 anon/authenticated 都沒有 schema USAGE，也沒有各表 SELECT/INSERT/UPDATE/DELETE 權限。工具的泛用「所有表公開」警告不能取代權限核對。未自行修改 RLS；後續開放 Data API 或改角色權限前必須重審。

## 更新後三個切片
| 切片 | 本輪狀態 | 下一個必要證據 |
|---|---|---|
| 外層恢復 | 本機 bounded supervisor + 真實子程序恢復 PASS | SIGKILL 持鎖斷點、部署目標常駐服務與停止/回滾驗收 |
| 新舊整合 | 同 checkout API/Worker + 認證 FileStore + HTTP MOCK PASS | #89 原目錄隔離載具在同一固定候選 SHA 跑測；PgStore 實際接線 |
| DB/ACK | 真實 DB 單筆寫讀 PASS；跨 AI ACK 未驗證 | 受限測試 runtime 透過真實 PgStore 執行；獨立接收方綁定 event/attempt/digest ACK |

不加 GitHub cron 取代服務監督：本候選只處理程序恢復。真正常駐與排程需按部署目標整合，尚未啟用。沒有合併 main、部署、付費模型請求或新增雲端資源。
