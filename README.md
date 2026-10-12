# 3D 動態認知大腦 · AI 認知邊界（v1）

線上版：https://keqingwu5-cloud.github.io/ai-boundary/

把「AI 認知邊界」的公開提問種進一顆半透明 3D 大腦：每個問題是一個神經節點，可以**分裂**出子問題、讓整個腦區**獨立成子腦**、在不同子腦之間拉出**跨腦連結**，所有結構與歷史都會保存。

## 檔案
| 檔案 | 用途 |
|---|---|
| `index.html` | 3D 大腦介面（zh-TW）、樣式 |
| `app.js` | Three.js 場景、資料模型、操作、儲存、歷史、公開 API |
| `data.js` | 種子資料**載入器**：讀 `content/*.json`、`patches/*.json`，合併成 `QUESTIONS`／`TYPES`／`CONCEPTS`／`SEED_*`／`SERIES` 全域變數（`window.AI_DATA_READY`） |
| `content/` | 內容：`questions.json`（6 題真實來源，原文未改）、`types.json`、`concepts.json`、`seed-extras.json`、`series.json`、`media.json`、`activity.json`（每日動態） |
| `patches/` | 各個 bot 的補丁：`<bot>-<YYYY-MM-DD>.json`，`index.json` 列出載入順序 |
| `schemas/` | 上面這些 JSON 的格式（`scripts/validate_content.mjs` 和 CI 用） |
| `activity.js` | 📅 每日動態清單（大腦和 feed 共用） |
| `scripts/` | `publish_episode.sh`（發佈影片→開 PR）、`log_activity.mjs`（新增動態→開 PR）、`validate_content.mjs`、`bump_version.sh` |
| `.github/workflows/ci.yml` | 每個 PR 跑 JSON 檢查、node 測試、headless 冒煙測試 |
| `CONTRIBUTING.md` | 誰負責哪些檔案、bot 的標準流程（分支 → PR → 整合師合併） |
| `vendor/three.module.min.js`、`vendor/OrbitControls.js` | Three.js r169（MIT，見 `vendor/LICENSE-three.txt`），本地化不依賴 CDN |
| `config.js` | 雲端同步設定（`SUPABASE_URL`／`SUPABASE_ANON_KEY`），預設空白＝只用 localStorage |
| `sync.js`、`sync-core.js` | Supabase 同步（頁面整合／純合併邏輯；`safe.js` 跳脫、網址與顏色檢查），見「☁️ 雲端同步」 |
| `supabase/schema.sql` | 資料表、RLS、編輯名單（預填 keqingwu5@gmail.com），在 Supabase SQL Editor 執行 |
| `vendor/supabase.js` | supabase-js 2.117.3 UMD（MIT，見 `vendor/LICENSE-supabase.txt`），只有填了 config 才會載入 |
| `tests/` | `*.test.mjs`（node 單元測試，含資料拆檔等價測試 `data-split.test.mjs`）、`smoke.mjs`（無頭瀏覽器冒煙測試）、`mock-supabase.mjs`（假 Supabase 整合測試） |

除 Google Fonts 外沒有任何外部依賴，也不需要 build。（內容是用 `fetch()` 讀 JSON，所以要透過網址打開，例如 GitHub Pages 或 `python3 -m http.server`；直接雙擊 `file://` 不行。）

**改內容、發影片、改程式都走「分支 → PR → 整合師合併」，不直接推 main。** 詳見 [CONTRIBUTING.md](CONTRIBUTING.md)。（雲端同步是選用的：`config.js` 空白時不會連任何外部服務。）

## 技術選擇：Three.js（原生 ES Modules） vs React Three Fiber
| | Three.js 原生 | React Three Fiber |
|---|---|---|
| 部署 | 靜態檔直接放 GitHub Pages，import map 指向 `vendor/` | 需要 React + bundler（Vite 等）build 流程 |
| 依賴 | 只有 three（約 680 KB） | react、react-dom、@react-three/fiber、drei… |
| 控制 | 直接操作 BufferGeometry／shader，方便做逐幀粒子、程序化大腦 | 宣告式、元件化，適合大型 UI 團隊 |
| 結論 | **v1 採用**：零 build、可離線、手機效能好控制 | 之後若介面變複雜（多人協作、表單很多）再評估遷移；資料模型與場景分離，遷移成本低 |

大腦外型是**程序化生成**：兩個半球由球體變形（內側壓平、底部收斂）並以多組正弦場做「腦回」皺褶，加上小腦（橫向皺褶）與腦幹；材質為 Fresnel 邊緣光 + 皺褶明暗的半透明 shader，內部有脈動的突觸粒子與神經網。沒有使用外部 3D 模型，所以沒有授權問題。

## 資料模型（graph）
存在 `localStorage['aiBrain.v1']`，自動儲存；可在「🕘 生長紀錄」匯出／匯入 JSON 跨裝置搬移。

```js
{
  version: 1,
  brains: [{ id, name, parentBrainId, position:[x,y,z], scale, regionColor, rootNodeId, createdAt }],
  nodes:  [{ id, brainId, parentId, kind:'question'|'extension'|'split', title, type,
             oneLiner, source:{who,outlet,date,url,also[]}, assumptions, reasoning:[{k,v}],
             counterEvidence:[{id,text,source,createdBy,ts}], media:{video,image},
             status:'open'|'researching'|'resolved', createdBy:'seed'|'merlin'|'bot',
             createdAt, collapsed, pos:[x,y,z] /* 腦內局部座標 */, botNotes:[] }],
  links:  [{ id, from, to, kind:'derived'|'cross', createdAt }],
  history:[{ ts, action, payload }]   // seed/add/split/subbrain/merge/cross/status/counter/collapse/expand/media/delete/import/reset
}
```
- `derived`：分裂／延伸的來源關係（子腦獨立後仍保留，畫成跨腦光弧＝出處）。
- `cross`：手動建立的跨領域關聯（金色光弧）。
- 子腦：`brains[].rootNodeId` 指向成為子腦核心的節點；`parentBrainId` 形成腦的樹狀結構，可無限往下分裂。
- 復原：每次操作前保存快照（最近 12 步，也存在 localStorage）。

## 操作
- 拖曳旋轉、滾輪／雙指縮放、右鍵／雙指平移；閒置會自動旋轉。
- 點節點 → 詳情：問題、來源、前提假設、推演、反證、媒體、出處（來自／衍生／跨腦）、研究進度。
- 節點動作：❖ 分裂、◌ 收合／◉ 展開、🧠 子腦（腦區飛出成獨立小腦）、↩ 併回、🔗 連結、⌂ 主腦。
- 頂部：＋ 新問題（長在目前聚焦的腦）、🔗 跨腦連結模式、↶ 復原、🕘 歷史（匯出／匯入／重置）。

## 給未來 AI bot 的掛鉤
`window.AIBrain` 公開 API：
`getState() / addQuestion({...,createdBy:'bot'}) / splitNode(id, items, 'bot') / makeSubBrain(id) / mergeBrain(id) / crossLink(a,b) / addCounterEvidence(id, text, 'bot', source) / setStatus(id, s) / on('change', cb)`。
bot 產生的內容以 `createdBy:'bot'` 標示（介面顯示 🤖），`botNotes[]` 預留給研究筆記。

## 🧵 概念線（Concept threads）

「相同概念或流程，拉成一條線」。

- 每個節點有 `concepts: string[]` 與選填的 `processPattern: string`。種子標籤放在獨立的 `CONCEPTS` 區塊（`index.html` 第二個 `<script>`），`QUESTIONS` 原始資料一個位元都沒改。
- 概念線是**推導出來的**（`kind: 'concept'`），不存進 `links`：每次 `sync()` 依目前可見節點，以「最近鄰串接」把同概念節點串成**一條鏈**（不是全連網），跨子腦也照樣相連；節點移動、分裂、變成子腦後自動重畫。
- 每個概念有自己的顏色、光暈與流動粒子；推演流程線以虛線呈現。
- 🧵 按鈕：打開概念抽屜 → 全部開／關、點一個概念即高亮該線並淡化其他。
- 節點面板：概念 chips（點＝高亮、✕＝移除）、新增標籤（有自動完成）、推演流程選單。
- 新增問題時依文字自動建議概念，點選即採用，也可手打其他概念。
- 舊存檔（v1）載入時自動遷移：只補缺的欄位，使用者改過的內容不動，歷程記一筆 `migrate`。

### 分裂的兩種結果

節點 `kind`：`'question'`（主問題）｜`'extension'`（從問題分裂出的子問題）｜`'direction'`（提出的新方向）。

- 分裂時選「🌿 子問題」或「🚀 新方向」。
- 新方向是粉紫色的菱形星、帶一道向外的光束，繼承父節點的概念，可再「升為子腦」。
- 面板顯示「分裂自」與兩份清單：子問題／新方向。
- 新方向保留 `media.image` 欄位（給未來的影像導演 bot 填圖）。種子資料沒有編造任何新方向。

### API 新增

```js
AIBrain.addDirection(parentId, { title, type, oneLiner, concepts, image, createdBy })
AIBrain.addConcept(nodeId, name) / removeConcept(nodeId, name)
AIBrain.setProcessPattern(nodeId, name)
AIBrain.getConcepts()          // 概念與流程登錄表
AIBrain.getConceptThreads()    // [{key, name, kind, color, ids}]
AIBrain.getConceptLinks()      // 推導出的 concept 連線
AIBrain.suggestConcepts(text)
AIBrain.focusConcept(name | 'p:流程' | null)
AIBrain.showConcepts(true|false)
AIBrain.splitNode(id, items, createdBy, 'extension' | 'direction')
```

## 📱 短影音模式（feed.html）

網址：https://keqingwu5-cloud.github.io/ai-boundary/feed.html （大腦右上角 📱 也能進去，🧠 回到大腦）

- 直式、全螢幕、一格一格吸附（CSS scroll-snap）。手機上下滑，桌機用滾輪或 ↑↓ 鍵；空白鍵播放／暫停，M 開關聲音，L 喜歡。
- 每一格是一個節點（主問題／延伸問題／新方向）。
  - 有 `media.video`（mp4/webm 網址，或 repo 內的相對路徑）：進到畫面就靜音自動播放、離開就暫停、會循環播放、9:16 滿版（`object-fit: cover`）。點一下開聲音，再點一下暫停，點兩下按喜歡。
  - 還沒有影片：顯示依類型上色的動態卡片（標題、概念、「影片製作中」）。如果 `media.video` 是 YouTube 之類的外部頁面，會多一顆「觀看原始影片」按鈕。
- 下方字幕區：標題、類型、概念 chips、說明（`node.caption`，沒有的話用 `oneLiner`；點一下展開，會顯示來源）。
- 右側按鈕：🧠 在 3D 大腦打開（`index.html#node=ID`）、🌿 子問題／新方向、❤ 喜歡、🔖 收藏（存在 localStorage `aiBrain.feed.v1`）、💬 留言、🔊 聲音。
- ⚙ 設定：依類型、概念篩選，只看有影片、只看收藏，排序可選大腦樹狀順序或最新。
- 跟大腦讀同一份資料（localStorage `aiBrain.v1`；沒有的話用種子資料），所以會保持同步：在大腦掛上影片，回到 feed 就看得到。
- 深層連結：`feed.html#node=ID` 會直接跳到那一格；`index.html#node=ID` 會在大腦裡展開、選取並把鏡頭飛到那個節點。
- 種子資料在 `content/`、`patches/`（由 `data.js` 載入），大腦和 feed 共用（`QUESTIONS` 原文不動）。

### 掛影片
在大腦點節點 → 面板「🎞 媒體」→ 貼上網址按 ✓。只接受 `http(s)://` 或 repo 內的相對路徑（例如 `media/videos/n_q1.mp4`），其他 scheme 一律拒絕。

### 🎬 影像導演 bot 介面
1. 把產出的影片放進 `media/videos/`，建議檔名 `<nodeId>.mp4`（H.264 + AAC，直式 9:16，加上 `-movflags +faststart`）。
2. 讓節點的 `media.video` 指到它：`AIBrain.setMedia('<nodeId>', 'video', 'media/videos/<nodeId>.mp4')`，或匯入 JSON 時直接寫在 `nodes[].media.video`。封面圖可以放 `media.image`。
3. 用 `scripts/publish_episode.sh` 開分支、開 PR（見下方），整合師合併後 GitHub Pages 更新，feed 就會自動顯示（`playable()` 認副檔名 mp4/webm/m4v/mov/ogv）。

## 📅 每日動態（activity.js）

大腦工具列（🕘 左邊）和 feed 工具列（⚙ 左邊）的 📅 打開；也可以直接開 `index.html#activity`。
- **依日期**：一天一組（最新一天展開，其他可以點開），每一筆是：時間（台北）、哪個 bot、類型（內容／影片／程式／修正／審查／合併／清理／文件／設計）、標題、摘要、相關節點（點了在大腦／feed 打開那個節點）、PR／commit 連結。同一天裡「衍生自」別筆的事件會縮排在父事件底下；父事件在別天的話，顯示「↳ 衍生自：…」，點了跳到衍生樹裡的那一筆。
- **衍生樹**：不分日期，整條衍生鏈縮排顯示；有子事件的每一筆都可以 ▾／▸ 收合，⇕ 全部展開／收合。
- 資料在 `content/activity.json`，**只增不減**，一個事件一筆：`{id, date, ts, bot, kind, title, summary, nodes[], links[], parentId}`（格式見 `schemas/activity.schema.json`）。每週的 repo 副本清理也記在這裡（`kind:"cleanup"`）。
- 新增一筆：`node scripts/log_activity.mjs --bot radar --kind content --title "…" --node n_q1 --link "PR #12|https://github.com/…/pull/12" --parent <id>`，會自動開分支、PR（`--here` 只 commit 在目前分支、`--local` 只改檔案）。`publish_episode.sh` 發佈時會自動記一筆。
- 目前的內容是從 git 歷史和 PR #1／#2／#3 回填的；commit 沒寫是哪個 bot 的，就標「未標註」。
- 所有文字都經過 `esc()`，連結只接受 `https://`。

## 💬 留言（giscus / GitHub Discussions）

- 每一格的 💬 會打開底部留言抽屜，背後用 giscus 接 GitHub Discussions。設定：mapping `specific`、`strict`，分類 `Announcements`（`repoId R_kgDOVDydcA`，`categoryId DIC_kwDOVDydcM4DHf-d`），設定值在 `feed.js` 的 `GISCUS`。
- **每一題 × 每個 bot 各自一串**：討論串的 term／標題是 `node:<nodeId> bot:<slug>`。

| slug | bot | 負責 |
|---|---|---|
| `radar` | AI 邊界雷達 | 新問題、延伸、來源 |
| `decomposer` | 問題拆解師 | 推演流程、問題類型 |
| `director` | 影像導演 | 影片與畫面 |
| `intp` | INTP 鏡像研究員 | 關於 Merlin 自己的思考 |
| `openness` | 開放性 | 把問題往外打開，一次列出多個開放式延伸問題，不急著收斂 |

- 留言框上方有一行灰字「留言將交給：影像導演（影片與畫面）」，下面有 chips 可以切換。預設：有影片的節點交給影像導演，開放性提出的節點（`bot:'開放性'`）交給開放性，其他交給 AI 邊界雷達。每一題最後選的 bot 會記在 localStorage。
- 啟用條件：Merlin 必須在 https://github.com/apps/giscus 安裝 giscus App 並授權 `keqingwu5-cloud/ai-boundary`（Discussions 已開啟）。還沒安裝的時候，抽屜裡會顯示提示，giscus 也會在 console 印出 "giscus is not installed on this repository"。
- 想用專屬分類的話：在 GitHub 網頁的 Discussions → Categories 新增（例如「影片留言」，建議選 Announcement 格式，這樣只有 giscus 能開新串），再用 `gh api graphql` 查出新的 `categoryId`，填進 `feed.js` 的 `GISCUS`。

### 🔁 把留言轉成問題（給 bot 的介面）
之後各個 bot 定期讀 Discussions，把回饋變成新節點：
1. `gh api graphql` 列出分類下的 discussions，用標題篩出自己的那幾串：`title` 含有 `bot:<自己的 slug>`，再從 `node:<id>` 解析出節點。
2. 讀留言 → 判斷是新問題、延伸、新方向、推演修正，還是媒體需求。
3. 寫回大腦：`AIBrain.addQuestion({..., parentId:'<id>', createdBy:'bot'})`、`AIBrain.addDirection('<id>', {...})`、`AIBrain.addCounterEvidence(...)`、`AIBrain.setMedia(...)`，或產出可匯入的 JSON。原文出處記到 `botNotes`（附 discussion 網址）。
4. 在該串回覆一則「已轉成節點 <id>」，讓留言的人知道。

## 🎬 發佈影集（scripts/publish_episode.sh）

一個指令完成：從 `origin/main` 開分支 `episode/<epNN>-<YYYY-MM-DD>` → 轉檔 → 放進 `media/videos/` → 更新 `content/media.json` → 在 `content/activity.json` 記一筆 🎬 動態 → commit → push 分支 → `gh pr create`。**不會直接推 main**；整合師合併 PR 後網站才會更新。

```bash
scripts/publish_episode.sh ep02 n_q2            # 第 2 集 → q2，開分支＋PR
scripts/publish_episode.sh ep03 n_q3 --local    # 只在目前分支 commit，不開分支、不 push（舊的 --no-push 也可以）
scripts/publish_episode.sh ep04 n_q4 --parent git-abd3a61   # 動態的「衍生自」
```
- 工作目錄要是乾淨的（不然先 commit 或 stash）；同名分支已存在時會自動加上時間。沒有 `gh` 的話會印出開 PR 的網址。

- 來源：`$SRC_DIR/<epNN>.mp4`（預設 `/workspace/影像導演/ai-boundary-series`）。對應關係：ep01–ep06 → `n_q1`–`n_q6`。
- 有 ffmpeg 的話會轉成手機串流用的格式：H.264 Main@3.1、yuv420p、固定 30fps、每 1 秒一個關鍵格（`-g 30`）、CRF 23（可用 `CRF=` 調整）、`-maxrate 2.5M -bufsize 5M`、AAC 128k/44.1kHz、`+faststart`、寬度最多 720、維持 9:16。影片長度不變，60 秒以上也可以；來源沒有音軌的話會補一條靜音音軌。另外拿第 0.8 秒的畫面存成封面 `<nodeId>.jpg`。不想轉檔就加 `--no-encode`，直接複製。
- 發佈時會自動執行 `scripts/bump_version.sh`，更新快取版本（見下方）。
- nodeId 必須存在於種子資料（`QUESTIONS` 推出的 `n_qN`／`n_qN_eM`、`content/seed-extras.json` 或補丁檔裡 `seedExtras` 的 id），找不到會列出所有可用的 id。
- `SEED_MEDIA`（`content/media.json`）只在節點的 `media.video`／`media.image` 是空的（或仍是 QUESTIONS 原本的 `videoUrl`／`imageUrl`，例如 q3 的 YouTube 連結）時才會填入；使用者自己貼的網址不會被覆蓋。已經有存檔的使用者，下次載入也會自動拿到新影片。
- 例外：如果使用者把影片清空，下次載入時會被 `SEED_MEDIA` 補回去，因為存檔裡分辨不出「刻意清空」和「從來沒設定」。

- EP1–EP6（n_q1…n_q6）都已換成 60 秒版（中文旁白、字幕燒進畫面），`media/videos/n_qN.zh-TW.srt` 附上同一份字幕。`content/media.json`（`SEED_MEDIA`）可以帶 `subtitles`／`subtitlesBurnedIn`；重新發佈時腳本會保留這兩個欄位。

### 種子節點補充（SEED_EXTRAS）
`content/seed-extras.json`（`SEED_EXTRAS`）放不在 `QUESTIONS` 裡的原創節點；之後 bot 要新增節點，寫在自己的補丁檔 `patches/<bot>-<date>.json` 的 `seedExtras`，載入時接在後面（`QUESTIONS` 原文不動）。載入時會補進大腦和 feed，接在 `parentId` 底下（如果父節點已經變成子腦，就跟著放進那顆子腦）。已經加過的 id 會記在 `state.seedExtras`，所以使用者刪掉之後不會再長回來。
- `content/seed-extras.json` 目前有 12 個節點：main #6 的 6 個 🎧 日文轉場音實驗室節點（`n_x_jp_audio_lab_v1`、`_e01`–`_e05`，最上面那個 `parentId:null`）排在最前面，接著是原本的 6 個新方向；順序跟 main 的 `SEED_EXTRAS` 一樣，所以拆檔前後的大腦完全相同。

目前有：
- `n_x_language`「語言是不是思考的邊界？」：🚀 新方向，接在 q4 底下，類型理解與意識，由 INTP 鏡像研究員提出。來源是影像導演 × INTP 鏡像研究員原創短片（2026-10-10），v2 版 56 秒，字幕已經燒進畫面；`media.subtitles` 另外附上 SRT，給搜尋和無障礙用。

### 🔓 開放性 bot 的 10 則開放式延伸（SEED_EXTRAS，2026-10-12）
- 開放性（slug `openness`）：把問題往外打開，一次列出多個開放式延伸問題，不急著收斂。節點標 `createdBy:'bot'`、`bot:'開放性'`。
- 10 則來自 X／Threads／INSIDE／政大論文／Dcard／Substack 的公開討論，各是一個 🚀 新方向（`n_x_open_*`），底下各有 5 個延伸問題（`n_x_open_*_e1`–`e5`），共 60 個節點：
  - `n_x_open_jspace`（<n_q6）、`n_x_open_llm_conscious`（<n_q5）、`n_x_open_lego`（<n_q3）、`n_x_open_paper_review`（<n_q2）、`n_x_open_eval_aware`（<n_x_alignment_faking）
  - `n_x_open_judgment_creation`、`n_x_open_polished_content`（<n_x_cognitive_offloading）、`n_x_open_borrowed_judgment`（<n_q4）、`n_x_open_ai_confide`（<n_q5）、`n_x_open_wrong_question`（<n_q4）
- 原頁面沒有日期的來源（Threads、Dcard）`source.date` 留空；政大論文只有年份。新概念 `判斷力`／`認知卸載`／`評測覺察`／`錯假訊息`／`情感依附` 已登記在 `CONCEPTS.defs`。
- 檔案：`patches/openness-2026-10-12.json`（`seedExtras` 60 個節點＋`conceptDefs` 5 個概念），載入順序排在 `intp` 補丁後面，跟 main 的 `SEED_EXTRAS` 順序一致。

### 🧭 問題拆解師的推理流程（SEED_PATCHES）
- `patches/decomposer-2026-10-11.json` 的 `seedPatches`（合併成 `SEED_PATCHES`）依節點 id（n_q1…n_q6）補上 `flow`（❓問題定義／◇前提假設／→推理步驟／🗣各方觀點／？未解關鍵點）、bot 反證（含來源連結）與 botNotes。`QUESTIONS` 原文不動。
- `applySeedPatch(n, st)` 在每次載入時執行（`migrate`）。同一個節點如果有好幾個 bot 的補丁，依 `patches/index.json` 的順序都套用。只做加法：
  - `reasoning`／`assumptions` 只有在「空的」或「仍等於原始種子」時才換成新版本；使用者改過的會保留。
  - 反證依 id、botNotes 依文字附加，不刪不改。
  - 套用過的記在 `st.seedPatches`（`<節點id>@<patchId>`），不會重複套用。要推新版本就換一個 `patchId`。
- 面板會把 flow 顯示成可收合的段落；【推測】會標成黃色小標，反證附 `↯ 針對` 與來源連結。
- 新方向（SEED_EXTRAS，createdBy bot・問題拆解師）：`n_x_cot_faithful`（<n_q2）、`n_x_model_collapse`（<n_q3）、`n_x_alignment_faking`（<n_q3_e2）、`n_x_cognitive_offloading`（<n_q5）、`n_x_latent_thought`（<n_x_language）。
- `語言`／`思考`／`邊界` 已登記在 `content/concepts.json` 的 `defs`（只是固定顏色與說明）。
- `structure-review.json` 的分裂、合併、改掛父節點、改標籤、`n_rev_*` 節點，以及新方向裡的 `x_crossLinks`／`x_suggestedNewConcepts` **都還沒套用**，要等 Merlin 確認。

### 🌿 n_x_language 的 4 個延伸問題（SEED_EXTRAS，kind extension）
- 放在 `patches/intp-2026-10-11.json`（`seedExtras` 4 個節點＋`conceptDefs` 12 個標籤），載入時接在 `content/seed-extras.json` 後面。
- 來自 INTP 鏡像研究員〈explainer-language-boundary.md〉「延伸問題」Q1–Q4：`n_x_language_e1`（理解與意識）、`n_x_language_e2`（能力邊界）、`n_x_language_e3`（社會影響）、`n_x_language_e4`（推理與判斷）。類型都已存在於 TYPES。
- 來源與反證取自同一份文件的「解說依據」與「查證備註」；【推測】的部分照原文標示。12 個新概念標籤已登記在 `CONCEPTS.defs`（kw 留空）。
- 延伸問題型的種子節點放在父節點旁邊（不像新方向往外推）；父節點被刪掉時不會加入。已加過的記在 `state.seedExtras`，刪掉後不會再長回來。
- 影片 v2（56 秒，字幕燒進畫面）已取代 v1；`n_x_language.zh-TW.srt` 也換成 v2 版字幕。

## 📱 iPhone 播放與快取

- **一個共用的 `<video>`**：feed 只有一個播放器，滑到哪一格就搬到哪一格。iOS 的「有聲播放許可」是跟著元素走的，所以第一次點擊開了聲音之後，後面每一集都會繼續有聲，自動接下一集也一樣。
- 換集時先設定 `src` 並呼叫 `load()`，再 `play()`。不加 `autoplay` 屬性，因為 WebKit 在 `autoplay` 跟程式呼叫的 `play()` 互搶時，可能卡在第一格。
- `play()` 被拒絕時（例如 iOS 低耗電模式），中間會出現大 ▶，點一下就播。另有看門狗：2.5 秒內沒播起來就顯示 ▶，不會只停在封面圖。播放中如果時間軸停住，會輕推一次（pause→play），不會重新載入。
- **聲音**：第一次點畫面任何地方就解鎖整段工作階段的聲音；右上角 🔇/🔊 和右側按鈕可以切換；被擋下時會顯示「🔇 點一下開聲音」。
- **連續播放**（⚙ 設定，預設開）：影集（`content/series.json`：EP1–6 是 q1–q6，番外是 `n_x_language`）播完會自動捲到下一集。關掉的話改成單集循環。預設排序是「🎬 影集順序」。
- **順暢度**：播放中不在影片上方做 backdrop blur，畫面外的格子和佔位動畫都會暫停；進度條用 `transform` 更新，且有節流；不另外用第二個 `<video>` 預載下一集，免得跟正在播的搶頻寬。
- **快取**：`scripts/bump_version.sh` 會把兩個頁面的 `?v=`、`window.__V` 和 `version.json` 改成同一個時間戳。頁面每次載入都會用 `no-store` 讀 `version.json`，如果比自己新，就加上 `?v=` 重新整理一次（同一個版本只會重整一次）。

## 🎯 知識掌握度（knowledge-score.js）

大腦和短影音的工具列上都有一顆小圓徽章，顯示「我對這些內容的掌握度」（0–100）。它只在背景默默記錄，不會跳出任何東西；點一下才會從左邊滑出「說明區」（手機上從底部滑出），✕ 或 Esc 就能關掉。

- **記錄什麼**（只存在這台裝置的 `localStorage['aiBrain.knowledge.v1']`，不連網）：點開哪些節點（短影音要停留 3 秒）、看節點內容的時間（90 秒沒有操作又沒在播影片就暫停計時）、影片實際播放到的段落（以 1% 為單位，快轉跳過的不算）、隔 30 分鐘以上的回訪、在節點上的動作（反證、研究進度、概念、分裂、媒體），以及 feed 的喜歡／收藏。
- **每個節點的分數**＝接觸 15＋停留 30（主問題 60 秒、其他 30 秒拿滿）＋影片 30（看過 90% 拿滿；沒有影片的節點這 30 分改用停留時間算）＋回訪 15（每次 +5，最多 3 次）＋動手 10（每種 +5，最多 2 次）。分數不會隨時間衰減。
- **主題分數**＝同類型（`TYPES`）所有節點的平均；**整體分數**＝全部節點的平均，沒看過的算 0。
- 說明區列出：整體分數、各主題分數、掌握最多的節點、還沒探索的節點、還沒看完的影片（點了會直接跳到那個節點），以及計分方式。底部有「重置」按鈕（會先確認），只清分數，不動大腦資料。
- 掛鉤：`app.js` 在 `select()`／`closePanel()` 多發 `AIBrain.on('select')`／`on('close')` 事件；feed 不用改，模組讀 `AIFeed.current()` 和 `<video>` 的事件。公開 API：`window.KnowledgeScore.compute() / raw() / open() / close() / reset()`。


## 🎧 日文轉場音實驗室（50 組實驗）

開啟 `audio-lab.html`，或由主腦工具列的 **🎧** 按鈕進入。這是獨立實驗頁；不取代原本的認知主腦或短影音頁面。

- 原創五音音型：JP01 月光、JP02 桜、JP03 雫、JP04 星、JP05 凪。
- 每個音型產生 10 種速度、音色、留白與音序變體，總共 **50 組**，在使用者裝置上透過 Web Audio 合成並播放；可下載個別 WAV。
- **技術硬門檻**：0.6–2 秒、合成音峰值 ≤ 0.95、RMS > 0.015。未通過者標記供人工檢查。
- **結構代理分數**：轉場長度 35%、音程及音序轉折 20%、音色與音程的柔和代理 25%、可延展性 20%。這些是人為設計的啟發式模型，不是已驗證的聽眾偏好，更不是銷售預測。
- **人工盲聽**：播放後以 1–5 評估日文轉場適配、主觀辨識度和舒適感，可附備註。只代表實際評分者的評價；50 個音樣不等於 50 個獨立聽眾。
- 以 `localStorage['aiBrain.audioLab.jpTransitions.v1']` 獨立保存 50 筆客觀檢查、人工分數、備註與時間戳；可匯出 JSON／CSV。更換裝置不會自動同步。
- 按「送入主腦」才把摘要暫存至 `aiBrain.audioLab.pending.v1` 並進入主腦；`audio-lab-import.js` 先另存 `aiBrain.audioLab.backup.<時間>`，再透過 `AIBrain.addQuestion` 與 `addDirection` **新增**摘要主節點及五個音型方向。既有節點、連線與歷史不覆寫。腳本會等主腦內容載完（`body[data-ready="1"]`／`AIBrain` 就緒，最多 30 秒）才動作；同一個實驗只會有一個摘要節點（同一份快照、或同實驗的新快照都沿用既有那個），五個音型方向也按音型去重，所以重送、重新整理都不會重複。失敗時保留待匯入記錄；瀏覽器沒有 WebGL 時不匯入，待匯入記錄留著。
- 驗證腳本：`node scripts/test_audio_lab.cjs`。檢查 50 組 ID 唯一、合成可重現、音波有效、技術門檻與代理分數合理性。

### 實驗證據界線

本次「50 次」是 50 個可重現的**合成樣本及程式化結構測試**；尚未完成 50 人盲聽，沒有量測日本語句切點精確度、TikTok 觀眾反應、聲音採用率或真實收入。日後的市場驗證結果應另附來源、時間、樣本數及反證，與結構代理分數分開。

## ☁️ 雲端同步（Supabase）

讓 Merlin 和 bot 在不同裝置上看到、編輯**同一顆大腦**。`config.js` 兩個值空白時，網站跟以前完全一樣（只用這台裝置的 localStorage，也不會下載 supabase-js）。

### 一次性設定（3 步）
1. 到 https://supabase.com 用 **keqingwu5@gmail.com** 建立新專案（地區選 Tokyo 或 Singapore 比較快）→ 左側 **SQL Editor** → New query → 把 `supabase/schema.sql` 整份貼上 → **Run**。編輯名單 `brain_editors` 已經預先放好 `keqingwu5@gmail.com`（可以重複執行）。
2. **Authentication → URL Configuration → Site URL** 填 `https://keqingwu5-cloud.github.io/ai-boundary/`（同一個網域底下的大腦和 feed 都能回跳，不用另外加 Redirect URL）。
3. **Project Settings → API**：把 Project URL 和 **anon public**（或 publishable）key 交給我，填進 `config.js` 後 bump 版本、push：
   ```js
   window.AI_BOUNDARY_CONFIG = { SUPABASE_URL:'https://xxxx.supabase.co', SUPABASE_ANON_KEY:'eyJ…', GRAPH_ID:'main' };
   ```
   anon key 本來就是公開的（權限由 RLS 控管），可以 commit。**service_role key 絕對不能放進 repo 或前端。**

之後打開網站 → 工具列同步按鈕 → 輸入 email → 寄登入連結 → 點信裡的連結就登入了。雲端是空的時候，第一位**編輯者**打開網站會自動把種子資料（加上那台裝置的本機修改）整份上傳。（Supabase 內建寄信每小時只能寄幾封；需要的話可以在 Authentication → Emails → SMTP Settings 換成自己的 SMTP。）

### 誰可以寫
- 只有 `brain_editors` 裡的 email（小寫比對）才能寫，由資料庫 RLS 強制，不靠前端：`is_brain_editor()` 檢查 JWT 的 email 在名單裡、而且跟 `auth.users` 裡**已驗證**的 email 一致。
- `brain_editors` 本身開了 RLS、沒有任何 policy、權限全部收回：網頁（anon／authenticated）讀不到也改不了，只能在 SQL Editor 管理：
  ```sql
  insert into public.brain_editors (email, note) values ('radar-bot@example.com', 'AI 邊界雷達');  -- 加人（小寫）
  delete from public.brain_editors where email = 'radar-bot@example.com';                       -- 移除
  ```
- 任何人都能讀共享大腦。沒登入、或登入了但不在名單裡 → 🔒 唯讀：本機照樣可以編輯，但只存在這台裝置，會提示「未登入」或「這個 email 不在編輯名單」。
- 沒有 DELETE 權限：刪除一律寫墓碑（`deleted=true`）。

### 介面
- 大腦工具列（🕘 左邊）和 feed 工具列（⚙ 左邊）多一顆同步按鈕：☁️ 已同步／⏳ 同步中／⚠️ 離線（修改先存在這台裝置）／🔒 唯讀。右上角小數字＝還沒上傳的修改數。
- 點一下打開選單：輸入 email 寄登入連結、登出、↻ 重新同步。
- 登入過期：自動用 refresh token 換新 token 再重試一次；換不到才提示「登入已過期，請重新登入」。只有資料庫真的拒絕（403／RLS）才會變成 🔒。
- **給介面／bot 用的 JS API**（`window.AISync`，`config.js` 空白時也存在，`enabled:false`）：
  | 呼叫 | 回傳 |
  |---|---|
  | `AISync.status()` | `'off'`（沒設定）／`'synced'`／`'syncing'`／`'offline'`／`'readonly'` |
  | `AISync.reason()` | 為什麼能不能寫：`'off'`（沒設定）／`'anon'`（沒登入）／`'checking'`（已登入、正在查編輯名單）／`'not-editor'`（已登入但不在 `brain_editors`）／`'editor'`（可以寫） |
  | `AISync.user()` | `null` 或 `{ id, email }` |
  | `AISync.isEditor()` | `true`＝已登入而且在編輯名單（＝`canWrite()`） |
  | `AISync.pending()` | 還沒上傳的修改數（有快取：大腦 `change` 事件、拉取、上傳、別的分頁改了資料時才重算，`status()` 也一樣） |
  | `AISync.pull()`／`flush()` | 手動拉取／上傳 |
  | `AISync.ready` | **Promise，只會 resolve、不會 reject、不會永遠等**：`config.js` 空白 → 立刻 resolve；啟用 → Supabase client 建好、第一次 session＋編輯名單檢查做完就 resolve（不等第一次拉取，所以 `status` 通常還是 `'syncing'`，但 `reason`／`canWrite`／`user` 已經是確定的）；初始化失敗（例如 `vendor/supabase.js` 載不到）也會 resolve，帶 `error`，狀態變 `'offline'`；超過 10 秒還沒好（`config.js` 可用 `READY_TIMEOUT_MS` 改）就帶 `timedOut:true` resolve（這時 `status:'syncing'`、`canWrite:false`；之後連上了照常同步，聽 `aisync:change` 就知道）。值＝`{ enabled, status, reason, canWrite, user, error?, timedOut? }` |
  | `AISync.isReady` | `ready` 已 resolve 時是 `true` |
  介面要等同步準備好再決定顯示什麼時，用 `const s = await AISync.ready;`，不用輪詢；也可以聽 `window` 上只發一次的 `aisync:ready` 事件（`detail` 同上；停用時事件在下一輪事件迴圈才發，所以稍晚載入的 script 也收得到，但最穩的還是 `await AISync.ready`）。
  狀態、原因或待上傳數改變時，`window` 會發出 `aisync:change` 事件（`detail:{ status, reason, pending }`），介面可以聽這個事件，不用一直輪詢。
  同步按鈕 `#bSync` 的 `aria-label` 固定是「雲端同步：已同步／同步中／離線／唯讀」（有待上傳時加「，N 筆待上傳」），跟 `title` 一起更新；`aria-expanded` 表示選單有沒有打開。
- **重置**（🕘 → 重置）只重置這台裝置：捨棄本機修改、改用雲端版本，**不會**清掉共享大腦或其他裝置（↶ 還能找回）。

### 資料模型（雲端）
| 資料表 | 內容 | 權限 |
|---|---|---|
| `brain_entities` | 共享大腦，一個實體一列：`(graph_id, kind, id)` 主鍵，`kind` = `brain`／`node`／`link`／`concept`／`pattern`／`meta`；`data` jsonb＝跟 `localStorage['aiBrain.v1']` 裡一模一樣的物件（上限 256 KB）；`deleted` 墓碑；`updated_at`、`updated_by` 由 trigger 填 | 所有人可讀；編輯者可新增／修改；不能刪除 |
| `brain_history` | 🕘 生長紀錄，只增不減，`hkey` 去重（payload 上限 16 KB） | 所有人可讀；編輯者可新增 |
| `brain_editors` | 可寫入的 email 名單 | 網頁完全碰不到 |

沒有個人資料表：喜歡／收藏、知識掌握度照舊只存在各自裝置的 localStorage。`meta` 列放 graph 頂層的其他欄位（`seedExtras`、`seedPatches`），`concepts`／`patterns` 每個名稱一列。`graph_id` 預設 `main`。

**為什麼一個實體一列**：兩台裝置改不同節點時互不影響；同一個節點同時被改才會「最後寫入者為準」。用 jsonb 是因為節點欄位還在一直長，不用每次改 schema。

### 合併規則（沒有 Realtime）
- **什麼時候抓**：載入時、回到這個分頁（focus／visibilitychange，最多 5 秒一次）、恢復連線時、自己寫入之後。不訂閱 Realtime。
- **待上傳＝跟快照的差異**：`localStorage['aiBrain.sync.v2:main']` 存「上次跟雲端一致時」每個實體的指紋。本機現在跟快照不一樣的實體就是還沒上傳的修改（刪掉的 → 墓碑）。沒有版本號、沒有佇列。
- **合併**：雲端資料先在本機跑一次 `migrate()`（`SEED_EXTRAS`／`SEED_PATCHES`／`SEED_MEDIA`／概念定義，只做加法），每一列都先經過 `sanitizeEntity` 補齊欄位、檢查網址和顏色，再把本機還沒上傳的修改疊上去。`seedExtras`／`seedPatches` 是只增不減的集合，所以「刪掉的種子不會長回來」「同一個補丁不會套兩次」在所有裝置都成立。編輯者會把補丁結果上傳；唯讀的人只在本機套用，不算成本機修改。這兩個集合比對時不管順序（新種子插在 `SEED_EXTRAS` 最前面也不會多出一筆待上傳）。
- **🎧 日文轉場音實驗室**：`SEED_EXTRAS` 裡的 6 個實驗室節點跟其他種子一樣處理。「送入主腦」（`audio-lab-import.js`）透過 `AIBrain.addQuestion`／`addDirection` 新增的節點就是一般的本機修改：編輯者會上傳，唯讀的人只留在這台裝置；同一個實驗只保留一個摘要節點（依實驗去重），所以已同步的裝置再送一次不會重複。實驗室自己的 50 筆紀錄（`aiBrain.audioLab.*`）不會上雲端。
- **第一次同步**：雲端有的實體（含墓碑）以雲端為準；只在本機有的實體當成本機修改，編輯者登入後會上傳；雲端才有的實體直接加進來。
- **離線**：修改照樣存 localStorage，恢復連線就自動上傳。
- **復原 ↶**：雲端來的修改也會套進復原快照，↶ 只撤銷你自己的上一步，撤銷本身也會同步。
- **feed** 只讀共享大腦（播影片時會等暫停再更新清單），不會寫回雲端。

### 🤖 bot 怎麼寫進共享大腦
**A. bot 使用者（建議）**：在 Authentication → Users → Add user 建一個 email＋密碼的 bot 帳號（勾 Auto confirm），把它的 email 加進 `brain_editors`，用 anon key＋它的 token 呼叫 REST，受 RLS 控管：
```bash
export SB=https://xxxx.supabase.co ANON=<anon key>
TOKEN=$(curl -s "$SB/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"radar-bot@example.com","password":"…"}' | jq -r .access_token)
NOW=$(date +%s000)
curl -s "$SB/rest/v1/brain_entities?on_conflict=graph_id,kind,id" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" -d @- <<JSON
[{"graph_id":"main","kind":"node","id":"n_bot_$NOW","data":{"id":"n_bot_$NOW","brainId":"main","parentId":"n_q2","kind":"extension",
  "title":"模型的推理鏈是否忠實？","type":"推理與判斷","oneLiner":"","status":"open","createdBy":"bot","createdAt":$NOW,
  "botNotes":["來源：…"],"concepts":["推理"]}},
 {"graph_id":"main","kind":"link","id":"l_bot_$NOW","data":{"id":"l_bot_$NOW","from":"n_q2","to":"n_bot_$NOW","kind":"derived","createdAt":$NOW}}]
JSON
# 記一筆生長紀錄（hkey 任意唯一字串）
curl -s "$SB/rest/v1/brain_history" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"graph_id\":\"main\",\"hkey\":\"bot-$NOW\",\"ts\":$NOW,\"action\":\"add\",\"payload\":{\"nodeId\":\"n_bot_$NOW\",\"title\":\"模型的推理鏈是否忠實？\",\"createdBy\":\"bot\"}}"
```
**B. 伺服器端用 service role key**（繞過 RLS）：同樣的 REST，把 `apikey`／`Authorization` 換成 service role key。只能放在 bot 自己的伺服器或 GitHub Actions secret，**絕對不能進 repo 或前端**。

規則：
- 缺的欄位（`media`、`pos`、`reasoning`…）網頁讀到時會自動補齊；網址只接受 `http(s)://` 或站內相對路徑，顏色只接受 `#hex`／`hsl()`，不合格的會被清掉。
- 新概念另外寫一列 `kind:'concept'`（`{"color":"#5eead4","desc":"","createdBy":"bot"}`）。
- **修改既有節點**：先 `GET /rest/v1/brain_entities?graph_id=eq.main&kind=eq.node&id=eq.<id>` 讀出 `data`，改完整份 upsert 回去（同一個節點以最後寫入者為準）。
- **刪除**：不要 DELETE，upsert `{"deleted":true,"data":null}`。
- 開著的頁面會在下一次回到分頁／重新整理時看到。也可以在瀏覽器（編輯者已登入）呼叫 `window.AIBrain.*`，會自動同步。

### 測試
```bash
node scripts/validate_content.mjs                          # content/、patches/ 的 JSON 格式
node --test tests/*.test.mjs                               # 全部單元測試：XSS／safeUrl、合併、快照差異、資料拆檔等價、JSON 檢查、AISync.ready（停用／初始化失敗／逾時都會 resolve）（不需要任何套件）
PGLITE=<@electric-sql/pglite>/dist/index.js node --test tests/rls.test.mjs   # 在 PGlite（WASM Postgres）跑真的 schema.sql 和 RLS
python3 -m http.server 8000 &                              # 冒煙測試（config 空白 → 跟原本一樣、沒有 JS 錯誤）
PUPPETEER=<puppeteer-core>/lib/esm/puppeteer/puppeteer-core.js node tests/smoke.mjs http://127.0.0.1:8000/
PUPPETEER=… node tests/mock-supabase.mjs                   # 假的 Supabase：編輯者／非編輯者 🔒／兩台裝置／離線／復原／墓碑／401 refresh／重置／XSS／feed／AISync.ready
```
這些都不是真的 Supabase；接上真專案後請再手動確認一次登入信回跳和兩台裝置同步。
