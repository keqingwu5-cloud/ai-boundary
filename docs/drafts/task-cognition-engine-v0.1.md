# 第一大腦｜任務認知與條件推演引擎 V0.1
狀態：獨立候選分支，未合併、未部署、未安裝成全域發布閘門。

## 本次已建立
- `modules/task-cognition-engine.js`：純函式 `evaluate(task, registry)`，不寫入資料、不執行外部操作、不核發授權。
- `tests/task-cognition-engine.test.js`：9 個 Node assert 測試案例（尚待實際執行並附 CI 證據）。
- 將目的、原始前因、前置條件、缺失後果、既有機制重用及阻塞原因整理成結構化結果。
- 對 publish/deploy/protected_write/handoff 採保守拒絕，合成或自述證據不可作為實際執行授權。
- `READY_FOR_AUTHORIZATION` 只表示可以進入獨立授權驗證，`canExecuteProtectedAction` 永遠為 false。

## 尚未完成與重要限制
1. 此版只是最小認知評估器，**不是**完整的智能根因推理、動態機制註冊表、持久事件儲存或全入口發布閘門。
2. `verified: true` 是資料欄位而非密碼學驗證；必須由外部可信驗證器驗證真實身份、簽章、範圍、有效期限及撤銷狀態後才可能授權。
3. 未實作跨 Issue/PR/commit/ACK 的歷史查詢；未建立正式 JSON Schema 與版本遷移；未驗證與主腦原有 localStorage 的整合。
4. 尚未做負向循環偵測、反事實缺失後果推演、條件優先級與多路徑替代方案；目前僅輸出由輸入資料提供的影響文字。
5. `trusted_ack` 在 handoff 中是獨立條件，不能用合成 CI 或任務寫入當成真實 GPT② 接收。
6. 尚未實際執行 Node 測試／CI，僅已提交測試原始碼；不宣稱 PASS。

## 下一階段驗收
- 在隔離 runner 執行 `node tests/task-cognition-engine.test.js`，記錄 run ID、commit SHA、完整輸出。
- 補充資料契約、機制註冊與關聯索引，實作因果與缺失後果的證據分層。
- 對同一阻塞且無新證據的重複修補，提出停止修補與根因診斷建議；不得自動授權。
- 實作 preflight adapter 供各發布入口調用，先只在隔離環境測試；經批准後才考慮 GitHub branch protection/CI 的正式強制執行。

## 操作邊界
不合併 main、不部署、不更改權限、不操作正式資料或私人記憶、不自動派工、不聲稱真實 GPT② ACK。
