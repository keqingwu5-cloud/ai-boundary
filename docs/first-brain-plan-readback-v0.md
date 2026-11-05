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
