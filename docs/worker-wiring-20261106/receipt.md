# 新版 Worker 接線收據（2026-11-06）

狀態：ISOLATED_MOCK_WIRING_PASS；不是生產上線通過。

## 固定來源
- Worker/API/PG 候選父版本：775ad493a1e770a9e82c4b5a64c1396c9f212c62。
- #89 FileStore/config/token/mock executor：34d5f702f51070905e951822eb8644d7e3196c9e。
- 程序退出修正來源：aa7763d70530345746efe02ea6d025fabeff9f37。

## 修改
- local-client 映射 receive/intent/authorize/execute/ack/fail/report/status，每方法指定認證 scope，沒有廣泛權限 fallback。
- config 載入同一 checkout 的 api，避免舊 queue-wt pin 與新 worker 錯位。沒有更動 #89 原分支、工作流或 evidence。
- FileStore 增加 intent/authorize/outcome report；執行前必須有 intent。過期 leased/executed 在下次 lease 掃描轉 blocked；未知外部結果 fail 不再重排。撤權後可保存證據，但仍綁定 endpoint/attempt/digest，重播不得改內容。
- MOCK receipt 改為 bounded synthetic reference，結果保留 MOCK 標記與內容 hash。
- 保留 Worker 死亡時關閉 HTTP 與非零退出修正。

## 實測
命令：`node --test tests/mainbrain-*.test.cjs tests/testenv-new-worker-wiring.test.cjs tests/testenv-wired-process.test.cjs`

109 PASS / 0 FAIL / 0 SKIP。
新增 8 個認證/持久化接線測試：完整 ACK 與讀回、ACK 回應遺失、ACK 提交前失敗、過期租約重啟隔離、撤權阻止執行但容許證據、report 重播/偽造、preflight retry、缺 intent/未支援分頁拒絕。
新增 1 個真實子程序 HTTP 測試：實際 server + HMAC + FileStore + 新 Worker + MOCK executor，HTTP send/status 到 ack_received，SIGTERM 退出 0、移除 runtime，再啟動同一資料目錄，attempt 與成本紀錄仍各 1，MOCK 花費 0。

## 限制與下一步
- FileStore 為隔離 adapter，未驗證 PostgreSQL 交易/鎖/併發。沿用原 JSON lock，不作多主機/生產使用。
- FileStore 最多讀回 50 筆並明示截斷；分頁/指定 report 查詢明確 BAD_REQUEST，不假裝已相容。B2 完整實作仍在 PgStore。
- PORT=0 僅用於測試，測試透過 IPC 取得實際埠；一般配置預設 18765。
- 過期租約掃描是下次 receive 的恢復預檢，未授權解封 blocked；未驗證 SIGKILL 時 JSON lock 的復原。
- 自動 supervisor、常駐排程與回滾演練尚未接通。可偵測 Worker 死亡不等於已自動恢復。
- B4 真實 PostgreSQL 與獨立跨 AI ACK 仍 NOT_RUN/NOT_VERIFIED。
- 未部署、未合併 main、未改 GPT2 工作分支、未新增付費資源或呼叫付費模型。
