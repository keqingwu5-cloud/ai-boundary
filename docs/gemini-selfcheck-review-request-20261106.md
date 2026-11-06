
八、Gemini 獨立審核請求：自動化一致性自查（2026-11-06）
request_id: GEMINI-AUTONOMY-SELFCHECK-20261106-001
state: PUBLISHED_NOT_ACKED
目的：使用者要求「先執行自查，再給 Gemini 審核」。這是針對固定候選的獨立反證，不是請同意既有結論。寫入不表示已喚醒 Gemini。

審查基準
工程：4b4fddb617ccdf13c5f48bd7887526decdfb5e96
總規格及固定自查規則：https://github.com/keqingwu5-cloud/ai-boundary/blob/c72104cb2162e92ff0c485043c3f1e864705d951/docs/first-brain-unified-autonomy-spec-v1.md
逆向缺口：https://github.com/keqingwu5-cloud/ai-boundary/blob/e233e143cc2cf3a71560c3b06bdf62a57f563fff/docs/autonomy-reverse-gap-review-20261106.md
實作入口：https://github.com/keqingwu5-cloud/ai-boundary/tree/4b4fddb617ccdf13c5f48bd7887526decdfb5e96/testenv/loop

本輪實際執行
1. 本機再跑 node --test tests/mainbrain-*.test.cjs tests/testenv-new-worker-wiring.test.cjs tests/testenv-wired-process.test.cjs tests/testenv-supervisor.test.cjs：117 PASS、0 FAIL、0 SKIP。不是 GitHub CI 或生產結果。
2. 用 VM 執行 server.cjs 原始 ensureBootstrapGrant 函式，配真實隔離 FileStore；沒有外部模型或正式資料。
重現輸出：
stopped → after_stopped=false、after_revoked=false、after_expired=false。
revoked → after_stopped=false、after_revoked=false、after_expired=false。
expired → after_stopped=false、after_revoked=false、after_expired=true。

已重現問題
ensureBootstrapGrant 尋找 task_id=TASK-LOCAL-E2E 且未 stopped/revoked 的 grant；找不到即以固定 grant-local-e2e-001 建立。FileStore.createGrant 直接 db.grants[grant_id]=row，因此重啟初始化可能清掉 STOP/撤權；過期 grant 則被直接沿用。
這是函式級重現，不是完整程序重啟新測試；請獨立確認因果與影響範圍。117 項既有測試沒有覆蓋此情境，不能抵銷反例。本輪尚未修程式。

靜態發現（尚未以故障測試全部重現）
A. Worker receive/status/prepareTask/performTask 等等待缺統一 deadline，HTTP client fetch 未設明確 signal/deadline。supervisor 只看 exit，不能判斷卡住。
B. supervisor 遇 store.lock 阻擋，FileStore 卻可按 10 秒鎖齡刪鎖，政策不一致。
C. supervisor.lock 在 finally 移除，SIGKILL 不保證執行；重試 starts 只存在記憶體，重開歸零。
D. 預檢與 spawn 不是同一個原子操作，PID 存活不等於程序身分。
E. aborted_before_dispatch 返回時未結束租約；過期後可能封鎖尚未實際派送的任務。
F. 微型退出收據 writer/validator 未落地；真實 PgStore/Worker、獨立 ACK、常駐部署與回滾未閉環。

證據邊界校正
東京 PG17.11 已有一次真實管理 SQL 探針寫入/獨立讀回；核對的是 probe 字串 SHA-256，不是全 payload，不是 Node pg runtime，不是跨 AI ACK。
RLS 未開啟的 7 表，本輪先前權限查詢顯示 anon/authenticated 沒有 schema USAGE 與表 DML；不要直接推論公開暴露。
原子拆分不表示完全無依賴；沒有模型呼叫不表示總資源成本為零。
M2M 可以有不同可信認證設計，請評估合適方案，不預設唯一解。

請 Gemini 回覆
1. 對上述結論逐項採納／修正／反駁，附固定 SHA、檔案/函式、證據與來源存取程度。
2. 找出我們漏掉的跨模組衝突，尤其 STOP 持久性、鎖 ownership、卡死、重試預算、部分寫入、收據失效。
3. 給出最小修正順序與每項能推翻修正的負例；避免重造既有模組。
4. 區分原始碼實讀、僅本文件摘要、SOURCE_NOT_VERIFIED；無法讀私庫就明說，不能宣稱獨立程式驗證。
5. 結論用 NOT_READY／READY_FOR_ISOLATED_TESTING／其他附範圍判定，不得把審核文字當成部署核准。

邊界：僅審查與在此文件追加回覆；不修改程式、不合併、不部署、不啟動付費 API、不更動權限。本輪預期結論是找缺口，不要求「零問題」。

【Gemini 回覆區｜GEMINI-AUTONOMY-SELFCHECK-20261106-001】
response_status: WAITING_FOR_ACTUAL_REVIEW
請在此新增回覆並保留前文。
