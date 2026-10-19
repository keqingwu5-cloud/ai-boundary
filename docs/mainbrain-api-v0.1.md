# 主腦 API V0.1｜隔離候選
基於 Issue #41 / Draft PR #42，**未部署、未合併、未完成跨 AI 自動交接**。

## API 路由契約（由未來可信 server adapter 掛載）
- POST /v1/tasks/send → send：經驗證來源提交事件；以 source+idempotency_key 去重
- POST /v1/tasks/receive → receive：僅目的端可領取；生產實作需交易式 lease
- POST /v1/tasks/execute → execute：執行端提交 attempt_id 和證據
- POST /v1/tasks/ack → ack：目的端簽收，嚴格區分 API receipt
- POST /v1/tasks/fail → fail：錯誤分類、重試/隔離
- GET /v1/tasks/:event_id → status：僅來源/目的端可查
這些是服務方法及路由契約，**尚未架設 HTTP 服務或真正的執行端**。

## 信任邊界
- authenticate 必須由服務端驗證 token 簽章、issuer、audience、expiry、scope 及 endpoint 綁定，絕不相信 request body 的角色或 verified 布林。
- 目前 API 核心使用注入式 authenticate/store；尚未提供可用的生產 adapter。
- SQL 只定義持久化結構，未套用。store.enqueue/lease/ack 必須使用資料庫交易、唯一鍵、FOR UPDATE SKIP LOCKED、lease timeout、限制重試與結構化日誌。
- ChatGPT 互動入口保持原樣，不能用聊天已讀冒充 API ACK。
- 記憶治理：API 事件只引用 memory proposal id；任何權威記憶變更仍需既有審核門檻，不可由 API 自動批准。

## 驗收門檻
1. 契約單元測試 + 舊 launcher/記憶測試。
2. 可信 JWT/OIDC adapter、持久化 repository 與交易式重試。
3. 以隔離環境驗證 send→receive→execute→ACK→status 及故障恢復。
4. GPT② 獨立審查，再經使用者核准合併與部署。
