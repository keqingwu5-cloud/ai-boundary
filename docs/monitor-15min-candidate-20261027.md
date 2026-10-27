# 資料集中站｜15 分鐘唯讀監控候選 R1（2026-10-27）

**狀態：CANDIDATE / NOT DEPLOYED**。使用者授權隔離候選、正反測試及回報，不授權合併 main、正式 Notion token、修改私人記憶、資料庫、部署或規章。現有每小時 ChatGPT 監控保持啟用。

## G0 盤點與邊界

- GitHub 來源：keqingwu5-cloud/ai-boundary。main 起點 SHA：7b7b77e8c06ce3ed348e2d5c086ff086da64f95a。
- [Issue #31](https://github.com/keqingwu5-cloud/ai-boundary/issues/31) 共同規章仍為待核准草稿；使用者對高影響操作保留批准權。新規則不可因 AI 紀錄自行升格。
- [#38](https://github.com/keqingwu5-cloud/ai-boundary/issues/38) 已有雙來源收件索引；[#41](https://github.com/keqingwu5-cloud/ai-boundary/issues/41) 真跨 AI 交接仍 BLOCKED；[#54](https://github.com/keqingwu5-cloud/ai-boundary/issues/54)、[#55](https://github.com/keqingwu5-cloud/ai-boundary/issues/55)、[#56](https://github.com/keqingwu5-cloud/ai-boundary/issues/56)、#57/#60/#62/#63/#64/#65 均作既有任務來源，不建第二份權威任務資料庫。
- 現有 ChatGPT GitHub＋Notion 條件式監控已是每小時執行；此候選只新增獨立測試，不替換它。
- 本輪核對 main 不含 .github/workflows 目錄；記憶工程候選分支的 Actions 不等於正式上線。
- 兩個歷史 Notion 沙盒頁面經本對話的連接器讀取均回傳 NOT_FOUND。Runner 未被配置 Notion 權限前標 NOT_CONFIGURED，不能宣稱全面涵蓋。

## 候選行為與排程

- Actions cron 設為 7,22,37,52 * * * *，UTC 每小時四次、間隔 15 分鐘，避開整點；實際觸發可能延遲或遺漏。GitHub schedule 僅在預設分支生效；工作流檔仍位於隔離候選分支，**未啟動真正週期監控**。
- GitHub Action 權限只有 contents/issue/pull-request/actions 的 read；GitHub Runner token 只用於唯讀 API 和跨輪 Actions artifact 回讀；絕不寫入 GitHub、發送任務、修改 PR、合併、部署或自動核准。
- 讀取 Issue/PR 更新、Issue/PR 對話留言、workflow 執行摘要與 main HEAD；起點為上次快照前 5 分鐘以保留交疊，時間範圍不超過 24 小時；分頁過量會顯式失敗，不靜默當作已讀完。
- Notion 選配：待使用者獨立授權後，使用只讀 Notion integration token（secret NOTION_MONITOR_TOKEN），白名單 pages（repo variable NOTION_MONITOR_PAGE_IDS）與 data sources（NOTION_MONITOR_DATA_SOURCE_IDS），只檢查頁面 ID 與 last_edited_time，不讀取正文或標題、不修改內容。尚未設定就維持 NOT_CONFIGURED；403/404/限流必須顯示失敗，不是假 PASS。
- 跨輪由 Actions artifact 保存非權威 checkpoint；鍵包含來源類型、確切 ID、更新時間/狀態。相同事件去重、修訂版與原始版都保留。遺失/毀損/不符分支/過期時標 BOOTSTRAP、INVALID 或 STALE；不以歷史事件製造錯誤新警報。
- JSON artifact 僅保留必要識別與 URL／Notion ID 雜湊，不包含私人 Notion 標題/原文、Issue 原文、憑證或機密資訊。artifacts 是有限期限的快照，不是永久稽核庫。
- 關鍵字 ACK 僅能標為 CLAIM_ONLY_NOT_VERIFIED，無法證明 GPT② 獨立讀取與可信回執；GitHub Actions 也無法自行喚醒另一個 ChatGPT 對話。
- 意外 CI 失敗才升為 CRITICAL_UNVERIFIED；既有刻意 NO_GO 的 memory release 工作流不可假報成新重大事故。重大事件候選以 Action failure 和 Step Summary 顯示；使用者能否收到推播取決於 GitHub 通知設定，**尚未做實際送達測試**。

## 可重跑測試

使用 node --test tests/monitor-15min-candidate.test.cjs。正反例：Issue/PR/留言/工作流/main commit 更新、同 ID 新版、跨輪去重、含 ACK 的偽造宣稱、意外 CI FAIL 與預期 NO_GO 區分、首次基準不亂報、失效與損壞 checkpoint、Notion 無權限、任意 ID 拒絕、Notion/GitHub 多頁擷取超限 hard-fail、敏感正文不出現在 JSON。

須同時回讀 GitHub Actions 固定 commit、原始 TAP 及 JSON artifact，不以 PR 發布等同真實排程運行；正式生產判定保持 NO_GO。

## 原監控與新增候選差異

| 評估 | 原 ChatGPT 每小時監控 | 新 GitHub Actions 候選 |
|---|---|---|
| 週期 | 1 小時且目前已啟用 | 15 分鐘 cron；尚未在 default branch 生效 |
| 去重 | 提示規則與執行端狀態 | Artifact checkpoint，候選可做純函式測試 |
| Github/Notion | ChatGPT 連接器 | GitHub REST；Notion 需獨立最小權限與實測 |
| 安全/缺口 | 既有排程與治理 | 只讀、實際 log；新增 Runner/token 與偵測覆蓋風險 |
| 通知 | ChatGPT 條件式通知 | GitHub workflow 失敗/摘要，不保證直接通知 |

優點：預期頻率提升、可測去重及失敗記錄；但尚無實際時間漂移/漏跑/Notion覆蓋或通知送達數據，不能虛報可靠度增益。

## 未解阻塞、驗收與回退

1. candidate branch 只能被推送/PR CI 測試，不能觸發真 cron；合併 main 必須另得使用者同意、核對分支保護。
2. Notion token 和資料來源的獨立使用者授權與真實連接測試欠缺；兩個既有頁面目前 NOT_FOUND。
3. 真實跨對話 ACK 及身分未驗證；G0/G1/G2 異常審查仍需要人工把關。
4. Actions 發生 API rate limit、20-run snapshot history 缺失、資料大於上限或網路短暫失敗時不能宣稱完整監控；需在有限部署後收集長期延遲、恢復與漏報樣本。
5. 測試後由獨立審查員與使用者評估，若再核准合併主分支、監控/通知及必要 credentials，才進正式漸進上線。原每小時監控不會自動停用。
6. 回退：停止此候選的自動化、保留原有 GitHub/Notion 原始證據與失敗工單；既有每小時監控繼續運作。禁止破壞性刪歷史。

**本文件為追加的候選研究/工程基準，不能作正式規章或任何人的批准證明。**


## 補充安全審查（2026-10-27｜候選 R2，原 R1 內容保留）

- **Secret 防線**：Workflow 已將 Notion token 引用限制為主線 `schedule`／`workflow_dispatch` 的條件表達式；候選 push / PR 預設不得收到 token。**但這只是工作流層防護**，不能抵抗有權修改 workflow 本身的惡意同倉庫提交。正式核准前，必須另外配置 GitHub environment protected secret、限制可部署分支到受審 main、必要時附可信審核者。不得只建立可被任意 PR 存取的 repository-wide secret。上述保護目前未配置／未驗證。
- **證據遺失必須 fail-closed**：已有相同分支舊 Actions run 但下載不到 checkpoint 時，候選拒絕把它當成乾淨首次執行；既存 checkpoint 損壞或距今超過 24 小時，輸出 `REVIEW_CHECKPOINT_GAP` 並以失敗狀態要求人工處理。
- **意外通知不保證送達**：新 P0 或人工審核事件產生 `REVIEW_CHANGES` 和 Action 異常狀態候選；實際 Email/手機通知、接收者、去噪、失效恢復都尚未完成實測。
- **Actions rerun 與版本**：新增 `run_attempt` 到去重鍵；歷史執行重新 rerun 在最新 500 筆執行列表內才可觀測，超過窗口或 API 過量不能宣稱完整追蹤。
- **Notion API 2026**：`in_trash` 與舊 `archived` 均辨識成待審刪除候選。仍未取得實際合法的 Notion Runner token 或私有頁面讀取實測，不能將合成資料測試視為真權限驗收。
- **獨立 G2 未完成**：候選開發者自測和同一對話的風險盤點，均不能冒稱為另一位審查員的獨立簽核。正式 GO 仍待使用者另行批准。

**R2 關卡狀態：僅工程候選修補；main 未合併／Notion 憑證未變／原每小時監控照常。**
