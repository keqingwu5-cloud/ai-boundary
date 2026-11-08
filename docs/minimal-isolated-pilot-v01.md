# 第一大腦｜最小隔離試運行 v0.1

## 目標
將原 PR #123/#124/#125 的 **V1.4～V1.6 真實隔離模組**接入一個最小且可以操作的網頁，讓合成資料 A+B 生成 X，再將 X+C 組成 Y；當 C 未知、刻意留白或受限，必須保留未知或拒絕，而不是自行填成 0。每一項結果可以顯示來源 r1、局部 SHA-256 指紋、規則及研究狀態。

## 嚴格範圍
- 基於 PR #125 HEAD `1535605f096737dfbc3b963cb41d89e9677d93cc` 新建隔離 Draft，不合併 main、不部署正式服務。
- 無個人資料、API 金鑰、真實記憶連線、跨 AI ACK 或系統寫入。完全使用人工作出的 MB 單位合成案例。
- 不使用 localStorage、IndexedDB、外部 API 或資料庫。按下運算時建立新的暫存 engine，刷新頁面後沒有資料。
- 若 C 為 REDACTED，V1.6 的 `ACCESS_DENIED_OR_UNAVAILABLE` 直接阻斷，不能透過結果猜測受限資料。
- Browser smoke 和 SHA 需獨立驗證：本機 JS 測試成功並不代表已執行 Chromium；若 Chrome 驗收失敗標 blocked。

## 輸入與輸出
1. A、B 是 0～1,000,000 的安全整數（MB）；X=A+B 使用 V1.5 `quantity_sum` 規則及 V1.4 hash/canonical refs。
2. C 可選 KNOWN（輸入整數）、UNKNOWN、MISSING、UNVERIFIED、INTENTIONALLY_OPEN、NOT_APPLICABLE、REDACTED。
3. C 已知 → Y=X+C; C 缺失/未證 → Y=null 並帶有狀態；C 受限 → BLOCK。
4. 可匯出候選 JSON，含 `scope:SYNTHETIC_SESSION_ONLY`、`remote_ack:NOT_VERIFIED`、`approval:NOT_APPROVED`、`persisted:false`。

## 這次還不能說「部署完成」
此份是**可操作的隔離靜態預覽**。完成定義為固定提交 CI Node、Chromium 真瀏覽器驗證與可下載的可重現離線包。GitHub Actions artifact 並非正式線上服務，不會自動執行或同步其他 ChatGPT。

## 驗收邊界
- 單頁功能 A+B→X→X+C 正向、未知、拒絕和版本顯示。
- 瀏覽器不對 storage/IDB 寫入，不用外部 fetch。
- 尚未有：真記憶同步、授權舊資料、Safari/iPad 真機、跨程序 ACK、持久化、斷電恢復、BOT③ reviewer、部署批准。

## 供使用者本機試用
下載包含 HTML 與模組的 ZIP，解壓後在該目錄執行 `python3 -m http.server 8765`，再開 `http://localhost:8765/preview/index.html`。也提供一個獨立單檔離線版（由同版模組拼接，只供本機測試），可以直接開啟。