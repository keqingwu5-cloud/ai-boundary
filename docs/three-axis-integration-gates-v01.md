# 第一大腦｜非 ACK 三軸一致性整合候選 V0.1

狀態：`DRAFT / SYNTHETIC_ONLY / HOLD / NOT_APPROVED / PRODUCTION_NO_GO`。

## 範圍與版本樹
- 實作在獨立 branch，base 為 Draft #144 HEAD `5a97a356572a5f17b4e05512db21a7b0bad2dca8`，它自身承接 #139 → #138 → #136 → #135 → #134 → #133。
- 從 #145 HEAD `74935176afba6f249d4ac74f8d0c3f3dd6cb520d` 精確取回控制循環修補、Q01～Q06 和文件。
- 從 #146 HEAD `7c5102f978acc0376281cf128750439caf8aa809` 精確取回進度日誌修補、J01～J05 和文件。
- 原始 GitHub content blob 已比對：本整合 base 的兩個待修模組分別與母 Draft #133/#135 相同，不是盲目改寫後續並行修補。
- 不接 #41 真 ACK，並非宣稱 #41 不重要；使用者指定另外一邊處理，這裏不改它的工程分支或驗收狀態。

## 新發現且已做的 RED/green 跨模組驗證
控制引擎同一程序中由所有 event 共享。#145 雖會在不可回滾的 engine mutation + journal append 失敗後進入全局 quarantine，但如果該資訊沒有傳到 `control.readEvent` / #134 `proof-audit.pinned`，不受該競爭直接影響的 event 仍可能被下游 #139 cognition 與 #135 progress journal 當成目前可信快照。

- 新 I01：事件 e2 透過兩個來源競爭耗盡 history，令 engine quarantine；e1 的 proof/cognition/progress 都必須無權再追加，舊紀錄仍可唯讀，這是跨事件全球引擎共享的反例。
- I02：無故障時原始資料與 proof 可正常建立候選；HOLD／NOT_APPROVED 仍固定。
- I03：quarantine 不可推出真 remote STOP/ACK，權限始終 NOT_VERIFIED。
- RED [Actions #42611861836](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42611861836)：新增跨模組候選後 **225 PASS / 2 FAIL**（共 227）。
- 首輪補修 [Actions #42611971835](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42611971835)：新增的 I01～I03 已通過，但控制 `readEvent` 多一欄 `engine_quarantined`，原 exact JSON Schema 不接受，**226 PASS / 1 FAIL**，故不能把該版視為整合成功。
- 最終已核 [Actions #42612075825](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42612075825) control job #129142745621：`227/227 PASS` + export folder `6/6 PASS`，0 fail/skip。
- 同一 HEAD [Actions #42612075841](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42612075841) cognitive job #129142745785：原負例 `26/26 PASS` + 來源快照反例 `12/12 PASS` + V10→V11 合成腳本 PASS。兩套 job 都有顯式 `git rev-parse HEAD` 一致性檢查。
- 先前經實驗的 HEAD `c623e45d83ebdb5e5f9e1f9818c6145f80163931`，如再變動本文件/工作流，需以**新 HEAD 的原始 run**重新核查。

## 具體修補
1. 控制 `readEvent` 明確輸出 `engine_quarantined:boolean`；其機器 Schema 的 required + properties 同步更新。
2. 證明 `pinned()` 拒絕來自 quarantined control 的事件，即使自身 event_id 和版本沒變。
3. 認知 `sourceSnapshotFresh()` 也直接拒絕 quarantined control；進度日誌原有 `pinned` 會接收 proof 控制快照過期訊號，因此拒絕追加/過期重複報成功。
4. 所有檢查僅在內存，沒有新版自動升權或跨端寫入。

## 必須保持阻擋
- 引擎未提供真正跨事件／跨程序/DB 的原子性和持久恢復；quarantine 是保守阻斷，不是 rollback。
- 既有 proof/cognitive/journal 的 actor 與 reviewer 只是 caller claim，沒有可信 root、金鑰輪替/撤銷/簽收。
- 來源時間與人工因果、真實進度未認證；Node 模擬不能代替授權舊檔、實機 Safari 和正式系統。
- 其他獨立線：#41 真 GPT①↔GPT② 收送 ACK；記憶/3D/圖 Journal/Pages 發布安全與部署 Gate 都仍存在。
- 無 BOT③ 具身分的獨立正式 Review，沒有主分支 merge 或部署核准。由使用者**一次集中**決定整體 Gate，不因這批單項 PASS 拆分通知。
