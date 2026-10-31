# OpenAI 接線計畫（唯讀／規劃 only — 未啟用）

- 狀態：**NOT_CONNECTED** / 相關真實測試 **NOT_RUN**
- 政策（2026-10-31 Merlin）：可盤點與文件化；禁止建立金鑰、禁止送模型請求、禁止開 billing、禁止接到執行端。

## 現況盤點（名稱 only）

| 變數名稱 | 本機狀態 | 備註 |
|----------|----------|------|
| OPENAI_API_KEY | UNSET | 未建立、未讀取值 |
| OPENAI_ORG_ID | UNSET | |
| OPENAI_PROJECT_ID | UNSET | |

## 若 Merlin 核准後的建議步驟（尚未執行）

1. 由 Merlin 在 OpenAI 控制台建立**專案級**金鑰與硬額度（hard limit），不把金鑰貼進 chat。
2. 以 vault／本機 env 注入 `OPENAI_API_KEY`（名稱見 `.env.example`）；執行端只讀 env，不落盤到 git。
3. 實作 `createRealExecutor`：與 `mock-executor.cjs` 同介面；證據字串必須含 `result_kind=REAL`；費用寫入 `cost_ledger`。
4. 僅在 `TESTENV_EXECUTOR_MODE=REAL` **且** 另有明確核准旗標時啟用；預設保持 MOCK。
5. 成本帽沿用 grant `cost_cap_usd`；超額 → `failed` + `cost_cap_exceeded`。
6. 回歸：MOCK 與 REAL 結果分欄；禁止 REAL 證據寫成 MOCK。

## 不做的事（本環境）

- 不呼叫 `api.openai.com`
- 不建立／輪替金鑰
- 不啟用 billing
- 不把 REAL stub 接到 `server.cjs` 的 `performTask`

## claimSideEffect (MOCK worker path)

`createMockExecutor` calls `store.claimSideEffect({ key: 'mock-exec:' + event_id, ... })` inside `performTask`.
The polling worker in `server.cjs` uses that executor, so exactly-once claims apply on the worker/executor path (not API-layer-only).
Duplicate claims throw `UNKNOWN_NEEDS_RECONCILIATION` (see R3).
