# 第一大腦｜三方博弈 V0.2 隔離設計（最小候選）

**狀態：RESEARCH / ISOLATED / IN_MEMORY / NOT_APPROVED / NOT_DEPLOYED**  
基礎：PR #149 HEAD `36b5f5ed57c21929c584ccd3415ee7f1c5715f74`

## 範圍

薄型 sidecar `triad-duel-v02-candidate.mjs`：
- 聯合行動效用（G01）
- 裁判分離（G02）
- 合法性 Gate（G05）
- 不預設勝者（G07）
- information_state 最小版（G03 部分）
- TIE_PENDING（G06 部分）
- 證據型別 SYNTHETIC_DEMONSTRATION（G10）

不定稱與 CARA / OpenSpiel 真實軟體等價。只用合成資料。

## 限制

仍為 HOLD。需 BOT③ 獨立重現、GPT② 公平性反證。
禁止合併 main、部署、改正式記憶。

**交接給 BOT③ 獨立審核。**
