# 第一大腦｜多輸入底層「原始空白保留」協議 V1.6（Draft／隔離）

- 日期：2026-11-08，研究 ID `FB-NARY-EXPLICIT-GAPS-V16-20261108`
- 依賴：V1.4 PR #123（N 元組合）→ V1.5 PR #124（型別換算）
- 範圍：獨立、唯讀候選；不是生產權威存儲、正式記憶寫入、真實跨 AI ACK 或部署。
- 原始需求：效率與重用 X 時，不可讓「原本的空白」消失；空白可能是尚無資料、未知、待驗證、刻意未定義、不適用，或不具權限。

## 1. 核心不變式

1. `ABSENT ≠ null ≠ 0 ≠ "" ≠ false ≠ REDACTED ≠ UNKNOWN`：字段缺失、明示 null、數值零、空字串、布林否，與有型別的空白不可默默互轉。
2. **空白是帶型別及版本的研究狀態**，不是自動補完提示；哪怕 A+B+C+D→X 已能計算其他部分，任何必要的空白仍會阻止假完整結果。
3. `X+C → Y` 可攜帶 X 裡的空白與其版本，而非假設 X 已包含一切。其後任何空白或來源修訂使舊 X/Y 標記 `STALE_DEPENDENCY`，須基於新版本重算。
4. `REDACTED` 不由本模組提供來源存在、細節、時點或內容指紋；對外統一使用 `ACCESS_DENIED_OR_UNAVAILABLE`。此隔離層沒有真正的登入身份驗證，即便呼叫端自述能力也不能解除該限制。
5. `INTENTIONALLY_OPEN` 的修訂或填入，至少必須有明示選擇標記（本地研究候選）；字串標記本身**不是**已驗證的授權收據，正式平台仍要用權限／審批系統簽核。
6. 一切預覽固定 `authority:none`、`evidence_certification:UNVERIFIED`、`memory_approval:NOT_APPROVED`、`real_ack:NOT_VERIFIED`、`decision:HOLD`；不得因有來源、合成、反覆使用或測試通過自動升格。
7. `record_project` 不得把原始記錄中**未提供或值為 null 的被選欄位**靜默丟掉；此情境拒絕 (`UNDECLARED_FIELD_GAP` / `NULL_FIELD_AMBIGUOUS`)，由上層明確建立空白欄位候選後再決定如何處理。
8. 本研究保留 `GAP_ID, REVISION, STATE, EXPLANATION_CODE, ORIGINAL_HISTORY`；不依賴固定 A/B/C/D 語義，不將空白自動映射為缺乏可信度或以可信度數值取代。

## 2. 六種空白狀態

| 狀態 | 意義 | 能否自動填入或忽略？ |
|---|---|---|
| `MISSING` | 需要的欄位未提供／沒有出現在來源 | 否；須獨立補證 |
| `UNKNOWN` | 現有條件不足以判定 | 否；保持未知 |
| `UNVERIFIED` | 存在候選，但尚缺證據支持；本原型只記錄空白狀態，不保存未核實主張文本 | 否；不得升格 |
| `INTENTIONALLY_OPEN` | 使用者／研究設計刻意保持未定 | 否；須明示選擇後才可修訂候選 |
| `NOT_APPLICABLE` | 當前操作或情境不適用 | 不可當零；若日後要排除，需另訂明確規則 |
| `REDACTED` | 受限或不能揭露內容 | 不回傳空白細節，也不推斷隱藏內容 |

`REDACTED` 不是一種較低的可信度，而是存取邊界；甚至其存在本身亦可能敏感，未來連 `NOT_FOUND` 與 `DENIED` 的錯誤碼也應由上層統一防測試側通道。本版只在不可讀條件下返回一般拒絕。

## 3. 資料契約（研究候選）

```json
{
  "slot_id":"G_01",
  "revision":"r1",
  "state":"INTENTIONALLY_OPEN",
  "explanation_code":"KEEP_OPEN",
  "value":null,
  "authority":"none"
}
```

注意：上面是人類易讀的欄位示例；真正 `registerGap()` 輸入**不接受** `value`，且 `read()` 出來的完整候選預覽包含 schema、status、decision 等欄位；此設計故意防止任何空白被當作值寫入。

最小接口：

- `registerGap({id,revision,state,explanation_code})`：新建空白候選，不得附上值。
- `registerKnown({id,revision,payload,capabilities})`：沿用 V1.5 的合法型別與存取控制；本層只保留安全來源引用與欄位存在性索引，不外露原始資料。
- `compose({inputIds,rule,ruleVersion,context,capabilities})`：如果輸入完整且規則是 V1.5 已支援的算術／投影，交由原引擎運算；若存在空白，回傳 `partial_composition`，`computed_value:null`，保留每個 `slot_id/state/revision`；`collect_refs/derive_candidate/compare_refs/sequence_refs` 永遠只產出引用研究候選，不宣稱實際結論。
- `read(id,{capabilities})`：遞迴查直接或間接依賴的版本與存取條件；若依賴改變則 `STALE_DEPENDENCY`；若涉及受限資料則 `ACCESS_DENIED_OR_UNAVAILABLE`。
- `reviseGap({id,expectedRevision,revision,state,decision})`：版本 CAS 型比較；禁止沿用舊版 revision，開放空白須有明示選擇（但非權威授權）。
- `resolveGap({id,expectedRevision,revision,payload,evidenceRef,decision})`：以新修訂建立**未核准候選**，歷史保留。`evidenceRef` 只作核對線索，並非證據已驗真的聲明。
- `readGapHistory(id)`：唯讀保留本程序歷史；遇受限紀錄不回傳。

每次呼叫組合至少兩個引用，最多 32 個；可層層 X+C 再組合，另受最大深度、節點與資料大小限制。這些是隔離資源保護，不是概念上最多只有 32 個因素。

### 為什麼不直接回傳部分計算數字？

若輸入是 `A=5, B=未知, C=9` 且規則是總和，直接回傳 `14` 容易被上層誤用為完整答案。V1.6 採保守方式：保留已知來源引用與空白清單，但**不回傳最終總值**。日後若需要上下界、部分和或機率分布，必須新增有明確標籤與驗證的操作，不能偷渡到原本的 `quantity_sum`。

## 4. 版次、資訊縮減與復原

`X = F(A@r1,B@r2,Gap@r1; rule@v1)` 以來源指紋、空白狀態版本、操作規則和參照條件建立可重用引用。`
X + C → Y` 可傳遞 X 裡的空白與已知原始依賴。若 B 或 Gap 改版：

- 舊 X、Y 的引用維持可追蹤，但 `read(X)`、`read(Y)` 會拒絕當作當前有效結果。
- 新修訂另建 X'，禁止靜默覆寫原始資料。
- `INTENTIONALLY_OPEN` 不因推理模型或其他欄位更新而被補成值。
- 局部失效不是所有世界模型都必須重跑；僅對該組合直接與間接依賴標記。當正式跨系統快取有後，才可用經授權、版本正確的引用減少傳輸。

儲存／傳送空白狀態本身會增加少量 bytes；**節省重複內容不等於刪去重要空白**，所以大小效益應同時考慮失效與 bootstrap 開銷。V1.6 benchmark 只測本地合成 JSON UTF-8 bytes，不能宣稱 WAN、Token 或 GPT 推理節省。

## 5. 工程對接與前置審查

- **PR #124 V1.5**：僅沿用其型別運算、版本化來源與既有測試，不修改原檔。
- **PR #123 V1.4**：沿用 hash、依賴及安全讀取邏輯，所有新增運算仍要有明確 rule。
- **PR #122 V1.3**：其正式記憶、來源身分、ACK、因果審查 Gate 不變，絕不藉由本地空白填補越權。
- BOT③ 仍負責獨立工程審查；本段只交 Draft、原始碼、測試及固定 SHA，不能假裝遠端 BOT 已讀取。
- 真實來源、真人審批、持久儲存、跨程序快取同步、分散式 version CAS、iPad/Safari、既有記憶相容與真 ACK 皆未驗收。

## 6. 隔離測試與停止線

正例：數值零不當空白；完整 A+B+C+D 交 V1.5 計算；六種空白分類；X+E 仍攜帶未知；快取重用與來源修訂使 X/Y 失效；刻意開放不自動填；空白補值保留歷史；record_project 缺欄位或 null 被拒絕。

負例：未知算子、假數值、舊版重用、遺失權限、REDACTED 嘗試讀取或修訂、假 ACK、無內容填空、規則／context 型別不符、過深嵌套。嚴格分開本機 PASS、GitHub 隔離 CI、真系統 E2E 與正式 Gate。

**禁止**：本 PR 不能合併 main、不能寫入正式 memory、不能以 `HOLD` 預覽冒充已批准事實，不能藉空白自動推論受限資訊。下一段應對「何時知道已足夠回答／何時該停／何時需要主動研究空白」做單獨的決策與成本研究，不先把未知變成固定答案。

## 7. V1.6 本地實測（固定版本前的先期紀錄）

- 既有 V1.4、V1.5 和本版 V1.6：138/138 PASS，合成資料；其中 55 是 V1.6 的空白保存與 schema 契約測試。
- 完整 JSON Schema Draft 2020-12：5 組實際產出正例與 4 組拒絕負例均與預期一致（本地 Python jsonschema）。
- 50 次合成傳遞：原始資料包每次 472 bytes；引用包每次 120 bytes；初始化 X 預覽 1267 bytes。基線重傳 23600 bytes；若共享授權版本目錄，含首次來源+X引導後引用為 7739 bytes，差距 15861 bytes（約 67.2%）。**不能把此值套用真實網路、API Token 或模型效能。**
- `X` 已知數值可以在 `X+C` 繼續被 V1.5 計算；`X` 或 `C` 含空白時，V1.6 只回傳 `INCOMPLETE` 和空白狀態，不回傳假完整值。

## 8. 真實保留空白與現階段局限

- 本版有意採保守拒絕。對 record_project，缺失或 `null` 的**被選取**欄位一律拒絕；上游需要用獨立空白狀態表述缺失原因，後續在授權範圍內另定受控的投影策略。
- `REDACTED` 的實際讀取/修訂永遠拒絕；需要真正的憑證、身分與權限系統才能規劃合法解密/轉授權，不可直接在此研究橋樑提供。
- 並行與跨程序版本鎖不可由記憶體 Map 單獨保證；保留待真服務驗證。
- 來源宣告、語意理解和空白原因都還沒由獨立來源查核；不把候選發展為自動升格的「真知識」。