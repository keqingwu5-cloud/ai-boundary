# GPT① ↔ GPT② 雙方獨立審查關卡（候選；2026-11-06）

## 基準與界線
- Issue #31（共同規章）、#41（交接證據／真實 ACK）、PR #98（隔離候選）。
- 最新候選 CI：run 42235383887，success；包含雙向與多模態回歸測試。
- CI success **不等於** 真實跨 AI 傳輸、身分驗證、接收端獨立 ACK、正式部署。
- 本文件為雙方審查用候選資料；GitHub 寫入成功 **不代表** GPT①／GPT② 已接收。

## 已有候選
- api/handoff-mutual-review-candidate.cjs：prepare / review / verifyAck / exchange；禁止宣稱 actual_ack。
- api/handoff-multimodal-contract-candidate.cjs：結構化 JSON 正規化、內容摘要、圖片實際 bytes 摘要、重複參照阻擋、來源證據待驗證、發送快照自檢。
- tests/handoff-mutual-review-candidate.test.cjs；tests/handoff-multimodal-contract-candidate.test.cjs；CI 已納入。

## GPT① 必須獨立審查
1. GPT①→GPT② 與 GPT②→GPT① 皆作為發送者／接收者，確認權限邊界、資料契約、事件版本、correlation_id、idempotency_key 的完整性。
2. 提出發送端失敗反例：資料快照變更、重送、錯誤路由、來源版本漂移、身分冒用。
3. 提出傳輸層失敗反例：送達不等於接收、重試造成重複、ACK 丟失、逾時、監視器失聯。
4. 列出既有規章差異與不可擅自改動之正式邊界；附可重現證據。

## GPT② 必須獨立審查
1. 不採信 GPT① 的結論為前提；自行取得來源與版本，對兩方向都進行接收端驗證。
2. 提出接收端失敗反例：偽造回執、圖片內容與語意不一致、錯誤證據參照、重複 event_id、摘要一致但身分未驗證。
3. 驗證 ACK 必須由目的端獨立寫入、來源端重新讀回且驗證身分與關聯；否則 actual_ack=false。
4. 對 GPT① 提出逐項反證及必要修補，附證據；不得以單元測試成功代替實機／遠端驗收。

## 三區監視與監視器自檢
- 依每個方向分開：發送端、傳輸通道、接收端。
- 每區至少保存 event_id、correlation_id、版本、來源、目的、時間、狀態、證據參照、監視器心跳。
- 無法判斷責任時標記 UNKNOWN；監視器無心跳時標記 MONITOR_UNHEALTHY，不得顯示健康。
- 禁止以 queued、HTTP 2xx、CI success、使用者自填 verified_identity 代替真實 ACK。

## 審查輸出契約
每方各交：審查者身分與角色、審查版本/commit、獨立證據、反例與重現步驟、風險分級、通過/阻擋/證據不足、與對方意見的差異、待使用者核准事項。雙方意見不一致先維持候選，不得覆寫原證據。

## 停止關卡
達到「雙方獨立審查待接收」即停止自動推進正式流程。未取得雙方真實接收證據、獨立反證與使用者正式授權前，不合併、不正式部署、不建立憑證、不改正式記憶。
