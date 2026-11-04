# 提示詞規則（影片管線 v2）

適用：AI 認知邊界系列直式 9:16、每集 6 鏡 × 10 秒、生成上限 **720p**。  
鏡頭生成在管線外完成；本文件是寫提示詞與送檢時的共用規範。

---

## 1. 硬性規則（每鏡都要遵守）

1. **鎖定鏡頭（locked-off camera）**。真實感鏡頭也要用靜態機位；不要推軌、搖鏡、手持晃動（除非實驗片明確要求）。
2. **首尾幀固定在乾淨角色圖**：每鏡的第一幀與最後一幀都回到同一張乾淨角色／定裝圖，避免變形累積；下一鏡以本鏡尾幀當起點時，接合會丟掉重複的首幀。
3. **物件遠離頭部**。光球、模組、文字卡、環、粒子都放在肩側、胸前外側或背景，不要貼臉、不要繞頭皮。
4. **不要粉塵粒子（no dust）**。半透明耳朵＋粉塵容易被檢查員判成鬼影。
5. **UI／螢幕畫面：不能有任何文字，也不能有手**。
6. **畫面內零文字**：no text, letters, numbers, symbols, glyphs, logos, subtitles, watermarks。
7. **正好一顆頭、一張臉**：Exactly one head and one face. No duplicate faces, no faces inside objects。
8. **生成上限 720p、9:16、約 10 秒**；聲音關掉或生成後丟棄（旁白／配樂由管線配）。

---

## 2. 共通 STYLE（貼在每段提示詞尾）

### 神經人（系列主角色，ep01–08 常用）

```
Same translucent humanoid of glowing blue-violet neural network filaments with a translucent brain and gold sparkles, standing still facing the camera, starfield background, navy violet gold palette, photorealistic cinematic lighting. Locked-off camera. Exactly one head and one face. No duplicate faces, no faces inside objects, no animals, no dust, no text, letters or symbols.
```

若工具支援參考圖：`reference_image_paths=[character_ref.jpg]`，`image_path=上一鏡尾幀或本集首幀乾淨圖`。

### 真人視角（characters/ c01–c10，例如 ep09 founder）

```
Same person as the reference 4-view / hero still: keep identity, wardrobe, and hairstyle locked. Vertical 9:16, photorealistic, cinematic lighting, locked-off camera. End on a calm, clean frame matching the hero still. No text, letters, logos. No dust particles. Keep props away from the head.
```

---

## 3. 否定詞清單（Negative / 禁止）

請整段附上或拆進工具的 negative 欄：

```
text, letters, numbers, subtitles, captions, watermark, logo, UI, HUD,
duplicate face, extra face, face in object, twin head, deformed face,
dust, particles near face, powder, smoke on skin, ghosting, double exposure,
hands on UI, fingers on screen, readable phone screen, readable laptop screen,
camera move, handheld, dutch angle, morphing identity, melting, warping,
animals, extra limbs, truncated body, low-res artifacts
```

針對檢查員誤判：**半透明耳朵 ≠ 鬼影**——避免耳周粉塵／重影；必要時在送檢說明寫「translucent ear filaments are intentional, not ghosting」。

---

## 4. 各類鏡頭模板

### A. 隱喻物件進出（肩側）

```
{物件} appears beside the figure's {left/right} shoulder, far from the head;
{動作：滑入／點亮／替換}；light pulse travels along a thin thread into the brain;
objects stay at shoulder/chest height; locked-off camera; end calm facing camera.
```

### B. 驗收／通過門檻

```
A thin golden hoop hangs beside the figure, far from the head;
{N} smooth glowing spheres drift through it one at a time;
pass → bright gold; fail → dull grey, bounce back, fade; locked-off.
```

### C. 背景網路／星場（勿靠近頭）

```
In the background starfield behind and below the shoulders,
tiny pinpoint stars connect with thin gold lines into a wide network;
soft pulses travel along the lines, then settle; nothing near the head.
```

### D. UI／螢幕（無字、無手）

```
A blank frosted glass panel floats at chest height showing only abstract
glowing shapes and color blocks — no readable text, no icons with letters,
no hands, no fingers touching the panel; locked-off camera.
```

### E. 真實人物靜態敘事

```
Medium shot of {角色描述}, locked-off camera, shallow depth of field,
soft window light, 9:16; ends on the same clean hero framing as the first frame;
no text in frame; props stay below shoulder line.
```

### F. 四視角參考圖（定裝，非成片鏡頭）

- 輸出 2×2：前／後／左／右；**左側應朝左、右側應朝右**。
- 自動左右翻轉曾判錯：產出後用人眼核對鼻尖方向；不確定就 `--force-mirror-right`（見 `characters/work/make_char_4view.py`、`lab02/work/make_4view.py`）。

---

## 5. 檢查員提問範本

送檢或自檢時可直接貼：

1. **機位**：整鏡是否全程鎖定？有沒有偷推／晃？
2. **首尾**：第一幀與最後一幀是否回到乾淨角色圖、身分沒漂？
3. **頭部安全區**：頭與臉周圍 10% 畫面內是否出現物件、粉塵、光斑？
4. **鬼影**：半透明耳朵／纖維是否被誤看成重影？若有粉塵請重做。
5. **文字**：畫面任何位置是否出現字母、數字、logo、字幕？
6. **UI**：若有螢幕，是否完全無字且無手？
7. **臉數**：是否始終只有一張臉、一顆頭？
8. **左右**：四視角或側面鏡，左右朝向是否正確？
9. **規格**：是否 9:16、約 10 秒、≤720p？
10. **銜接**：本鏡尾幀是否適合當下一鏡首幀（接合會丟下一鏡第 1 格）？

---

## 6. 旁白／字幕（與提示詞分開，但同一集要對齊）

- 字幕：**只繁中**，每行 **≤14 字**（建議 12–14）。
- TTS：`edge-tts` **HsiaoChen**（`v05_young_calm_hsiaochen`），語速 **-15%**。
- `tts` 欄可含標點；`cue` 欄是燒進畫面的字幕，必須 ≤14 字。

---

## 7. 素材庫備註

- 可商用底圖／SFX／音樂署名見 `stock-library/LICENSES.md`。
- 合成配樂／音色見 `sound-library/`（`music.style`：future／space／city／ancient／nature）。
