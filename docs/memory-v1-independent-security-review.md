# 安全獨立記憶體 V1｜G2 獨立審查交接（候選、未批准）
**日期**：2026-10-23（Asia/Taipei）  
**路徑**：[Draft PR #59](https://github.com/keqingwu5-cloud/ai-boundary/pull/59) → PR #58 候選基底；[PR #27](https://github.com/keqingwu5-cloud/ai-boundary/pull/27) 深層資料驗證是重疊候選，正式合併前需確認去重。

> 這份文件是交接與自查整理，不構成真正的獨立審查。撰寫者與候選實作者為同一操作來源。獨立審查者、審查 ACK、使用者合併及部署批准均**尚未取得**。

## 核對時應固定的版本
- 第一批原驗證 SHA：`728bafb466020010a949e0049cb85c5717bd90d7`，CI [#39906426582](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/39906426582)：合成資料 66/66 Node + 9/9 Chromium PASS。
- 在此之後的額外隔離檢查（候選）：`scripts/verify-memory-v1-bundle.cjs`、`tests/memory-isolated-origin-policy.test.cjs`、擴充的 `tests/memory-browser-e2e.test.cjs`。**以審查當天 PR head 與該 head CI job logs 為準**，本文件不對尚未跑完的 CI 預先判定通過。
- 候選只在 Draft PR #59 branch；沒有 `main` 合併、真實後端、網域配置或私人記憶遷移。

## 安全性威脅與驗收清單

| 風險 | 目前防線及證據 | 獨立審查仍需檢查的事項 |
|---|---|---|
| 公開頁讀取/改寫密文 | 同 origin `localStorage` 可互讀（實際合成 Chromium 重現），列為 P0 | 必須分離 scheme+host+port；**不能用同 host 不同 path 假裝隔離**；正式 HTTPS 私人來源的部署授權與雙向驗證待辦 |
| JS／CSP 出站 | private-only bundle 只有五個來源檔及 index alias；`script-src 'self'`、`connect-src 'none'`、`form-action 'none'`；新增靜態阻擋與合成 Chromium 出站負測 | 實際平台 HTTP response headers、內容快取、service worker、第三方資源及網路實測；靜態字串掃描有繞過空間，不構成源碼安全證明 |
| 跨分頁同時寫入 lost update | `navigator.locks` 排他鎖包裹檢查、加密、commit；缺鎖 fail closed；修補後 synthetic Chromium & VM PASS，保留修補前 TOCTOU 重現 | 舊版分頁與未遵守鎖協定的同源 JS 仍可寫入；跨裝置沒有 transaction；手機 Web Locks 支援與故障中止需實測 |
| 備份還原風險 | 舊版 schema + 真 AES-GCM、損壞引用、Quota、錯密碼均用合成資料測試；還原需下載目前密文並二次確認 | 從舊 origin → 私人 origin 手動匯出/匯入；對原候選、記憶版本、拒絕記錄、audit checksum 校對；不能刪原庫直到還原驗證 |
| 權威候選分離 | pending、人工核准、來源版本衝突與修正另分支 | 語意對齊、來源身分、反證及舊版保留檢查；不可自動核准或上傳私人內容 |
| 實際使用 | 隔離 Chrome localhost synthetic E2E | 真正手機 Safari、桌面、HTTPS、無障礙、無 Web Locks 的唯讀提示、分頁/休眠恢復 |
| 容量／效能 | 加密 JSON 上限 700000 bytes；整庫加密與重繪；無擴容 | 不先提高上限；先量測 p50/p95 與容量，再決定分流、封存及遷移 |

## 真實 host 發布須由運維提供的證據（目前全部待辦）
1. **獨立 origin：**private hostname，HTTPS/TLS、DNS/站點 owner、路由、權限政策；與公開 `mainbrain`/`launcher` hostname 分離。不得將記憶庫 JS 設為公共站同來源。
2. **HTTP 安全回應標頭：**驗證 CSP response header 包含 `default-src 'none'; script-src 'self'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`，保留經審查的 `style-src 'unsafe-inline'`（除非後續移除行內樣式）。`frame-ancestors` **只能由回應標頭有效設定**，HTML meta CSP 無法代替。建議 `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Cache-Control: no-store`、`Permissions-Policy` 限制非必要功能，確認 HSTS 只在實際 HTTPS 部署與子網域策略審核後啟用。
3. **真實跨源負測：**公開頁在相同瀏覽器操作不能讀私庫密文／DOM／cookie；私人頁不應向公開來源傳送資料；檢查 network panel 與框架嵌入防護。
4. **遷移／回退：**在原 origin 保留加密備份，將副本手動匯入私人測試站；解鎖與逐筆核對後，不刪除原密文；復原失敗不覆寫當前庫。程式降版與資料回退分別測。
5. **審查身份與批准：**獨立審查者需以可核實的不同操作者／身分提交 findings，標記 critical/high、重跑固定 SHA 原始 CI；取得使用者 **先合併批准、再部署批准**，不可把本操作帳號的 GitHub 留言誤算獨立 ACK。

## 獨立審查應給的結論格式
- `reviewed_commit_sha`: 固定完整 SHA
- `reviewer_identity`: 能被驗證的操作者（不可由本系統自封 GPT①）
- `scope`: #27/#58/#59 相依、`memory.js` / 專用打包器 / 私人 origin
- `findings`: ID、嚴重性、重現命令、是否解決、驗證回歸 SHA
- `data_integrity`: 原始來源 ID／版次／候選／audit 在升級、回滾與併發下不遺失
- `security_origin`: 實際 private URL、header、public 無權訪問的證據
- `go_no_go`: 只有所有 P0 關閉且使用者核准才可 GO；否則 **NO-GO**

**當前結論**：`review_handoff_prepared`；`independent_review_not_performed`；`real_private_origin_not_provisioned`；`merge=false`、`deploy=false`、`private_memory_not_touched`。
