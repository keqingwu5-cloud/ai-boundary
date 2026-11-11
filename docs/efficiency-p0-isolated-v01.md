# 第一大腦｜P0 效能效率底座：最小隔離工程 V0.1

## 範圍與授權
- 本分支只包含**純函式研究原型、Node 原生測試與工程說明**；不修改 `app.js`、正式資料、Secrets 或事件觸發器；不啟動 BOT，不發送跨 AI 任務，不呼叫付費 API。
- `ACCEPT_CANDIDATE` 只代表可進入**下一輪隔離排程候選**，不代表 `DELIVERED`、`ACK_RECEIVED`、`REVIEWED`、`MERGED`、`DEPLOYED`。
- 此版本的實測是**本機純函式測試**，不是 GitHub CI、真跨程序儲存、真正 AI 或瀏覽器環境驗收。

## 為什麼先做這個？
我們先降低重複讀取及重複建立任務的風險，再談多 BOT 並行、效能倍數。所有任務需要 `projectId / taskId / kind / sourceRef / sourceRevision / ruleSha / payload`。固定完整 `ruleSha`（已存在於 Git 的規則提交 SHA）是不可省略的先決條件；這個研究原型**不自稱已建立正式規則權威**。

## 可測試的三個能力
1. **增量候選**：同一身份（專案、任務 ID、類型、來源、來源版本、規則 SHA）及內容指紋重複出現時 `DUPLICATE_SKIP`，新來源版本 `ACCEPT_CANDIDATE`。
2. **衝突阻擋**：同身份而 payload 不一致為 `BLOCKED / IDENTITY_PAYLOAD_CONFLICT`；規則 SHA 過期、缺來源或舊 ledger 矛盾則 fail-closed。來源 revision 本身目前由呼叫端提供，**尚未連接外部來源真實驗證器或審查員身分驗證器**。
3. **效能量測**：僅對輸入的任務時長、附證據來源和審查者 ID 的合格結果及已知成本計算合格產出每小時及相對倍數；若基線沒有任何合格成果則倍數未知，不虛報「50 倍」。

## 測試命令
在專案根目錄執行：

```sh
node --test tests/efficiency-core.test.mjs
```

全部使用 Node.js 標準函式庫，不新增 NPM 依存，不修改既有 workflow。

## 相依與後續 Gate
- 對照既有 [#150 需求與 24 項改良](https://github.com/keqingwu5-cloud/ai-boundary/issues/150)、[#160 工程支點](https://github.com/keqingwu5-cloud/ai-boundary/issues/160)、[#41 真 ACK](https://github.com/keqingwu5-cloud/ai-boundary/issues/41)；不新增第二個正式規則或審查帳本。
- **未實作**：真來源版本檢查、持久化任務 ledger/outbox、跨程序去重、並行競態、限額與重試、STOP/撤權、真 BOT 派發、觀察儀表板。現在的 `prior` 只是由呼叫者傳入的快照。
- **安全 Gate**：W001 #161、恢復 #162、跨 AI ACK #41、Safari/iPad 和非作者 BOT③ 驗收均不因本原型通過而解除。
- **下一個最小工作**：將本純函式接入可替換的**合成事件夾具**，測 crash/restart 與持久去重（不接正式端點），再由非作者審查同 SHA 原始測試與反向變異。

`RESEARCH_ONLY / NO_MAIN_MERGE / NO_DEPLOY / NO_REAL_DATA / NO_PAID_API / RELEASE_GATE=HOLD`
