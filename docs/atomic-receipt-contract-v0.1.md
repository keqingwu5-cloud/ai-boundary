# 原子職責與微型收據契約 V0.1
日期：2026-11-06
狀態：DRAFT_SPEC；新增規格，不代表新增程式已實作或通過。
工程基準：4b4fddb617ccdf13c5f48bd7887526decdfb5e96（本機 117 項通過；真實 DB 探針另計）。
範圍：細分已明確定義的 L2/L3，不自行重定義 L1/L4。市場節點仍屬獨立研究，不部署主腦或交易動作。

## 先校正六個父模組
| 父模組 | 已有證據 | 尚不能宣稱 |
|---|---|---|
| M2.1 目錄隔離 | #89 固定版本的 4 項隔離測試 | 已涵蓋最新整合候選、所有檔案系統失敗 |
| M2.2 退出信標 | Worker 死亡時 HTTP 關閉、非零退出；supervisor 捕捉 exit/signal；日誌 | 完整結構化原因收據已持久化；SIGKILL 可由子程序自報；receive 錯誤等於 ACK timeout |
| M2.3 恢復預檢 | 本機鎖、JSON、事件/lease、存活程序檢查；blocked 不解封 | 已讀退出收據、外部 DB 已恢復、任務可重派 |
| M2.4 觸發 | 前景 bounded supervisor 已測試 | 已安裝常駐服務、已有 cron、自動重啟 supervisor 本身 |
| M3.1 DB 讀回 | 東京 PG17.11：管理 SQL 工具單筆 blocked 探針寫入、獨立讀回與 hash 驗證 | Node pg/Worker 真實端到端、併發與故障恢復完成 |
| M3.2 ACK | 本機認證與 synthetic ACK 測試 | 真正獨立接收方已驗證、具名且格式合法即可信 |

117 項不是每個原子的通過數；必須引用具體測試、版本與適用範圍。
消耗分開記錄模型請求、CPU/時間、磁碟、DB、CI；不呼叫模型不代表總成本為零。

## 優先細分：退出至恢復
原子是可測的職責邊界，不要求每顆拆成服務、套件或新程序。先抽既有純函式與注入介面，避免增加維運與額度成本。

| 原子 | 唯一職責 | 輸入 → 輸出 | 通過條件與限制 |
|---|---|---|---|
| M2.2a Exit Observer | 記錄程序終止觀察 | pid/run_id、exit/signal → exit_observation | 有可信父程序觀察；不推測死因 |
| M2.2b Reason Classifier | 將已知證據對應原因代碼 | observation、worker bounded error → reason_code | 可支持才分類；未知標 UNKNOWN，SIGKILL 不猜 OOM |
| M2.2c Receipt Writer | 保存一份不可覆寫的退出收據 | receipt → artifact_ref/hash | 暫存寫入、flush、原子發布、讀回核對；檔案系統支援與持久性保證須實測 |
| M2.3a Receipt Validator | 驗證收據來源與綁定 | receipt、預期 run/SHA/schema → validity | 版本、hash、來源、run 相符；缺失不補造 |
| M2.3b Local Pre-check | 檢查本地可啟動條件 | dataDir/runtime → local_ready | 鎖、資料格式、存活程序合格；不寫 store |
| M2.3c Dependency Probe | 驗證本次需要的外部依賴 | 明確依賴與時限 → probe result | 有時限且不產生業務副作用；不輪詢無關服務 |
| M2.3d Process Restart Gate | 決定是否可啟動程序 | 本地/依賴證據、STOP、重試預算 → allow/hold | bounded attempt、退避到期、停止優先；不能改任務狀態 |
| M2.3e Task Reconcile Gate | 決定單筆任務是否可續接 | event/attempt/digest、遠端結果 → hold/ack確認/重試候選 | 未知副作用保持 HOLD；程序已重啟不構成任務放行 |

M2.3a 嚴格收據檢查、M2.3c 外部依賴 probe 及完整 M2.3e 對帳目前是待實作規格；不能套用現有本機測試冒稱通過。
M2.2c 無法寫磁碟時，父程序可記「觀察到終止但退出收據缺失」；不得把 fallback stderr 當成已落盤，也不能承諾所有崩潰都有完整死因。

## 其餘原子的延伸邊界
- M2.1a：配置 run_id；M2.1b：驗證路徑歸屬與禁止逃逸；M2.1c：核對追蹤 evidence 未覆寫。
- M2.4a：接收觸發事件；M2.4b：去重與取得單一執行權；M2.4c：判斷到期與退避。只呼叫 Restart Gate，不給新業務授權。
- M3.1a：以唯一 probe ID 寫入合成、不可派工資料；M3.1b：另一次請求讀回；M3.1c：比較 identity、內容、digest；M3.1d：保存範圍明確的 DB 收據。
- M3.2a：驗證格式；M3.2b：驗證簽章與可信金鑰登錄；M3.2c：綁定 event/attempt/payload/nonce/audience；M3.2d：檢查時效與重放；M3.2e：確認接收方信任域獨立。合格的簽章只證明該金鑰持有者，不自動證明某個 AI 已理解或完成任務。
- ACK 逾時屬任務證據缺口，不一律讓整個 Worker 退出；隔離受影響任務，只有程序/連線層故障才交給退出機制。

## 共用微型收據
```json
{
  "schema_version": "atomic-receipt/v1",
  "receipt_id": "unique-id",
  "atom_id": "M2.3d",
  "run_id": "run-unique-id",
  "code_sha": "exact-commit",
  "input_digest": "sha256",
  "dependency_receipts": ["receipt-id"],
  "status": "PASS",
  "reason_code": "RESTART_CHECKS_COMPLETE",
  "decision": {
    "process_restart": "ALLOW",
    "task_replay": "HOLD"
  },
  "evidence": [{"ref": "artifact-ref", "sha256": "digest"}],
  "scope": "isolated_mock",
  "observed_at": "RFC3339",
  "valid_until": "RFC3339",
  "cost": {"model_requests": 0, "elapsed_ms": 0},
  "emitter": {"component": "supervisor", "identity_ref": "registered-id"}
}
```
此 JSON 是格式範例，所有值皆為占位，不能作真實 PASS 證據。
status：PASS=此原子的驗證完成；HOLD=合法阻塞且不可放行；FAIL=違反契約或核對失敗；NOT_RUN=未執行。不得把 HOLD 換寫成 PASS 來使總表變綠。
程序收據的 event_id/attempt_id 可不存在；任務與 ACK 收據必須附上 event_id、attempt_id、payload_digest。缺關鍵欄位即不可復用。
收據不保存 token、完整原始 provider output 或連線密碼。輸出 hash 只證明一致性，不能單獨證明來源真實性。

## 局部重跑與失效傳播
1. 只重跑失敗原子與受其影響的下游；不相關分支沿用仍有效證據。
2. 復用鍵至少包含 atom_id、code_sha、input_digest、設定與依賴收據 digest、環境身分。
3. 依賴變更、授權撤銷、STOP、超時或 nonce 使用後，對應結果失效；禁止用昨日綠燈批准今日動作。
4. 有副作用的寫入不能只靠 cache 跳過對帳；重試先用既有 idempotency key 讀回。
5. 「互不干擾」不是完全獨立：資料污染、共享儲存故障或授權問題可合法阻擋多個下游。把影響範圍寫明，而非承諾永不牽連。
6. 模組故障只記自己的觀察，不將未知上游原因改寫為確定因果。

## 世界模型的相同契約（研究限定）
C/U/T 節點拆成資料觀察、品質與時點對齊、替代解釋、因果判斷四種職責。原使用者材料中的資金流與政策敘事未在本輪取得市場資料驗證。
- 觀察收據：來源、交易所/商品、bid/ask 或成交口徑、時間、時區、延遲、成本/匯率口徑、缺值。
- 比較收據：同時點/可交易時間窗、匯率基準、費用、流動性與資料修訂。
- 假說收據：主張、機制、可替代解釋、支持/反證、可檢驗條件與失效時間。
- 因果收據：未排除替代解釋時只能 HYPOTHESIS/UNRESOLVED，不能標記「傳導通過」。
例如 C1 溢價觀察與「台灣大戶搬錢」分成兩顆；T1 跌、T2 漲是描述，不能單靠價格認定外資撤退或內資提前備料。具體市場解讀須另取可靠資料核對。
沒有在本輪建立每日下午 14:00 排程；未確認排程存在，不宣稱持續監看。

## 最小落地順序
先定義 receipt schema 與版本/失效規則 → 為既有 supervisor 加退出收據寫入及 validator → 驗證寫入失敗/過期/錯版負例 → 對接受限 DB runtime → 最後做可信 ACK 的獨立接收方驗證。
此次僅保存規格，未新增測試通過數、未部署、未修改 main、未啟用付費 API。
