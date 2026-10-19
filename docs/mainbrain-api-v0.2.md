# 主腦 API V0.2｜隔離候選（尚未部署）
新增 api/http-server.cjs 提供 Node HTTP 路由，api/auth-adapter.cjs 提供短效 HMAC 簽名端點 token 驗證示例，未接生產憑證系統。不得把 HMAC 示例等同 OIDC/JWT 身分提供者或正式可信身份。
本候選不啟動伺服器、不建立金鑰、不部署；需要外部受控 secret 管理、TLS 反向代理、金鑰輪替、撤銷、速率限制、服務端授權政策。
**阻塞：** 尚無真實持久化 store adapter、交易式 lease/retry/ACK 驗證、worker/agent runtime、記憶治理接線；目前 HTTP API 只是可測試的接口外殼。
現有 ChatGPT 對話入口不改；ChatGPT 已讀不能產生 API ACK。
