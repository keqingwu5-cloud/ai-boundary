# 15 分鐘監控候選｜G1 安全核對、G2 獨立審查交接與最小權限方案（2026-10-27）

> **分類：G1 開發者安全核對 + G2 待接收審查包；不是獨立 G2 審查結果。** 凡本報告提到 PASS，均限定對應固定 commit 與合成／Actions 觀測範圍。用戶的「好」授權繼續候選安全檢查，**不**授權 main 合併、Notion 正式憑證／Environment 設定、部署、私人記憶資料讀取或關閉原每小時排程。

## 0. 原始來源、版本與固定證據

- [共同規章 #31](https://github.com/keqingwu5-cloud/ai-boundary/issues/31)：G0/G1/G2 分工、人工正式核准、保留來源、否決與歷史；仍不得自稱正式批准。
- [#38 執行者收件索引](https://github.com/keqingwu5-cloud/ai-boundary/issues/38)、[#41 真雙向交接 BLOCKED](https://github.com/keqingwu5-cloud/ai-boundary/issues/41)、[#56 GPT② 審查入口](https://github.com/keqingwu5-cloud/ai-boundary/issues/56)。
- [PR #66](https://github.com/keqingwu5-cloud/ai-boundary/pull/66)：Draft / 隔離候選；最初 main 固定 `7b7b77e8c06ce3ed348e2d5c086ff086da64f95a`；R2 候選 `e8a3d22536c83cd4f487b2e49c045c586f9f9f1e`。
- [R2 實際 Actions #40364403808](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40364403808)：31/31 Node PASS；GitHub READ_SUCCEEDED；跨輪 checkpoint RESTORED；Notion NOT_CONFIGURED / PARTIAL。此項不是私有 API、通知到達或 G2 簽收證據。
- R3 額外 G1 反例與修補：原程序只取 `issue_url` 尾端的數字便拼出本 repo 連結，若把外部 issue_url 誤當本專案，就會污染審計來源（已改為嚴格核對官方 API 的 repo/path）。當 checkpoint seen 超過 5,000 筆，原程式依字串鍵末端切除，可能默默遺失舊證據或重複通知（已改容量溢出明確 NO_GO）；兩項分別附正/負測試。**不能把尚未取得的最新 CI 結果提前宣告成功。**

## 1. G1 風險矩陣（保留反證）

| ID | 嚴重性 | 已核對命題 / 實際缺口 | 狀態 / 最小補證 |
| --- | --- | --- | --- |
| S01 | P0 上線阻擋 | Notion token 即使限制為 YAML 條件，若同倉庫有修改 workflow 權限的人可改條件，就不構成完整憑證隔離。 | UNVERIFIED：**禁止現在加入 repo-level Notion secret**；需獨立 Environment branch rule、最小 token、正式核准與稽核 |
| S02 | P0 資料分類 | 公開 GitHub repo 的 Actions artifact / job summary 為可被授權訪問者取得的輸出；Notion ID 的無鹽雜湊與更新時間並不能當加密或去識別化。 | BLOCKED：未完成私有資料分類、私人來源排除與安全證據倉，不得導入私人 Notion |
| S03 | P1 来源污染 | 非本 repo 的 comment.issue_url 若只有末端 issue number 相同，舊程式曾生成假的本 repo ref。 | CANDIDATE_FIXED：R3 程式正反測、待固定 SHA 實際 CI 複驗 |
| S04 | P1 回溯與重複 | 5,000 筆 seen 上限舊程式靜默淘汰證據，且不依時間排序。 | CANDIDATE_FIXED：R3 容量超限 fail closed；需要可稽核重建／清理方案才可長期使用 |
| S05 | P1 交接可信度 | Issues/PR 含 ACK 文字，不是 GPT② 真實獨立端點 ACK；#41 仍 BLOCKED。 | UNVERIFIED：不得升格實際簽收，需可信目的端可回讀 receipt |
| S06 | P1 通知 | Actions 紅燈與 Summary 存在不表示手機/Email 已成功送達指定使用者。 | NOT_RUN：人工測試 GitHub 通知設置、真告警訊號、去重及恢復通知 |
| S07 | P1 觀測覆蓋 | GitHub Actions schedule 只在預設分支實際定期觸發，且可能延遲/漏跑；候選不在 main。 | NOT_ACTIVE：正式排程連續 15m 驗收缺少實際樣本 |
| S08 | P1 / P2 API 和狀態 | GitHub workflow 列表 500 筆上限、24h 截止、Actions Artifact 30/14 天保存，可能漏掉很舊的 rerun／長期歷史；恢復老 snapshot 不能保證完全補回遺漏事件。 | PARTIAL：需要真實故障注入、回補策略／歷史留存策略 |
| S09 | P1 職責分離 | 同一開發對話自查自改不能被認定為獨立 G2；共享 GitHub actor 亦非另一位 GPT 確實 ACK。 | G2_NOT_RECEIVED：交付真審查者重跑，以獨立身份、固定 SHA 和原始 CI log 立證 |

## 2. 最小權限架構候選 A / B

**方案 A — 優先、低耦合：GitHub-only 15 分鐘候選 + 保留現有 ChatGPT 每小時 GitHub／Notion 監控**
- GitHub Actions `GITHUB_TOKEN` job 權限：`contents: read`（checkout）、`issues: read`、`pull-requests: read`、`actions: read`；不加 `write`、`deployments` 或外部出站 token。
- 用合成資料和 GitHub 自有事件驗證觀測、去重、失敗、快照重建與假 ACK；Notion 保持 `NOT_CONFIGURED`，回報 `PARTIAL`。不以此替代原每小時跨平台監控。
- 保留完整 Release NO_GO，不能因方案 A 較安全就免掉 owner main merge 核准或獨立 G2。

**方案 B — 真實 Notion 每 15 分鐘，待使用者另行批准與證據補齊**
- 配一個**專用** Notion integration：只給讀取內容能力（Notion read-content capability），只 share 用戶**特別批准且經脫敏**的工作頁／資料來源，不可 share 私人記憶、機密 vault、未公開憑證或跨專案權威資料。
- 絕不放 repository-wide secret。先選定有私有 artifact/狀態存放能力的隔離 runner／專用私有工作流方案。需要在 Github 使用 environment secret 時，必須設定 environment 允許分支僅 main 與必需的 protection rules，將 workflow job 明確指向該 environment；**在已檢查前不得填正式 token**。
- 若 Environment 選「每輪 required reviewer」，會使無人值守的 15 分鐘排程每次等待人審；應區分**一次性的設定/變更核准**與每次排程 runtime 的最小權限監控。無法同時滿足時，保留方案 A，不降低保密要求。
- Notion response 的頁面 ID、時間、欄位、狀態都是可能有隱私意義的 metadata；候選現在無鹽 SHA 摘要不算強隱私保護。若進入 B，需獨立審查受控儲存、最小輸出、隔離日誌／artifact、token 撤銷和備份保留期限，避免任何私人活動跡象流到公開 Runner 證據。
- Notion 真 API 403/404/429、分頁超量、斷線恢復、撤銷後拒絕、舊回執偽造及跨 GitHub/Notion 去重實測，才得把 coverage 從 PARTIAL 提升到實際已驗證範圍。

官方行為依據：[GitHub environments / branch restrictions / secrets](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)、[GitHub schedule delay](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows)。文件是設計依據，不等於本 Repo 已完成保護設定。

## 3. G2 獨立審查所需返回證據（不得自行偽造）

請在真正獨立的 GPT②／受授權 G2 執行端核對以下 8 件，每件標 PASS / FAIL / UNVERIFIED / NOT_RUN / DISPUTED，附：

`criterion_id`、`source_sha`、`tool_or_command`、`original_run_url`、`test_case`、`observed_result`、`contradiction`、`reviewer_claimed_id`、`reviewer_verified_id`、`read_at`、`review_receipt`、`proposed_fix`。

1. SHA / PR diff 檢查：PR #66 四檔；未改 main、沒有任何正式觸發，原每小時任務仍在。
2. YAML 權限靜態檢查與惡意 PR 模擬：candidate / pull_request 不能取到 Notion token；repo secret 威脅模型要算在結論內。
3. GitHub 來源真實性：外部 issue_url 不得冒成本 repo，Issue/PR 與評論附正反例。
4. 去重／容量／回復：跨輪 artifact、stale/corrupt、5,000 以上、版本修改、Actions rerun、重送仍保留事件與負面歷史。
5. 來源 API 失敗：HTTP 403/404/429、網路 timeout、分頁上限、漏跑與重啟；不得把部分結果宣稱 PASS。
6. GPT② 自稱 ACK：與真正身分／目的端接收、已讀、回覆、可信端點 ACK 分級，不得文字升格。
7. Notion 資料等級：不得讀取私人記憶／內容；不同用戶／不同目的地需重新審查；現階段沒有真 Notion 連線就必須 UNVERIFIED。
8. 使用者通知：以非敏感測試事件實測期望收件者收到，且只一次；沒有通知到達證據不得宣稱完成。

**明示 G2 狀態：`HANDOFF_DRAFT_PREPARED` ≠ `DELIVERED` ≠ `VERIFIED_RECIPIENT_ACK` ≠ `INDEPENDENT_REVIEW_PASSED`。** 本報告作者不是獨立審查者。

## 4. 不得越過的停止條件

- 未經使用者另行批准，不得合併 main，不得把 workflow schedule 啟動，不得建立／修改 Notion 正式 token、Environment、私人/權威資料庫、網站或原每小時排程。
- 本 PR 在 S01、S02、S05、S06、S07、S09 未有可回查補證前維持 `MAIN_MERGE=NO_GO`、`NOTION_ENABLE=NO_GO`、`PRODUCTION=NO_GO`。
- 需要有身份可驗證的 G2 結論及使用者最終授權，才能把候選視為正式。


## 5. G1 第二輪外部來源核對與權限收斂（R4；不取代 G2）

**GitHub 規則已直接查證**：repo 可見之 active ruleset [#24906639](https://github.com/keqingwu5-cloud/ai-boundary/rules/24906639) 適用預設分支，包含 PR 必經、禁止刪除及非快轉修改。但其 `pull_request.parameters.required_approving_review_count = 0`、`required_reviewers=[]`。這不是獨立 G2 審核必需規則，不能聲稱權限控制已足以防止未審直接合併。Github `branches/main/protection` 端點回應 403 `Resource not accessible by integration`；因此**不能對其他可能的 branch protection settings 下全域不存在結論**。需由有權限者截取實際 Settings → Rules／Branch protection 配置及 required checks，另行授權修改規則；本輪不動。

**Notion 來源檢查更新**：透過目前使用者已連結 Notion 連接器，已能搜尋並唯讀取得「AI 主腦｜Notion 自動化接口沙盒 V0.1」、「主腦接口事件佇列｜測試版」以及 GPT① 測試說明；前次某些歷史單頁 URL 的 NOT_FOUND 只表示那些特定 ID 不能讀，不應推論整個 Notion 連接不可用。仍需區分：**ChatGPT Notion 連接器可以讀 ≠ GitHub Runner 已獲授權**。所有本次 Notion 內容只在當前對話核查，未複製私人內容或內部資料列至公共 GitHub repo、Action artifact 或狀態快照。Notion source scope 的本次結果仍是只讀沙盒，未觸及正式私人記憶。

**R4 最小實際變更**：公開候選 workflow 移除 `secrets.NOTION_MONITOR_TOKEN` 的直接引用，固定在 GitHub-only 觀測狀態 `NOTION_MONITOR_TOKEN: ''`；增加靜態負例斷言 workflow **不能解析 GitHub secrets，也不能宣告 GitHub write 權限**。這樣未來僅在 GitHub repo 新增同名 secret，也不會讓這份公共候選直接取得私有 Notion token。注意：這並非無法被有權限修改程式/Workflow 的人繞過的信任邊界；真正跨源方案須另行審查專用隔離 runtime、最小權限與資料分類，並由使用者批准後另立 PR。

**待 G2 核對新增項**：R4 固定 SHA 下核對 YAML/CI 權限；ruleset 零必要 reviewer 的正式合併風險；何時才應設定環境與受保護 secret；Notion Test DB 是否存在可脫敏且可授權的唯讀狀態事件；GitHub→ChatGPT 實際 ACK/通知送達的證據。**缺乏獨立 reviewer/正式授權時一律 NO_GO**。

