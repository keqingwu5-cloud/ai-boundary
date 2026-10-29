# G1L｜獨立 GPT② 受控沙盒接受事項與未啟用界線

**使用者核准來源**：[Issue #41 2026-10-29 G1L 接受方案紀錄](https://github.com/keqingwu5-cloud/ai-boundary/issues/41#issuecomment-6500061627)。範圍限公開**合成**資料的最小可驗試驗；不可視為 production authorization。

## 已接受的規劃
- Railway Hobby Node Agent，最低 USD 5/月，含 5 USD 當月資源用量；超出將另有費用，必須查核**服務側真正會停止消耗**的 usage cap 設定。參考：https://docs.railway.com/pricing/plans 。
- Supabase Free 測試 PostgreSQL（目前連接帳號 0 個專案），可能因閒置暫停，無 production backup/recovery 保證。參考：https://supabase.com/pricing 。
- OpenAI API 受限獨立**測試專案**，模型 `gpt-5.4-mini-2026-03-17`，每月 USD 5 推理支出限額；必須啟用 `Enforce a hard limit`，且計量非即時，**不得聲稱絕對不超額**。參考：https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform 。
- 授權上限：最多 100 件公開合成事件；單件規劃 input ≤ 5000、output ≤ 1000 tokens，請求每分鐘 ≤ 5 次；具 revocation/STOP、真正持久的 atomic attempt/nonce 回執，以及不自我批准。
- 模型外部服務必須**實際自行讀取固定版次來源**、產生可驗 request/response 證據，且獨立語意校正。API ACK、synthetic Ed25519 或固定 URL 欄位均不代表 ChatGPT GPT② 真正接收。

## 本候選的限制
`api/g1l-sandbox/sandbox-readiness.cjs` 為**純本機 fail-closed static preflight**，不讀取網路、不建立 key、不連 Railway／Supabase／OpenAI API、不產生費用、不改授權。
輸入中的 `connected: true`、`operator_pinned: true`、`hard_limit_enabled: true` 只是 **untrusted self-assertions**，即使格式全符合，仍僅 `PENDING_EXTERNAL_ATTESTATION`，永遠 `deploy_authorized=false`、`real_gpt2_ack_verified=false`。

## 目前外部資源現況
- Railway App 可用但**需使用者連接**，本階段沒有可操作 Railway 帳戶。
- Supabase 已連接帳號查無 project；沒有可實作獨立隔離 PG 角色與復原測試的 runtime。
- OpenAI API project / model allowlist / hard spend enforcement / usage authority 目前無可驗證管理連接工具。

## 後續真實 G1L 試驗順序（需要外部帳戶／硬限查核）
1. 在使用者實際連接服務後，以只讀方式核對 Railway plan、成本停止策略、workspace、Supabase org 和 API project 的管理權限。
2. 核對上述接受範圍和管理端真實 hard-limit 設定，然後才允許建立專用測試資源與 secrets；正式付費確認動作應由帳戶持有人明確執行。
3. 接收端必須只具有指定 synthetic read、receiver execute/ack、隔離回執 insert/select；嚴禁 schema admin、main push、私人記憶、prod database。
4. 用非敏感合成資料實際收件、固定來源內容 hash、獨立推理、回執與摘要反證；有外部可查證 evidence 再宣告哪項測試完成。
5. 保留 STOP/撤銷、低額超支、Webhook/unknown response、DB outage、舊 attempt/nonce 與錯模型的 fail-closed 報告。

**不變 Gate**：`G1L_PLAN_ACCEPTED=YES`; `PROVIDER_CONNECTION=INCOMPLETE`; `G1L_LIVE_DEPLOY=NO_GO`; `GPT2_ACK=UNVERIFIED`; `CROSS_AI_E2E=BLOCKED`; `MAIN_MERGE=NO_GO`; `PRIVATE_MEMORY_ACCESS=DENIED`。資料及失敗歷史只追加，不覆寫。
