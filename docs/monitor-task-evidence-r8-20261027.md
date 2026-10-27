# R8｜任務語意—實際行為—結果證據對帳候選（2026-10-27）

> **G1 Candidate｜只讀｜不具自動批准／G2 受理權。** 延續 PR #66 R7「正在做什麼」基準。新增的 R8 僅對既有六個 GitHub 任務錨點進行原始事件的**明確歸屬**，不解析私人 Notion、不使用任何私人/正式 Token，不上線。

## 原始問題／建立差異優勢的依據

R7 可證明「監控知道自己的用途與執行階段」，但還無法回答「來源事件與哪個任務有關」。原 `observed_activity_types` 是全部儲存庫的事件數，不代表任何特定 Issue #31／#41／#56／PR #66 已有實質進度。因此，數量大不等於任務實際執行，更不等於任務完成。

R8 新增 `scripts/monitor-task-evidence.cjs` 與 `tests/monitor-task-evidence.test.cjs`，在原 `report.json` 多一個 `task_evidence` 子結構；不另建權威資料庫、不覆蓋 checkpoint 或任何原始歷史紀錄。

## 分層資料契約

| 層級 | 來源 | 能確定什麼 | 禁止推論 |
|---|---|---|---|
| **意圖：原本要完成的事** | R7 固定的 `ANCHORS[]`、候選 `purpose`（依既有任務規章與使用者限制） | 本候選對每項已列錨點的觀測目的、角色 | 這些目的摘要屬於正式使用者核准的新規章 |
| **動作：確實可觀測到什麼** | GitHub REST Issues、PR、Issue／PR 留言的 metadata 與 canonical URL | 一筆事件的來源、指向的錨點與當輪新舊鍵 | 留言的敘述真實、該事件已送達獨立 AI |
| **結果：證據是否充分** | 原始 URL + checkpoint + 任務狀態核對 | 有活動或無活動、可能需要人工審查 | 「已完成」「GPT② 已 ACK」「使用者已批准」「部署成功」 |

R8 的唯一自動結論為 `OBSERVATION_ONLY_NOT_OUTCOME_PROOF`；若證據每任務超過 25 筆，顯式 `REVIEW_EVIDENCE_OVERFLOW` 且工作流需人工處理，不得將截斷的清單當成完整證明。

## 重要安全限制與反例

- 限 `https://github.com/keqingwu5-cloud/ai-boundary/` 官方來源，且限定 `issues/{n}` 或 `pull/{n}`；杜絕不同 repo、任意查詢字串與非官方 URL 污染來源。
- 檢驗 `event.key` 的任務 ID/留言 ID 必須和 URL 精確一致；避免把其他任務的事件貼進目標錨點。直接 PR 更新須歸於 `pull/{n}`，Issue 與 PR 直接更新不可互換；PR 內的 GitHub Issue Comment 仍可核對對應 PR 編號。
- 不複製 Issue 標題、原文、留言原文或任何 private metadata。帶有「ACK」的文字只計 `unverified_ack_claims`，`verified_receiver_ack=false`；`closed` 仍為純 GitHub metadata，`verified_work_completed=false`。
- `already_in_prior_checkpoint` 區分先前已見 vs 這輪首次見到；去重鍵不因單輪同事件重複返回就重覆加計。
- `scope=SIX_EXISTING_GITHUB_ANCHORS_ONLY`：僅 #31、#36、#41、#54、#56、PR #66。超出此範圍的 repo 事件記為 `unmatched_valid_gitHub_events`，**不代表其他 Issue 不存在或不需要監控**。全 repo 現有觀測路徑保留。
- `no_observation_is_not_proof_of_no_work=true`：沒有可歸屬的直接事件只代表本輪**未見直接可核對的事件**，不能當成任務沒執行或完全健康。
- 來源只是現有 GitHub REST 觀測快照；不是 G2 獨立簽收系統、長期 event sourcing、GitHub+Notion 權威狀態仲裁或真定期排程。Notion Runner 仍故意 `NOT_CONFIGURED`。

## 比較策略與未完成問題

**R7→R8**：從「所有活動總數＋六個錨點 metadata 前後差異」增加「每筆 GitHub 事件到底可直接歸到哪個任務」。差異優勢是**機械可測的來源真實性與精確 ID 歸屬**，不是聲稱任務完成率提升。R8 限 25 筆/錨點報告，計數保留，超限 fail-closed；尚未有持久化逐任務全文歷史，不能用它替代原始 GitHub。

**G2 上線前仍待補**：逐任務實質成功條件與審查者可驗證結果、GitHub 版本 ancestry/回填 SHA 防漏、跨來源 Notion 去重、取消排程補償、通知實際送達、真正跨 GPT 收件 ACK；正式 `main` PR 適用的強制獨立審查仍不足。這些與目前 15 分鐘 cron 未在 default branch 生效的問題獨立。

最終驗收需固定 SHA、原始 Node TAP、真 GitHub Runner 日誌、最新報告 artifact 和 R7/R8 差異；任何測試失敗應追加、不覆寫。未經使用者分別批准，仍 `MAIN_MERGE=NO_GO`、`NOTION_CREDENTIAL=NO_GO`、`DEPLOY=NO_GO`、`REPLACE_HOURLY=NO_GO`。
