# 測試環境資源盤點與最小可行技術方案

- 時間（Asia/Taipei）：2026-10-31 10:12–10:17 CST
- 倉庫：`keqingwu5-cloud/ai-boundary`
- 限制：可逆隔離；無 push／PR／合併／部署；無喚醒雲端；無付費 API；無 service_role

## 1. 可用資源（已核對）

| 項目 | 狀態 | 版本／SHA | 成本 | 缺權限／設定 | 重用方式 |
|------|------|-----------|------|--------------|----------|
| GitHub 程式（main） | 唯讀可用 | `7b7b77e8…` | $0 | main 受保護；寫入需 PR | 基線對照 |
| Draft 佇列／handoff 候選 | 本地 worktree | `a99f48a1…`（`feat/queue-pg-worker-candidate-20261020`） | $0 | 未合併；PG schema 需隔離 DB | **重用** `api/*`、`handoff-contract.js`、auth／HTTP／worker |
| PR #86 HEAD | 本地 worktree | `3c57f56a…` → 修補 `d6ceb561…` | $0 | 修補僅本地；push／PR 需核准 | plan-core L1 修補另線 |
| Issue #41 handoff 機制 | 文件＋合約碼 | Issue open／34 comments | $0 | 無獨立 GPT② ACK runtime | 合約語意對齊；真跨 AI 仍 BLOCKED |
| Node／npm | 可用 | Node v24.22.1／npm 11.21.1 | $0 | — | 本地迴路 runtime |
| `gh` CLI | 已認證 | 2.103.0 | $0 | 本任務禁寫入遠端 | 唯讀查 PR／Issue |
| Docker | **無** | — | — | 需安裝才可本機 Postgres／Supabase CLI 容器 | **不假設**；改用檔案 store |
| Supabase CLI | **無** | — | — | 同上 | 不假設 |
| 本機 Postgres server | **無**（僅有 `psql` client） | client 17 | — | 無 daemon | 不假設 |
| SQLite lib | 系統有 libsqlite3 | — | $0 | 未綁 Node binding | 未採用；用 JSON 檔即可 |
| Supabase 專案 `xsgtpcutpnniomlrqazs` | **INACTIVE**（唯讀 list_projects） | PG 17／ap-south-1 | 喚醒可能產生雲端費用 | 喚醒／SQL／金鑰需 Merlin 核准 | 狀態核對 only；**不喚醒** |
| OPENAI_API_KEY 等 | **UNSET**（僅查名稱） | — | 呼叫＝付費 | 建立金鑰／billing／接線需核准 | 文件化接線；**REAL NOT_RUN** |
| Railway token 名稱 | **UNSET** | — | 部署可能付費 | 帳戶未驗證 | NOT_RUN |
| 正式第一大腦資料 | 未碰 | — | — | 禁止 | 僅合成 data |

## 2. 最小可行技術方案（不假設新服務）

```
[Merlin／origin CLI submit]
        │ HMAC token（合成本地密鑰）
        ▼
[localhost HTTP :18765]  ← 重用 queue-wt createHttpServer + createApi + createHmacAuth
        │
        ▼
[file-store JSON]  ← 取代 Postgres（因無 Docker／無本機 PG／Supabase INACTIVE）
        │
        ▼
[polling worker + MOCK executor]  ← 重用 createPollingWorker；OpenAI 不接線
        │
        ▼
[view.cjs / store.json]  ← 原端直接讀回 ACK 結果（MOCK 標籤）
```

**為何不用新平台：** Issue #41／#30 已有 handoff 合約與 Draft API；本方案只補「可跑的本地持久化＋MOCK 執行＋可視讀回」。

**兩條線分開：**
- **線 A（最小 API 迴路）**：上圖；不依賴 PR #86。
- **線 B（PR #86 L1 修補）**：`local/pr86-l1-fix-20261031` @ `d6ceb561…`；不阻塞線 A。

## 3. 成本估計（現況）

| 項目 | 估計 |
|------|------|
| 本地 MOCK 迴路／測試 | **$0** |
| PR #86 本地修補與負測 | **$0** |
| OpenAI REAL | **$0（未啟用）**；啟用後依額度，建議硬限 ≤ 數 USD／月並綁 cost_cap |
| Supabase 喚醒 | **需核准後查價**；免費額可能足夠但非保證 |
| Railway／正式部署 | **需核准**；未估價 |

## 4. 證據索引

- 盤點：`evidence/inventory/`
- 迴路測試：`evidence/tests/suite-summary.json`（PASS 12／NOT_RUN 4／FAIL 0）
- PR #86：`evidence/pr86/`
