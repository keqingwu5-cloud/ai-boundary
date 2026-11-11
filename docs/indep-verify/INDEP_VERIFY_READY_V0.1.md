# 第一大腦｜獨立驗收準備清單 V0.1

**狀態**：RESEARCH_CANDIDATE / HOLD  
**目的**：供非作者（BOT③）重跑時使用，不構成正式驗收。

## 可重跑固定版本
| 階段 | 分支 | Commit |
|---|---|---|
| BOT-A 圖紙 | research/bot-a-d01-d06-v0.1 | f6bea00f26a46e5e29b3b8a827fa6a07d90d8899 |
| BOT-B 內驅動 | research/bot-b-inner-drive-v0.1 | 7fab780cd47ccf263320c400324d40ca5d25bf73 |
| 總核對 | research/total-check-v0.1 | 76d454ae6547de19192eb3c72f0facb391d91236 |

## 重跑步驟（合成）
1. checkout 上述 commit
2. 執行 `node docs/bot-b/bot-b-min-test.mjs`
3. 確認輸出含 `SYNTHETIC` 且 EXIT=0
4. 記錄 reviewer identity、reviewed SHA、exit code

## 已知限制
- 無真實執行者
- #41 跨 AI ACK 仍 BLOCKED
- STOP/撤權未程式化
- 本清單本身不是驗收結果

**RELEASE_GATE = HOLD**
