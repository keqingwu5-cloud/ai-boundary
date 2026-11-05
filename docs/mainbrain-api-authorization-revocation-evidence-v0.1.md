# ADR-CANDIDATE 07 — 第一大腦事件持久化、授權撤銷與歷史證據邊界 V0.1

- **狀態**：DRAFT_IMPLEMENTED_PARTIALLY / SYNTHETIC_TESTED / NOT_REAL_E2E_VERIFIED
- **日期**：2026-11-01（Asia/Taipei）
- **對應**：PR #48；《世界如棋局》Actor / Resource / Rule / Relation / Flow / Constraint / State / Mechanism / Time；原 18 條邏輯 × 50 種修正方法
- **受檢固定基線**：`7e3dc478044cfc57f5a784204a5d0bbc63e79845`（隔離 CI success，不代表真 PG 或真 GPT②）
- **權限邊界**：本文只約束未來的隔離候選實作；**不是部署、授權恢復、資料庫擴權、主腦記憶更新或合併許可**。

## 1. 決策摘要

採用**四個獨立判斷**，而非把「成功」壓縮成一個布林值：

1. **存在性 Existence**：由已提交的持久化交易或明確驗證持久性的 Queue receipt 證明事件已安全保存；HTTP `2xx` 只表示達到接收契約。
2. **來源真實性 Authenticity**：驗證原始請求位元組的來源簽章、來源設定與重播防護；Webhook 事件是經認證來源提供的**主張**，不是已驗證的世界事實。
3. **當前執行權 Current Authority**：執行前依目前的人工 grant、endpoint、attempt、租約、授權版本與下游能力確認可做的副作用；「事件真實」不能推得「允許執行」。
4. **歷史結果證據 Retrospective Evidence**：撤銷新行動的執行權，不得阻斷受限的 append-only 結果／失敗證據；歷史回執不因事後撤權而刪除或改寫。

**核心安全承諾**：未知的 `COMMIT`、未知外部副作用、或未知撤銷是否已在下游生效時，必須保留 `UNKNOWN` 與對帳要求；不能宣稱「未執行」、「已取消」、「已完成」或「正好執行一次」。

## 2. 目前有／沒有的功能（固定基線）

- **已存在**：`/v1/tasks/send` 於 `await store.enqueue()` 完成後才回 HTTP 200；`inTransaction` 在 `COMMIT` 回傳前不視為成功；事件／冪等鍵及人類 grant；`lease`、`markExternalIntent`、`markExecuted`、`ack` 具授權和 attempt 檢查；`external_intent_at` 作意圖持久標記；遺失 ACK 時隔離不自動重派；獨立但尚未排程的 Watchdog 與 inbox-only alerts。
- **原基線 P0 缺口（本輪已加候選防護，仍非真實驗收）**：
  - `client.intent()` 與 `performTask()` 之間已增加 `client.authorize()` 的最後 grant 複查，但它只能縮小競態，尚無下游原子化撤銷 fence。
  - `fail()` 仍會 `checkGrant(..., 'execute')`；已新增獨立受信 `tasks:report` 的 `recordOutcome()` 通道，提供撤權後的受限結果保存候選，真 DB 權限與部署仍未驗收。
  - `ack()` 仍查詢有效 grant；撤權後的受限 `report` 只保存歷史證據主張，不會冒充完成 ACK，也不授予新的業務執行權。
- **尚不存在**：通用、已啟用的 GitHub/Notion Webhook Ingress；獨立的原始事件 Inbox／Outbox 合約及真實斷線恢復驗收；被下游共同遵守的授權撤銷 fence；真 PostgreSQL 故障注入；已部署的 Watchdog／推播；可信 GPT② Runtime 與模型 ACK。
- **注意**：PostgreSQL 的物理 WAL ≠ 應用層的持久事件 Inbox/Outbox；`external_intent_at` ≠ 遠端執行收據。

## 3. 兩條互不取代的狀態軸

### 3.1 現有資料庫工作狀態（保持現行欄位語意）

`queued → leased → executed → ack_received`，另外 `failed` 與 `blocked`；`external_intent_at` 是補充證據欄位，不是 `executed`。現有 `blocked` 是本地**禁止再次派工**，不是取消或外部停止成功。

### 3.2 候選觀測／授權標籤（**目前不是 SQL enum**）

| 執行觀測／授權 | 判定與必要結果 |
| --- | --- |
| `DISPATCH_PENDING` + `AUTH_VALID` | 可申請 lease；真正領取時重新驗證 grant。 |
| `LEASED` + `AUTH_REVOKED` | 不得新啟動模型；保留事件與撤銷原因；不得重派。 |
| `INTENT_RECORDED` + `AUTH_VALID` | 仍須通過最後的執行權檢查；意圖不是執行證明。 |
| `INTENT_RECORDED` + `AUTH_REVOKED` | 若確認尚未發出且存在可靠下游 fence，拒絕；若可能已發出則 `EXECUTION_UNKNOWN`、隔離、對帳。 |
| `EXECUTION_UNKNOWN` + 任意授權 | 禁止自動重派；保留原 attempt／來源／必要最少證據；查遠端 `execution_id`／狀態。 |
| `EXECUTED` + `AUTH_REVOKED` | 不得發起新工作；允許受限歷史結果證據回報，不把收到證據誤當新業務授權。 |
| `ACK_RECEIVED` + 任意授權 | 保留原回執及授權時刻，不因事後撤銷重寫歷史。 |

**設計原則**：執行、意圖、授權、觀測、審計各自有可追溯證據與時間戳；不能用一個 `state` 欄位假裝推導出所有事實。

## 4. 授權撤銷的真正時間競態

```text
T1 lease                 [grant valid]
T2 intent COMMIT         [grant valid]
T3 grant revoked         [revocation committed]
T4 provider invocation   [MUST NOT infer permission from T2]
T5 provider outcome?     [may be unknown even if cancellation requested]
```

單純在 T4 前再 GET 一次 grant **仍有 TOCTOU 競態**：GET 與外部 HTTP 送出之間也可能撤銷。候選設計需同時提出：

- **授權版本／撤銷序號**：由受權管理者修改 grant 版本；對 attempt 記下比對值。授權撤銷必須可區分 `requested_at`、`effective_at` 與已對外發出的工作。
- **短效、綁定資料的執行許可**：至少綁定 `event_id`、`attempt_id`、`payload_digest`、接收方、授權版本、到期時刻；不得作為跨事件或跨租約通行證。
- **最後保護點**：真正可保證撤銷的方案需要**下游執行者／Provider 閘道**在副作用開始之前共同驗證許可或撤銷 epoch；若下游不支援，就只能提供 best-effort 檢查並明示**在途工作不能保證取消**。
- **未知結果維持隔離**：失去聯絡不能推論操作沒開始；不允許從 `INTENT_RECORDED` 直接宣稱 `CANCELLED_CONFIRMED`，也不以自動重試來探測狀態。

不得用長時間持有資料庫鎖跨越網路請求來假裝保證原子性；此舉會造成鎖競爭、資源耗盡與不可解決的外部副作用。

## 5. 撤銷後的受限證據保存契約

**執行權 ≠ 證據保存權**。禁止給 Worker 一把通用 `service_role` 或無上限的「系統特權」來逃過 grant。候選實作必須：

- 提供獨立的 `recordOutcome` / `appendAudit` 證據回報動作，以**受信服務身分、最小權限**運行；只允許指定事件的 append-only 記錄與合法狀態隔離，**不能**建立新的業務工作、修改 grant、公開私人 Payload 或重新派工。
- 驗證 `event_id`／`attempt_id`／`endpoint_id`／`payload_digest`／證據類型與來源、受信憑證；限制速率、證據大小與保留範圍。過期或偽造 attempts 不能追加任意別人的事件。
- 先寫入審計與需要的隔離狀態，同一交易內以事件鍵去重；寫入失敗要顯式回報 `AUDIT_PERSISTENCE_UNKNOWN`，不可宣稱已保存。
- 區分「遠端完成的原始證據」與「新的業務 ACK 核准」。允許保存撤銷後的歷史事實，不表示允許在撤銷後執行新的副作用。
- 誤報或修正採 append-only 補正／撤回註記；依使用者的刪除權、隱私與合法保留規則管理個資，不主張日誌永久不可刪除。

## 6. Webhook Ingress / Inbox-Outbox 合約（針對反例 1）

這是**未來通用事件入口**的候選契約，不把現有 `/v1/tasks/send` 誤稱通用 Webhook：

1. 驗證來源的**原始請求位元組**簽章、受信來源設定與大小限制；未驗證來源不入可信派工隊列。敏感原文採最小化、加密、控權與保留期限。
2. 唯一事件身分使用 `source + source_delivery_id`，加上 payload digest、來源版本；缺少穩定來源 ID 的供應商需定義特定去重契約，而非僅以毫秒時間戳代替。
3. 在**單一可靠交易**保存認證後的事件 Inbox 與 Outbox 待派工標記。只有在持久確認後，才依來源回應契約送 `2xx`；`2xx` 僅表示接收，不是已執行／已驗證的世界事實。
4. `COMMIT` 成功回應若遺失，狀態保持 `UNKNOWN_COMMIT`；依同一來源事件鍵查詢持久狀態、比較 digest；同鍵同內容返回原接收結果，不再建立新 Outbox；同鍵不同內容隔離為衝突。
5. 未發生 Webhook 自動重送的情況要另有**來源事件對帳／人工授權重送**。不能假設任何特定供應商會因 HTTP 503 自動重傳。
6. Outbox 再派送前**重新驗證當前授權**，並遵循 §4 的撤銷競態政策；再次派送同一事件不得直接重複外部副作用。

## 7. 五項驗收 Gate（有 PASS 才能升格，不以規格完成充當驗證）

| Case | 故障注入／前提 | 要求結果 | 現況 |
| --- | --- | --- | --- |
| P0-A | T2 意圖成功；T3 撤權；T4 外部呼叫前 | 本地最後 grant 複查拒絕後不得呼叫模型；下游無 fence 仍保留競態 | `CANDIDATE_MOCK_PASS / PROVIDER_FENCE_NOT_RUN` |
| P0-B | 已發出外部請求；其後撤權／網路斷線 | 保留遠端結果未知狀態，不能自動重派、不能宣稱已取消 | `NOT_RUN` |
| P0-C | 撤權後，執行端回報真正結果／失敗 | `tasks:report` 回報必須綁定當前事件／attempt／digest，append-only 去重，不得執行或重排 | `CANDIDATE_MOCK_PASS / REAL_PG_NOT_RUN` |
| P1-D | Inbox + Outbox `COMMIT` 成功但 HTTP 回覆遺失；來源重播 | 相同來源鍵與 digest 僅有一份持久事件及一個待派工項目；衝突不得成功 | `WEBHOOK_NOT_IMPLEMENTED` |
| P1-E | 事件已保存、還未派工便重啟；重啟前後撤權 | 仍可找到原始事件；新派工先檢查最新 grant；撤權後不執行 | `WEBHOOK_NOT_IMPLEMENTED` |

測試應同時驗證**無不當副作用、資料庫實際最終內容、原始時間／版本及合格證據**，而不僅測 HTTP 回應碼。需要真 PostgreSQL 多連線、強制斷線／崩潰、獨立 Provider stub、受信身份負測。Node Mock 綠燈不能替代此 Gate。

## 8. 世界如棋局反證與審查責任

- **Actor**：使用者授權者、Webhook 來源、Worker、授權管理者、獨立審計接收方、外部 Provider、GPT② 審查者。
- **Resource**：raw event、Inbox、Outbox、grant/epoch、attempt、external intent、執行／審計 receipt。
- **Rule / Constraint**：使用者控制、最小權限、有限保留、成本與資料隔離、BOT STOP；有效權限不得由舊事件推導。
- **Relation / Flow / Time**：發送、到達、提交、撤權、外部副作用與確認，各事件可能不同序；依賴關係或時間相近不等於因果。
- **State / Mechanism**：至少對比 H1「外部尚未執行」與 H2「外部已執行／仍在途中」，以收據／Provider 來源查詢而非重試做反證。
- **③ 影響定位 → ② 最小反例 → ① 局部修補**：保留不同機制結論，不強迫未知變成成功。

### GPT② 獨立審查必問

- `checkGrant ... FOR SHARE` 與人工 revoke `UPDATE` 的交易提交順序，能否保證 Provider 呼叫不落在撤銷之後？如果不能，最小反例是什麼？
- 若 T3 撤權後，舊 Worker 在 T4 `fail()`，現在的 `checkGrant('execute')` 是否使審計報告永遠無法寫入？
- 若獨立審計回報也遭網路逾時，哪些信息只能標為 UNKNOWN？如何防止受限審計通道成為繞過授權的後門？
- `external_intent_at`、`executed`、`ack_received` 哪些只證明本地資料庫狀態，哪些能證明 Provider 真實結果？
- 現有 enqueue 是原子提交，但未來的 Webhook Raw Inbox/Outbox 是否真的與授權任務 API 有一致的唯一身分和資料保留規則？

## 9. 逐階段落地、停線

- **現在**：僅建立本 ADR 候選，保留現行 PR #48 程式、CI 與使用者授權邊界。
- **下一隔離候選**：先為 P0-A、P0-C 添加固定 SHA 可回歸的負測，再做最小授權狀態／受限審計介面；只能證實 Mock 達成 Mock 預期。
- **實境 Gate**：在另行核准的隔離 PostgreSQL 與下游執行端實測 T2/T3/T4 競態、審計斷線、未知 COMMIT、併發撤銷。失敗即保持 `BLOCKED`。
- **禁止自動升格**：本 ADR、PR #48 Draft、CI success、Google Docs POSTED 均不等於主腦部署、真 GPT② ACK、無條件發信或主線合併。

## 10. 實際補丁與重新驗收（2026-11-01，候選而非上線）

- **新程式**：`api/pg-store-candidate.cjs` 增加 `authorizeDispatch`，在外部呼叫前重新核對已存在的意圖、grant、現行 attempt 與 lease。這**不是** Provider 下游 revocation fence。
- **受限證據**：`api/persistence-candidate.sql` 加入帶有事件、attempt、report ID 複合鍵的 `outcome_reports`；`recordOutcome` 驗證身分與 digest、固定原因、證據引用上限，採冪等新增，必要時只轉為 `blocked`，不領取工作、不重排、不授權執行。需獨立的 `tasks:report` 身分與最小權限 DB 角色；目前尚未正式核准配發。
- **API 與 Worker**：新增 `/v1/tasks/authorize`、`/v1/tasks/report` 兩條候選端點。Worker 意圖登記後先授權複查；若失敗，經受限回報隔離而不觸發 Provider。一般 `fail` 因撤權被拒絕時，允許改用受限報告保存未知結果，回報失敗不得偽稱已保存。
- **負測**：`tests/mainbrain-revocation-candidate.test.cjs` 檢查撤權攔截、無 Provider 呼叫、受限證據、過期 attempt 與偽造身分、冪等衝突、超量證據；舊 Worker / API 回歸測試與 HTTP 權限測試同步驗證。
- **不能升格的結果**：尚未部署正式服務、尚未做真 PostgreSQL 撤權交易競態／網路斷線／資料遺失驗收；下游沒有共同執行撤銷 epoch 的證據。也未建立可信 GPT② Runtime 或實際警報推播。此處的報告為受信來源提交的**待查證歷史主張**，不是遠端執行已獨立證實。
