# 第一大腦｜效率成本 EC-01 與可信來源讀取器接線｜審查候選 V0.2

日期：2026-11-08（Asia/Taipei）；**僅隔離 Draft、公開 GitHub 唯讀源、無外部模型、無資料庫/正式記憶/部署更動。**

## 版本與來源
- 上游 GitHub 來源讀取：PR #105/#108 於 PR #110 固定 HEAD `b466118a5e4fcb7af05d2083f247a5b2a74fde97` 的 `task-locator-github-adapter.cjs`、`task-source-summary.cjs`、`source-to-task-candidate.cjs`。
- 效率核心：PR #117 修補後固定 SHA `ac9204c07fec00e2c3c930a85e17a88f843d652a` 的 `efficiency-cost-preflight.cjs` 與 28 項測試，兩個檔案按原 Git blob 原樣複製，不另起同功能。
- 本分支在 PR #110 head 上叠加來源橋與 A/B，PR 請以 #110 分支作 base，禁止解讀為 `main` 的獨立可部署完工。
- 同一 HEAD 的 CI、原始 job logs 才能認定「本次組合測試通過」，不能拼接不同 PR 的綠燈。

## 接線實際範圍
`inspectGitHubAndPlan` 調用既有 `discoverGitHub`，保留完整性、GitHub issue/comment 頁數、前後版本和 comment drift 的既有檢查。`evaluateSourceSnapshot` 產生來源 content digest，`prepareSourceHandoff` 以 existing source-only contract 再確認 repo/issue/comment canonical URL。橋接另比對 issue/comment revision metadata，產生 `revisionFingerprint`。若任何來源不完整、已核對 issue 不在唯一 scope、版本缺失，回 `BLOCK_SOURCE`，而非沿用舊快取。

預設風險 `high`，只輸出 `REVIEW_REQUIRED`；只有調用端明確提供 `risk:low` 的研究候選才可能產生 `TARGETED_VERIFY` 或 `REUSE_VERIFIED`。**目前沒有可信政策身份/簽章驗證層**；`prior.reviewed` 仍是 caller-supplied 的模擬先前審核，不可直接視為真正權威。此接口無自行派工/模型執行/外部寫入能力。

## 成本分母與測試結果的正確解釋
- 檢查 GitHub 完整來源時仍必須實際呼叫 `getIssue`/`getComments`；本版 `sourceReadsSkipped:0`。讀取器函式呼叫 ≠ HTTP request（分頁可能更多），所以後者標為 NOT_MEASURED。
- 10/100/1,000 筆合成記錄 A/B，**baseline 對全部記錄模擬重做 review；candidate 只對變動或不能重用的記錄 review**，每 10 筆恰有 1 筆合成變動。對比 review-unit count、模擬輸出是否一致、已知變動 false negatives。**不是**真實 GPT token、模型品質、費用或實際時間節省。時間只為當次 CPU 診斷。
- 本模組沒有真正分析模型、provider 計量/帳單，也沒有存取私人研究資料，並不聲稱成本下降 90%。
- 未證明 source reviewer 身分／權威、GitHub API request/latency 真實對照、模型輸入與輸出 token、價格政策、質量盲測及研究錯誤漏判。

## 下一階段 Gate
1. 確認 source reader scope、權威目的版本、審核者／可信 attestation；過期/撤權時 cache 必須失效。
2. 將差異閱讀流程接到允許唯讀研究的**真實量測環境**，比較同來源集與同判準下的 full vs selective 的 GitHub HTTP requests、token、品質、人工修復量和延遲；模型測試必須另取得授權與成本門檻。
3. 驗收高風險與矛盾源的抽樣反證：即使指紋相同，疑似污染、來源撤回／拒絕、重要反例、規則變更不得自動重用。
4. 同 SHA 完整隔離 CI、原始負測、獨立 reviewer、可恢復和 STOP/回退方案。
5. 效益未證、或未獲使用者同意，不合併 main、不部署、不啟用付費 API。不將此候選替代 #41 真 GPT② ACK、真 PG／Safari 和安全治理 Gate。

狀態：`SOURCE_BRIDGE_CANDIDATE / SYNTHETIC_AB_CANDIDATE / REAL_TOKEN_SAVINGS_UNKNOWN / INDEPENDENT_REVIEW_PENDING / DEPLOY_NO_GO`。
