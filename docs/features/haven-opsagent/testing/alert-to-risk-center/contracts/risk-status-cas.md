# Contract: risk-status-cas

- **Journey**: alert-to-risk-center
- **Risk**: High
- **Operation**: POST /risk-center/:id/status + POST /risk-center/batch-status（单条/批量 CAS 标记）

## Preconditions

- 目标条目存在且归属当前租户（否则 404）。
- 单条：请求体 `{ status ∈ {viewed, done}, expectedVersion? }`（expectedVersion 取自条目 version）。
- 批量：`{ items: [{id, expectedVersion}], status }`，items 数 ≤50。

## Input

- `status`：目标状态；`expectedVersion`：乐观锁版本（可选，不传则不做版本校验）。

## Output

- 单条成功：更新后的 RiskEntry（version 已 $inc +1）。
- 批量成功：`{ succeeded: [{id, version}], failed: [{id, reason, reasonCode, currentVersion?}] }`。
- 冲突：409 ERR_CONFLICT + 最新 RiskEntry（供刷新）；not_found → 404。

## State

- 命中条目 `version` $inc +1，status 变更，追加 status_history。

## Side-effect

- 单个条目一次 findAndModify；批量逐条 findAndModify（不做整批事务）。

## Invariants

- CAS 不静默覆盖：version 不匹配的条目落入 failed（reasonCode=conflict），绝不回退他人操作。
- 高危（severity P0/P1）不暴露确认/执行控件（P1 只读）。
- 待查看→已查看的自动流转仅由诊断详情 GET 触发（本操作不改变该流转语义）。