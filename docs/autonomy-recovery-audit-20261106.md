# 自主運作治理收據 B：恢復入口與版本相容性
日期：2026-11-06（Asia/Taipei）
狀態：SOURCE_AUDIT_COMPLETE / TARGETED_LOCAL_CHECKS_4_PASS / FULL_INTEGRATION_NOT_RUN。
本檔僅記錄研究與修補設計；不變更產品碼、main、部署、費用或權限，不構成跨 AI 已接收的證明。

## 固定基線
- main: d2ec331ea4fa68d5a2713f12f5d4706b8effb21a
- PR #89: 34d5f702f51070905e951822eb8644d7e3196c9e
- PR #48: 6102e523aef88aeed1d6327c1f196181ab37de2f
- #89 workflow 的 queue pin: a99f48a1cf3a848ef770b77701bf1e6283f11bad
2026-11-06 重讀 PR metadata，#48/#89 head 與上述一致，兩者仍 open、unmerged。
研究範圍是這三棵完整（truncated=false）repository tree，以及以下對應原始檔；不涵蓋其他分支、外部主機或控制台配置。

## A 收據校正
1. 四項目錄測試只證明指定測例通過，不保證所有產出永不覆寫或污染。
2. receive() rejection 會使 worker 迴圈退出，但不是完整 circuit breaker，也不能排除其他路徑的 API 額度風險。
3. workflow_dispatch 是手動觸發宣告，不是常駐入口；schedule 即使存在也不等於常駐服務。本輪沒有啟動排程。

## 恢復機制盤點
|來源|查到的機制|範圍與缺口|
|---|---|---|
|main、#89 的 .github/workflows/f05-testenv-mock.yml|pull_request|無 schedule / workflow_run / workflow_dispatch|
|#48 handoff-contract-ci.yml、mainbrain-api-candidate.yml|pull_request + workflow_dispatch|只跑測試；不證明候選分支可直接手動觸發或有常駐服務|
|#48 handoff-contract-tests.yml|pull_request + 指定分支 push|只跑測試|
|#89 testenv/loop/start.sh|nohup 啟動 server；PID 檢查；啟動後 0.3 秒確認存活|不是持續 supervisor，未見自動重啟或 resume pre-check|
|#89 testenv/loop/server.cjs|catch worker rejection，console.error，process.exitCode=1|錯誤路徑沒有 server.close / restart；HTTP listening handle 可能保持程序存活，PID 存活不代表 worker 健康。此項是來源判讀，完整子程序故障注入 NOT_RUN|
|#48 api/lease-watchdog-candidate.cjs|呼叫 store.sweepExpired，回報 inbox_only_not_pushed|能隔離到期任務；不重啟 worker、不重跑任務、不含真 scheduler 或已送達通知|
|上述 tree 的檔名清冊|未見 package.json、PM2/systemd 或明確 supervisor 配置|不能據此斷言外部主機沒有 supervisor|

## 三項介面對照
|介面|舊 pin|#48 最新|結論|
|---|---|---|---|
|client 必需方法|receive/execute/ack/fail|另必需 intent/authorize/report；status 可選|#89 createLocalClient 只有四項；直接換新版 worker 在建構時就會拋 TypeError，已用合成 client 重現|
|task 輸入|event/task/attempt/payload/version|另要求 payload_digest，提供 execution_idempotency_key；新增 prepareTask|必須調整替身與契約，不是補環境變數即可|
|receive 失敗|在內層 try/catch 前拋出|相同|兩版都沒有 worker logger/fail receipt；錯誤交給 caller。函式不直接決定 OS exit code|
|成功與不確定結果|processed / failed_attempt|新增 processed_readback / reconciliation_required；log action 有變更|consumer 不可只識別舊狀態|
|目錄契約|worker 本身不直接寫檔|仍透過 logger / client / performTask|run-dir 測試不是 worker I/O 相容性證明|

## Store 狀態與恢復
- receive 失敗不能一律判 FAILED/BLOCKED。若 lease 根本未提交，可仍 queued；若提交後回應遺失，可已 leased。worker 在此路徑未自行呼叫 fail，必須讀回資料庫判定。
- #89 FileStore lease 會把到期 leased 任務納入重新領取候選（仍有 grant / 次數等檢查）。
- #48 PgStore reapExpired 會將到期 leased/executed 改為 blocked，保留 attempt 並記錄 outcome unknown。
- 新 PgStore 在已有 external_intent 或 reconciliation_required 時隔離，不直接重排。
- 因此 FileStore 不是新版 PgStore 的等價替身，不能用舊 lease reclaim 測試聲稱新版恢復通過。
- 新 worker 的 evidence 字串檢查與 synthetic receipt pointer 不等於可信 M2M 身分/ACK 已驗證；worker 本身未建立 live PG 連線或執行 PG 預檢。

## 已完成的四項本機合成檢查
在執行環境停止可用前，node --test compat.test.cjs 實際輸出 tests 4 / pass 4 / fail 0：
1. 舊四方法 client 被舊 worker 接受、被新 worker 拒絕。
2. 舊 worker receive rejection：fail=0、logger=0、performTask=0。
3. 新 worker receive rejection：fail=0、logger=0、performTask=0。
4. watchdog runOnce 只呼叫一次 sweep，回傳 checked / quarantined=2 / inbox_only_not_pushed。
這些是範圍有限的契約反例，不是完整整合通過。未呼叫付費模型 API。
本機原始檔是固定版本的隔離副本，不是完整 git checkout；測試完整逐字輸出尚未附在本 Git commit。
本輪接續時執行工具回覆 No usable execution environment is available，故新增服務存活故障注入與完整整合均 NOT_RUN。

## 最小修補設計（尚未實作）
1. 先在外層記錄 worker_failed、錯誤分類、最後進展及待對帳狀態，讓 worker 健康與 HTTP/PID 健康分開。
2. 若採程序退出策略，需設計停止接新工作、關閉 server、限時退出及非零退出碼；不能直接沿用目前 shutdown 的 process.exit(0)，以免遮蔽故障。
3. 若採同程序恢復，需有限重試/退避/停止處理；receive 回應遺失先處理 lease 不確定性，外部結果未知一律先對帳，不以重啟當作授權重跑。
4. 保留 #89 舊 pin 基準，另建新版整合候選；補齊 client intent/authorize/report、相關 API route、scope 與 FileStore 狀態語義，禁止使用空函式或直接 authorized=true 假造通過。
5. 先做精簡完整鏈驗證，再接持續執行；不是先加 cron。

## 下一批必要驗證
- 真實子程序：注入 receive 失敗，分別觀察 HTTP、worker、PID、runtime.json 與退出碼。
- 新舊 pin：相同合成任務，記錄 I/O、狀態轉移、回執與錯誤差異。
- lease 已提交但回應遺失：重啟後不得無證據重跑。
- 授權撤銷、STOP、結果未知與重試上限：應停止或隔離，不可掩蓋為健康。
- live PG、外部 supervisor、可信 M2M ACK、正式部署：NOT_RUN。

## 原始來源
https://github.com/keqingwu5-cloud/ai-boundary/blob/34d5f702f51070905e951822eb8644d7e3196c9e/testenv/loop/server.cjs
https://github.com/keqingwu5-cloud/ai-boundary/blob/34d5f702f51070905e951822eb8644d7e3196c9e/testenv/loop/start.sh
https://github.com/keqingwu5-cloud/ai-boundary/blob/34d5f702f51070905e951822eb8644d7e3196c9e/testenv/loop/file-store.cjs
https://github.com/keqingwu5-cloud/ai-boundary/blob/6102e523aef88aeed1d6327c1f196181ab37de2f/api/polling-worker-candidate.cjs
https://github.com/keqingwu5-cloud/ai-boundary/blob/6102e523aef88aeed1d6327c1f196181ab37de2f/api/pg-store-candidate.cjs
https://github.com/keqingwu5-cloud/ai-boundary/blob/6102e523aef88aeed1d6327c1f196181ab37de2f/api/lease-watchdog-candidate.cjs
