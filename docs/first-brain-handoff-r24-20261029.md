# 第一大腦｜工程交接與恢復入口（R24；2026-10-29）

> **交接用途**：下一個對話框、下一個工程執行者或獨立審查者可從這份紀錄接手，不必重跑已通過的項目，也不得將隔離 CI PASS 說成正式整合 PASS。
>
> **最後核對**：2026-10-29。**正式放行：BLOCKED**。禁止未經使用者明確授權合併 `main`、部署、遷移私人資料或執行正式主腦還原。使用者要求「**真正需要正式整合決定時再通知**」，現階段不要要求整合批准。

## 一、工程所在位置

- 儲存庫：`keqingwu5-cloud/ai-boundary`。
- 交接的最高層 PR：[#75](https://github.com/keqingwu5-cloud/ai-boundary/pull/75)，head branch `test/legacy-concept-reuse-compat-20261027`，稽核時 HEAD `69aec4a9eb7abc3a57ad5a419bb608655507b4bf`。
- 依賴鏈**必須依序**：[#68](https://github.com/keqingwu5-cloud/ai-boundary/pull/68)（base `main`）→ [#71](https://github.com/keqingwu5-cloud/ai-boundary/pull/71)（base #68 branch）→ [#72](https://github.com/keqingwu5-cloud/ai-boundary/pull/72)（base #71 branch）→ [#74](https://github.com/keqingwu5-cloud/ai-boundary/pull/74)（base #72 branch）→ [#75](https://github.com/keqingwu5-cloud/ai-boundary/pull/75)（base #74 branch）。
- **實際核對五個 PR 都 open / Draft / merged=false / reviews=[]**。GitHub `mergeable=true` 並不表示已通過使用者授權、安全審查或實機 Gate。
- 討論紀錄／主要缺陷登錄：[Issue #32](https://github.com/keqingwu5-cloud/ai-boundary/issues/32)；長期工程稽核 `docs/legacy-concept-reuse-compat-r02.md`；R18 前置稽核 `docs/first-brain-r18-integration-review.md` 和 `docs/first-brain-r18-release-gates.json`。

## 二、最新 CI（切勿把舊 SHA 的綠燈冒充新修改）

[GitHub Actions #40853173647](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40853173647) 是核對時 #75 HEAD `69aec4a9eb7abc3a57ad5a419bb608655507b4bf` 的最新完成工作：
- Node.js **149/149 PASS**（包含 R24 正式還原唯讀預檢 6 項）；
- Chromium **43/43 PASS**（包含 R23 雙分頁 / abort 演練）；
- Linux 桌面 WebKit **11/11 PASS**（包含 R23 演練）；
- 三個工作 conclusion 均 `success`，0 fail。

**重要**：這些都是隔離候選與合成資料實測，**不是 macOS Safari、iPhone 或 iPad 硬體驗收**。本交接文件本身若新增後 HEAD 變成新 SHA，需視變更內容判斷是否重跑；不得將上述 Run 宣稱在未來程式修改後仍自動有效。

## 三、已證明的工程階段與可追溯證據

| 階段 | 目前得到的實際成果 | **不能推論** |
|---|---|---|
| R16／R15 | 3D 歷史格式與 Undo 的合成資料相容、舊寫入衝突的偵測與封鎖；R16 曾找到自動改寫原始 bytes 和 false ready 的真錯誤並修復 | 沒有使用者授權真人歷史語料或所有舊 JS writer 已停止 |
| R17 | 只寫隔離合成 IndexedDB 的裝置診斷入口、輸出人工核對 JSON；Chrome/Linux WebKit 合成診斷通過 | 沒有 Apple Safari/iPhone/iPad 實體裝置測試、受控預覽發布 |
| R18 | 五層 PR 依賴、變更熱點和放行 Gate 已盤點；未有獨立審查 ACK | CI PASS 不等於可合併 |
| R19 | 新世界模型 writer 使用 Web Locks 互斥；鎖缺失/忙碌時 fail closed；Chromium 與桌面 WebKit 真兩頁回歸 | 不能停止未更新的舊 writer 直接寫 `localStorage` |
| R20 | 已啟用 IDB 權威但 IDB 遺失時，3D/Feed 拒絕用舊 legacy 備份自動重建 | 沒有能力復原已被 OS 刪除的最新資料 |
| R21 | 使用者主動匯出 **目前 IDB** 的 graph/Undo 原始 bytes、revision、SHA-256；格式/內容/舊版本衝突可拒絕 | SHA-256 不是簽名或來源認證，沒有正式還原能力 |
| R22 | R21 合成備份只可在 `first-brain-r22-rehearsal-<id>` 隔離資料庫讀回；不覆寫較新版本、不升格權威 | 不是正式主腦還原 |
| R23 | 兩頁同時對同一測試 DB stage，恰一頁成功；Undo 損壞被阻擋；中止交易不留半筆；重載及刪除安全 | 不是未合作舊 JS 的完整防護 |
| R24（**最新**） | `first-brain-formal-recovery-preflight.mjs` **只讀**：檢查備份、舊 bytes 指紋及「現有 IDB 是否被授權查明」；即使符合仍永遠回傳 `status=blocked`、`restoreAuthorized=false`、`mergeAuthorized=false` | **沒有正式 restore API/UI、沒有權威切換、沒有人為審查或實機 ACK** |

R24 入口文件：[正式還原／Safari／獨立審查工作包](./first-brain-r24-formal-acceptance.md)，R24 Node 反例測試 `tests/first-brain-formal-recovery-preflight.test.mjs`。

## 四、未完成的三個主要 Gate（下一個對話應優先接手）

### Gate A｜正式還原 **BLOCKED**

- 現在只有 R21 匯出／驗證、R22/R23 隔離恢復，以及 R24 唯讀候選預檢。**沒有經批准的正式 IDB 還原工具或權威切換流程**。
- 下一步只能先審查正式恢復設計：核對外部備份來源、真實現有快照、版本、損壞／缺失與舊 writer；建構乾跑、雙向備份與回退演練；明訂誰批准與誰執行。
- 不得把 `currentSnapshot:null` 的呼叫參數當成真 IDB 已空；必須透過獲授權且可追溯的獨立讀取確認。
- 不得覆寫存在的較新 IDB 或把 legacy 原始 bytes 當成交易式目前版本。缺真實備份證據／明確使用者許可時不得執行復原。
- **不要接入正式 restore**，直到資料風險評估、獨立 reviewer、實機與使用者批准就緒。

### Gate B｜真 Apple Safari／iPad **BLOCKED**

- Linux desktop WebKit 和行動裝置模擬設定**不能代替實體裝置**；目前沒有真 iPad／iPhone Safari 操作證據。
- 需先有獲核准的受控 HTTPS 預覽，使用公開合成 Graph/Undo，且**不得向 GitHub 上傳私人快照**。
- 由實際持有 Apple 裝置的人操作：切 App、鎖屏、重開頁面、再讀同一合成內容、主動 abort、刪除隔離 DB、確認不自動建立；保留裝置／OS/Safari 版本、受測 SHA、報告與 reviewer 判定。
- 驗收步驟：`docs/first-brain-r17-device-acceptance.md`、`docs/first-brain-r24-formal-acceptance.md`。
- macOS Safari、iPhone Safari、iPad Safari 是不同證據，沒有真實執行不得勾 PASS。

### Gate C｜獨立 Reviewer 審查 **BLOCKED**

- #68、#71、#72、#74、#75 目前 GitHub reviews 全部空白；**工程作者／AI 自己的評論或測試摘要不是獨立核准**。
- `docs/first-brain-r24-formal-acceptance.md` 已列出三組審查責任：A 儲存／還原，B 跨頁權威與世界模型，C Safari 實機與合併／回退權限。
- 只有真 reviewer 在精確 PR HEAD SHA 下留下證據、可核對反例與正式 `APPROVED`，才能視為該條 Gate 的有效 ACK。新程式提交後須重新核對審查適用性。
- 不可虛構 reviewer、擅自邀請未知第三方、替使用者批准或直接把 Draft 改 Ready。

## 五、其他不能被忽略的 BLOCKED

- 使用者授權的真歷史樣本及授權範圍；沒有授權不讀私人資料；
- 未合作的舊 JS writer 停止／資料遷移一致性；
- 來源真實性：SHA-256 僅是 byte 完整性摘要，不是授權或來源簽章；
- 備份實際持久性、系統自動資料清理、授權部署與回退操作；
- 每次上游 PR 合併造成的變更必須逐層重跑最新矩陣。

## 六、接手規則（下一個對話框可直接執行）

1. **先讀這份交接**，再核對 PR #75 最新 HEAD、五層依賴鏈、最新 CI jobs 與真 reviewer reviews；沒有新證據的 Gate 不變。
2. **不要重做 R16–R23 已通過的相同合成測試**；若要動程式，先提出新的具體反例與最小失敗案例，再在隔離分支修補、保留第一次紅燈，測 Node／真 Chromium／桌面 WebKit，歸檔 commit SHA 和 Actions。
3. 以 R24 三個 Gate 為主，不擴張新功能、不平行另建第一大腦，不進行正式還原。
4. 沒有 Apple 實體設備、審查人、受控預覽或真資料授權時，**只能做前置工程、精確證據檢查與待驗收清單，絕不可替外部證據宣稱 PASS**。
5. 保持 GitHub [Issue #32](https://github.com/keqingwu5-cloud/ai-boundary/issues/32) 與 Draft PR #75 的證據鏈；PR 上游是 #74，依賴 #72→#71→#68，請勿直接合併最高層。
6. **使用者明確要求：真正需要正式整合（合併／部署）才提醒與確認**；不要每完成一個隔離回歸就要求批准，也不要擅自執行 merge/deploy。

### 下一個對話框接手指令（可複製）

「接手第一大腦 R24 之後的工作，先看 `docs/first-brain-handoff-r24-20261029.md`、`docs/first-brain-r24-formal-acceptance.md`、`docs/legacy-concept-reuse-compat-r02.md` 及 Draft PR #75、Issue #32。維持原 #68→#71→#72→#74→#75 堆疊，不重複 R16–R23 已通過測試。優先處理正式還原／真 Apple Safari-iPad／獨立 reviewer 的可驗證前置項目，所有外部證據未取得仍須 BLOCKED。不合併、不部署、不用私人資料。真正需要整合授權時才通知我。」
