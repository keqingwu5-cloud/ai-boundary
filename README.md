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
