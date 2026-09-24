---
id: "T-review-doc"
title: "Review Documentation Quality"
priority: "P1"
estimated_time: "30min"
dependencies: ["1.3", "1.4"]
type: "doc.review"
surface-key: ""
surface-type: ""
---

Review documentation quality for the haven-opsagent feature (breakdown mode).

## Acceptance Criteria Summary

The following acceptance criteria are pre-extracted from doc tasks. Use these as the review baseline.

### 1.3-mongo-schema
1. `mongosh <dsn>/opsagent --file schema.mongo.js` 无错误执行（全部集合 + 索引创建）
2. 每个集合含 tenant_id 前缀复合索引（多租户隔离硬约束）
3. `settings` 唯一索引 `(scope, tenant_id)` 成立；`sessions` 服务名索引用顶层 `service_name`（非 `query.service_name`）
4. `risk_entries` CAS 版本、`alerts` dedup 三态、`llm_usage` 预算约束注释齐备
5. 集合字段与 er-diagram.md 实体一致（含 compensations 集合）


### 1.4-contract-freeze
1. B1–B4 契约精确路径 / 字段名盘点冻结，消除所有 `{M1 冻结}` 占位
2. golden 快照入库（B1..B4 每组至少 1 个），与 api-handbook Part B 契约形状一致
3. 契约覆盖：请求/结果结构、错误语义、超时/降级行为、租户字段
4. 通知渠道复用方式（走 alert 通知接口 vs 直连渠道 webhook）择一冻结
5. 契约文档标注版本号，供契约测试按版本断言


## Discovery Strategy

Scan ONLY the following allowlist of directories for target documents:
- docs/features/haven-opsagent/ (prd/, design/, testing/, and any subdirectories)
- docs/proposals/haven-opsagent/

EXCLUDE the following from scanning — do NOT read or process these:
- tasks/ directory (task definitions are not deliverables)
- tasks/records/ directory (execution records are not deliverables)
- manifest.md (build artifact)
- index.json (build artifact)

Only .md files under the allowlist directories are target deliverables.

## Acceptance Criteria

- [ ] All acceptance criteria met
