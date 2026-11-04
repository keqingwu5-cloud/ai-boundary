# 影片代碼簿與管線 v2 文件

- `codebook/video_codebook.md`、`video_codebook.csv`：全部影片素材代碼簿（76 筆），含代碼、規格、字幕、狀態。
- `codebook/build_codebook.py`：產生代碼簿的腳本（掃描影像導演工作目錄）。
- `pipeline_v2/`：影片管線 v2 說明（README）、提示詞規則（PROMPT_RULES）、升級報告（UPGRADE_REPORT）。

## 如何更新
1. 在 box 上重跑 `python3 build_codebook.py`（於 `/workspace/影像導演/代碼簿/`）。
2. 將產出的 `video_codebook.md`、`video_codebook.csv` 複製到 `docs/video/codebook/`。
3. 開分支、提交，開 PR 審核；勿直接推 main（合併會部署 GitHub Pages）。

註：EP07/EP08（含 CLEAN）狀態為人工更正為「已交付」；腳本會依網站 media/ 判定而改回「試片」，重跑前請先修正腳本。
