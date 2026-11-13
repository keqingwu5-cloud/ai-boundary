# 非作者覆驗可重跑包 V0.1

## 固定版本
- BOT-A: research/bot-a-d01-d06-v0.1 @ cda4abeb
- BOT-B: research/bot-b-inner-drive-v0.1 @ 80b2938a
- 橋樑 tarball SHA-256: dff301c6ffe59be9892f6880e1df1aae7a2fbedae64e138b93edb1053f34c568
- 啟航 bundle SHA-256: 386c14645c0206cdf3ba96605577fc18499dc2ee9d9c0f626a1902617b23e8aa

## 重跑指令（隔離環境）
```bash
# BOT-B 主測試
OFFLINE=1 node docs/bot-b/bot-b-min-test.mjs

# 指紋比對
OFFLINE=1 node docs/bot-b/fingerprint-verify.mjs

# F05 gap detection
node docs/bot-b/f05-gap-detection-test.mjs
```

## 預期
- 主測試：PASS / NOT_RUN 分開計數；有 NOT_RUN 則 exit 2
- 指紋：與 f6bea00 一致
- gap detection：三案例皆通過

## 注意
- 本包僅供非作者重跑，不構成驗收
- RELEASE_GATE = HOLD