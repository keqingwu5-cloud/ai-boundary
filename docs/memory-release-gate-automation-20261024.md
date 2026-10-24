# 記憶體 V1｜自動化驗證與正式發布阻擋（候選）

**基準**：PR #62 隔離整合提交 2e575be16f0788b915af003259cfe05247070dd9（#58 → #59 → #61）。僅新增候選流程；不改正式 main、私人記憶與站點。

## 本次自動化能力

1. 候選檔案異動時跑 9 項獨立守門單元測試（不取代原有 Node 85 與 Chromium 10 回歸）。
2. 產出 machine-readable JSON 證據盤點；產物名稱包含 GitHub run/attempt ID，腳本採排他檔案建立，不覆蓋同一次執行既有證據。
3. 目標為 main 的 pull request 會額外執行 strict 主線發布阻擋；安全證據未獨立驗證就回報 NO_GO（非零結束碼）。此為刻意失敗，不是程式異常。
4. 只要求 GitHub contents:read 權限，不使用 deployment secrets、不變更設定、沒有部署或核准 API。

## 嚴格邊界

- 驗證器只盤點必要檔案存在性：PRESENT_NOT_SECURITY_ATTESTED 不代表程式正確、系統安全或已上線。
- 任意 JSON、布林值、PR 留言自稱 owner-approved 都不能解除 NO_GO。正式授權必須經獨立可核實身分與原有規章。
- Gate 仍需真實私人 HTTPS origin / DNS/TLS / CSP 回應標頭、跨來源負測、真實備份遷移及回退、獨立 G2 reviewer ACK、owner 分別批准主線合併與部署。
- CI 已記錄同來源腳本可讀取私人密文；此 P0 在實體隔離驗證完成前保持 OPEN。
- 若 GitHub main 分支尚未將此 job 設為 required check，即使 strict check 為 FAIL，具權限的人仍可能手動合併。不得聲稱已取得正式分支保護。
- 不會自動解除 NO_GO：未來要引入真正授權驗證需另立設計與審查，不得以可編輯文字宣告通過。

## 操作與預期結果

- node --test tests/memory-release-gate.test.cjs：應為 9 PASS。
- GITHUB_SHA=<40位提交SHA> node scripts/memory-release-gate.cjs --out gate-evidence.json：返回 0 但 JSON 的 release_verdict = NO_GO。
- GITHUB_SHA=<40位提交SHA> node scripts/memory-release-gate.cjs --strict：應返回 1 且仍輸出 NO_GO。
- 保留原始 CI、錯誤、PR #27/#58/#59/#61/#62 和拒絕紀錄；新資料採追加，不覆蓋。
