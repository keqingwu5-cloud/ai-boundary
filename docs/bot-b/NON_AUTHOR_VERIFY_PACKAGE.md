# 非作者覆驗可重跑包 V0.2

## 固定版本
- BOT-A: research/bot-a-d01-d06-v0.1 @ cda4abeb
- BOT-B: research/bot-b-inner-drive-v0.1 @ 80b2938a
- 橋樑 tarball SHA-256: dff301c6ffe59be9892f6880e1df1aae7a2fbedae64e138b93edb1053f34c568
- 啟航 bundle SHA-256: 386c14645c0206cdf3ba96605577fc18499dc2ee9d9c0f626a1902617b23e8aa

## BOT-B 重跑
```bash
OFFLINE=1 node docs/bot-b/bot-b-min-test.mjs
OFFLINE=1 node docs/bot-b/fingerprint-verify.mjs
node docs/bot-b/f05-gap-detection-test.mjs
```

## 橋樑重跑
```bash
# 解開 tarball 後
tar -tzf fb-loop-bridge-phase2-V0.1.tar.gz | wc -l
# 預期 77
# 執行其內部測試（依 tarball 內說明）
```

## 啟航重跑
```bash
git fetch FB-FOUNDATION-LOOP-001-qihang-c8a52c2.bundle HEAD:qihang/fb-foundation-loop-001-20261113
# 進入該分支執行其測試
```

## 預期
- BOT-B：PASS / NOT_RUN 分開；有 NOT_RUN 則 exit 2
- 橋樑：77 個檔案可讀
- 啟航：bundle verify 通過

## 注意
- 本包僅供非作者重跑
- RELEASE_GATE = HOLD