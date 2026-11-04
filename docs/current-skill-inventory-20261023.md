# 資料集中站｜目前可用技能盤點（部署前凍結清單）

> **盤點日期**：2026-10-23（Asia/Taipei）。依 ChatGPT 目前可列出的 `skills__list` 實際結果整理；不代表已部署於 GitHub Pages 或已獲私人資料讀寫權。**本文件僅為候選分支的盤點；無技能安裝或權限變更。**

## 一、目前可列出的技能：40 項
這裡的「技能」是 ChatGPT 插件提供的可用**工作流程與模板條目**，**不是 40 個獨立 AI、40 個新插件，亦非資料集中站已接通的 40 個 API**。同一插件可能含多項技能，且目前環境可用不代表部署時自動進入私人記憶服務。

| 類別 | 數量 | 已列出的技能名稱（slug） |
|---|---:|---|
| 預設文檔／簡報／試算表模板 | 20 | `artifact-template-analytics-dashboard`、`artifact-template-business-review`、`artifact-template-design-report`、`artifact-template-experiment-analysis`、`artifact-template-financial-budget`、`artifact-template-investment-committee-memo`、`artifact-template-legal-memorandum`、`artifact-template-market-trends-report`、`artifact-template-minimal-letterhead`、`artifact-template-operating-calendar`、`artifact-template-operating-review`、`artifact-template-project-kickoff`、`artifact-template-project-tracker`、`artifact-template-sales-pipeline`、`artifact-template-simple-dark-mode`、`artifact-template-simple-light-mode`、`artifact-template-strategy-memorandum`、`artifact-template-system-design`、`artifact-template-team-alignment`、`artifact-template-three-statement-forecast` |
| Google 雲端工作流程 | 5 | `google-docs`、`google-drive`、`google-drive-comments`、`google-sheets`、`google-slides` |
| Notion 工作流程 | 5 | `notion-database-designer`、`notion-meeting-intelligence`、`notion-research-documentation`、`notion-spec-to-implementation`、`notion-weekly-project-digest` |
| 自訂插件開發／維護 | 3 | `create-plugin`、`prepare-plugin-submission`、`update-plugin` |
| 文件成品路由 | 1 | `document` |
| PDF 成品路由 | 1 | `pdf` |
| 簡報成品路由 | 1 | `presentation` |
| 試算表成品路由 | 1 | `spreadsheet` |
| HeyGen 影音 | 1 | `heygen-workflows` |
| 自訂模板建置 | 1 | `template-creator` |
| 插件管理 | 1 | `plugin-management` |
| **合計** | **40** | 工具清單實際確認 |

## 二、逐項清單（來源：目前已安裝技能表）
- `skills://plugins/heygen/heygen-workflows` — Use HeyGen for talking-avatar videos, general AI clips with HeyGen Video 1, and video, avatar, voice, translation and media workflows.
- `skills://plugins/plugin-creator/create-plugin` — Create local or cloud plugins. Use when the user asks to build an app, tool, integration, or plugin within ChatGPT or Codex, not a standalone skill. Covers custom MCP apps, skills bundled in plugins, tools that connect agents to websites and services, and extensions for custom app views, file handling, and referencing app data in chat.
- `skills://plugins/plugin-creator/prepare-plugin-submission` — Guide a user through preparing an existing plugin for public submission, including review and publication metadata, listing, examples, demo, and reviewer access. Use when the user wants to get ready to submit, create a submission-ready ZIP, submit, or publicly release a plugin.
- `skills://plugins/plugin-creator/update-plugin` — Inspect, edit, or extend custom plugins the user owns or has permission to edit. Use when the user asks to change a plugin's instructions, skills, tools, app UI, Extensions, metadata, assets, or configuration, delete packaged files, or inspect a previous version.
- `skills://plugins/notion/notion-database-designer` — Turns scattered notes and recurring work into useful Notion trackers for requests, content plans, or team work. Use to set up or improve a tracker, choosing its fields and views from the user's needs; ordinary record updates belong to the task's workflow.
- `skills://plugins/notion/notion-meeting-intelligence` — Prepares Notion meeting agendas, pre-reads, decision briefs, and follow-up actions. Use for meeting preparation, carrying context into recurring meetings, or turning meeting outcomes into next steps. Simple meeting lookups or saving notes verbatim do not need this workflow.
- `skills://plugins/notion/notion-research-documentation` — Synthesizes Notion workspace evidence into cited answers, comparisons, briefs, or reports. Use to investigate a question, connect findings across sources, or reconcile conflicting information, with external research when useful. Simple lookups, fetching a known page, or summarizing one supplied page do not need this workflow.
- `skills://plugins/notion/notion-spec-to-implementation` — Converts Notion product or technical specs into implementation plans, linked tasks, and evidence-based progress updates. Use for planning or implementing a spec, creating tasks from requirements, or reconciling implementation with spec changes.
- `skills://plugins/notion/notion-weekly-project-digest` — Produces evidence-based weekly project or team updates by comparing reporting periods, tasks, decisions, and blockers in Notion. Use for recurring status digests; use spec-to-implementation for requirement-level implementation tracking.
- `skills://plugins/openai-templates/artifact-template-analytics-dashboard` — Create a spreadsheet using the Analytics Dashboard template and its retained reference file. Use when the user selects or names Analytics Dashboard. Monitor acquisition, engagement, retention, revenue, and conversion funnel KPIs with charts.
- `skills://plugins/openai-templates/artifact-template-business-review` — Create a presentation using the Business Review template and its retained reference file. Use when the user selects or names Business Review. Review business performance, KPIs, segment results, strategic priorities, decisions, and outlook.
- `skills://plugins/openai-templates/artifact-template-design-report` — Create a document using the Design Report template and its retained reference file. Use when the user selects or names Design Report. Produce design reports with an executive summary, key findings, implications, recommendations, and appendix.
- `skills://plugins/openai-templates/artifact-template-experiment-analysis` — Create a document using the Experiment Analysis template and its retained reference file. Use when the user selects or names Experiment Analysis. Analyze experiments with hypotheses, methodology, results, interpretation, limitations, and next steps.
- `skills://plugins/openai-templates/artifact-template-financial-budget` — Create a spreadsheet using the Financial Budget template and its retained reference file. Use when the user selects or names Financial Budget. Model actuals, budget and scenario forecasts, variances, cash runway, and departmental plans.
- `skills://plugins/openai-templates/artifact-template-investment-committee-memo` — Create a document using the Investment Committee Memo template and its retained reference file. Use when the user selects or names Investment Committee Memo. Prepare investment committee memos with the thesis, transaction details, financial analysis, risks, and recommendation.
- `skills://plugins/openai-templates/artifact-template-legal-memorandum` — Create a document using the Legal Memorandum template and its retained reference file. Use when the user selects or names Legal Memorandum. Draft legal memoranda with the issue, brief answer, relevant facts, analysis, and conclusion.
- `skills://plugins/openai-templates/artifact-template-market-trends-report` — Create a presentation using the Market Trends Report template and its retained reference file. Use when the user selects or names Market Trends Report. Communicate market or industry trends, supporting evidence, implications, and recommended responses.
- `skills://plugins/openai-templates/artifact-template-minimal-letterhead` — Create a document using the Minimal Letterhead template and its retained reference file. Use when the user selects or names Minimal Letterhead. Write professional business letters with sender, recipient, message, and signature fields in a minimal letterhead layout.
- `skills://plugins/openai-templates/artifact-template-operating-calendar` — Create a spreadsheet using the Operating Calendar template and its retained reference file. Use when the user selects or names Operating Calendar. Plan annual and monthly operating milestones, campaigns, launches, deadlines, and recurring events.
- `skills://plugins/openai-templates/artifact-template-operating-review` — Create a presentation using the Operating Review template and its retained reference file. Use when the user selects or names Operating Review. Run weekly operating reviews with scorecards, functional updates, risks, decisions, and action items.
- `skills://plugins/openai-templates/artifact-template-project-kickoff` — Create a presentation using the Project Kickoff template and its retained reference file. Use when the user selects or names Project Kickoff. Align teams on project goals, scope, roles, milestones, risks, and the working model.
- `skills://plugins/openai-templates/artifact-template-project-tracker` — Create a spreadsheet using the Project Tracker template and its retained reference file. Use when the user selects or names Project Tracker. Manage workstreams, tasks, owners, status, priority, dates, launch pulse, and a Gantt schedule.
- `skills://plugins/openai-templates/artifact-template-sales-pipeline` — Create a spreadsheet using the Sales Pipeline template and its retained reference file. Use when the user selects or names Sales Pipeline. Track opportunities, stages, owners, deal sizes, probabilities, forecasts, next steps, and risks.
- `skills://plugins/openai-templates/artifact-template-simple-dark-mode` — Create a presentation using the Simple Dark Mode template and its retained reference file. Use when the user selects or names Simple Dark Mode. Create clean dark-mode presentations with bold typography, simple sections, charts, and imagery.
- `skills://plugins/openai-templates/artifact-template-simple-light-mode` — Create a presentation using the Simple Light Mode template and its retained reference file. Use when the user selects or names Simple Light Mode. Create clean light-mode presentations with spacious typography, simple sections, charts, and imagery.
- `skills://plugins/openai-templates/artifact-template-strategy-memorandum` — Create a document using the Strategy Memorandum template and its retained reference file. Use when the user selects or names Strategy Memorandum. Present strategic context, choices, rationale, risks, milestones, and a clear recommendation.
- `skills://plugins/openai-templates/artifact-template-system-design` — Create a document using the System Design template and its retained reference file. Use when the user selects or names System Design. Document system architecture, requirements, components, data flows, APIs, tradeoffs, and operational considerations.
- `skills://plugins/openai-templates/artifact-template-team-alignment` — Create a presentation using the Team Alignment template and its retained reference file. Use when the user selects or names Team Alignment. Facilitate team offsites and planning with context, goals, priorities, decisions, and action items.
- `skills://plugins/openai-templates/artifact-template-three-statement-forecast` — Create a spreadsheet using the Three-Statement Forecast template and its retained reference file. Use when the user selects or names Three-Statement Forecast. Build an integrated income statement, balance sheet, and cash flow forecast with assumptions, checks, and an executive summary.
- `skills://plugins/template-creator/template-creator` — Create or update an installable personal ChatGPT artifact-template skill from a reference document, presentation, spreadsheet, Google Docs, Slides, or Sheets link, ImageGen or Product Design image, email, Slack message, or Site project. Use when the user selects Template Creator, asks to create a reusable template, or explicitly asks to update one exact personal template. Do not use for one-off creation from an existing template.
- `skills://plugins/presentations-router/presentation` — route explicitly selected presentation or slide artifact requests to the preinstalled capability. use only when the user explicitly selects @presentation; never trigger from request content alone.
- `skills://plugins/pdf-router/pdf` — route explicitly selected pdf artifact requests to the preinstalled capability. use only when the user explicitly selects @pdf; never trigger from request content alone.
- `skills://plugins/documents-router/document` — route explicitly selected document artifact requests to the preinstalled capability. use only when the user explicitly selects @document; never trigger from request content alone.
- `skills://plugins/google-drive/google-docs` — Create and edit native Google Docs through connected tools.
- `skills://plugins/google-drive/google-drive` — Use connected Google Drive as the single entrypoint for Drive, Docs, Sheets, and Slides work. Use when the user wants to find, fetch, organize, share, export, copy, or delete Drive files, or summarize and edit Google Docs, Google Sheets, and Google Slides through one unified Google Drive plugin.
- `skills://plugins/google-drive/google-drive-comments` — Write, reply to, and resolve Google Drive comments on Docs, Sheets, Slides, and Drive files with evidence-backed location context. Use when the user asks to leave comments, review a file with comments, respond to comment threads, or resolve Drive comments.
- `skills://plugins/google-drive/google-sheets` — Analyze and edit connected Google Sheets with range precision. Use when the user wants to create Google Sheets, find a spreadsheet, inspect tabs or ranges, search rows, plan formulas, create or repair charts, clean or restructure tables, write concise summaries, or make explicit cell-range updates.
- `skills://plugins/google-drive/google-slides` — Route Google Slides authoring requests and derive a design system from a native template or reference deck. Use this skill when the user provides an existing native Google Slides deck as a template, reference, or prior-period source, or asks to edit, update, repair, restyle, or clean up an existing native Google Slides deck. Use the Presentations skill instead for net-new presentation creation when no existing native Google Slides deck must be followed.
- `skills://plugins/plugin-management/plugin-management` — Discover and suggest relevant plugins, inspect app permissions and dependencies, and manage plugin connections or removal. Use when the user asks about plugins or when a task would materially benefit from an external app, account, service, or data source that available tools cannot access.
- `skills://plugins/spreadsheets-router/spreadsheet` — route explicitly selected spreadsheet artifact requests to the preinstalled capability. use only when the user explicitly selects @spreadsheet; never trigger from request content alone.

## 三、個人自訂與專案自訂
- `Plugin Creator — list_owned_personal_plugins` 於此次環境查詢返回空清單；**僅可說這個帳號可列出的個人 USER scope 私有插件為零**，不能藉此推斷沒有工作區私人插件、外部 MCP、其他帳號的技能。
- 搜尋 GitHub `keqingwu5-cloud/ai-boundary` **預設分支**的 `SKILL.md`、`skills`、`agents.md` 與 `skill` 程式碼，未取得技能檔的正向證據；在 #59 固定 HEAD 常見位置的 `AGENTS.md`、`SKILL.md`、`skills/SKILL.md` 等路徑亦不存在。**這不是全面遞迴掃描證明**。原本的 `memory-workflow-core.js`、`memory.js`、`launcher.html` 是既有產品程式／介面，不等於已安裝 ChatGPT Skill。
- **已有候選功能，尚未正式部署**：本機加密記憶、候選提交與人工審查、方向／門檻歷史、來源與裂變預演、加密備份、安全還原、跨分頁協同 Web Locks 寫入保護、獨立私人站點靜態封裝，以及其合成測試。這些是 repo candidate 能力，不能當作正式上線技能。

## 四、第一階段部署前保留的禁止與依賴
1. **新增插件／技能不得當成第一階段完成的替代**：必須先完成獨立私人 HTTPS origin、備份/還原/rollback、正式網站 header 與真正跨來源安全負測、獨立身分審查及使用者分別批准合併/部署。
2. **插件權限須與私人記憶隔離**：預設沒有密文、金鑰、私人記憶資料庫或使用者審核權。任何存取須由 owner 明確授權的資料契約，最小權限、範圍白名單、人工審核和記錄，每個外部 API 需證明不能未經允許輸出記憶。
3. **資料方向與門檻仍由使用者控制**：未經人工核准不能把候選自動轉成正式記憶，不能靠「安裝技能」擅自發射給其他 AI；官方批准由使用者保留。
4. **技能版本化／回滾**：每個新技能記錄 slug、plugin ID、來源、版本、依賴、資料存取範圍、啟用權限、風險、測試與停用/rollback；先用合成資料與分離的測試環境再逐項開通。
5. **效能與容量**：基礎穩定優先，後續新增技能應能限流與隔離耗時工作，不得卡住人工查詢、候選審核、備份保存，也不能擅自更動 700000 bytes 現行上限。

## 五、第一階段部署完成後才評估加裝（建議順序；非安裝紀錄）
| 優先 | 擬新增或配置的專案技能方向 | 先決條件 |
|---|---|---|
| 1 | 備份／還原／程式與資料回滾驗證 | 獨立私人 origin、可信合成回滾證據 |
| 2 | 資料來源、候選審核與 Pre-Split Impact Gate | 明確 user approval、來源 provenance／稽核 |
| 3 | 安全派工與接收 ACK，人工交接優先 | 驗證外部端身分與真正交接確認、限制外傳 |
| 4 | 容量、延遲 p50/p95、穩定度巡檢 | 先取得實際數據，分流／索引需另授權 |
| 5 | Notion／Google Drive 知識同步與文件產出 | 確認外部資料可分享的分類與最小權限 |

**查核界線**：此盤點只驗證本次可列出的可用 Skills、個人自訂插件清單和指定 GitHub repo 的正向檔案搜尋。未檢查每個插件 OAuth 授權，未驗證 40 條技能在使用者私人環境中均具資料存取權，也未提供獨立審查 ACK。 
