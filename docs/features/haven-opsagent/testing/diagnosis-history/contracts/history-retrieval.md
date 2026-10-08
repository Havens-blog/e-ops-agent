# Contract: history-retrieval

- **Journey**: diagnosis-history
- **Risk**: Medium
- **Operation**: GET /api/v1/opsagent/history + GET /api/v1/opsagent/diagnosis/:id

## Preconditions

- 调用者已登录；history 检索 `serviceName` / `startTime, endTime`（≤24h）/ `sessionId` 可选。
- diagnosis 详情 `:id` 存在且归属当前租户；可选 `riskEntryId`（触发自动已读）。

## Input

- history：serviceName 模糊、startTime/endTime RFC3339（End-Start ≤24h）、sessionId 精确、分页。
- diagnosis：路径参数 id；query riskEntryId。

## Output

- history：`{ items: SessionSummary[], total, page, limit }`（total 为本页条数近似）。
- diagnosis：完整 Diagnosis（rootCause/conclusions/citations/trace/disposition）。
- 404 → 不存在或跨租户；400 → 时间窗超 24h；riskEntryId 不关联本诊断时忽略流转、按无参数处理。

## State

- history 只读；diagnosis 带 riskEntryId 且条目 status=pending_view 时惰性 CAS 迁移 viewed（$inc version + status_history）。

## Side-effect

- 自动已读仅当 riskEntryId 同租户关联本诊断且 pending_view；不命中无副作用（幂等）。

## Invariants

- 跨租户不可见（history/diagnosis 均按 tenant 过滤）。
- 会话完整内容经 diagnosisId 二次拉取；running/failed 无 diagnosisId → 占位说明。
- 自动已读为窄状态迁移（仅 pending_view），与其他 CAS 写路径共用版本记账。