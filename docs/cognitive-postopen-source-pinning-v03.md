# 三軸認知 V0.3｜開啟後來源／證明快照防過期（隔離）

狀態：DRAFT / HOLD / IN_MEMORY_ONLY / NO_DEPLOY。父層 PR #139，HEAD 原始點 `39338c429fff6ed8b81a923d63b6c064e6f229cb`。不更動 #41 真跨 AI ACK 路線。

## 已證實的根因
PR #139 在 `openTransition()` 時檢查了 control/proof 版本，但之後的 `addDrive`、`proposeAction`、`recordObservation`、`calibrate` 和 `addMemoryRef` 只檢查本地 transition 版本。因此上游控制事件/證明包更新後，舊來源仍可追加候選，沒有強制檢查資料過期。

此外，`calibrate()` 只檢查 `prediction` 是否存在；尚未記錄 O1 時也可添加誤差校準候選。

## 修正
- 在建立 transition 時固定 `control_version`、`control_domain_id`、`control_observed_hash`、`proof_revision` 與 `proof_history_head_hash`（皆只是本機證據，並非簽名驗證）。
- 五個變更入口先檢查控制與證明快照；共享 `append()` 在雜湊前和完成後再檢查，來源過期一律 `SOURCE_SNAPSHOT_STALE`。
- `calibrate()` 若沒有 O1，回傳 `OBSERVATION_REQUIRED`，不追加誤差候選。
- 舊歷史仍可唯讀查看；`readTransition/verifyTransition` 顯示 `source_snapshot_stale`、`safe_to_revise`，不把本機 hash chain 正確當成來源現行。
- 原 26 項校準範圍邊界測試更新合成 O1 前提；保留原來 0/1 confidence 可接受的規則。

## 反例／CI
- RED [GitHub Actions #42609452710](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42609452710)：先新增 S01–S12，原實作 12 項中 10 FAIL、2 PASS。
- 第一修補版 [#42609548285](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42609548285)：新實作令舊測試「沒有 O1 即可成功校準」的一條案例失敗，原因是新契約需要 O1，不是隱藏錯誤；更新測試前提。
- GREEN [GitHub Actions #42609711830](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/42609711830) 同 HEAD `87e52b33e020542f98e185846201009004afdadc`：原負例 **26 PASS / 0 FAIL**；新 S01–S12 **12 PASS / 0 FAIL**；synthetic V10→V11 完成。
- 只在 GitHub runner Node/純合成/記憶體內驗證；沒有外部真認知、真因果或真身分證據。

## 尚未解決
- Proof/control 的 readback 是呼叫端提供的本機接口；沒有可信根、持久 CAS、簽名來源、跨程序一致性。
- 觀測 O1 尚未綁定指定 action 和真實外部資料可信性；本輪只要求至少已有觀測，不假稱因果驗真。
- 程序崩潰、跨程序重啟、跨 AI 真 ACK、journal 實際持久寫入、四時間軸可信時間、真私人記憶均未接通。
- PR #133～#135 的控制證明進度日誌整體還需要同 HEAD 集成回歸；此 PR 只是薄型 sidecar 追加防護。
- 需 BOT③ 真獨立審查後才能考慮進一步整合；沒有 main merge、實機或正式部署核准。
