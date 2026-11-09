# 第一大腦｜關鍵字問題歷史對帳第一批工程修補 V0.1

**候選狀態**：`DRAFT / READ_ONLY / NOT_DEPLOYED / PRODUCTION_NO_GO`。母文件為 [Draft #63](https://github.com/keqingwu5-cloud/ai-boundary/pull/63) 的兩份歷史問題關聯設計稿；本修補**只增加隔離程式、人工索引、可重跑測試與 CI**，不變更 main、正式記憶、3D、PostgreSQL、API 或任何跨 AI 存取權限。

## 問題／原始材料
- 2026-11-09《第一大腦_關鍵字全局核查_2026-11-09.md》：17 個整合問題群、16 組語意關鍵字、截至當時 116 PR / 96 Open / 20 Closed-Merged，以及《全域待辦總清單 V0.3》73 筆重疊母項/細項。
- [Issue #41](https://github.com/keqingwu5-cloud/ai-boundary/issues/41) 仍是 `BLOCKED`；真 GPT② 獨立接收/ACK 不得由 CI、發文或模擬訊息推定。
- [Issue #65](https://github.com/keqingwu5-cloud/ai-boundary/issues/65) 要求整合前先判定跨 Draft 同問題、同契約及同實作差異，保留完整歷史，不能把不同 SHA PASS 相加。
- [Draft #140](https://github.com/keqingwu5-cloud/ai-boundary/pull/140) 的來源 Git tree 靜態包修補即使通過 202/202 Node 和 3/3 WebKit，也不等於全局正式部署。
- 原 `KGE-001` 曾提及 214 詞/12 類，**本次沒有該完整原始詞庫**。`data/problem-keywords.v01.json` 為**新建人工摘錄索引**，不能被冒充原 214 詞、外部真相或新的主資料庫。

## 具體修正
1. 永久 `problem_id` 對應原稽核表 `FB-P0-01`～`FB-P2-17`，保留人可讀原問題、關鍵字、歷史 Issue 和 PR 候選編號、確切仍缺的 Gate。不從公開摘要複製私人記憶內容。
2. `scripts/keyword-historical-audit.mjs` 提供 Unicode 正規化與關鍵字搜尋，防止 `ACK` 落在 `BACKUP`、`BLACKLIST` 等子字串內；可搜尋 `GPT②`/`GPT2`、`#41`、`Issue #41`、`PR #140`、中文關鍵字，區分 Issue vs PR。
3. 同一詞對應**多個不同**問題不會自動歸併：例如 `3D` 同時指寫入一致性和新 2D/3D 視圖。候選關聯只代表人工整理的資料，不能作為因果或可信身分證據。
4. `compareSourceSnapshots` 比較帶類型的 source、HEAD SHA/狀態／review/ACK **宣稱**變化，輸出 `STALE_RECHECK_REQUIRED`、`NEW_SOURCE`、`SOURCE_NOT_IN_NEW_SNAPSHOT`，**不自動更改**正式 gate。
5. `assessEvidence` 將有固定 SHA、真 run ID、已查原始 log 的 CI 限定為 `PINNED_CI_ONLY`；其他評論、文字 ACK、未驗證 reviewer 均為 `CLAIM_ONLY_OR_INCOMPLETE`。此程序不連真遠端執行端，**不能批准任何 ACK 或部署**。
6. CI 以 Node 原生測試跑關鍵字同義、字串誤觸、型別區分、重複 ID、假 ACK、舊版 HEAD、來源消失、拒絕 READY 等負例。無新 npm 依賴、無 token、沒有網路請求，也沒有通知副作用。

## 本輪手動關鍵字對應（目標不等於已獨立驗證運作）
| 查詢 | 對應原歷史問題 | 仍缺 |
| --- | --- | --- |
| `ACK` / `#41` | `FB-P0-01`；Issue #41 / #56；PR #42～#52、#114 等候選 | 獨立目的端、真接收與身份、簽收/回讀 E2E |
| `RLS` / `Ed25519` | `FB-P0-02`；PR #29 / #128 | Root of trust、金鑰撤銷與實際權限 |
| `STOP` / `watchdog` | `FB-P0-03`；PR #116 | 真遠端終止、晚完成對帳、程序死亡後的持久狀態 |
| `記憶` / `restore` | `FB-P0-04`；PR #102/#103/#104/#107 | 真私人 origin、授權舊備份與跨分頁提交 |
| `3D` | `FB-P0-05`、`FB-P1-14`；PR #75、#142 | 真舊節點兼容、單一 writer、同 origin、真機 |
| `PR #140` | `FB-P0-07`/`FB-P0-08` 等對應索引群 | 公網 404／real Safari／可恢復實際發布 |
| `KGE-001` | `FB-P1-15` | 真 214 詞詞庫和跨 GPT 增量對帳都未取得 |

## 重現（僅索引，不是重新抓 GitHub 最新資料）
```bash
node --test tests/keyword-historical-audit.test.mjs
node scripts/keyword-historical-audit.mjs 'ACK'
node scripts/keyword-historical-audit.mjs 'Issue #41'
node scripts/keyword-historical-audit.mjs 'PR #140'
```

## Gate 仍未解除
- 這是 **快照索引**，沒有 GitHub/Notion live source adapter、永久動態同步、外部簽章來源證明，亦沒有取得 GPT②/BOT③ 真身份。
- 草稿的 `gate:BLOCKED`/`HOLD` 是截至核查日期的保守審核分類；不代表今天每一份原始碼逐行重審。每次進入正式決策都要重查原始 Issue、PR 最新 HEAD、相同 SHA CI logs、真正的接收/審查身份與權限/復原。
- 對接既有 KGE-001 原詞庫和 T01–T16、E/R/C 母子待辦之前，**不得宣稱自動歷史檢索已完整**。
- 本分支及其測試通過不是 BOT③ 獨立審核、真部署或升權批准。正式部署仍 `PRODUCTION_NO_GO`。