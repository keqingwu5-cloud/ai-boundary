# AUTO-TRUST V0.1｜來源與審核基準驗證契約（僅隔離候選）

> Draft [PR #128](https://github.com/keqingwu5-cloud/ai-boundary/pull/128)，父候選 [#126](https://github.com/keqingwu5-cloud/ai-boundary/pull/126)。**無正式憑證、未部署、未合併、未修改資料庫或有效記憶**。

## 主要工程發現：監視游標不是核准基準

`api/task-source-checkpoint.cjs` 在完整 GitHub 來源掃描有內容變更時，會更新儲存在 Actions Cache 的「上次觀測指紋」。它可協助監控避免重複報告，但 **Actions Cache 不是永久可信資料庫**，而且「下次觀測到的內容」不能自動升格為「已核准生效的來源版本」。

因此必須分成兩條：
- **觀測游標**：監控程式寫入，表示 `LAST_OBSERVED`；可因讀取成功而前移，不提供執行授權。
- **審核基準**：需受信且經授權的來源讀取者證明、獨立的基準管理者簽名、外部不可隨意替換的基準 head，才可用於審查比較。此 PR 僅實現**驗證契約**；沒有建立真實 head 保管系統。

## 這次隔離實作

`api/source-baseline-attestation.cjs` 只做：
1. 要求呼叫者事先提供 `expected_scope`（此版僅支援 `github:owner/repo:issue:N`），不可讓來源簽章自行選取任務的標的。
2. 檢查 `source_readers` 允許清單、Ed25519 公開金鑰簽章、來源 ID／版次／原目的／原始 JSON 字串 SHA-256、簽章時效與來源範圍。
3. 對有基準的比較，另外驗證不同角色的 `baseline_curators` 公開金鑰簽章、基準版本與評審參照、外部提供且已預先錨定的 `head: {scope, source_id, sequence, seal_digest}` 是否匹配。
4. 驗證成功才呼叫既有 #126 `scanEntry`，回報 `NO_CHANGE`／`REVIEW_CANDIDATE`／`NEED_COUNTEREVIDENCE` 等**唯讀候選**，永不對正式儲存或 AI 產生副作用。
5. 無基準時僅回 `WAIT_BASELINE`；有 head 但基準缺失、錯誤或舊版時拒絕。資料來源與基準管理者使用相同公開金鑰時拒絕。

測試使用 `node:crypto.generateKeyPairSync('ed25519')` 在測試執行期間建立暫時金鑰；測試私鑰**沒有儲存到 GitHub 或正式金鑰管理服務**。此版本有簽章**驗證**功能，不具發證或金鑰託管功能。

### 狀態標記的真實意義

- `local_source_signature_valid`：對**傳入的允許清單**驗證來源讀取者簽章通過，不能證明 GitHub 原站或真實 GPT 已親自簽署。
- `local_baseline_signature_valid`：對**傳入的基準管理者名單及 head** 核對通過，不能證明外部 head 實際受保護、來源真實、治理批准或已合法生效。
- `real_source_verified:false`、`actual_remote_ack:false`、`approved:false`、`action:'NO_EXTERNAL_EFFECT'` 都必須保留。
- `review_ref` 是已簽名的參照文字，**不等於真的有獨立 Review**。
- SHA-256 是內容指紋而不是憑證；若來源為低熵私人內容，未經權限控管不可對外公開摘要。

## 實際負測

| 固定證據 | 結果與解讀 |
| --- | --- |
| [最初 RED Actions #42490518178](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42490518178) | 既有 87 項通過，新測試檔因模組尚不存在而載入失敗；不是 20 個反例逐項失敗。 |
| [第一輪 GREEN Actions #42490620820](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42490620820) | 107/107 通過，含 20 項新增模擬驗章與基準失效反例。 |
| [新增 scope RED Actions #42490716616](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42490716616) | 107/110 通過，3 項驗證外部目標綁定條件失敗；識別到只憑簽章內 scope 不足。 |
| [新增 scope GREEN Actions #42490767070](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42490767070) | **110/110 通過**，修正為先固定 expected_scope 再驗證，並保留原先 87 項回歸。 |

## 正式化前仍缺的關卡

1. **來源真實性**：建立可信 GitHub webhook/API 擷取身分、資料原始版本、時間戳及防重播，不能由呼叫者自稱來源。
2. **獨立金鑰管理**：公鑰清單由受權治理者維護，私鑰簽發服務與任務 Worker 分離，需旋轉、撤權、速率與審計管理。
3. **可信 head 持久化**：受限 PostgreSQL append-only 紀錄、獨立唯讀檢索、版本序號、CAS 或唯一約束與回讀；本次 `head` 仍是呼叫者傳入，尚不是真正可信保存。
4. **原目的／候選審核**：記錄基準建立與生效的獨立審核來源和決策版本，未核准不能讓監視游標升格。
5. **安全與可恢復性**：檢查同一 signed source 在允許有效期內重播、並發版本前移、授權撤銷、資料恢復以及同 SHA 真 PostgreSQL；仍無外部停止與真 GPT② ACK。
6. **裝置與服務端驗收**：Chromium/iPad Safari、真服務 TLS、實際來源讀取與通知回執都尚未做。

**本輪的設計結論：不以 GitHub Cache 當審核基準資料庫；只在分離且可信的基準 head 存在時執行分流比對。任何自動更新的僅為觀測游標，非有效版本。**
