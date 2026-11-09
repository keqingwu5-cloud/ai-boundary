# 第一大腦｜2D 唯讀樹狀介面隔離原型 V0.1

**研究候選，非正式部署。** 本次疊在 Draft PR #141 的主腦視圖設計增量之上，沒有更改既有 3D、短影音介面及 main。

## 目的與檔案

| 檔案 | 功能 |
| --- | --- |
| tree-view.html | 響應式 2D 平面研究預覽 |
| tree-view.mjs | 搜尋、收合、節點詳情與返回 3D 的深層連結 |
| tree-view-model.mjs | 沿用本機 aiBrain.v1 的唯讀腦區／節點樹投影 |
| tree-view-demo.mjs | 完全合成示範資料，標記 SYNTHETIC-DEMO |
| tests/tree-view-readonly.test.mjs | Node 內建 15 項合成測試 |
| .github/workflows/tree-view-readonly.yml | 遠端 syntax + Node 測試 |

**本頁不呼叫原 app.js 的 migrate/save，不呼叫 localStorage.setItem/removeItem，不新增權威事件與權限資料。** 只有 getItem('aiBrain.v1')；沒有本機快照時提示而不擅自建立。測試資料不會寫入原本的本機記憶。

## 沿用舊資料與保留差異

- 腦區樹來自 brains[].parentBrainId；節點分組來自 nodes[].brainId，同腦內父子來自 nodes[].parentId。
- 子腦核心可能指向另一腦的原父節點；此時保留原 parent ID 但不跨腦複製節點。
- cross 連結僅呈現為「跨領域連結」，不冒認因果或父子關係。
- 缺少腦區、缺少父節點、自指及循環會留診斷；嚴重結構缺失、重複 ID、缺 main 或超大型輸入拒絕處理；不回寫修復。
- 每個字串使用 DOM textContent 呈現；來源 URL 僅允許 HTTP(S)。

## 預覽與驗證

在**隔離的分支工作目錄**執行：

    node --check tree-view.mjs
    node --check tree-view-model.mjs
    node --check tree-view-demo.mjs
    node --test tests/tree-view-readonly.test.mjs
    python3 -m http.server 8000

在隔離測試瀏覽器使用 http://localhost:8000/tree-view.html?demo=1 查看純合成示範。也可使用相同 origin 的本機資料檢視；但 localStorage 按 origin 隔離，localhost **不會**讀取 GitHub Pages 真資料。不要為了預覽而把私人存檔複製到公開網址。

原有 3D 大腦：index.html#node=ID；本原型採相對路徑，需在同一站點上測試。獨立 preview origin 可能有不同的本機 3D 狀態，因此不能宣稱跨站資料已同步。

## 待驗證／限制

- 合成 Node 測試以固定 HEAD 的 CI 原始 job log 為 PASS/FAIL 依據；單有測試檔不算成功。
- Safari／iPad 實機、觸控／效能／無障礙、原始 3D 回歸、同 origin 切換實測尚未完成。
- 這只做樹狀檢視；AI 協作、證據面板與跨尺度距離視圖仍是 #141 的研究設計，未實作。
- 即使本次 CI 綠燈也不代表 #41 真 ACK、#138 + #139 審核通過、權限可信或部署完成。
- **Release Gate = HOLD**：不合併、不部署、不寫正式記憶、不變更主腦原路由。
