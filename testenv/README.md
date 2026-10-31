# ai-boundary 隔離測試環境（testenv）

路徑：`/workspace/f05/testenv/`  
時區標籤：Asia/Taipei

## 快速使用（MOCK，$0）

```bash
cd loop && ./start.sh
node submit.cjs "任務"
node view.cjs
./stop.sh
```

## 文件

- `INVENTORY.md` — 資源盤點與最小可行方案
- `DEPLOY-PACK.md` — 版本／指令／成本／備份／回滾／核准清單／獨立審查欄
- `docs/openai-wiring-plan.md` — OpenAI 僅規劃（未接線）
- `config/.env.example` — 金鑰名稱範本
- `evidence/` — 逐步證據

## 兩條線

- **A 最小 API 迴路**：`loop/` + 重用 `queue-wt/`（SHA `a99f48a1…`）
- **B PR #86 L1 修補**：`pr86-fix/` 分支 `local/pr86-l1-fix-20261031`（SHA `d6ceb561…`）

## pr86-fix/（gitignored，R9 需要）

`pr86-fix/` 被 `.gitignore` 排除。完整 R9 需要本機 worktree 指向 #86 L1 修補 SHA `d6ceb561…`：

```bash
# 範例：連到既有審查 worktree
ln -sfn /workspace/f05/pr86-fix-review-d6ceb56 /workspace/f05/testenv/pr86-fix
# 或
# git -C <ai-boundary> worktree add /workspace/f05/testenv/pr86-fix d6ceb5618615f79f3e8be027fb1bca245e8b3f40
```

缺席時 R9 仍驗證 tip pin／suite／loop 指令，但 `pr86_paths_present` 為 false。
