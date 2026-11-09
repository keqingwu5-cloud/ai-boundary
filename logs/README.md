# 第一大腦｜日誌資料夾索引（研究候選）

本資料夾是**目錄規格與查核入口**，不是正式日誌資料庫。真實私人記憶、隱藏推理、授權憑證與外部水電設備資料不可直接放進公開 GitHub。

## 分層與隔離
- 第一層：領域 ENGINEERING／INFRASTRUCTURE／DATA／WATER／ELECTRICITY
- 第二層：project_id，代表不同工程或研究項目
- 第三層：AUTOMATION／REASONING_SUMMARY／WORLD_MODEL／MEMORY
- 第四層：ISO 日期與不可重覆的版本識別，例如 2026-11-13__revision-2.json

每個檔案必須帶有 event_id、proof_id、project_id、sector、stream、journal_id、revision 與對應證據引用。不同項目不能只靠相同名稱去合併。

## 範例路徑
```text
logs/
  ENGINEERING/project_engineering/AUTOMATION/2026-11-13__revision-2.json
  INFRASTRUCTURE/project_infrastructure/REASONING_SUMMARY/2026-11-13__revision-2.json
  DATA/project_data/WORLD_MODEL/2026-11-13__revision-2.json
  WATER/project_water/MEMORY/2026-11-13__revision-2.json
  ELECTRICITY/project_electricity/AUTOMATION/2026-11-13__revision-2.json
```

GitHub Actions 使用 scripts/export-proof-audit-synthetic.mjs 真正產生**五個領域 × 四種日誌 = 20 個合成 JSON 檔案**，另附各項目 index.json 和共用 manifest。GitHub Actions artifact 才是這些**合成範例**的實際輸出；不會自動成為正式持久日誌。

## 日期與進度的三軸
- 預期：expected_start、expected_due、expected_progress_percent
- 現在：last_observed_on、actual_progress_percent、evidence_ref、progress_status
- 延期：原始 expected_due 永不覆蓋；另記 forecast_due、delay_reason_code、days_shifted、days_overdue、next_action_code

進度歸零或日期倒退不可默默覆蓋原紀錄；必須另外提案與保留先前版本。

## 不同日誌的對應方式
- AUTOMATION：來源觸發、派工、操作狀態與故障，不等於實際派送成功。
- REASONING_SUMMARY：假設、判斷摘要與反證，不保存 AI 隱藏內部推理。
- WORLD_MODEL：圖節點、模型與版本，不把推演升格為現實。
- MEMORY：記憶候選、變更與回退引用，不複製私人記憶作第二份權威。

所有資料仍須由當事授權的儲存權限、身份驗證、刪除規則、保留期限、版本控制與安全隔離 Gate 審查後才可正式使用。
