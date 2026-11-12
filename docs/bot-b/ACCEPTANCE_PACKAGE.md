# BOT-B 驗收包 V0.1

**分支**: research/bot-b-inner-drive-v0.1  
**測試基準**: f6bea00f26a46e5e29b3b8a827fa6a07d90d8899  
**日期**: 2026-11-12  
**狀態**: ACCEPTANCE_PENDING

## 包含內容
- 主測試：bot-b-min-test.mjs（PASS / NOT_RUN 分開計數，有 NOT_RUN 則 exit 2）
- 證據清單：evidence-manifest.json（使用 baseline_sha）
- 重現指南：REPRODUCE.md
- 限制說明：LIMITATIONS.md
- BOT-A 檔案：已從 f6bea00 還原

## 自測狀態
- 語法：已修正
- evidence_level 檢查：已恢復
- NOT_RUN：不計入 PASS，且會導致非零退出
- CI：待確認執行結果

## 待完成
- [ ] CI 實際成功紀錄
- [ ] 非作者獨立重跑

## 結論
本包供驗收準備，不構成正式通過。  
**RELEASE_GATE = HOLD**