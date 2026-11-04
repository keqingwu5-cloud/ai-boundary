# 影片管線 v2 — 升級報告

日期：2026-11-04（Asia/Taipei）  
範圍：盤點 `ep0*_build`、`shot7.sh`、`tools/postpro.sh`、系列 `*_work` 時序筆記、代碼簿、stock／sound-library、characters／lab01–03；整合成 `影像導演/pipeline_v2/`。

---

## 1. 哪些腳本在重複？

| 能力 | 舊位置（每集一份或近似拷貝） | v2 |
|---|---|---|
| TTS 旁白 | `epNN_build/synth.py`（幾乎相同） | `lib/synth.py` |
| 排程＋ducking＋預混 | `epNN_build/build_audio.py`（每集改 layout／音樂） | `lib/audio.py`（由 yaml 驅動） |
| true-peak finalize | `epNN_build/finalize_audio.py` | `lib/audio.py:finalize_mix` |
| SRT／ASS | `epNN_build/make_subs.py` | `lib/subs.py`（ASS 絕對路徑） |
| 六鏡接合 | `epNN_build/join.sh` | `lib/join.py` |
| 720p 燒字幕編碼 | `epNN_build/encode.sh` | `lib/encode.py` |
| HQ／手機版 | `tools/postpro.sh`（已共用） | 仍呼叫它；`--skip-hq` 可跳過 |
| feed／封面／接觸表 | `batch_hq/run.sh` 後段 | `lib/deliverables.py` |
| 響度／字數檢查 | 散落在 postpro／手動 | `lib/verify.py` |
| 代碼簿 | `代碼簿/build_codebook.py` | 成品進 series 時自動重跑 |

`shot7.sh` 只是把附件拷進 agent assets 再呼叫 `shot.sh`，屬「收鏡頭」輔助，不進主流程。

---

## 2. 容易出錯的地方（已寫進規則或程式）

1. **ASS 相對路徑** → ffmpeg／libass 偶發找不到；v2 一律 `resolve()` 絕對路徑，並固定 `fontsdir`。
2. **ESRGAN worker 太多** → 機器被搶、中斷後要從 raw 續跑；預設 **最多 2 worker**，工作目錄可續跑（沿用 postpro）。
3. **首尾幀未鎖定** → 角色變形累積；PROMPT_RULES 強制乾淨首尾幀。
4. **物件貼頭／粉塵** → 檢查員把半透明耳當鬼影；否定詞＋送檢範本已列。
5. **UI 有字或有手** → 直接退件；模板 D 寫死。
6. **四視角左右翻轉誤判** → lab02／lab03／characters 的 auto-fix 曾翻錯；規則改為人眼核對＋必要時 force-mirror。
7. **字幕超 14 字** → synth／audio／subs／verify 四道擋。
8. **生成超過 720p** → 規則寫明上限；HQ 只走 postpro 升 1080。
9. **每集改硬編碼 layout** → 改 yaml 後容易漏改 pause／start；v2 單一來源。

---

## 3. v2 修了／統一了什麼？

- 單一入口 `make_episode`＋`episode.yaml`（範本＋ep08 實填例）。
- 旁白 → 字幕 → 混音 → 接合 → 編碼 →（可選 HQ）→ feed／封面／接觸表 → 驗收 → 代碼簿。
- **不包含**鏡頭生成（只讀 `shots[].file`）。
- 響度規格統一：**−14 LUFS**、true peak **≤ −1 dBTP**（limiter＋雙 pass loudnorm）。
- 短影音頁版：**1080×1920、30fps、≤35MB**，附封面與 srt。
- 測試可 `--until subs`、`--skip-hq`、`--reuse-clips`，輸出到任意目錄，不覆蓋系列成品。

---

## 4. 每集預估可省時間

依 ep08 `timing_notes.txt` 與過往手工切換目錄經驗（Asia/Taipei）：

| 階段 | 舊（約） | v2 後（約） | 節省 |
|---|---|---|---|
| 拷貝／改 epNN_build 腳本、改 layout | 20–40 分 | 填 yaml 5–10 分 | **15–30 分** |
| TTS＋混音＋字幕＋接合＋720p | 15–25 分（含除錯路徑） | 一鍵 10–15 分 | **5–10 分** |
| feed／海報／接觸表／驗收 | 10–15 分手動 | 自動 | **10–15 分** |
| HQ ESRGAN（2 worker） | 仍約 40–90 分牆鐘 | 同（可續跑） | 流程銜接省 **5–10 分** 切換成本 |

**合計（不含生成鏡頭、不含 ESRGAN 牆鐘）約省 30–55 分／集。**  
若連「少重做退件鏡頭」（提示詞規則＋檢查清單）算入，實務上常再少 0.5–2 小時重工。

---

## 5. 下一步建議（只列建議，不開通、不花錢）

1. **外部高畫質生成服務**（可選）：若未來 720p 來源品質不夠，可評估「生成端直接 1080p」或雲端 upscale API，用來替代本機 ESRGAN；需另估單價、隱私與是否仍要 RIFE。**本次不開通。**
2. 把 ep09 及之後新集只維護 `examples/epNN.yaml`，停用新的 `epNN_build/` 拷貝。
3. 代碼簿 `EP_META` 與 yaml 的 `title`／`node_id` 可再做成雙向同步（小工具）。
4. 檢查員半自動：對首尾幀做簡單 SSIM／臉數啟發式（本機、免費）。
5. feed 若常壓到 35MB 邊緣，把 crf 階梯寫進 yaml（`feed.crf`）。

---

## 6. 安全邊界（本次遵守）

- 未觸碰 ep02–07 的 ESRGAN 行程與 `*_hq_work`。
- 未開 ESRGAN；測試 `--skip-hq`，輸出僅在 `pipeline_v2/test/`。
- 未改網站、未付費。

---

## 7. 驗證結果（2026-11-04 15:48 Asia/Taipei）

指令：

```bash
/workspace/.venv-sound/bin/python make_episode examples/ep08.yaml \
  --out pipeline_v2/test --work pipeline_v2/test/work \
  --reuse-clips /workspace/ep08_build/clips_-15% \
  --skip-hq --until subs
```

- 出口碼 0；`cues.json` 與 `/workspace/ep08_build/cues.json` **完全一致**。
- 驗收：字幕每行 ≤14 PASS；**−14.21 LUFS** PASS；true peak **−2.22 dBTP** PASS。
- 輸出僅在 `pipeline_v2/test/work/`；未覆蓋 series／ep*_build 成品；ep07 ESRGAN 行程未受影響；未開 ESRGAN。
