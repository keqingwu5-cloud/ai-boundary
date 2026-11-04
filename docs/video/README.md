# 影片代碼簿與管線 v2 文件

- `codebook/video_codebook.md`、`video_codebook.csv`：全部影片素材代碼簿（78 筆），含代碼、規格、字幕、狀態。
- `codebook/build_codebook.py`：產生代碼簿的腳本（掃描影像導演工作目錄）。
- `pipeline_v2/`：影片管線 v2 說明（README）、提示詞規則（PROMPT_RULES）、升級報告（UPGRADE_REPORT）。

## 如何更新
1. 在 box 上重跑 `python3 build_codebook.py`（於 `/workspace/影像導演/代碼簿/`）。
2. 將產出的 `video_codebook.md`、`video_codebook.csv` 複製到 `docs/video/codebook/`。
3. 開分支、提交，開 PR 審核；勿直接推 main（合併會部署 GitHub Pages）。

註：
- 人工確認的交付狀態寫在 `build_codebook.py` 開頭的 `DELIVERED_OVERRIDE`（代碼 → 交付備註），目前含 EP07、EP07-CLEAN、EP08、EP08-CLEAN、EP08-FEED、EP08-CMP；重跑腳本會保留。新增交付時請改這份清單再重跑。
- `video_codebook.csv` 刻意帶 UTF-8 BOM，讓 Excel 正確顯示中文，請勿移除。
