# AUTO-REVIEW V0.1｜MIT 穩定摘要 × 圖完整性 × 審核狀態機（隔離候選）

> 2026-11-08，Draft PR #121。僅為可手動呼叫的唯讀差異判斷模組，**不是**常駐背景服務、真 AI 協作、認證或有效記憶寫入。父依賴 [PR #120](https://github.com/keqingwu5-cloud/ai-boundary/pull/120)；#120 又依賴 [PR #118](https://github.com/keqingwu5-cloud/ai-boundary/pull/118)。主線、正式資料庫、憑證、記憶有效版本沒有修改。

## 1. 誰做什麼

| 元件 | 責任 | 不負責 |
| --- | --- | --- |
| `brain-graph-integrity.mjs` | 確認節點、子腦、父子連結、引用、座標等圖結構有效 | 原問題真假、證據可信度、審核是否通過 |
| `vendor/fast-json-stable-stringify-v2.1.0.cjs` | 按物件鍵穩定排序後序列化 | 整份圖的語義相等、陣列自動排序、資料格式與來源身分驗證 |
| `api/auto-review-router.cjs` | 只讀摘要、來源版次與原目的對照，輸出待審狀態；明確限制可走的審查狀態轉換 | 保存候選、發送請求、AI 執行、授權審核、正式 ACK、修改有效版 |
| `tests/auto-review-router.test.cjs` | 合成負測：失效來源、損壞、重複、同版衝突、原目的差異、審核越界 | 真實 Chromium／Safari／資料庫／跨 AI 正式環境驗收 |

**開源來源**：[fast-json-stable-stringify v2.1.0](https://github.com/epoberezkin/fast-json-stable-stringify/tree/v2.1.0)。已保留上游原始 [MIT 授權](../vendor/LICENSE-fast-json-stable-stringify.txt) 與著作權。Ajv／XState 在此只是模組化與明確狀態轉換的設計參考，**沒有**安裝或複製其原始程式碼，也沒有引入 Redis/BullMQ。

## 2. 已完成的局部資料路徑

```text
可信來源介面（此版本尚未接線，操作者傳入原始 JSON 與來源識別）
        ↓
資料大小、ID、來源版次初判
        ↓
JSON 解析 → 已有圖結構驗證模組
        ↓
MIT 穩定序列化 + SHA-256（全資料／去歷史內容／歷史）
        ↓
比對「同一來源的外部提供基準」與原目的及版本
        ↓
純狀態分流，不產生外部副作用
        ├─ SOURCE_ABSENT：來源不存在，不能當作刪除授權
        ├─ QUARANTINED：來源／格式／圖結構／基準有問題
        ├─ WAIT_BASELINE：首次見到，需要人核定比對基準
        ├─ NO_CHANGE：完全相同且來源版本無歧義，不新增候選
        ├─ REVIEW_CANDIDATE：內容確實變更，等待審核
        ├─ REVIEW_HISTORY：只有歷史變動，另行審查
        ├─ REVIEW_METADATA：只有來源版次改變，仍留待審
        └─ NEED_COUNTEREVIDENCE：同版內容矛盾／原目的改變／上下文不足
```

`reviewTransition` 的候選狀態僅允許 `REQUEST_RECHECK`、`REQUEST_COUNTEREVIDENCE` 或 `REJECT` 等有限動作，產生 `NEEDS_RECHECK`、`NEED_COUNTEREVIDENCE` 或 `REJECTED`。沒有 `APPROVE`／`PROMOTE`／`DISPATCH` 的有效轉移。每次結果仍標 `action: NO_EXTERNAL_EFFECT` 和 `approved: false`。

## 3. API 契約（候選）

```js
const {scanEntry,scanBatch,reviewTransition}=require('../api/auto-review-router.cjs');
const initial=await scanEntry({
  source_id:'source-1', source_revision:'r1',purpose_id:'purpose-1',
  raw:JSON.stringify(graph)
});
// initial.state === 'WAIT_BASELINE'; initial 不會自動存為正式 baseline。
const previous={
  source_id:'source-1',source_revision:'r1',purpose_id:'purpose-1',
  content_digest:initial.content_digest,history_digest:initial.history_digest
};
const changed=await scanEntry({source_id:'source-1',source_revision:'r2',
  purpose_id:'purpose-1',raw:JSON.stringify(updatedGraph)},previous);
// changed.state === 'REVIEW_CANDIDATE'（需圖形驗證通過、目的相同等條件）
```

舊基準需由**外部可信且有授權的保存服務**提供，本模組不驗證基準簽章、也不會替基準背書。來源 ID、版次與目的 ID 都是呼叫者宣稱的欄位，不能當作真正 endpoint 身分。審查者身分在回傳中明確標 `reviewer_identity_verified:false`，不等於獨立審查已完成。

為防止無限制處理，單批最多 100 筆，每筆原始字串最多 1,000,000 個 JavaScript 字元；掃描不包含排程、重試、外部 IO 或 provider 呼叫。僅將固定摘要和狀態回傳，原始內容不放進事件結果。**注意**：SHA-256 是內容指紋，不是權限簽章；外部如洩露低熵資料摘要仍可能帶來推測風險，正式介面需依資料分級控管。

## 4. 哪些差異不能讓程式自行決定

- 物件鍵次序不同可得到相同指紋，但**節點／連結陣列順序改變仍會被判為變更**。不能把位元／欄位層級的差異直接宣稱語義改變。
- 只有 `history` 根欄位從比對內容排除；圖節點中的其餘欄位、原目的與時代背景，需由外部契約與審查者確認。
- 完整圖結構合法不代表來源內容為真、歷史不可偽造、方向偏移已正確判定。
- 同一來源版本內容相異，必須取得反證；本模組不猜測是誰先收到哪一份。
- 檢查結果不是正式案件狀態庫、不可用作真 AI ACK、已通知使用者或已寫進記憶的證據。

## 5. 測試、限制、下一個關卡

**測試先行**：初次只加入 `tests/auto-review-router.test.cjs` 和 CI，模組不存在時 GitHub Actions `48/49 pass`、1 個新測試檔整體載入失敗。這個 RED 代表模組缺失，**不代表 23 個情境逐項失敗**。模組實作後 `71/71`；再加入六項補充反證後 `77/77` 通過。以當前最終 SHA 的 GitHub Actions 為準。

後續 Gate：
1. 由另一端獨立審查固定 SHA、上游 MIT 版次／聲明與不可變更的原資料；
2. 真來源／外部基準的身分驗證與來源修訂綁定；
3. 持久候選與審核事件表，分清 `CREATED`、`POSTED`、`RECEIVED`、`REVIEWED`、`EFFECTIVE`；
4. 經授權且可停止的排程／通知、併發重複負測、實際使用者體驗測量；
5. 同版資料庫、記憶恢復、Chromium/iPad Safari 驗收後，再單獨討論實際部署。

**狀態：DRAFT；NO_DEPLOY；NO_EFFECTIVE_MEMORY_WRITE；NO_TRUE_REMOTE_ACK。**
