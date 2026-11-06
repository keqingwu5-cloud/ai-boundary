# 第一大腦：最後修正收據（2026-11-06）

狀態：隔離修正通過；尚未完成上線驗收。

## #89 程序生命週期
固定來源：34d5f702f51070905e951822eb8644d7e3196c9e。
修改 testenv/loop/server.cjs：Worker 非預期返回、reject、同步 throw、未由本程序停止觸發的 AbortError 都進入 shutdown。停止即清除 runtime.json、關閉 HTTP，200ms 後強制收尾並以非零狀態退出。SIGINT/SIGTERM 正常退出為 0；停止過程出錯保留 1。重複停止不覆蓋錯誤碼。

程序級測試：真實子程序、TCP listener 與 OS signal；Worker/Store/Auth 以測試替身注入，沒有真實 API 或資料庫。
修正前：7 項中 2 PASS / 5 FAIL，三種 Worker 終止情況在 2.5 秒截止仍存活；同步 throw 留下 stale runtime；停止期間的錯誤被 exit(0) 蓋掉。
修正後：7 PASS / 0 FAIL。命令 `node --test tests/testenv-worker-lifecycle.test.cjs`。

## 整合候選批次清理
父版本：d2888c424518a69c560a676a748e1f07bac44085。
批次異常租約回報原本直接 await report，未使用 B3 cleanup timeout；現複用 runCleanup，首筆掛住時有限等待並繼續其餘租約，最後拒絕而不假報成功。新增測試禁止 intent/provider/ACK，首筆永不返回、第二筆仍回報。
整合測試：`node --test tests/mainbrain-*.test.cjs`：100 PASS / 0 FAIL / 0 SKIP。
逾時只結束本機等待，不保證遠端取消；單批總等待仍與租約數量成比例。

## 尚未通過的邊界
- #89 七方法 client/Store 尚未接上新版 Worker；本修正沒有把舊 FileStore 當作 PgStore 替身。
- 非零退出讓 supervisor 可偵測，但尚未建置或驗證常駐 supervisor/resume。禁止將未知結果任務直接重派。
- B4 真實 PostgreSQL、獨立跨 AI ACK、部署與回滾演練仍 NOT_RUN/NOT_VERIFIED。
- 兩個不同父版本各自保存候選與證據，不代表已端對端整合。沒有修改 main、GPT2 原分支或部署；未呼叫付費模型。
