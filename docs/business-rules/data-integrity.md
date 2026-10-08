---
domains: [data-integrity, concurrency, cas, optimistic-locking, idempotency, dedup]
---

# 并发更新与幂等去重（跨功能业务规则）

> 事实来源：`docs/features/haven-opsagent/design/tech-design.md`（risk_entries CAS + worker 去重）+ `api-handbook.md` §4/§5。任何多值守并发写 / 幂等入站的模块应复用本规则。

## CAS 乐观锁（不静默覆盖）

- 文档带 `version` 字段（创建为 1），更新以 `{_id, tenant_id, version: expectedVersion}` 过滤 + `$inc version`。
- 冲突（version 不匹配）返回 409 + 库内最新条目供刷新重试；绝不在冲突时静默覆盖。
- 批量标记不做整批事务，逐条独立 CAS：失败条目回显 reasonCode（conflict/not_found）+ currentVersion 供重试。

## 幂等与去重

- 告警按指纹（租户+服务+指标+级别）滚动窗口（默认 10min）去重：Redis SET NX 快闸（fail-open 宁多不漏）+ Mongo 归并记账。
- requestId 作为入站幂等键，重复请求不重复产生副作用；窗口内首条建文档、后续 `$inc count` 归并、溢出丢弃的低级别告警亦留档。