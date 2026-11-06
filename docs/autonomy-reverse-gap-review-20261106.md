# 自動化逆向缺口審查（2026-11-06）
審查基準：工程 4b4fddb617ccdf13c5f48bd7887526decdfb5e96 及總規格 V1.1。
範圍：本對話固定候選的本機原始碼；未查核其他代理最新提交，未部署。下列區分實際重現、程式靜態發現與尚缺整合證據。

## P0：已重現的權限恢復衝突
server.cjs ensureBootstrapGrant 尋找未 stopped/revoked 的 grant；找不到就用固定 grant-local-e2e-001 呼叫 createGrant。FileStore.createGrant 直接覆寫同名鍵。
使用 VM 執行原始 ensureBootstrapGrant 函式，配合真實隔離 FileStore：
- stopped=true → 啟動函式後 stopped=false、revoked=false。
- revoked_at 已設定 → 啟動函式後 stopped=false、revoked=false。
- expired grant → 原函式直接沿用，仍 expired（活著但不會恢復處理）。

這是函式級重現，不是正式環境事故。影響為 MOCK 候選的 STOP/撤權可被重啟清除；歷史 117 項測試未包含此情境。
必要修正：bootstrap 只允許全新明確授權的隔離資料集建立一次；既有 grant 不重建、不續期、不覆寫。停止/撤權/過期需可解釋阻塞，不由 supervisor 重新授權。

## P1：尚未整合的失效處理
| 缺口 | 證據強度 | 影響 | 最小修正/驗證 |
|---|---|---|---|
| 卡住不退出 | 靜態：Worker receive/status/prepareTask/performTask 等 await 無統一 deadline；HTTP fetch 無明確 signal/deadline | supervisor 只看 exit，無法辨識活著但不推進 | 分階段時限、進度心跳、失聯隔離；逾時不宣稱遠端取消 |
| 恢復鎖政策不一致 | 靜態：supervisor 遇 store.lock 停止；FileStore 超過 10 秒可刪鎖 | 停擺或錯把仍活躍鎖當 stale | 統一 ownership/fencing 與失效規則；多程序競爭和持鎖 SIGKILL 測試 |
| supervisor 自身死亡 | 靜態：supervisor.lock 只在 finally 清除 | SIGKILL 後下次啟動被舊鎖阻擋；無外層常駐 | 明確單一宿主與自身恢復方案；不得僅靠鎖齡刪除 |
| 重試預算未持久化 | 靜態：starts 是程序內變數 | 重開 supervisor 重置次數，多層重試可能放大 | 持久化任務/程序分別的預算、時間窗與 STOP |
| 預檢與啟動間競態 | 靜態：檢查與 spawn 非原子；PID 僅用 kill(pid,0) | PID 重用誤擋、其他入口可同時啟動 | run identity、唯一入口與 fencing；不是只檢查 PID |
| 派送前 abort 留下租約 | 靜態：aborted_before_dispatch 返回時沒有結束 lease | 之後過期轉 blocked，即使未發生外部副作用 | 記錄可證明的未派送結果；不可一概自動重排 |
| 退出收據未落地 | 既有日誌、exit 觀察不等於完整 receipt writer/validator | 重啟無法依可驗證死因與版本判斷 | 實作收據持久化與缺失/錯版/過期負例 |
| 真實執行通路未閉環 | DB 管理 SQL 單筆寫讀與 MOCK Worker 分開通過 | 不能證明 Node PgStore 真實連線與交易 | 同 SHA、同 event/attempt/digest 的受限 live runtime 驗收 |
| 獨立 ACK 信任鏈未接 | 尚無獨立接收方證據 | 具名訊息仍可能只是同一來源自證 | 信任域、簽章、nonce、時效與重放驗證 |

## P2：持續自主運作的閉環仍不完整
- 任務來源到入隊：尚無證據證明 GitHub 討論可自動、受控轉為授權任務；不能把任意留言當命令。
- 完成到下一輪：棋盤回寫、下一任務選擇、重複工作消除與背壓尚未接成常駐流程。
- 告警到負責人：有錯誤輸出不等於有人或系統已接收並承接處理；重啟上限後不能靜默。
- 正式候選管理：單一 SHA、環境/設定版本、依賴組合、回滾資料相容性尚需統一驗收。
- 測試環境邊界：FileStore 權限/鎖/分頁與 PgStore 不等價；預設測試金鑰和可配置 HOST 不能直接搬到公開部署。
- 證據保存週期：日誌/收據容量上限、清理、磁碟滿時的行為未驗證。
- M2.1 原有 4 項隔離測試尚未在最新整合候選對齊；不能用舊綠燈代替。
- 「結果正確」與「執行有收據」仍是不同契約；業務驗收器需隨任務類型定義。

## 收斂次序
1. 先阻止重啟重授權，加入 STOP/撤權/過期跨重啟驗證。
2. 補卡死偵測、分階段 deadline 與重試預算，再統一鎖/程序 ownership。
3. 落實微型收據，串真實 PgStore/Worker 與獨立 ACK。
4. 最後接常駐、任務入口、棋盤回寫、告警與回滾。

本輪為逆向審查，沒有改程式或新增 PASS 數。117 項歷史通過仍有效，但不證明上述缺口已消除。現況仍不具正式上線驗收條件。
