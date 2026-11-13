# 接口相依與接線條件 V0.1

## 相依
| 來源 | 依賴 | 條件 |
|---|---|---|
| BOT-B 指紋 | BOT-A D01–D06 + VERSION_MANIFEST | 檔案內容一致 |
| F05 gap module | 來源事件與 inbox 查詢 | 真實接收端存在 |
| 橋樑 outbox | #97 events 表 | 關係待確認 |
| 啟航 manifest | digest 綁定 | SYNTHETIC_APPROVAL 有效 |

## 可立即接線
- 無。皆為隔離候選。

## 必須等待
- 真實 Webhook 接收
- 真實 PostgreSQL
- Hatchet 版本決定
- 衝突原文存放決定
- 非作者覆驗

## 狀態
RELEASE_GATE = HOLD