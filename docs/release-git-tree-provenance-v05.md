# 第一大腦｜隔離發布候選 V0.5：Git HEAD 與靜態資產來源比對

狀態：`ISOLATED_CANDIDATE / NOT_APPROVED / PRODUCTION_NO_GO`。僅限靜態合成預覽包，未經集中審核不得合併 main、切換 gh-pages、正式部署或變更權限。

## 原問題
PR #132 的打包器原先只驗證 `sourceSha` 的 40 碼字串格式，沒有核對 Git HEAD 或打包檔案是否來自該提交。這會讓未提交的資產或錯誤 SHA 被標示成某個發布版本，故此項不能當正式來源證據。

## 最小補強
1. 核對目前檢出的 Git 工作樹根目錄，要求 `HEAD^{commit}` 與來源 SHA 完全相同。
2. 逐一核對 10 個從程式碼複製的 allowlist 檔案，以及正在執行的打包器本身，均是已提交 Git HEAD 的一般檔案，且磁碟位元組與 `git show HEAD:path` 一致。符號連結、未入版來源或錯誤目錄一律拒絕。
3. 複製後再次比較輸出資產 SHA-256，避免檢查與複製間置換了不同內容。
4. 靜態 manifest 加入 `source_git_tree_matched:true` 且保持 `source_independently_verified:false`。公網驗證器拒絕欠缺 Git tree 欄位的舊版 manifest。
5. 無關的未追蹤檔案不會進入封裝，仍需部署前的公開內容、Git 歷史、授權與敏感性審查。

## 修復前後驗證
先在隔離本地以原始 V0.4 打包器搭配新增反例運行：18 tests / 10 pass / 8 fail；修補候選為 18 tests / 18 pass。遠端結果以本 PR 固定 HEAD 的 GitHub Actions job 原始日誌為準，不用本地數字替代正式 CI。

## 仍是 NO_GO
Git tree 一致性不代表外部身份可信、簽名核准或發布網址可用。既有 #131 公網探測 HTTP 404 尚未解除，真 iPhone/iPad Safari、獨立 BOT③ reviewer、正式資料與 #41 真 AI ACK、PostgreSQL 故障恢復、記憶/3D 一致性仍需分開驗證。本案不開啟任何 Pages 設定，不發布網站，也不更新正式資料。
