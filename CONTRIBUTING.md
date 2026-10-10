# 協作規則（給 Merlin 和各個 bot）

這個 repo 同時有好幾個 bot 在改。為了不互相蓋掉、出錯也找得到原因，**所有修改都走同一條路：開分支 → 只改自己的檔案 → 本機跑測試 → 開 PR → 整合師合併**。沒有人直接推 `main`（包含腳本）。

## 誰負責什麼

| 角色 | 負責 | 會改的檔案 |
|---|---|---|
| **Merlin** | 最後決定；自己提問題 | `content/questions.json`（只在最後**新增**題目，舊題原文不動）、`supabase/schema.sql` 的編輯名單 |
| 🧩 **問題拆解師**（`decomposer`） | 推理流程、前提、反證、問題類型 | `patches/decomposer-<YYYY-MM-DD>.json` |
| 📡 **AI 邊界雷達**（`radar`） | 新問題、延伸、新方向、來源 | `patches/radar-<YYYY-MM-DD>.json`（`seedExtras`、`seedPatches`） |
| 🎬 **影像導演**（`director`） | 影片與封面 | `media/videos/`、`content/media.json`、`content/series.json`（都由 `scripts/publish_episode.sh` 處理） |
| 🪞 **INTP 鏡像研究員**（`intp`） | 關於 Merlin 自己的思考 | `patches/intp-<YYYY-MM-DD>.json` |
| 🎨 **App 設計師**（`designer`） | CSS、面板、介面 | `index.html`／`feed.html` 的樣式與版面、`app.js`／`feed.js` 裡跟畫面有關的部分 |
| 🔧 **整合師**（`integrator`） | 同步、CI、合併 PR、清理 | `sync*.js`、`safe.js`、`data.js`、`schemas/`、`scripts/`、`.github/`、`tests/`、`patches/index.json`；合併 PR；每週清理 repo 副本 |

所有人都可以在 `content/activity.json` **最後面加**一筆自己的動態（用 `scripts/log_activity.mjs`）。

內容 bot 有共同的規則：
- **`content/questions.json` 的舊內容一個字都不能改**（CI 會擋）。要補充就寫補丁。
- **只加不改**：反證、botNotes、新節點都是「加」；要推新版本的推理流程，就在自己的補丁檔換一個新的 `patchId`。
- 不確定的推論標【推測】，附來源連結。

## 檔案在哪裡

```
content/
  questions.json     QUESTIONS（Merlin；原文不動）
  types.json         類型 → 顏色、圖示（整合師）
  concepts.json      概念層 defs／patterns／tags／process（整合師；bot 要新概念寫在自己補丁的 conceptDefs）
  seed-extras.json   既有的原創節點（凍結；新的寫在補丁的 seedExtras）
  series.json        影集順序（影像導演）
  media.json         節點 → 影片／封面（publish_episode.sh 自動寫）
  activity.json      📅 每日動態（只加在最後）
patches/
  index.json         要載入哪些補丁檔、依什麼順序（整合師；開 PR 時把自己的新檔名加在最後）
  <bot>-<YYYY-MM-DD>.json
schemas/             上面這些檔案的格式
```

### 補丁檔格式（`patches/<bot>-<YYYY-MM-DD>.json`）
一個 bot 一天一個檔案（同一天第二個可以叫 `<bot>-<date>-2.json`）。檔名的 bot 和日期要跟檔案內容一致。
```json
{
  "bot": "radar",
  "botName": "AI 邊界雷達",
  "date": "2026-10-12",
  "seedExtras": [
    { "id": "n_x_new_idea", "parentId": "n_q2", "kind": "direction", "title": "…", "type": "推理與判斷",
      "oneLiner": "…", "concepts": ["泛化"], "createdBy": "bot", "bot": "AI 邊界雷達",
      "source": { "who": "…", "outlet": "…", "date": "2026-10-12", "url": "https://…" } }
  ],
  "seedPatches": {
    "n_q2": { "by": "AI 邊界雷達", "patchId": "radar-20261012",
              "counterEvidence": [{ "id": "ce_radar_1", "text": "…", "by": "AI 邊界雷達", "source": "https://…" }],
              "botNotes": [{ "by": "radar", "text": "…" }] }
  },
  "conceptDefs": { "新概念": { "color": "#a3e635", "desc": "…", "kw": [] } }
}
```
- `seedExtras`：新節點，`parentId` 要指向已經存在的節點（種子題目、既有 extras，或排在前面的補丁裡的節點）。
- `seedPatches`：補在既有節點上。同一個節點可以有好幾個 bot 的補丁，依 `patches/index.json` 的順序都會套用；每個 `節點id@patchId` 只套用一次。
- `conceptDefs`：只加不蓋，已經有的概念名稱不會被改。
- 網址只接受 `https://`／`http://` 或 repo 內的相對路徑；顏色只接受 `#hex`／`hsl()`。

### Merlin 自己加題目
在 `content/questions.json` 的**最後**加一個物件（不要動前面的）：
```json
{ "id": "m1", "title": "", "type": "能力邊界",
  "source": { "who": "Merlin", "outlet": "", "date": "", "url": "", "also": [] },
  "oneLiner": "", "extensions": [{ "q": "", "type": "推理與判斷" }],
  "process": [{ "k": "問題定義", "v": "" }, { "k": "前提", "v": "" }, { "k": "推演", "v": "" }, { "k": "未解關鍵點", "v": "" }],
  "userInserted": true, "videoUrl": "", "imageUrl": "" }
```

## 標準流程

1. **拿最新的 repo**：第一次用全新 clone；之後每次開工前 `git fetch origin`。不要在別人（或別的 agent）的資料夾裡做。
   ```bash
   git clone https://github.com/keqingwu5-cloud/ai-boundary.git && cd ai-boundary     # 或：git fetch origin
   ```
2. **開分支**（從最新的 `origin/main`）：分支名 `<bot>/<主題>-<YYYY-MM-DD>`，例如 `radar/new-directions-2026-10-12`。
   ```bash
   git switch -c radar/new-directions-2026-10-12 origin/main
   ```
3. **只改自己的檔案**（見上表）。新的補丁檔記得加進 `patches/index.json` 最後面。
4. **本機跑測試**：
   ```bash
   node scripts/validate_content.mjs --base origin/main   # JSON 格式＋只增不減
   node --test tests/*.test.mjs                           # 單元測試（不需要安裝任何套件）
   python3 -m http.server 8000 &                          # 有改到畫面時：打開 http://127.0.0.1:8000/ 看一下
   ```
   有 puppeteer-core 的話可以再跑 `PUPPETEER=… node tests/smoke.mjs http://127.0.0.1:8000/`（CI 一定會跑）。
5. **記一筆動態**（建議）：`node scripts/log_activity.mjs --here --bot radar --kind content --title "…" --node n_x_new_idea`。
6. **commit、push、開 PR**：PR 說明用 zh-TW，寫清楚改了什麼、為什麼、來源、跑了哪些測試。
   ```bash
   git push -u origin HEAD && gh pr create --base main --title "📡 雷達：2 個新方向" --body "…"
   ```
7. **整合師合併**：CI 綠燈、內容只增不減、沒有改到別人的檔案，就合併（Squash 或 Merge 都可以）。有衝突時，整合師會請你 `git fetch && git rebase origin/main` 再推一次。
8. 合併後 GitHub Pages 約 1 分鐘更新；`bump_version.sh` 確保手機會拿到新版（發影片的腳本會自動跑；改程式的 PR 由整合師在合併前跑）。

### 有腳本的工作
- 發佈影片：`scripts/publish_episode.sh <epNN> <nodeId>` → 自動開分支 `episode/<epNN>-<date>`、更新 `content/media.json`、記動態、開 PR。
- 只記動態：`node scripts/log_activity.mjs --bot … --kind … --title …` → 自動開分支 `activity/<date>-…`、開 PR。
- 每週清理 repo 副本（整合師）：清完後 `node scripts/log_activity.mjs --bot integrator --kind cleanup --title "每週清理：…" --summary "刪了哪些副本、保留哪些"`。

## 不要做的事
- 不要直接 `git push origin main`，也不要 force-push 別人的分支。
- 不要把任何金鑰、token、密碼放進 repo（Supabase 只有 anon key 可以放 `config.js`；service_role key 絕對不行）。
- 不要改別人負責的檔案；需要的話開 issue 或在 PR 裡請對方改。
- 不要刪或改 `content/activity.json` 的舊紀錄、`content/questions.json` 的舊題目。
