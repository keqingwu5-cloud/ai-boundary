# R7｜以「正在執行的任務」為基準的觀測契約（2026-10-27）

> CANDIDATE / G1 / NOT PRODUCTION / NOT INDEPENDENT G2。本次依使用者新指示：基準除了版本與時間，應納入「系統正在做什麼、為何做、預期與禁止什麼」，然後持續隔離驗證。不授權 main merge、正式 Notion token、正式資料庫／記憶修改、部署、調整舊每小時監控。

## 問題成因與改造目的

R1–R6 的快照使用上一輪 `last_checked_at`、`seen[]`、`main_sha` 做機械差異偵測。這只回答「觀測到什麼版本或事件」，**沒有回答「當時正在執行哪一項工作、應該發生哪種結果」**。因此會把：合法發布阻擋、功能測試真正失敗、使用者未批准、獨立 GPT② 尚未 ACK、預期 Notion 未配置等不同狀況混在同類警訊中。

R7 不取代這份技術差異基線；在它旁邊加一層可查證的「任務目的＋操作階段＋來源現況＋授權界線」基準。

## 基準五個面向與責任歸屬

| 基準面向 | 原始證據 | 這一版能確認的事 | 不能推論的事 |
| --- | --- | --- | --- |
| 作業目的（為何） | 使用者已確認的監控候選限制、Issue #31 草稿交接 | 此候選只讀發現新任務／版本／阻塞／聲稱 ACK | Issue #31 草稿自動變正式有效規章 |
| 工作現況（正在做什麼） | Runner `GITHUB_EVENT_NAME`、候選 head branch、GitHub PR #66 | 本輪是獨立 PR CI 或候選手動測試 | PR 綠燈即正式 15 分鐘監控已運作 |
| 任務對象（哪件工作） | GitHub 原始 Issues #31/#36/#41/#54/#56 與 PR #66 | 對象是否可讀、open/closed、更新時間 | closed 就已完成、留言存在即 GPT② 收到或批准 |
| 前後證據（做出了什麼） | GitHub 活動類型／main SHA、現有 checkpoint、report artifact | 本輪觀測事件類別、數量、去重狀態、資料來源配置 | 「數量是 0」就表示整個系統沒有錯誤或漏報 |
| 權限／停止（不應做什麼） | 已接收的使用者限制、候選 workflow | main 合併、私人記憶／正式 DB／憑證、跨端 ACK 均不在候選許可範圍內 | 靜態 manifest 或 CI 成功是 owner release 授權 |

## R7 工程設計（仍屬候選）

- `scripts/monitor-operational-baseline.cjs`：把人類允許的候選工作目的與禁止事項寫成固定可讀的 `POLICY`，並每輪唯讀查詢上述 6 個**已存在**的 GitHub 任務錨點。只存 ID、角色、網址、GitHub open/closed、最近更新時間。**絕不存 Issue 原始內容、私人 Notion、驗證憑證**。
- `scripts/monitor-15min-candidate.cjs`：將該情境快照併入既有 `monitor-output/report.json` 的 `operational_baseline`，不另造第二份權威資料庫或任務列表。
- `task_contract` 是此隔離候選的規格，不是全專案生效的規章、也不是 owner 授權憑據。`task_anchors` 的 `open/closed` 是 GitHub 機械狀態，不是工作完成或 G2 交接。
- `intent_fingerprint` 對公開候選目的＋錨點角色做 SHA-256（**不是內容保密機制**）；首次設定記 `FIRST_PIN`，下輪 `MATCH`。如候選目的或對象改變，記 `POLICY_CHANGED_REVIEW`、要求重新 G0 核對並使 workflow 回傳需人工審查，不會自行將新的目的設定為已批准。原 `seen` 與 `last_checked_at` 仍保留。
- `stage_match`：只接受候選來源分支上的 `pull_request` 或 `workflow_dispatch` 作為目前許可的執行階段；任何試圖在 main 定期啟用的觀測都明確不符合此候選基準。即使收到使用者正式合併核准，未來也應用另一版核准過的契約升級，而不能沿用候選狀態自稱已批准。
- `source_scope_match`：本公開候選 Notion 必須 `NOT_CONFIGURED`，GitHub 來源必須實讀成功；ChatGPT 既有每小時 GitHub+Notion 任務維持原狀。
- `evidence_continuity_verified`：只有 `checkpoint: RESTORED` 才成立；首輪/失效需明確呈現，不把乾淨測試當作長期完整性。
- 用 `observed_activity_types` 說明觀測到 Issues／PR／留言／CI／commit 哪些類別；不是任何 GPT 執行端的工作計時、目的端收件證明或完整工作進度計算。

## 新增反證的驗收內容

`tests/monitor-operational-baseline.test.cjs` 至少涵蓋：執行目的與實際階段區分、缺失錨點 fail-close、Issue／PR 類型錯誤、GitHub 偽造來源拒絕、Issue closed 不代表完成、PR 事件和 main schedule 不能混用、Notion 私密來源意外啟用拒絕、checkpoint 首次基準不等於已恢復、目的 fingerprint 遭修改不得自動接受、公開報告不得複製 Issue 內文。再跑 `node --test tests/*.test.cjs`，確認原有 Launcher、Memory、Monitor 測試並未受害。

## 實際驗證與剩餘差距（待填 GitHub 原始執行）

- 初版採已存在的 `main` 基準 SHA `7b7b77e8c06ce3ed348e2d5c086ff086da64f95a`，各候選修補追蹤 PR #66；工作流在隔離 PR 中只能跑 CI，真 cron **未啟用**。
- 必須取得 Github Actions **固定 SHA、Node 原始測試數、任務錨點真實讀回、`operational_baseline` 報告與 checkpoint 狀態** 才能稱 R7 合成／整合驗證通過。
- R7 仍未做到真正的各 Task 目的語意比對、GitHub+Notion 跨源權威任務狀態裁決、時間逆序 commit ancestry 比對、跨端可信 G2 ACK、通知收件或 15 分鐘真時效 SLA。要先由 G1 補反證、G2 獨立驗證，再由使用者另行核准。
- **保留 R1–R6 所有原始報告、失敗 run、反證與修復版本；不得用本文件覆蓋舊資料**。
