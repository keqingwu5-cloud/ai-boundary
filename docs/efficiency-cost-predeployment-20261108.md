# 第一大腦｜效率、成本工程獨立候選 V0.1（部署前審查）

日期：2026-11-08，Asia/Taipei。原始依據：待辦 T09/T11/T15/T16、C10/C11；Notion A→AB→B「先研究／成本先量測」；既有 PR #66/#99/#105/#116。目標是把成本、查詢、上下文重讀的增量控制工程拆為可重跑的最小組件，而非增加第二個任務、記憶或監控系統。

## 本次真正完成的隔離組件

- api/efficiency-cost-preflight.cjs：純函式計畫器。源頭有不完整／未知版本則 BLOCK_SOURCE；高風險或矛盾 REVIEW_REQUIRED；相同可信來源指紋、研究目的、已核對證據且在有效期限內 REUSE_VERIFIED；其他來源 TARGETED_VERIFY；超額 BLOCK_BUDGET；缺估價 BLOCK_UNKNOWN_COST。
- tests/efficiency-cost-preflight.test.cjs：27 個合成正常／負向案例，包含版本、來源、目的、時間、重複鍵、未知成本、實際用量不可確認、數值溢位及不可變性。
- 本候選用 caller-supplied 的 SHA256 指紋和微美元預算；本模組不具備自行核對 caller 身分、簽章、實際 provider 成本或真實模型品質的能力。
- runtimeAllowed=false、autoDispatch=false、modelCallsAuthorized=0。CI 只做 Node 離線測試，沒有定時排程、金鑰、資料庫更動、模型呼叫、外部寫入。

## 避免重工與角色分工

- PR #99：已有差異判讀、舊案例重用工作指引；本模組提供測試可驗的確定性預檢，不建立新的記憶權威。
- PR #66：已有唯讀監控及去重候選；本模組不重做 GitHub/Notion 掃描、Webhook 或排程。
- PR #105 及 #110→#115：已有來源讀取、比對、HTTP/合成 ACK；本模組不授權真正發送，未與這些分支合併。
- testenv/loop 已有 MOCK cost_cap_usd 與 cost_ledger；本模組不取代 worker 成本上限。
- PR #116：已做 worker/watchdog 本地 timeout/unhealthy 測試；本模組不假稱 remote STOP 或監控告警完成。

## 輸入限制

可信來源層必須事先核對 sourceId、SHA256 指紋、原始研究目的 digest、審核來源身分及版本，再將非敏感 metadata 交給此模組。reviewed=true 不是可受信身分認證；沒有證據 ref 或超過時間上限就不准重用。estReadMicros 或 usage.chargeMicros 是估計／來源填值，不能當 provider 實際帳單；unknown 不能被填為 0。只使用非敏感 ID，不把私有記憶或原文送到 GitHub。

## 可重現測試

Node.js v22：node --test tests/efficiency-cost-preflight.test.cjs。需核對候選 PR 當前 HEAD SHA 與同一 SHA GitHub Actions 的原始 job log，並保留本地紅燈／修補歷史。CI pass 僅證此模組純函式行為，不證真整合效益。

## 真正的待部署 Gate（未完成）

1. G0 原件與依賴：固定 #105 source adapter、#66/99 重用指引、T16/R09 的來源與版本，確定不重做已有功能，辨認唯一責任歸屬。
2. G1 完成可信 metadata 接口：必須有完整來源快照、權限、原始目的、sha/revision、證據審核，不可由不受信輸入任意升級 reviewed。
3. G2 同條件效率量測：比較 10／100／1000 筆安全資料的舊全讀流程與新差異流程；實測 API request、實際模型 tokens、耗時、漏判/假陽性、人工複核量、重試/停止及真 provider 帳單。不得預設節省百分比；兩組品質不可比時只報不具可比性。
4. G3 例外與回退：矛盾、高風險、資料過期、權限變動、原始目的變更、來源未讀全時，都不得因省錢跳過反證；將 fail-closed 和停止/恢復與原工作 Gate 區分。
5. G4 程式整合：建立單一整合 HEAD，在隔離環境完成正/負測、資料正確性、隱私、效能、實際觀測與回退；真正 GPT② ACK、memory/3D 等全系統驗收另列，不可從本 PR 代替。
6. G5 獨立 reviewer 與使用者核准：同 SHA CI + 獨立審查 + 真費用資料及測試證據 + 恢復方案齊全，才能稱 READY_FOR_DEPLOY_CANDIDATE；未授權不合併 main、不部署、不建立付費 key。

## 預期輸出／禁止誤報

決策：REUSE_VERIFIED / TARGETED_VERIFY / REVIEW_REQUIRED / BLOCK_SOURCE / BLOCK_UNKNOWN_COST / BLOCK_BUDGET。
指標：estimatedReadMicros=caller supplied estimate；actualUsdSavings=UNKNOWN；actualSpendCertified=false。若沒有完整 provider 用量與前後對照，不宣稱實際節省或成本為零。

狀態：ISOLATED_CODE_AND_TESTS / LIVE_WIRING=NOT_RUN / INDEPENDENT_REVIEW=PENDING / REAL_SAVINGS=UNKNOWN / MAIN_UNCHANGED / DEPLOY_NO_GO。
