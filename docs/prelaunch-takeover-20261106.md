# 第一大腦上線前收斂：接手紀錄
日期：2026-11-06 Asia/Taipei
本對話執行者依使用者「我讓你接手最後任務」接手上線前收斂；不代稱其他執行者已停止或已收到通知。授權涵蓋隔離研究、修補、測試與發布準備；不含 main 合併、正式部署、新付費或權限擴張。

## 最新來源核對
- #93：open/unmerged，bcdb3c1d53322ea1123d31120e8475205e7854e3。
- #94：open/unmerged，a3c51d82067c863811a8c9a5f79dd0e9b770ae8e。
- #95：open/unmerged，325bcd98a6e4dbf5a6d1435b18f933df597cae91；base 為 #93。
- #96：merged 進 #48 候選分支，非 main；head 0f9d2b39987977a079c605afd8a4539c71aa33bc。
- #48 最新核對 head：5a235717f8c57b303e142ae968044994be1bea53，open/unmerged。
- B4 原回件：BLOCKED/NOT_RUN，缺已授權非正式 PG17 連線。
來源：https://github.com/keqingwu5-cloud/ai-boundary/issues/30#issuecomment-6661440424

## 本輪真正執行
從 GitHub 固定 SHA 取回 api/ 與相關 tests/ 原始檔到各自隔離目錄。不是完整 checkout；沒有把來源 SHA 冒充本地 git HEAD。無遠端模型 API、正式資料庫或部署。

### #94 固定 SHA
命令：node --test tests/mainbrain-store-readback-b2.test.cjs
實際：tests 8 / pass 8 / fail 0 / cancelled 0 / skipped 0。
涵蓋單 client RR 指令、rollback/release、截斷標記、分頁、指定 report、參與者權限與突變檢查。
限制：mock pool，並未驗證 PostgreSQL 真正交易隔離。

### #95 固定 SHA（內含 #93）
命令：node --test tests/mainbrain-worker-abort-b3.test.cjs tests/mainbrain-revocation-candidate.test.cjs
實際：tests 25 / pass 25 / fail 0 / cancelled 0 / skipped 0。
涵蓋 B1 證據保存、B3 abort/有限善後逾時、R03/P0 回歸與突變檢查。
限制：局部合成測試，並非外部 runtime 或可信 M2M ACK。

兩組為不同候選版本，不能相加成整合套件的「33 項驗收通過」。
目前是本對話獨立重跑既有測試，不是新第三方身分認證或完整審查通過。

## 最後任務範圍與順序
1. 固定 #48 新基線，核對 #96 及其他增量；保留 B1/B2/B3 的修補與測試，避免較舊 worker 覆蓋新增身分驗證。
2. 在獨立整合候選中解決相依與衝突，跑同一版本完整回歸。未開始，不得標完成。
3. 接續治理收據 B 的 worker/PID/HTTP 健康分離與 receive 失敗測試；B3 abort 修補不等於 supervisor 恢復完成。
4. 查驗既有非正式 PG17 測試入口；原 B4 不可由 mock 升格。無可用既有授權環境時，列出具體缺口與方案供一次決策，不索取正式秘密、不另啟用計費資源。
5. 確認一筆任務讀取、執行、持久保存、回傳、原端讀回與未知結果不重派；可信外部 ACK 另驗。
6. 交付固定候選 SHA、證據索引、限制、成本/權限、部署與回滾步驟，提供 GO/NO_GO 建議。
7. 使用者最後核准才可正式發布；本輪 DEPLOY_NO_GO 保持。

## 狀態
接手與來源對帳：完成。
B1/B2/B3 指定測試獨立重跑：在各自固定候選版本通過。
最新整合候選／真 PG B4／常駐恢復／可信跨 AI E2E／部署：未完成。
本紀錄不代表背景常駐工作已啟動，也不表示已通知 GPT②/BOT。
