# 第一大腦八維規劃「內部載入／回讀」候選（僅 Draft）

- 來源：Notion 第一大腦總規劃 https://app.notion.com/p/4009d611eff68173aee2f23d5eda3350
- 按下 3D 主腦工具列 📥 後，才讀取網站同來源的公開八維候選摘要檔；不自動讀私人加密記憶，不向任何模型發送訊息。
- 先檢查 schema、八個維度、來源 URL、版本與候選檔 SHA-256；確認後以一次性本機儲存快照追加 1 個總節點與 8 個子節點，保存 plan.loaded 事件。
- 同 packet ID+同 digest 重複載入不新增，異 digest／既有節點 ID 衝突會拒絕，舊節點不修改；在記憶歷史可以看到 plan.loaded；可用 JSON 匯出回讀。packet_sha256 是摘要檔的雜湊，**不是 Notion 原文的雜湊**。
- 保護：寫入前先對照目前持久 JSON，先保存 undo 快照，寫入後立即讀回。不承諾跨分頁原子 CAS；同來源並行寫入及私密資料安全仍須分開驗證。
- **此功能只代表 3D 模組本機載入並保存規劃候選**，不代表「第一大腦 AI 已推理／理解」、GPT② 真 ACK、雲端同步、內驅動自動化或正式驗收。
- 不應藉舊版「匯入 JSON」按鈕載入候選檔：該操作會替換整個舊腦圖。本功能只走新增按鈕及獨立 schema。
- 未改 main、未部署、未更動正式記憶／Supabase。上線前需實際瀏覽器測試（手機/iPad、多分頁寫入、容量不足、回退及歷史回讀）和獨立審查。


## 2026-11-05｜已確認的共識與保存層反例

本節固定前輪結論。上段描述 PR #86 的原始候選，原始版本為 `3c57f56a23fff296342e1e77a001c02f23f5386d`。

- 保留三個獨立判斷。原始載入基準（初始 9 個節點、8 條關聯）、現有圖結構及使用者後續編輯各自核對。正常刪除 D4 同時移除相連邊，與節點遺失後仍留斷鏈是兩種狀況。允許修改標題、研究狀態或新增反證，保留使用者操作。
- `plan.loaded` 是可隨 Undo／重置／整圖匯入而退出目前歷史的本機回執。摘要檔 SHA-256 可識別這份檔案。Notion 原件、來源身分、模型理解與遠端 ACK 各需自己的證據。
- 以固定版原始函式及模擬儲存執行 12 項新增觀察和 7 項既有測試。新增案例重現七項異常：檢查後插入寫入導致遺失更新、舊頁保存覆蓋規劃、舊頁同版判斷跳過儲存讀回、Undo 寫入後主圖失敗、已保存後因畫面錯誤回報失敗、Undo 保存失敗仍說已復原、正常刪改與斷鏈顯示同一提示。19 項斷言成立表示觀察重現。當輪環境為 Node 與故障注入，瀏覽器與 iPad 尚未驗收。
- 隔離續接以 [PR #75 的交易保存層](https://github.com/keqingwu5-cloud/ai-boundary/pull/75) 為基底，讓載入、一般變更、Undo 使用同一個版本化主圖／Undo 交易入口。分開回報交易提交、畫面刷新及本機事件。對照 [W02](https://github.com/keqingwu5-cloud/ai-boundary/pull/86#issuecomment-6537435167) 與[已可取得的完整性修補](https://github.com/keqingwu5-cloud/ai-boundary/commit/d6ceb5618615f79f3e8be027fb1bca245e8b3f40)，保留來源 ID 與碰撞防護，另驗合法刪除和結構錯誤。此項為隔離整合範圍。

### 隔離整合候選

- 以 PR #75 的 `aacbe68271533e540675eddcc038b810fb75bb8c` 為基底。沿用既有 `index.html?brainTx=1` 及其保存權威啟用流程。八維載入在交易模式可用，沿用 `commitChange` 將圖與 Undo 交給同一個 IndexedDB 交易。
- 同版路徑先讀交易版本和現有圖。偵測舊版本、來源錨點異動或斷鏈時阻擋，保留已有的資料。找到可對應的本機刪除紀錄且結構一致時，保留修改和原始載入基準。
- 提交、畫面更新和本機通知分開回報。若交易完成後才偵測舊版寫入衝突，顯示已保存但停止編輯。獨立舊版仍能改動自己的 localStorage，交易模式依既有防護偵測分歧。
- 隔離 Node 驗證命令為 `node --test tests/first-brain-plan-core.test.cjs tests/first-brain-plan-core-l1-negative.test.cjs tests/first-brain-plan-persistence.test.cjs tests/brain-import-integrity.test.cjs`。共 47 項通過，含 9 項新保存層案例。新的保存測試使用原應用程式函式和模擬交易邊界。真瀏覽器兩分頁、Safari／iPad 與 Notion 原件真實性仍待驗證。


### 單案例續跑檢查點｜2026-11-05

- 固定受測提交 `ded6ac5b73ee99e34236f9347737e40cbc72e617`，核對 5 個檔案的 Git blob 雜湊。監督程序共用 15 秒限時，只執行 1 次。
- Chromium／WebKit 執行檔缺少，原生瀏覽器狀態為 `BLOCKED_NO_BROWSER`。改跑既有 Node VM 的單一案例，模擬另一分頁 Undo 後從過期分頁重載。過期分頁收到拒絕，儲存維持復原結果，沒有新增寫入。
- 結果為 `PASS`，1/1，退出碼 0。Node 測試程序報告 172 ms，含檔案核對、環境檢查和本機檢查點的監督程序為 814 ms。此處只比較覆蓋範圍及本機耗時，帳戶用量未量測。


### 真 Chromium 單次驗證｜2026-11-05

- [GitHub Actions #41974384663](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/41974384663) 測試提交 `b455ad4989420d395bff289797543e51a4a54dbd`，Google Chrome 156.0.8078.47，單次執行，外層 30 秒上限。原始輸出與檢查點已保存於 [CI 證據](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/41974384663/artifacts/13390918648)。
- 真瀏覽器成功由版本 1 載入到版本 2，IndexedDB 讀回 9 個規劃節點及 1 筆回執。測試約 21.9 秒，退出碼 1。B 分頁點 `#bUndo` 時被 `#brainPersistenceBanner` 攔截，5 秒後停止。Undo 與後續舊版本拒絕未執行。
- 修正候選將交易狀態及跨分頁警告放到工具列下方，保留備份與重新整理按鈕。回歸腳本以滑鼠操作 Undo 和舊頁載入。修正後 app blob 為 `fd34728fb73ced2ffe72f9df799666c80c5c7d1d`，語法及差異檢查通過。真瀏覽器複驗仍待執行。


### 修正後雙分頁複驗｜2026-11-05

- 落子前採用的證據為原版反例、47 項 Node 基準，以及上一輪真 Chrome 已讀回 9 個節點和 1 筆本機回執。上一輪止於橫幅擋住 Undo，跨分頁復原及拒絕尚待真瀏覽器確認。
- 產品與測試檔固定於 `eb6df1992f9883705c85fa5965f0333cf55e1e1b`，app blob 為 `fd34728fb73ced2ffe72f9df799666c80c5c7d1d`。沿用同一案例和 30 秒限時，只觸發一次。
- 驗收分三項。B 的 Undo 由版本 2 提交到版本 3，主圖與 Undo 回讀和首次載入前一致。A 停在版本 2，以滑鼠按載入時收到過期版本拒絕。拒絕後再次回讀，版本 3、主圖與 Undo 內容全部維持一致。

- 複驗通過 1/1，退出碼 0，單次測試程序耗時 22.4 秒。受測提交 `4857f94bea4b9830d9e14df0739368b76d87d916`，Google Chrome 156.0.8078.47。 [CI 執行 #41978009026](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/41978009026) · [原始 TAP 與檢查點](https://github.com/keqingwu5-cloud/ai-boundary/actions/runs/41978009026/artifacts/13392184601)
- A 載入後保存為版本 2，讀回 9 個節點及 1 筆回執。B 用滑鼠點 Undo 後提交版本 3，主圖與 Undo 原始位元組皆與載入前一致。A 保持版本 2 再用滑鼠點載入，收到過期版本提示。其後回讀仍為版本 3，主圖與 Undo 位元組一致，新增寫入為 0，該規劃的節點與回執皆為 0。
- 此案例納入 [R24 共用保存層回歸驗收](first-brain-r24-formal-acceptance.md#d-共用保存層回歸驗收)。本次證據範圍為隔離 Chrome 的單一雙分頁案例。


### 10 分鐘批次｜原生寫入競爭與中止恢復

- 落子前盤面。先前 Chrome 證明在讀取前就過期的 A 分頁會被拒絕。此批次追到 A 已通過初檢、真正寫入時才落後的情況，另驗證原生 IndexedDB 交易中止與後續恢復。
- 競爭案例。A 確認載入後暫停在交易之前，B 以一般編輯提交版本 2，再放行 A。A 應到達真正的寫入交易並收到 `stale_revision`。讀回 B 的主圖和 Undo 必須完全一致。
- 中止案例。在真 IndexedDB 的 `put` 請求成功後故意中止交易，確認原圖、Undo 和版本仍一致，而且無載入事件。解除故障後用新操作載入，再重新整理並讀回同一存檔。
- 兩個案例各自從新瀏覽器環境開始，各執行一次，單案限時 45 秒，CI 批次上限 10 分鐘。使用合成規劃與既有交易保存層。
