# BOT-B 隔離檢查重現指南

## 前置
- Node.js 22+
- 已 checkout 本分支

## 執行
```bash
# 離線模式（建議）
OFFLINE=1 node docs/bot-b/bot-b-min-test.mjs
```

## 預期輸出
- 各項檢查印出 PASS
- 最後一行：`EXIT=0`

## 單獨檢查
```bash
node docs/bot-b/verify-manifest.mjs
node docs/bot-b/fingerprint-verify.mjs   # 需網路，或 OFFLINE=1
node docs/bot-b/stop-cross-restart-test.mjs
```

## 注意
- 本指南僅供重現，不構成驗收
- RELEASE_GATE = HOLD