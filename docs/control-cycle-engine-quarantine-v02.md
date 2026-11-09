# 第一大腦控制循環 V0.2：先變更引擎、後寫入事件帳的失敗隔離

狀態：`ISOLATED_DRAFT / HOLD / IN_MEMORY_ONLY / NOT_DEPLOYED`。

## 已證實風險
PR #133 的 `registerSource / registerGap / reviseGap / compose` 在事件記錄 `append()` 之前，已改變共享的 V1.6 in-memory engine。若兩個呼叫並行使用同一個有限事件日誌，可能已註冊來源、缺口或合成結果，而事件版本／容量導致其中一筆 append 失敗。使用者可收到 blocked，卻仍可讀引擎未能證實記錄的結果。

## 本次風險緩解（不是完整原子交易）
- 若 engine 已返回 `registered/reused/revised/created/created_partial`，但相應事件帳 append 失敗，保守將整個共享 engine 標為 `engine_quarantined:true`。
- 禁止後續 `registerSource`、`registerGap`、`reviseGap`、`compose`、`readComposition`、`planExpansion` 使用可能未記錄的引擎，統一返回 `ENGINE_STATE_QUARANTINED`；本地 control event 歷史仍可稽核。
- `stats()` 明示 `recovery: RESTART_OR_RECONCILIATION_REQUIRED`、`auto_recovered:false`。程式不偽稱已回滾、不清除原始歷史，也不自動解隔離。
- 仍允許追加普通的控制事件；有剩餘事件容量時，`STOP` 可標本地停止，永遠 `remote_stop_confirmed:false`。容量已滿就 `blocked`，不能假報遠端已停。
- 引擎的底層未記錄狀態**仍可能殘存在記憶體內**，只是阻止經控制循環接口讀取與沿用；跨程序持久交易、分散式 CAS、復原及跨服務權限完全未完成。

## 正反測試
- 純合成 Node 測試 `tests/control-cycle-engine-quarantine.test.mjs` Q01–Q06：來源與缺口同時註冊，journal 容量競爭，失敗後讀取/重用禁止、歷史仍可驗證、普通組合不受損、本地 STOP 語義及先行阻擋不觸發假隔離。
- 初始 RED：[Actions #42610370825](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42610370825)，原程式增加測試後 **173 total / 167 PASS / 6 FAIL**。
- 第一輪補丁 [#42610491842](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42610491842) **172 PASS / 1 FAIL**。剩餘 Q05 是測試錯誤假設：有空餘日誌容量時 STOP 可成功標示「本地停止」，不能強制期待它失敗；已保留記錄並修正測試，並非降低產品安全限制。
- 第二輪 [#42610585955](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42610585955) 同 HEAD `476d0fb9bb54fe893cbc1cda282cbab653c380ac` **173/173 PASS**、0 fail、0 skip、`ISOLATED_ONLY` 檢查通過。
- GitHub runner Node22、read-only workflow、合成資料，非正式資產/金鑰/資料庫。

## 仍待完成的正式 Gate
1. 引擎與事件帳的**真正原子提交**或持久交易／Outbox；此時先做 fail closed 保護，不聲稱已根治。
2. 崩潰後不可再信任同一權威歷史；完整備份、恢復、防分支以及持久時鐘／來源 ID 驗證。
3. 同 SHA 跨 #133→#134→#135→#139 的契約與整合負測；單一 PR 的合成成功不能替代。
4. BOT③ 獨立身份審查；真環境及使用者一次集中批准。不涉及 #41 GPT①↔GPT② 真 ACK 的另一條工程工作。

無 main 合併、無部署、無憑證改動、無私人記憶／實盤操作。
