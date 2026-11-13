# R02：本機啟動不得恢復已停止授權

日期：2026-11-13（Asia/Taipei）。接續 #166 R02；不是新母任務，也不修改 R04 S0/S1 的既有執行者分工。

## 行為與改動

舊版 `ensureBootstrapGrant` 排除 stopped/revoked 後，用固定 ID 重建 grant；FileStore 的 createGrant 允許覆寫，因此重啟會清除停止及撤銷標記。本次在既有 localhost MOCK 程序實際重現兩種標記丟失，並非正式服務事故。

- server：固定 bootstrap 記錄存在時保留原件；同 task 已有授權歷史時也不自動補發。
- FileStore：相同 grant_id 再次建立回 EVENT_CONFLICT，不覆寫歷史。這是 createGrant 契約收緊；依賴重複 ID 作更新的呼叫端須改為獨立、明確的新授權。本次未對所有呼叫端做整合驗收。
- 未停止的正常授權仍可執行；STOP-only、revoke-only、expired-only 分開測試。顯式新 ID 的合成授權可恢復合法工作，原停止記錄不被改寫。

## 固定來源與重現

- 主程式：d2ec331ea4fa68d5a2713f12f5d4706b8effb21a。
- 既有 queue dependency：a99f48a1cf3a848ef770b77701bf1e6283f11bad。
- 取得 11 個原始檔案後逐一重算 Git blob SHA 相符，才修改 server/file-store。
- Node v24.22.1；Python 3.12；只綁 127.0.0.1:19873；執行完終止所有本次建立的服務。
- 同倉庫 queue SHA 的 `api/auth-adapter.cjs`、`api/http-server.cjs`、`api/mainbrain-api.cjs`、`api/polling-worker-candidate.cjs` 須原樣放進 `testenv/queue-wt/api/`。這是既有外部 worktree 相依，不新造 queue；不可默默改用最新 HEAD。
- 從候選根目錄執行：`python3 testenv/loop/r02-restart-check.py`。輸出至根目錄 evidence；僅合成資料。執行前確保 19873 未被其他服務占用。

## 實測範圍

三筆 HTTP 提交 → 原 worker 模擬執行 → 精確結果讀回 → 終止程序 → 新程序從磁碟讀回相同三筆；STOP-only/revoke-only 重啟保留且新提交 403；重複 grant ID 拒絕、原記錄不變；明確新 grant ID 正向可執行；expired-only 不續期且提交被拒。

結果檔中 16 筆為操作／檢查紀錄，不是 16 個彼此獨立的完整測試。預期拒絕的 submit exit=1 是正確結果。baseline 是未改程式的先行診斷；after 是候選完整腳本結果，兩者範圍不完全相同，不能宣稱完整測試集 RED→GREEN。

## 未驗與交付邊界

FileStore 的 stale-lock 接管、雙程序競態、舊 Worker lease、PgStore、真 API、真 AI 身份、瀏覽器資料保存、正式部署與獨立非作者驗收均不由本結果證明。此修正只封住已重現的 bootstrap/覆寫路徑，R02 尚非全面結案。API/模型零呼叫；MOCK 帳本的 0 不是雲端報價。

需工程審查確認 createGrant 的契約變更與完整 R02 相依後再整合。main 未改、未部署、未建立常駐 BOT。回退候選時只還原程式；不得抹除停止記錄來讓任務通過。
