# 進度日誌 V0.2：過期證明不得回覆「重複成功」

狀態：`DRAFT / HOLD / SYNTHETIC_ONLY / NOT_DEPLOYED`。父 Draft PR #135 起點 `918724f3e096a6bbd7b61244acc1610f8ac6c843`。

## 問題根因
`progress-journal-candidate.mjs` 的 `createJournal` 若遇到相同 `journal_id` 會在比較原計畫一致後直接返回 `DUPLICATE_IGNORED`，即使建立時所引用的 proof revision 已增加；`listProject` 只回傳進度狀態，可能讓下游把過期的 `COMPLETED` 看成仍可用於更新。

## 修正
- 重用舊 `journal_id` 前先檢查 `pinned(existing)`。證明包已進版就回 `PROOF_SNAPSHOT_STALE`，舊紀錄仍可唯讀檢視、不得假裝已重新驗證。
- 專案列表每項加入 `snapshot_stale` 與 `safe_to_promote:false`；即使證明包未過期，也不是人類批准或身份核驗。
- 已有 `recordProgress` 的 proof 版本/日期/進度稽核保持不變，不引入新資料庫、網路或正式通知。

## 反向測試與版本
- RED [Actions #42611011470](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42611011470) HEAD `523ba1f4cd4dccf63bad3256cd729a8efcc6bfc3`：Node **218 total / 215 PASS / 3 FAIL**；明確重現舊版重複成功與列表未帶失效旗標。
- GREEN [Actions #42611053417](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42611053417) HEAD `dbe17fbd838bdb9117ede9357196ede9b1b71777`：Node **218 / 218 PASS**、6 / 6 日期資料夾匯出驗證通過，0 fail/skip；工作流固定 HEAD，純合成、GitHub runner。
- 將後續文件改動納入同版 CI；最終結果仍以最新 HEAD 原始 job log 為準。

## 無權宣稱完成的部分
無可信外部 proof identity、不可變資料庫、跨程序 CAS、真正四時間軸、真實人員執行進度、獨立 BOT③ 審查、正式部署或 #41 真 ACK。本案只是「查詢／重試不假報現行」的局部防護，不能解除全局 `PRODUCTION_NO_GO`。
