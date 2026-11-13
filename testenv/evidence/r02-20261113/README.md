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

以下為首輪邊界；後續補驗見下一節。FileStore 的 stale-lock 接管、雙程序競態、舊 Worker lease、PgStore、真 API、真 AI 身份、瀏覽器資料保存、正式部署與獨立非作者驗收均不由本結果證明。此修正只封住已重現的 bootstrap/覆寫路徑，R02 尚非全面結案。API/模型零呼叫；MOCK 帳本的 0 不是雲端報價。

需工程審查確認 createGrant 的契約變更與完整 R02 相依後再整合。main 未改、未部署、未建立常駐 BOT。回退候選時只還原程式；不得抹除停止記錄來讓任務通過。


## 第二輪：呼叫端與舊任務授權邊界

在候選 bf8eeadec4d22d5752261152a38031541ae79fad 上執行，未再改 production code。結果見 followup-run.json；新增可重現腳本 `node --test testenv/loop/r02-grant-boundary.test.cjs`。

- 現有 run-tests：14 PASS、0 FAIL、4 NOT_RUN。risk-tests：10 PASS、0 FAIL、1 BLOCKED、2 NOT_RUN；其中 K1/K2 引用前組，不能相加當作獨立測試數。
- 新增四個聚焦測試全部通過：STOP 與 revoke 各自阻擋舊 lease 的 execute/ack/fail，即使新 grant 已建立並重新開啟 store；新任務可正常完成。已過期 execution 不能借新 grant ACK。八個程序同時建立相同 ID 僅一個成功；STOP 後八次重建全數衝突且原記錄不變。
- 核對本機 server、run-tests、risk-tests 的 createGrant 呼叫，未發現必須覆寫既有 ID 的更新用途；既有迴歸未出現此契約變更造成的失敗。這不是全倉庫所有外部消費者相容保證。
- 既有風險腳本會呼叫 run-tests。以 MOCK、127.0.0.1:19874 與 TESTENV_CI_SKIP_R9=1 執行；R9 因重建目錄沒有歷史 orphan git metadata 而刻意跳過。原摘要中的 CI 字樣不是本次在 GitHub Actions 執行的證據，UNKNOWN SHA 由 source manifest 補足。Supabase INACTIVE 文字是既有測試描述，未重新查遠端狀態。
- 執行後 19873、19874 均無服務監聽；真跨 AI 身份仍 BLOCKED，真 API、RLS、部署仍未驗。

### 下一個整合卡點

#97 固定來源 3962de8b4ab2696b4764b10d802b979b182aa500 的新版 worker 需要 receive/intent/authorize/execute/ack/fail/report；現有本機 loop client 只提供 receive/execute/ack/fail。因此不能只更換 worker 檔案宣稱已接新版。PG store 也沒有這個 FileStore createGrant 方法，本次結果不可外推到 PostgreSQL。下一個整合候選須對齊 client、授權與 intent/reconciliation 契約，再用同一任務驗證結果讀回；沿用原 #166 分工，未重做 R04 S0/S1。

短時間八程序競爭不證明 stale-lock 接管與長時間崩潰恢復。阻擋 store 的完成寫入也不證明已送出的遠端副作用可取消。R02 仍待非作者工程審查，未全面結案。
