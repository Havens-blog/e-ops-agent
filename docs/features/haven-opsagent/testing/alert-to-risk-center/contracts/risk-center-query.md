# Contract: risk-center-query

- **Journey**: alert-to-risk-center
- **Risk**: High
- **Operation**: GET /api/v1/opsagent/risk-center（列表 + 筛选 + 统计）

## Preconditions

- 调用者已登录且持有有效租户上下文（service token / eiam claims）。
- 可选筛选：serviceName、status、severity、startTime/endTime（RFC3339）、page、limit。

## Input

- `tenant`（服务端注入，客户端不可覆写）
- `serviceName?`、`status? ∈ {pending_view, viewed, done}`、`severity? ∈ {P0,P1,P2,P3}`
- `startTime?` / `endTime?`（闭开区间，零值不参与过滤）
- `page`（默认 1）、`limit`（默认 20，上限 100）

## Output

- `{ items: RiskEntry[], total, page, limit, stats: { pendingView, todayNew, highRisk } }`
- stats 为租户全量聚合（与 items 筛选条件独立）
- 异常：跨租户/越界 → 404 ERR_NOT_FOUND；参数非法 → 400 ERR_PARAM_INVALID

## State

- 只读，不改变 risk_entries 状态；stats 由 aggregation pipeline 计算，无写入。

## Side-effect

- 无写副作用；仅触发一次聚合查询（$facet → $group $cond/$sum）。

## Invariants

- 跨租户隔离：items/stats 均带 tenant 过滤。
- highRisk = severity ∈ {P0, P1}。
- 分页 limit 钳制 ≤100，页溢出返回空 items 不报错。