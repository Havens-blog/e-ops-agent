---
feature: "haven-opsagent"
generated: "2026-10-08"
status: draft
---

# Business Rules: Haven 运维 Agent

## 多租户隔离

### BIZ-001: 跨租户隔离 + 存在性不泄露

**Rule**: 所有资源访问强制 tenant 谓词；跨租户访问返回 404（非 403），不泄露资源存在性；通知消息不携带跨租户数据。
**Context**: eiam 鉴权 + 租户隔离为 P1 硬约束（查询侧 + LLM 输入输出侧），防枚举攻击与数据越权。
**Scope**: CROSS
**Source**: prd/prd-spec.md「eiam 鉴权 + 租户隔离」；tech-design Error Codes ERR_NOT_FOUND

## 并发与数据完整性

### BIZ-002: CAS 乐观锁不静默覆盖

**Rule**: 写操作用 version 字段乐观锁（findAndModify 过滤 {_id, tenant, version} + $inc version）；冲突 409 回显库内最新；批量标记逐条 CAS、不做整批事务。
**Context**: 多值班并发标记时保证「未经确认不发生覆盖」。
**Scope**: CROSS
**Source**: api-handbook.md §4/§5；tech-design risk_entries CAS

### BIZ-003: 幂等去重（指纹窗口）

**Rule**: 告警按指纹（租户+服务+指标+级别）滚动窗口（默认 10min）去重；Redis SET NX 快闸 + Mongo 归并记账；requestId 作入站幂等键。
**Context**: 告警风暴防护——同指纹窗口内仅一次排查，其余归并。
**Scope**: CROSS
**Source**: prd/prd-spec.md「主流程 B 告警主动触发」；tech-design worker