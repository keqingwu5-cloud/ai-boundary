# 本機 Worker 共用授權呼叫端候選

接續 #166 R03 整合接口分析，依賴 #168 的固定候選 de83d07f4ec6d7cc616071b7e8307737950c0e2c。這是隔離候選，不改 R04 S0/S1，不另派工。未合併 main、未部署、未建立常駐服務。

## 改動與實際效果

把 server 內嵌的 client 抽成 local-worker-client.cjs，依呼叫取得最小 scope。明確選 legacy 或 intent-v1；缺少必要 API 方法時初始化拒絕。status 使用 params，其他動作使用 body；錯誤原樣傳回，沒有假成功或授權 fallback。server 仍明確使用 legacy 和原 queue，不偷偷切換新版依賴。

新版接口包含 intent/authorize/report/status。execute 不再順便索取 tasks:ack；report 只用 tasks:report，status 只用 tasks:status。授權身份仍由 server-side HMAC adapter 決定，不能由 body 指定 endpoint 越權。

## 實測

5/5 focused tests：固定 #97 的真實 worker/API 程式＋既有 HMAC adapter＋測試用 secret＋記錄呼叫的 store 替身。證明順序、身份、scope、拒絕派工時零 executor 呼叫、禁止以 execute scope 冒充 report，以及新 API 遇到不完整 store 不會假成功。此處的真實程式不代表真 AI 或真遠端服務。

抽取 client 影響既有 loop，因此重跑既有 risk-tests（內含 run-tests）：suite 14 PASS/4 NOT_RUN；risk 10 PASS/1 BLOCKED/2 NOT_RUN，零 FAIL。兩組有重疊，不合計獨立測試數。R9 刻意跳過：本機來源重建沒有歷史 orphan git metadata；原輸出的 CI 文句不是本次 CI 證據。來源 blob 與候選 SHA256 見 result.json。兩個本機埠執行後關閉。

## 重現

先依 #168 README 建立原 queue-wt/api 四個固定來源檔案（a99f48a1cf3a848ef770b77701bf1e6283f11bad）。另將同倉庫 3962de8b4ab2696b4764b10d802b979b182aa500 的 api/mainbrain-api.cjs 與 api/polling-worker-candidate.cjs 原樣放入暫存目錄；核對 result.json 的 Git blob SHA。

```
CANDIDATE_API=/absolute/path/mainbrain-api.cjs CANDIDATE_WORKER=/absolute/path/polling-worker-candidate.cjs node --test testenv/loop/local-worker-client.test.cjs
TESTENV_HOST=127.0.0.1 TESTENV_PORT=19874 TESTENV_EXECUTOR_MODE=MOCK TESTENV_CI_SKIP_R9=1 node testenv/loop/risk-tests.cjs
```

第二條執行前確認埠未占用、沒有自己的既有 loop server；原 stop.sh 會讀取 testenv/loop/data/server.pid。不要對使用中的環境執行。

## 尚未接通的持久化邊界

| 新 API 動作 | 必要 store 方法 | 本機 FileStore |
|---|---|---|
| intent | markExternalIntent | 缺少 |
| authorize | authorizeDispatch | 缺少 |
| report | recordOutcome | 缺少 |

不能只把三個方法補成空操作。#97 PG 候選已有另一套意圖保存、結果未知隔離和證據回報契約，須沿原整合線核對完整 store/schema/executor，不把舊 FileStore 的普通重試當成新版 reconciliation。

下個實作選擇以原 #97 PG stack 為優先核對對象，確認既有隔離環境與 executor 的結果持久化方式後再組裝。此候選只完成 client 接口，未驗 PG、真來源、跨 AI ACK、遠端副作用停止或獨立非作者驗收。RELEASE_GATE=HOLD。
