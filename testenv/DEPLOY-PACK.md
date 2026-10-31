# 部署包（隔離測試 → 審核決策用）

- 撰寫時間（Asia/Taipei）：2026-10-31 10:17 CST
- WEAK 修補時間（Asia/Taipei）：見 `evidence/tests/suite-summary.json` finished_at
- rp41 獨立審查 WEAK 修補時間（Asia/Taipei）：2026-10-31 10:52 Asia/Taipei
- 性質：**候選部署說明**；尚未 push／合併／部署／喚醒雲端
- 獨立審查欄：見文末

---

## 1. 版本與 SHA

| 元件 | 參照 | SHA |
|------|------|-----|
| main（保護分支） | `origin/main` | `7b7b77e8c06ce3ed348e2d5c086ff086da64f95a` |
| 佇列／API 候選（重用） | `feat/queue-pg-worker-candidate-20261020` worktree | `a99f48a1cf3a848ef770b77701bf1e6283f11bad` |
| PR #86 原 HEAD | Draft #86 | `3c57f56a23fff296342e1e77a001c02f23f5386d` |
| PR #86 L1 本地修補 | 分支 `local/pr86-l1-fix-20261031` | `d6ceb5618615f79f3e8be027fb1bca245e8b3f40` |
| Node | runtime | v24.22.1 |
| testenv 本地交付（無遠端） | 分支 `local/testenv-20261031` | 見 `evidence/inventory/testenv-commit-sha.txt` |
| 測試套件摘要 | `evidence/tests/suite-summary.json` | PASS 14／FAIL 0／NOT_RUN 4 |
| 風險包摘要（K/R） | `evidence/tests/risk-pack-summary.json` | PASS 11／FAIL 0／BLOCKED 1／NOT_RUN 1 |
| R9 覆蓋表 | `evidence/R9-coverage.md` | 含 4 NOT_RUN 說明 |

---

## 2. 依賴順序

1. Node ≥ 20（已具備 v24）
2. 本機目錄 `/workspace/f05/testenv/`（含 `queue-wt` worktree）
3. **不需要** Docker／Supabase CLI／Postgres／OpenAI（MOCK 路徑）
4. （可選，需核准）喚醒 Supabase → 套用 `queue-wt/api/schema.sql` + `persistence-candidate.sql` → 換成 `pg-store-candidate`
5. （可選，需核准）OpenAI 金鑰＋billing → REAL executor（見 `docs/openai-wiring-plan.md`）
6. （可選，需核准）將 PR #86 修補 push／開 PR／CI／合併
7. （可選，需核准）正式環境部署 worker

---

## 3. 操作指令（本地 MOCK）

```bash
cd /workspace/f05/testenv/loop
./start.sh                          # 啟動 API + MOCK worker
node submit.cjs "你的任務說明"       # 送出 → 等待 ACK
node view.cjs                       # 原端讀回結果
node view.cjs ack_received          # 只看完成
node view.cjs MOCK                  # 只看 MOCK
./stop.sh                           # 停止
node run-tests.cjs                  # 重跑隔離套件
```

PR #86 線（`pr86-fix/` 為 gitignored，需本機自備 worktree，見 README）：

```bash
cd /workspace/f05/testenv/pr86-fix
node --test tests/first-brain-plan-core.test.cjs tests/first-brain-plan-core-l1-negative.test.cjs
# 目前：16/16 PASS；SHA d6ceb561…
```

---

## 4. 必要權限與金鑰「名稱」

| 名稱 | 本地 MOCK | 正式／雲端（需核准） |
|------|-----------|----------------------|
| `TESTENV_ORIGIN_SECRET` / `TESTENV_WORKER_SECRET` | 合成本地 | 換正式 HMAC 密鑰管理 |
| `OPENAI_API_KEY` | 不使用 | REAL 才需要 |
| `OPENAI_ORG_ID` / `OPENAI_PROJECT_ID` | 不使用 | 可選 |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | 不使用 | PG 路徑需要 |
| `SUPABASE_SERVICE_ROLE_KEY` | **禁止處理／暴露** | 若必須，僅伺服器端 vault |
| `RAILWAY_TOKEN` / `RAILWAY_API_TOKEN` | 不使用 | 若用 Railway 部署 |
| GitHub push／PR／merge | 禁止 | Merlin 核准後 |

範本：`config/.env.example`（僅名稱與合成示例）。

---

## 5. 成本估計

| 階段 | 成本 |
|------|------|
| 目前已完成之隔離建構／MOCK 測試／#86 修補 | **$0** |
| 持續本機 MOCK | **$0** |
| OpenAI REAL（未啟用） | 依用量；建議先設硬限並 grant `cost_cap_usd` |
| Supabase 喚醒／儲存 | 可能落在免費額；**核准前不操作** |
| CI 因 push 觸發 | GitHub Actions 分鐘數（通常免費額內） |

---

## 6. 備份

```bash
# 本地佇列狀態
cp -a /workspace/f05/testenv/loop/data /workspace/f05/testenv/evidence/backup-data-$(date +%Y%m%d-%H%M%S)
# PR #86 修補分支（本地 git 物件已在 pr86-checkout 連線之 worktree）
cd /workspace/f05/testenv/pr86-fix && git format-patch -1 d6ceb561… -o evidence/pr86/  # 已產出
```

---

## 7. 回滾

| 目標 | 方式 |
|------|------|
| 停止本地服務 | `./loop/stop.sh` |
| 清空合成佇列 | 刪除 `loop/data/store.json`（或整夾 `loop/data/`）後重啟 |
| 撤銷 #86 修補檢視 | `git -C pr86-fix checkout 3c57f56a…`（修補仍在 `d6ceb561…` ref） |
| 雲端（若日後部署） | 還原先前 release SHA；Supabase 用備份／migration down（**未部署故 N/A**） |

---

## 8. 停止步驟

1. ` /workspace/f05/testenv/loop/stop.sh`
2. 確認無 `runtime.json`／無 listening `:18765`
3. （可選）封存 `evidence/`

---

## 9. 測試證據路徑

| 證據 | 路徑 |
|------|------|
| 套件摘要 | `evidence/tests/suite-summary.json` |
| 套件 stdout（WEAK 修補後） | `evidence/tests/suite-run-after-weak-fixes.out` |
| 套件 stdout（先前） | `evidence/tests/suite-run.out` |
| view 樣本 | `evidence/tests/view-sample.json` |
| e2e submit | `evidence/tests/e2e-submit.out` |
| e2e 內容 exact match | `evidence/tests/e2e-readback-exact.json` |
| #86 單元＋負測 | `evidence/pr86/unit-and-negative.out` |
| #86 修補 SHA | `evidence/pr86/fix-sha.txt` |
| 原碼仍有洞對照 | `evidence/pr86/original-still-buggy.json` |
| 盤點 | `INVENTORY.md`、`evidence/inventory/` |
| OpenAI 計畫 | `docs/openai-wiring-plan.md` |
| 獨立審查報告（外部） | `/workspace/f05/deploy-pack-independent-review.md`（§12 欄位已填，本修補未改 §12） |
| 風險包 run | `evidence/tests/risk-pack-run.out`、`risk-pack-summary.json` |
| 風險包 run（rp41 WEAK 修後） | `evidence/tests/risk-pack-run-after-rp41-weak-fixes.out` |
| 套件 run（rp41 WEAK 修後） | `evidence/tests/suite-run-after-rp41-weak-fixes.out` |
| mutation proofs | `evidence/tests/mutation-proofs/`（mut1–mut5） |
| R9 覆蓋／版本真實性 | `evidence/R9-coverage.md`（驗證 tip pin === git HEAD） |
| #41 風險清單來源 | Issue #41 comment `<!-- F05-ONEPASS-RISK-PACK-20261031-V1 -->` @ 2026-10-31 02:33:50Z（10:33 Asia/Taipei） |
| rp41 獨立複審（外部） | `/workspace/f05/risk-pack-41-independent-review.md`（PASS_WITH_WEAKNESSES；本修補未改 §12） |

### 已跑項目結果

| 測試 | 結果 |
|------|------|
| unauthorized rejection | PASS |
| source and version stamping | PASS |
| dedup / idempotency | PASS |
| retry | PASS |
| timeout（lease reclaim） | PASS |
| restart recovery | PASS |
| cost cap | PASS |
| reporting | PASS |
| e2e submit→ACK→readback（MOCK）＋**exact content match** | PASS |
| e2e_readback_content_mismatch_negative | PASS（竄改 store result → `verifyReadback` 拒） |
| state_machine_illegal_transition_negative（含 leased→ack 拒絕） | PASS |
| K1（對應 e2e exact readback）@ e3488eab | PASS |
| K2（對應 state_machine illegal transition）@ e3488eab | PASS |
| R1 forged endpoint（合成） | PASS；真跨 AI **BLOCKED** |
| R2 replay／跨 task | PASS |
| R3 retry side-effect | PASS（API + **executor/worker** `claimSideEffect` → UNKNOWN_NEEDS_RECONCILIATION） |
| R4 STOP／revoke vs COMPLETE | PASS |
| R5 crash inject recovery | PASS |
| R6 result binding invalid | PASS |
| R7 兩合成 store 隔離 | PASS（enqueue + **checkGrant** scope/expiry）；真 Supabase RLS **NOT_RUN** |
| R8 retry／cost／stop | PASS（**stop/revoke 經 checkGrant execute** 隔離） |
| R9 coverage manifest | PASS（驗證 tip/SHA/commands；見 `evidence/R9-coverage.md`） |
| mock/real separation | PASS |
| OpenAI REAL executor | **NOT_RUN** |
| OpenAI paid call | **NOT_RUN** |
| Supabase wake | **NOT_RUN** |
| production deploy | **NOT_RUN** |

---

## 10. 尚未解決

1. Issue #41 真實跨 AI／獨立 GPT② ACK 仍 **BLOCKED**（本地 API ACK ≠ ChatGPT 已讀）。
2. 無 Docker／本機 PG → 檔案 store 非生產級交易隔離（單機鎖）；上雲需改回 `pg-store-candidate`。
3. PR #86 修補僅本地；T05–T08（多分頁／Safari 等）仍 **NOT_RUN**。
4. OpenAI／Railway／Supabase 喚醒均待核准。
5. main 保護：任何入倉需 PR。

### #41 一次性風險包（F05-ONEPASS-RISK-PACK-20261031-V1）

- K1/K2：已在 `e3488eab` 驗證 PASS（對應既有負測；見 R9）。
- R1–R8：本地最小負測已落地（`loop/risk-tests.cjs`）；R1 真跨 AI **BLOCKED**；R7 真 Supabase **NOT_RUN**。
- R9：`evidence/R9-coverage.md`（含 tip/SHA/command 真實性驗證）。
- rp41 WEAK 已關；mutation proofs 見 `evidence/tests/mutation-proofs/`。
- **仍 NO_GO**：push／PR／merge／Supabase 喚醒／OpenAI／deploy（需 Merlin 核准）。

### 已關閉之獨立審查 WEAK（Line A，本地修補；§12 原文不改）

1. **e2e readback 僅查 exit／ACK** → 已改為 `assert.deepEqual(actual.result, expected)`（`buildMockResult` 決定性輸出；證據 `e2e-readback-exact.json`）；並加 `e2e_readback_content_mismatch_negative`。
2. **file-store.ack 允許 leased→ack 跳過 execute** → ACK 僅允許 `executed`；完整路徑 submitted→acked→running→verified→done|failed（wire：queued→leased→executed→ack_received|failed）；非法轉換丟 `EVENT_CONFLICT`；負測 `state_machine_illegal_transition_negative`。

### 已關閉之 rp41 獨立複審 WEAK（PASS_WITH_WEAKNESSES → 本地修補；§12 原文不改）

1. **mismatch_negative 空轉** → 竄改 store 內 result 後呼叫 `verifyReadback`／`get({verifyReadback:true})`，系統拒 `readback_result_mismatch`（mut1 證明）。
2. **R7 scope/expiry 空轉** → 統一 `grantAllows`（enqueue + checkGrant）；並對 execute 路徑斷言 scope／expiry FORBIDDEN（mut2 證明）。
3. **R8 stop 隔離不足** → lease 後 stop／revoke，經 `markExecuted`→checkGrant 必 FORBIDDEN（mut3 證明）。
4. **R9 只寫 manifest** → 驗證 tip pin === versions.env === suite tip_sha_file === git HEAD，並確認命令檔存在（mut4 證明）。
5. **claimSideEffect 僅 API** → 已接入 `mock-executor.performTask`（worker 路徑）；R3 斷言 executor 重複 claim（mut5 證明）；見 `docs/openai-wiring-plan.md`。
6. **SHA 釘選漂移** → summary／R9／`testenv-commit-sha.txt`／`versions.env` 統一；worktree clean。

---

## 11. 需 Merlin 明確核准的項目（逐項）

| # | 核准項 | 具體內容 |
|---|--------|----------|
| A | **push／開 PR** | 是否將 `d6ceb561…`（#86 L1 修補）推到 GitHub 並開／更新 PR |
| B | **Supabase 喚醒** | 是否喚醒 `xsgtpcutpnniomlrqazs`（或另建隔離專案）並允許套用 candidate SQL |
| C | **金鑰** | 是否建立／注入 `OPENAI_API_KEY`（及可選 org／project）；**禁止**把 service_role 交給 bot |
| D | **付費使用** | OpenAI billing／硬限額度；任何付費 API 呼叫 |
| E | **合併** | 合併 #86 修補 PR 與／或佇列候選 PR 到 main |
| F | **部署** | 正式／預發 worker 或 Pages 行為變更 |

未核准前維持：本地 MOCK only、無雲端寫入、無模型請求。

---

## 12. 獨立審查欄（留給審查者）

> 審查者：獨立 READ-ONLY 審查（2026-10-31）｜詳見 `/workspace/f05/deploy-pack-independent-review.md`
> 限制遵守：無 push／GitHub 留言／合併／部署／正式資料／Supabase／OpenAI 呼叫；僅本地重跑與本欄編輯。

| 檢查 | 審查者填 |
|------|----------|
| 證據與 SHA 是否可獨立重跑 | **PASS**。Line A 套件獨立重跑 12 PASS／0 FAIL／4 NOT_RUN（`evidence/tests/suite-summary.json`，2026-10-31 10:20:44 Asia/Taipei）。Line B worktree `/workspace/f05/pr86-fix-review-d6ceb56` HEAD=`d6ceb5618615f79f3e8be027fb1bca245e8b3f40`（與宣稱一致），`node --test` **16/16 PASS**；base `3c57f56a23fff296342e1e77a001c02f23f5386d`。 |
| MOCK／REAL 是否分離且 REAL 未偷跑 | **PASS**。`mock_real_separation` PASS（MOCK>0、REAL=0）；`createRealExecutorStub` 回 `NOT_ENABLED`；`OPENAI_API_KEY` UNSET；4 項 NOT_RUN 理由誠實（openai_real／openai_paid／supabase_wake／deploy_production）。 |
| #86 修補是否真正拒絕殘缺圖／任意 source_id | **PASS**。獨立 repro：root-only／刪 D7·D8 → 拋 `receipt_graph_incomplete_missing_node`（不再 `changed:false`）；8 個任意 `source_id` 全拒 `source_id_not_allowed`。合法路徑未誤判：允許清單 source_id PASS、完整圖既有 receipt → `changed:false`、合法改標題不變圖、digest／revision 竄改偵測為 conflict。設計為 **reject-not-restore**。 |
| 是否誤用 #85 結果關閉 #86 | **PASS（應為否）**。本審查僅針對 #86 L1 修補分支 `local/pr86-l1-fix-20261031` @ `d6ceb56…`；未將 #85 結果當作 #86 關閉依據。 |
| 部署包是否越權（push／金鑰／喚醒） | **PASS（未越權）**。審查過程無 push、無 GitHub comment、無 merge、無 deploy、無 Supabase／OpenAI。diff `3c57f56..d6ceb56` 僅 2 檔：`first-brain-plan-core.js`、`tests/first-brain-plan-core-l1-negative.test.cjs`（+121/−3）。 |
| 建議：核准 A–F 哪些／附加條件 | **建議僅維持本地 MOCK（相當於 A 類本地驗證範圍）**。暫不建議核准 push／開 PR／CI／合併／喚醒 Supabase／OpenAI REAL／正式部署。附加條件見弱點：① e2e readback 僅斷言 submit exit 0／ack，**未比對回傳內容**（digest 另測）；② `file-store.ack` 允許自 `leased` 直接 ACK（可跳過 execute）— 建議補負面測試或收緊狀態機。Line A 整體：**PASS_WITH_WEAKNESSES（MOCK only）**；Line B：**PASS**。 |
| 簽名／時間（Asia/Taipei） | 獨立審查 · 2026-10-31 10:23 Asia/Taipei · SHA Line B `d6ceb5618615f79f3e8be027fb1bca245e8b3f40` · 證據目錄 `/workspace/f05/deploy-pack-independent/` |
