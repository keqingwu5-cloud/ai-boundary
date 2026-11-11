# BOT-B 隔離文件索引

| 文件 | 用途 |
|---|---|
| [ISOLATION_SUMMARY.md](ISOLATION_SUMMARY.md) | 總結報告 |
| [evidence-manifest.json](evidence-manifest.json) | 機器可讀證據清單 |
| [REPRODUCE.md](REPRODUCE.md) | 重現指南 |
| [CHANGELOG.md](CHANGELOG.md) | 變更紀錄 |
| [LIMITATIONS.md](LIMITATIONS.md) | 已知限制 |
| [NON_AUTHOR_RECORD.md](NON_AUTHOR_RECORD.md) | 非作者重跑範例 |

## 測試腳本
- `bot-b-min-test.mjs` — 主測試
- `verify-manifest.mjs` — 清單驗證
- `fingerprint-verify.mjs` — 指紋比對
- `stop-*-test.mjs` — STOP 相關
- `netns-isolation-test.mjs` / `mount-ns-test.mjs` — 命名空間

**RELEASE_GATE = HOLD**