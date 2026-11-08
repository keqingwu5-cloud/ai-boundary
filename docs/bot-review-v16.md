# BOT③ 審查交接｜V1.6 原始空白保留（候選）

- 日期 2026-11-08；父版 V1.5 PR #124；下游隔離 Draft PR 待固定 HEAD 核對。
- 本次只在通用 N 元組合底層新增 `gap-aware-composition.mjs` 及其 schema/test/benchmark，不修改 V1.4／V1.5 原碼或正式記憶。
- 結構：`createTypedTransformEngine()` 為底層已知 typed 執行器，本層追蹤原始 `MISSING/UNKNOWN/UNVERIFIED/INTENTIONALLY_OPEN/NOT_APPLICABLE/REDACTED` 六種空白，返回可重用的版本化 partial 引用。
- 核心安全：空白不可自動填；0/false/empty/null 與未提供有區別；帶空白的 quantity_sum 不提供假完整結果；`REDACTED` 統一外部拒絕；經修訂的空白使舊 X/Y stale；刻意空白需要明示選擇，但**仍無真正審批證據**；缺字段與 null 的 record_project fail-closed；無生產寫入與 ACK。
- 特別查核：V1.5 typed read() 只返回變換結果，不返回原始 source；V1.6 用安全來源引用簿補足，不洩漏 payload；`read(X)` 能返回已換算的 typed preview，`X + C` 在完整條件下繼續算。
- 本地回歸：原 V1.4 42 + V1.5 41 + V1.6 新增 55 = 138 PASS（待 CI 核對）。
- 本地 Draft 2020-12 full schema: 5 positive PASS / 4 negative expected rejection；GitHub CI 若沒有安裝完整 validator，只是 JSON 語法及程式測試，不能冒稱全面 Schema 驗證。
- 實際安全/性能限制：沒有可信身份認證、持久化、跨程序快取、真實後端 ACK、原始來源身份證明、Safari/iPad 原設備、授權私資料測試或部署。
- 用戶重點：保留有價值的空白是必要的資訊完備性，不是要求每次用 AI 自動填補。
- BOT 請檢查：隱藏狀態是否可能透過錯誤碼或計時側通道暴露；CAS revision 是否能抵抗跨程序競爭；partial 巢狀循環/容量；同一來源證據重計權；空白改版是否全鏈失效；schema/版本與 v1.5 相容；未知狀態跨系統如何映射；成本與 bootstrap 是否正確；是否意外使用 caller-declared permission 當真實身份。
- 已知停止線：只研究 Draft，不合併 main、不部署、不對記憶權威寫入、不假裝已獲 GPT② 或 BOT③ 獨立 ACK。