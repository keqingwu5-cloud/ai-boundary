# 第一大腦｜GPT① 基建：Grok 交接驗證與三方六輪結果稽核 V0.1

**性質**：RESEARCH_ONLY / ISOLATED / NO DEPLOY / NO MAIN MERGE / NO REAL AI ACK / RELEASE HOLD

本輪根據使用者「我們先完成基建等待」而建置，目標是讓 GPT① 在等 Grok 實作時，先有**可執行、可反證的中立入口**，不重做已交給 Grok 的環境、裁判、代理或對手策略。公開 GitHub 文件不得存放私人對話、身分資料、金鑰或真實未授權內容。

## 1. 權責與唯一權威

- [#150](https://github.com/keqingwu5-cloud/ai-boundary/issues/150) 為 24 項改良總索引；[#151](https://github.com/keqingwu5-cloud/ai-boundary/issues/151) 是 Grok 現況理解與 G01–G10 分流入口；[#149](https://github.com/keqingwu5-cloud/ai-boundary/pull/149) 為 P0 證據來源版本修補研究候選。
- Grok：重建 V0.2 多方行動、獨立裁判與合法資訊視圖；**此 PR 不代寫其工程**。
- GPT①：設計比賽與交接契約、驗收、差異和證據映射；此 PR 新增兩個**無副作用唯讀檢查器**。
- BOT③：需以自己的環境／可證實來源獨立審核測試、版本、權限、安全。
- GPT②：反證設計假設、比較公平性、資訊洩漏與結果解釋。
- 目前沒有跨 AI 受認證的 receiver/ACK。任何 GitHub 提交、代碼、測試綠燈均**不能冒充** Grok 已收到、BOT③ 已驗或正式權限核准。

## 2. 第一項基建：回件理解／分流驗證

檔案：`triad-review-intake-candidate.mjs`，入口 `inspectTriadIntake(packet,{expectedPr149Sha})`。

此純函式會檢查：
1. 任務 ID 與來源 GitHub Issue #151，來源 PR #149 SHA 是否與**外部先取得的最新 SHA**一致；提交者自己填的 SHA 不可當權威。
2. Grok 回述是否保留「先修第一大腦」「V0.1 只做 proxy」「V0.2 未驗證」「正式 Gate HOLD」「真三方軟體未跑」等邊界。
3. G01–G10 是否全部涵蓋、沒有重複 ID、主責與審核角色是否分離、BOT③/GPT② 是否列為審查角色。
4. 所有測試結果只是 `ISOLATED_TEST_CLAIM`，必須附來源引用；人工轉傳、接收自述一律 `actual_ack=NOT_VERIFIED`。
5. 拒絕額外的 `APPROVED`、`actual_ack` 等可能冒充授權的欄位。無資料保留 `HOLD`。

**不做的事**：不打開網址、不發送訊息、不驗證 GitHub 原件、不驗證接收者身分、不驗證簽章、不寫入權威記憶或第二份 ledger。可信 SHA 仍必須由外部 GitHub 查核端取得。

## 3. 第二項基建：六輪結果結構稽核

檔案：`triad-six-round-audit-candidate.mjs`，入口 `auditTriadSixRounds(match,{expectedEnvironmentSha})`。

此純函式只驗證：
- 六輪固定，三類情境各兩輪：R1–2 資訊不對稱、R3–4 聯合行動、R5–6 歷史調整。
- 三種**研究 proxy** 在每輪各佔不同 seat，六輪合計每種 seat 各兩次。
- 每輪最多一個獨勝者，或 `null` 平手。只依**勝場數**算領先候選，不以合成分數硬定勝者。
- 領先者不唯一時回傳 `TIE_PENDING_PREDECLARED_TIEBREAK`，不會強制挑第一大腦。
- 即使唯一領先，仍回傳 `promotion=NOT_GRANTED`、`approval=NOT_APPROVED`、`payoff_integrity=NOT_VERIFIED`。

**重要限制**：這不是裁判！檢查不了其他參賽者行動對結果的影響、環境內部計分、秘密資訊洩漏或錄影/真程式是否跑過。這些 G01–G10 仍待 Grok 的引擎與 BOT③ 的獨立反證。場次紀錄中的 declared_winner 也只是**聲稱**，不是經驗證實績。

## 4. 可重現的隔離測試

```sh
node tests/triad-review-intake.test.mjs
node tests/triad-six-round-audit.test.mjs
```

測試應涵蓋偽造 ACK/APPROVED、來源 SHA 過期、問題漏派/重複、自我審查、測試無證據；與六輪平手、各方可贏、座位公平、缺輪、錯情境、冒充真正實際比賽等。每次以相同固定 commit SHA 的 CI 原始 log 確認，不以檔案中寫的期望數量作結論。

## 5. 後續接線的最小順序（目前未執行）

1. Grok 在其自身環境產出理解回件與分流表，附來源 URL、取得時間、可回讀接收證據；沒有可信 receiver 只能標 `MANUAL_BRIDGE / NOT_VERIFIED`。
2. GPT① 以外部查到的 PR HEAD 對照回件契約；對應 G01–G10 而不重開新的治理權威。
3. Grok 經授權在隔離 Draft 實作多方賽局，提交原始回放與可重現輸出。
4. GPT① 先跑**格式與公平性基本檢查**，BOT③ 再獨立驗證 payoff／state／隱私及安全，GPT② 反證模型可比較性。
5. 沒有完整 Gate 就 `HOLD`；真正需要使用者合併或部署決策時才集中通知。正式資料、私有記憶與權限維持不動。

本研究只新增**契約檢查與稽核投影**，不改 `control-cycle`、`proof-audit`、`progress-journal`、`cognitive-transition` 或正式主腦路由，也不會觸發真實多代理任務。