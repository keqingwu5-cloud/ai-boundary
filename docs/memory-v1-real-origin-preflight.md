# 安全獨立記憶體 V1｜私人 HTTPS 來源部署前檢查（候選）
日期：2026-10-23（Asia/Taipei）｜適用：Draft PR #59 基於 #58｜狀態：**未配置實際私人網址、未部署、未經獨立審查**

## 目標與責任
第一階段要先穩定、獨立隔離並保留安全回滾；新技能、容量擴充、AI 自動派工是下一階段。**此文件與程式不是部署授權。** owner 按 #31 決策保留重要變更正式核准權；GitHub 人工交接；公開介面與私人記憶分離。

## 可在正式啟用前執行的唯讀命令
當獨立私人 HTTPS 試驗網址**由 owner 另外指定、已授權檢查**，且網站已有需驗證的回應標頭後，才在受控終端執行：

```sh
node scripts/check-memory-private-origin.cjs \
  --private-url https://PRIVATE-EXAMPLE.invalid/memory.html \
  --public-url https://PUBLIC-EXAMPLE.invalid/
```

請以真實 HTTPS 站點替換 **兩個示意的 .invalid 網址**；**不要**把密碼、token、私人備份、URL query 或 hash 帶入命令。預設執行一個**不帶 Cookie、匿名、唯讀 GET**，不跟隨轉址，只檢查私站 HTML 的 HTTP 回應標頭，輸出簡短 PASS/BLOCKED 與理由；不發送任何 vault 資料、不會建立、修改或部署網站。

**不會通過的條件**：同 hostname（即使 path 或 port 不同）、HTTP 而非 HTTPS、URL 存在帳密/query/hash、私頁轉址、缺少有效的實際 CSP HTTP header、`frame-ancestors 'none'` 缺失、`script-src 'self'` 以外的 script、`connect-src` 非 none、未禁用 iframe、`Content-Type` 錯誤、缺 `nosniff`、缺 `no-referrer`、缺 `Cache-Control: no-store`、頁面設置 Cookie、宣告外部 CORS、未設 `Cross-Origin-Resource-Policy: same-origin`、未達 HSTS 最低門檻。可把特別的部署設定提案提交 G2 審查，但不能直接略過門檻。

## 此驗證的安全界線
- `HOST_HEADERS_PASS_NOT_RELEASE_APPROVAL` **只代表指定 HTTP 回應的表面檢查通過，並非生產安全認證或正式發布批准。**
- localhost `http://127.0.0.1` 對應的是測試 API 使用的 `syntheticLoopback` 標記，CLI **不允許**用它代替正式 HTTPS；測試端回傳 PASS 也不能當成真實環境證據。
- CSP meta 無法實現 `frame-ancestors`；需要 host **HTTP response header**。缺少 response header 無論 HTML meta 寫得多嚴格都必須 BLOCK。
- header 靜態檢查**不能證明** DNS/TLS 供應鏈、無 XSS、無惡意 JS、無 service worker、無外部連線繞過、沒有跨設備資料競態、手機 Safari 可用。必須另做真實 Chromium/Safari、network／實際來源交叉負測及獨立 G2。
- 部署來源應使用不同 hostname、不同公開站權限；**不同 path 不夠**。所有權、TLS、CSP/CDN 邊界、Cookie Domain、快取與 service worker 需實體查核。現有 GitHub Pages 公開 origin **仍有 P0 跨同源腳本讀寫 localStorage 的漏洞**；Web Locks 不阻止惡意或舊版同源腳本。
- 檢查器只 GET 私人頁面，**不取加密庫／密碼／金鑰／任何後端 DB**。CI 測試只有不含機密的合成數據；不會對未授權的外部 URL 執行探測。

## G2／正式合併前證據包
| Gate | 最少證據 | 目前狀態 |
|---|---|---|
| Gate A | #27/#58/#59 差異、重複驗證、固定 SHA、GitHub 原始 CI log | 候選驗證可用，尚未整合正式 main |
| Gate B | 合成舊版備份、有效加密但結構損壞檔、錯密碼、Quota、Web Locks 同時寫入 | 已有候選 CI 證據；實機與新 host 仍待辦 |
| Gate C | 實際不同 private HTTPS hostname、TLS、DNS ownership、HTTP security headers、URL preflight 輸出 | **未設定／未執行，BLOCKED** |
| Gate D | 真實同瀏覽器公開站無法讀私人密文、private 沒有資料出站、service worker／Cookie／cache 等 | **只在 localhost 合成測過，BLOCKED** |
| Gate E | 原站加密備份保留、私人測試站人工匯入、逐筆記憶＋版本＋候選＋audit 完整核對、失敗回滾 | **未對真實站點進行，BLOCKED** |
| Gate F | 獨立操作者以可驗證身分審查固定 HEAD 和負測，記錄 findings | **未收到，BLOCKED** |
| Gate G | owner 分別明確核准合併和部署 | **未批准，BLOCKED** |

## 失敗時的操作
若 Gate A-F 任一失敗：**不合併、不部署**。先保留原始測試環境與備份，將出錯時的 SHA、Header 摘要（不含敏感資訊）、重現條件、預期/實際結果寫入 PR 討論；修復只進候選分支後重跑。若已有私人測試副本，先停止受影響寫入，切唯讀驗證。不能因為趕進度而清除舊 vault，也不能把程式退版當成資料回滾。

後續技能安裝／技能發射需另設資料契約與 owner 核准，不從本次前置驗證取得私人記憶存取權。
