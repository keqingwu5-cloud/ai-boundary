# 第一大腦｜Pages V0.2 部署後唯讀驗收與安全停用候選

## 固定來源與界線
- 主工程只限合成資料隔離預覽，正式主腦 main、aiBrain.v1、私人記憶、跨 AI ACK 均不變。
- V0.2 審核來源：Draft PR #129 HEAD `e7a0ec5b4a273a88645a4977b9820eeda7c537a3`。
- 真正已同步至 gh-pages 的快照：`0d79eabe04db78f4b49b9dca25f952503c3e3f33`（三份文件精確 blob 回讀一致）。
- 上一版 gh-pages 快照：`03fc52e052179c0bfb1a90c42165dddd68b6ff8e`（因會復原空白被當作 0 的已知缺陷，**不能作為安全回退**）。
- 獨立維護頁候選：分支 `safety/pilot-maintenance-page-v01-20261109`，提交 `a3a57a7e8e11b3f162a0b9e14f9e9552a26a82cb`。此分支 **未發布、未切換**；只能在另行批准的停用事件中使用。
- 受限：GitHub Pages 啟用設定尚未由 GitHub 工具取得確定證據；對外 URL 是否上線需實際 HTTP 回應和人類 Safari 操作證據。

## 本輪執行的附加審查
1. 以固定 commit check out 已發布版本及舊備份，不改任何發布分支。
2. 驗證現行靜態版本恰好 9 檔，不包含正式 app.js/data.js/記憶或 API 程式。
3. 驗證三個修補檔的內容 blob SHA 與 PR #129 完全一致；V1.4～V1.6 引擎在新舊快照間不變。
4. 利用 WebKit 引擎模擬手機尺寸 390×844，測初始 UNKNOWN、明確 0、空白拒絕、修改後舊匯出失效；**不把它叫作真 iPhone Safari**。
5. GitHub Actions 公網 probe：對公開試用 URL GET，只有 HTTP 200、實際內容含 V0.2 註記時才標 HTML 可讀；其餘標 NOT_VERIFIED/NOT_ENABLED。probe 作為**診斷**，就算其 job 綠燈也不代表網站上線。
6. 判斷舊版備份為 **UNSAFE_ROLLBACK**。建議在故障發生時關閉 Pages，或另經人工批准把 `safety/pilot-maintenance-page-v01-20261109` 的安全停用版本發布至 gh-pages；不可盲目倒回舊 V0.1。

## 已識別後續差異
**目前 gh-pages 的 `pilot-manifest.json` 仍指向原始 PR #127 HEAD**，不是實際部署的 V0.2。這可能讓外部 reviewer 誤認發布版次。此輪先在唯讀 CI 明確偵測為 `MANIFEST_SOURCE_HEAD_OUTDATED`，不自行修改 gh-pages 第四個檔案。

## 維護頁候選安全特性
- `index.html` 和 `preview/index.html` 只顯示暫停服務文字，無 JS 模組、輸入欄、外部追蹤或記憶接口。
- 此分支由當前發佈 HEAD 作父提交，可在確認沒有其他同步修改時快速切換；但在使用者核准前**不可把 gh-pages 指向維護版**。
- 如果連 GitHub Pages 發布環境已被入侵，單靠維護頁不是充分補救，需停用 Pages 並核查存取與 GitHub 權限。

## 最終人工審查（待核准）
- 你是否確認試用站是公開靜態頁、**只輸入合成資料**？
- 你是否在 Settings → Pages 選擇 Deploy from a branch / gh-pages / (root)，並親自從 iPhone/Safari 打開網址？
- 下一輪是否批准額外更新 `pilot-manifest.json`，修正版本來源不一致？
- 是否同意把「停用 Pages 或安全維護頁」設定為正式試用站回退策略？

**目前不得宣稱正式系統部署或 Safari 真機驗收完成。**
