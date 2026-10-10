# 3D 動態認知大腦 · AI 認知邊界（v1）

線上版：https://keqingwu5-cloud.github.io/ai-boundary/

把「AI 認知邊界」的公開提問種進一顆半透明 3D 大腦：每個問題是一個神經節點，可以**分裂**出子問題、讓整個腦區**獨立成子腦**、在不同子腦之間拉出**跨腦連結**，所有結構與歷史都會保存。

## 檔案
| 檔案 | 用途 |
|---|---|
| `index.html` | 介面（zh-TW）、樣式、`QUESTIONS`／`TYPES` 種子資料（6 題真實來源，原文未改） |
| `app.js` | Three.js 場景、資料模型、操作、儲存、歷史、公開 API |
| `vendor/three.module.min.js`、`vendor/OrbitControls.js` | Three.js r169（MIT，見 `vendor/LICENSE-three.txt`），本地化不依賴 CDN |

除 Google Fonts 外沒有任何外部依賴，也不需要 build。

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
- 種子資料在 `data.js`，大腦和 feed 共用（`QUESTIONS` 原文不動）。

### 掛影片
在大腦點節點 → 面板「🎞 媒體」→ 貼上網址按 ✓。只接受 `http(s)://` 或 repo 內的相對路徑（例如 `media/videos/n_q1.mp4`），其他 scheme 一律拒絕。

### 🎬 影像導演 bot 介面
1. 把產出的影片放進 `media/videos/`，建議檔名 `<nodeId>.mp4`（H.264 + AAC，直式 9:16，加上 `-movflags +faststart`）。
2. 讓節點的 `media.video` 指到它：`AIBrain.setMedia('<nodeId>', 'video', 'media/videos/<nodeId>.mp4')`，或匯入 JSON 時直接寫在 `nodes[].media.video`。封面圖可以放 `media.image`。
3. commit 並 push 到 main，GitHub Pages 更新後 feed 會自動顯示（`playable()` 認副檔名 mp4/webm/m4v/mov/ogv）。

## 💬 留言（giscus / GitHub Discussions）

- 每一格的 💬 會打開底部留言抽屜，背後用 giscus 接 GitHub Discussions。設定：mapping `specific`、`strict`，分類 `Announcements`（`repoId R_kgDOVDydcA`，`categoryId DIC_kwDOVDydcM4DHf-d`），設定值在 `feed.js` 的 `GISCUS`。
- **每一題 × 每個 bot 各自一串**：討論串的 term／標題是 `node:<nodeId> bot:<slug>`。

| slug | bot | 負責 |
|---|---|---|
| `radar` | AI 邊界雷達 | 新問題、延伸、來源 |
| `decomposer` | 問題拆解師 | 推演流程、問題類型 |
| `director` | 影像導演 | 影片與畫面 |
| `intp` | INTP 鏡像研究員 | 關於 Merlin 自己的思考 |

- 留言框上方有一行灰字「留言將交給：影像導演（影片與畫面）」，下面有 chips 可以切換。預設：有影片的節點交給影像導演，其他交給 AI 邊界雷達。每一題最後選的 bot 會記在 localStorage。
- 啟用條件：Merlin 必須在 https://github.com/apps/giscus 安裝 giscus App 並授權 `keqingwu5-cloud/ai-boundary`（Discussions 已開啟）。還沒安裝的時候，抽屜裡會顯示提示，giscus 也會在 console 印出 "giscus is not installed on this repository"。
- 想用專屬分類的話：在 GitHub 網頁的 Discussions → Categories 新增（例如「影片留言」，建議選 Announcement 格式，這樣只有 giscus 能開新串），再用 `gh api graphql` 查出新的 `categoryId`，填進 `feed.js` 的 `GISCUS`。

### 🔁 把留言轉成問題（給 bot 的介面）
之後各個 bot 定期讀 Discussions，把回饋變成新節點：
1. `gh api graphql` 列出分類下的 discussions，用標題篩出自己的那幾串：`title` 含有 `bot:<自己的 slug>`，再從 `node:<id>` 解析出節點。
2. 讀留言 → 判斷是新問題、延伸、新方向、推演修正，還是媒體需求。
3. 寫回大腦：`AIBrain.addQuestion({..., parentId:'<id>', createdBy:'bot'})`、`AIBrain.addDirection('<id>', {...})`、`AIBrain.addCounterEvidence(...)`、`AIBrain.setMedia(...)`，或產出可匯入的 JSON。原文出處記到 `botNotes`（附 discussion 網址）。
4. 在該串回覆一則「已轉成節點 <id>」，讓留言的人知道。

## 🎬 發佈影集（scripts/publish_episode.sh）

一個指令完成：轉檔 → 放進 `media/videos/` → 更新 `data.js` 的 `SEED_MEDIA` → commit → push。

```bash
scripts/publish_episode.sh ep02 n_q2          # 第 2 集 → q2
scripts/publish_episode.sh ep03 n_q3 --no-push  # 只在本機 commit，先不推
```

- 來源：`$SRC_DIR/<epNN>.mp4`（預設 `/workspace/影像導演/ai-boundary-series`）。對應關係：ep01–ep06 → `n_q1`–`n_q6`。
- 有 ffmpeg 的話會重新轉成 H.264/AAC，CRF 26（可用 `CRF=` 調整），加 `-movflags +faststart`、寬度最多 720、維持 9:16，並拿第 0.8 秒的畫面存成封面 `<nodeId>.jpg`。不想轉檔就加 `--no-encode`，直接複製。
- nodeId 必須存在於種子資料（`QUESTIONS` 推出的 `n_qN`／`n_qN_eM`，或 `SEED_EXTRAS` 的 id），找不到會列出所有可用的 id。
- `SEED_MEDIA` 只在節點的 `media.video`／`media.image` 是空的（或仍是 QUESTIONS 原本的 `videoUrl`／`imageUrl`，例如 q3 的 YouTube 連結）時才會填入；使用者自己貼的網址不會被覆蓋。已經有存檔的使用者，下次載入也會自動拿到新影片。
- 例外：如果使用者把影片清空，下次載入時會被 `SEED_MEDIA` 補回去，因為存檔裡分辨不出「刻意清空」和「從來沒設定」。

### 種子節點補充（SEED_EXTRAS）
`data.js` 的 `SEED_EXTRAS` 放不在 `QUESTIONS` 裡的原創節點（`QUESTIONS` 原文不動）。載入時會補進大腦和 feed，接在 `parentId` 底下（如果父節點已經變成子腦，就跟著放進那顆子腦）。已經加過的 id 會記在 `state.seedExtras`，所以使用者刪掉之後不會再長回來。

目前有：
- `n_x_language`「語言是不是思考的邊界？」：🚀 新方向，接在 q4 底下，類型理解與意識，由 INTP 鏡像研究員提出。來源是影像導演 × INTP 鏡像研究員原創短片（2026-10-10），36 秒，字幕已經燒進畫面；`media.subtitles` 另外附上 SRT，給搜尋和無障礙用。
