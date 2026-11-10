# 01-duel-issue-routing.md

**Task ID**: FB-GROK-DUEL-CONTEXT-TRIAGE-20261110-V02

## G01–G10 分流

| ID | 主要修正 | 主責 | 本分支狀態 |
|---|---|---|---|
| G01 | 聯合行動效用 `u_i(s, a_C, a_O, a_F, chance)` | Grok | 已實作最小版 |
| G02 | 裁判/環境/參賽介面分離 | Grok + BOT③ | refereeUtility 已分離 |
| G03 | information_state(player, as_of) + 座位 | Grok + GPT② | 最小 informationState 已加 |
| G04 | 歷史回饋調整策略 | Grok | 未實作（後續） |
| G05 | 合法性 Gate，高分違規不得贏 | Grok + BOT③ | 已實作 |
| G06 | TIE_PENDING + 賽前加賽規則 | Grok + GPT② | TIE_PENDING 已實作 |
| G07 | 測試不預設勝者 | Grok + BOT③ | 測試已避免 assert 勝者 |
| G08 | proxy 不是安全沙箱 | Grok + BOT③ | 標註 NOT_VERIFIED |
| G09 | 薄型 adapter，無等價 NOT_COMPARABLE | Grok + GPT② | 文件註記 |
| G10 | 證據型別保留 | Grok + BOT③ | SYNTHETIC_DEMONSTRATION 已使用 |

## 最小修補優先順序
G01 + G02 + G05 + G07 已在本分支實作最小隔離版。
其餘項目保留後續。

Release Gate: HOLD
