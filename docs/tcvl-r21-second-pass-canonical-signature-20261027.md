# R21 第二次驗證｜合成 Ed25519 簽章編碼與測試權威來源不可變性

> 2026-10-27；G1 隔離候選，**不是正式使用者授權**、獨立 G2 審查、私人金鑰或正式資料庫變更。使用者要求「再一次」，因此在既有 R21 上重核並加入真正先紅後綠的反例，不複製第二套驗證器。維持 PR #69 Draft、原 PR #70/main/正式監控不變，所有既有證據追加保留。

## 原基準與為什麼要重測

- 原 R21 HEAD `4e2390b4170baa9b4187fd910f372b0014440900` 的 [CI #40489148547](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40489148547) **329/329 Node PASS**；已能以合成 Ed25519 公鑰驗證完整 v2-candidate 待審欄位並阻擋同一 Node isolate 重播。
- 原始 R21 文件已明確承認 **Base64URL 簽章編碼唯一性尚未測試**。64-byte Ed25519 簽章轉為無填充 Base64URL 共 86 字元，最後字元的低四個位元不能出現非零別名；否則兩個不同字串可解出相同 64 bytes。
- 測試中使用的 `syntheticAuthorities[0]` 原本是一個 caller-owned 物件的參照；初始化 status 為 `revoked` 後，caller 可修改物件為 `active`，使原驗證器接受相同的合成簽章，這不應被誤當成具有不可竄改的權威狀態。

## 明確反例，不以假綠燈替代

在 `tests/tcvl-r21-synthetic-signed-review.test.cjs` 新增兩項：

1. 簽一份真正測試 Ed25519 收據，把 Base64URL 最後字元改成**不同字串、相同解碼 bytes**，要求 `BLOCKED_NONCANONICAL_SIGNATURE_ENCODING`。
2. 以初始 `revoked` 建立 port，之後外部修改原設定物件的 `status='active'`，要求 `BLOCKED_SYNTHETIC_AUTHORITY_CONFIG_MUTATED`，不可憑 caller mutation 重新開通。

- **原始 RED**：[Actions #40499939043](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40499939043)，commit `29ca9702d4add37504a843dd4e22f66e3ae8cdd6`；**331 項 329 PASS／2 FAIL**。兩項失敗的實際結果都為 `SYNTHETIC_SIGNATURE_REVIEW_RESERVED_ONLY`，所以是兩個真實的**隔離驗證器缺陷**，不是新測試本身的語法誤報，也不是正式系統已遭利用。
- **最小修復**：`tcvl-r21-synthetic-signed-review.cjs` 在 `crypto.verify` 前要求解碼後 **正好 64 bytes、重新標準編碼必須等於原字串**；建構時記錄合成金鑰的 `key_id,approver_id,public_key_pem,status`，每次核對 caller 物件與初值，有任何變化就拒絕。即使暫時只測本地金鑰也不允許把外部物件修改當可信撤銷或恢復事件。
- **修復後 GREEN**：代碼＋明確 CI gate commit `cee6a80e5852f9f572ef7578d4b18808cbb3335c`，[Actions #40500224626](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/40500224626)，`completed/success`；**R21 定向 13/13，全 Node 331/331 PASS，零失敗**。R13–R20 disposable PostgreSQL、WAL/備份／早期升主失敗注入仍依原 runner 工作流執行；原 R17 危險反例不因 CI 綠燈視為已防護。

## 第二次審查後仍不可越過的正式 Gate

1. **合成鑰匙不是 owner 信任根**：`syntheticAuthorities` 由 caller 建立，測試用 Ed25519 驗簽成功仍固定 `trusted_signer_verified=false`、`verified_owner_approval=false`、`verified_gpt2_ack=false`、`execution_allowed=false`。
2. **沒有跨程序／資料庫原子執行授權**：R21 的 `used` 和 `nonces` 是記憶體集合；兩個獨立 port 仍可各接受同一合成收據。R20 PostgreSQL 的未簽 metadata 不能替代驗簽或正式授權。
3. **主備分岔風險仍然成立**：R17 在 WAL 未送達時的錯誤升主曾真重現收據／撤銷紀錄遺失，沒有可信 fencing／leader epoch/受保護派工。
4. **獨立 G2 和正式規章未完成**：GitHub 的 G1 追加留言不是 GPT② 真讀取、ACK 或核准；合併／部署／金鑰／私人 DB／監控變動均需使用者另行分別批准。

本文件是**新一份增量報告**，不覆蓋原 R21 文件對「當時未測」的真實歷史描述。加入本報告自身的 docs-only commit 後，需以**更新後固定 HEAD 的 Actions** 另外驗證；不能用前一版的綠燈冒充最終提交已測。

**`R21_RECHECK_CANONICAL_SIGNATURE=PASS_IN_G1`；`R21_RECHECK_MUTABLE_KEY_CONFIG=PASS_IN_G1`；`TRUE_TRUSTED_OWNER_AUTHORITY=NOT_BUILT`；`G2/MAIN_MERGE/PRODUCTION=NO_GO`。**
