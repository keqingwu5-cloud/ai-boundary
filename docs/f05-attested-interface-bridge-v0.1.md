# F05 × AUTO-TRUST 唯讀接口橋接 V0.1（2026-11-09）

> **隔離 Draft [#148](https://github.com/keqingwu5-cloud/ai-boundary/pull/148)**；以 [#128](https://github.com/keqingwu5-cloud/ai-boundary/pull/128) 固定 `cd8b78bf34ea7448482c42dd33132f00c9dddc8f` 為父版本。F05 的 [全工作預設查核](https://github.com/keqingwu5-cloud/ai-boundary/issues/31#issuecomment-6727335776)、[逐接口 6 項及退回](https://github.com/keqingwu5-cloud/ai-boundary/issues/31#issuecomment-6727627706)、[增量 12 項規範](https://github.com/keqingwu5-cloud/ai-boundary/issues/31#issuecomment-6727844683) **均是現行待審規章候選**；本橋接沒有把任何規章升為正式有效版。原 M2/M5/STOP、使用者批准及隱私限制不變。

## 1. 為何不重寫 F05 HTTP Gateway

2026-11-09 規章室 [F05 3 端口 Python HTTP Gateway 回報](https://github.com/keqingwu5-cloud/ai-boundary/issues/31#issuecomment-6728159236) 表示 localhost GPT1/GPT2/BOT3 的 114/114 測試已通過，ZIP `firstbrain_f05_gateway_v0_1.zip` 僅在另一個 ChatGPT 對話裡、沒有推送 GitHub；本輪未取得 ZIP 原始 bytes、沒有查原始 SHA、沒有重跑 Python 114 項，**不可宣稱本案已實現三端口或能與原 ZIP 直接互通**。

#128 的 `api/source-baseline-attestation.cjs` 只核實*呼叫者提供的*來源讀取者公鑰／基準管理者公鑰、已簽來源 scope/版本/原目的/內容指紋、外部 pinned head，之後委派到只讀 `scanEntry`。它不是 F05 的發送端／接收端簽章協定，缺少 F05 的每筆 interface message 審查欄位。

本次只建立 `api/f05-attested-interface-bridge.cjs`：**純本地、有限的 metadata 對接**，明確保留 UNKNOWN、停在本機隔離，提供衝突原因供人或真正獨立端點查核。沒有 socket、HTTP、DB、憑證、私人資料改寫、審核核准、真 ACK 或通知。

## 2. 規章十二項對照

| F05 項 | 本橋接在合成環境所做的檢查 | 合格時最終可信程度 |
| --- | --- | --- |
| 01 基本訊息 | schema、project、case、task、event、attempt、sender、receiver、source、目的、種類 | 只可標 **結構 PASS** |
| 02 版本 | source scope、revision、raw SHA-256 對照 #128 簽署來源 | 本地驗證後 **結構 PASS**，來源權威性仍未真證 |
| 03 ID | case/task 與預期一致；event/attempt 格式與重用阻擋 | **結構 PASS** |
| 04 放置順序 | container／slot／ordinal、sequence 對照傳入位置與前序 | **結構 PASS**；傳入位置不是真持久化 head |
| 05 邏輯 | 事件種類、目的 ID 與簽署聲明形式一致 | **UNKNOWN**：原問題語意、反證、因果仍需獨立核實 |
| 06 連結 | relation type、target ID 及版本在傳入登記表內一致 | **UNKNOWN**：關聯不代表依賴／因果真實 |
| 07 跨輪一致性 | previous_event_id；RETURN 須有原退回事件與原因；RESUBMIT 須指向被取代事件 | **UNKNOWN**：完整跨輪歷史、原始資料服務未讀回 |
| 08 錯誤重複／復發 | 同 event_id 同內容僅本地去重；不同內容拒絕 | **結構 PASS**，登記表本身未具獨立可信保存 |
| 09 雙端身分 | 文字端點需與**預先提供的預期路由**一致 | **UNKNOWN**：不是簽署且受信的真 AI 端點認證 |
| 10 排版 | 尚未取得另一個 F05 實際 message-body 格式／模板 | **UNKNOWN** |
| 11 文字循序 | 尚未解析正文、claim→evidence→conclusion 的實質關係 | **UNKNOWN** |
| 12 引用與使用紀錄 | 引用 ID、來源版本、來源摘要、locator、claim、readback、usage event/attempt/endpoint 與外部表的結構比對；跨來源引用可正確參照其各自摘要 | **UNKNOWN**：引用確實支持主張／真來源讀回／append-only use-log 未證 |

結構不符即加入精簡 `reasons: [{code, field_path, expected, actual, reason, suggested_correction}]`；絕不包含原始 message/body 私密資料。會保留原始 case/task/event 身分與原版本的 held 診斷，但不回送實際發送端。

## 3. 輸入與處理結果

`assessF05Interface({message,source,context,trust,baseline,head,now})` 是純 async 函式。`message` 是**本橋接候選的合成 schema `f05-bridge-v0.1`**，不是已核對的 Python Gateway 正式 wire schema。`source` 是 #128 格式；`context` 是預先固定的 target project/case/task/sender/receiver/scope/placement、上一事件與引用登記表。上述 context/trust/head 都**由呼叫者提供**，並非驗證器已取得的真實受信配置。

- `LOCAL_REVIEW_ONLY`：metadata 本地結構未發現衝突且 #128 來源本地驗簽完成；仍有 UNKNOWN 項，`approved:false`。
- `DUPLICATE_NO_EFFECT`：已見相同 event ID＋相同內容，僅本地去重，不表示先前成功送達。
- `QUARANTINE_NO_ROUTE`：沒有可信預期路由、來源簽章檢查不通過等，不猜目標。
- `QUARANTINE_NO_VERIFIED_SENDER`：已比出欄位衝突，且發送端只有路由欄位宣稱，沒有真正獨立端點身分驗證；暫時保留 `return_event.status='HELD_UNVERIFIED_SENDER'` 的診斷草稿，`return_to:null`、`route_verified:false`，不可送出。不得稱 `RETURN_POSTED`、`RETURN_DELIVERED` 或 `RECEIVED_ACK`。

所有結果固定 `action:'NO_EXTERNAL_EFFECT'`、`approved:false`、`actual_remote_ack:false`、`independent_sender_identity_verified:false`、`real_source_verified:false`。#128 `local_source_signature_valid:true` **只能證明測試來源讀取者對聲明簽名**；不能冒充 F05 endpoint 私鑰、正式 GitHub 擷取真實性或 AI 已執行。

## 4. RED → GREEN 實際測試

- 起始 RED SHA `ec1c7bc1fca787eb30b31175bc6dc1488e066b56`：[Actions #42628807310](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42628807310) 110/111；因橋接模組尚不存在，一個新測試檔無法載入，不代表 17 個情境逐項失敗。
- 首次 GREEN SHA `bcf6219ce25781d81e0648c77c0bfdb2fc65111c`：[Actions #42629104982](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42629104982) 127/127。
- RETURN/RESUBMIT/跨來源引用新反例 RED SHA `886583f0295a2678ab6117ff09fae38e0bb64930`：[Actions #42629316859](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42629316859) 129/132，3 項新反例失敗。
- 修正 [GREEN #42629438218](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42629438218) 132/132。
- F05 缺端點真實身分不可標可送達退回：新增反證 [RED #42629635624](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42629635624) 128/133，五項預期由 `RETURN_RECOMMENDED` 轉為隔離語義的測試失敗；修正後 [GREEN #42629745315](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42629745315) 133/133，0 失敗／0 跳過。

以上結果僅限對應 SHA 的 Node 合成測試；沒有第二端真運作、跨 AI ACK 或正式系統驗證。

## 5. 下一個獨立驗收 Gate

1. 由另一端提供**原 F05 ZIP bytes**（非僅 Issue 回報），重算 ZIP SHA、逐檔 digest，於隔離環境重新執行報稱 114 項。
2. 確定 Python Gateway 實際 JSON wire schema、端點公鑰／金鑰治理、簽名 canonicalization、入站／出站事件欄位，才能將本橋接候選與真 Gateway 做同源 payload 對照。
3. 建立受信的訊息來源服務、不可任意更動的審核基準 head／事件／引用使用鏈；需要防重播、並發重送、撤權與恢復負測。
4. 跨 F05 出入站真正身份、接收回執、使用者必要核准與獨立 reviewer 回覆均未驗證。獨立 Reviewer 應核固定 HEAD 和錯誤反例，不可由同一人／同一端自評通過。
5. 對上線前真 Chromium／Safari、真 PostgreSQL、真外部端點及停機／告警／成本邊界分關驗收。No main merge, deployment, long-term memory, permission or key change.

**狀態**：LOCAL_METADATA_BRIDGE_ISOLATED; F05_FORMAL_RULE_NOT_EFFECTIVE; F05_GATEWAY_BYTES_NOT_RECEIVED; TRUE_AI_ACK_UNVERIFIED; PRODUCTION_NO_GO.
