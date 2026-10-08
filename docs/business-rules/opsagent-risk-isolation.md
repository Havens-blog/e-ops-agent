---
domains: [opsagent, risk, multi-tenancy, cas, security]
---

# 运维 Agent 风险分级与租户隔离（跨功能业务规则）

> 事实来源：`docs/features/haven-opsagent/design/tech-design.md`（Interface 5 RiskRegistry + 风险分级确定性代码 + 租户隔离语义）。

## 风险分级确定性代码

- 每个工具在 `internal/risk` 注册表静态声明风险档（read/low/high），**LLM 输出不得改变档位、不得引入未注册工具**。
- 高危档不允许入白名单：白名单校验未注册或 riskLevel=high → 整体拒绝（400）。
- 高危条目仅展示「待人工确认」，**不渲染任何确认/执行控件**（P1 只读，无执行后端）。

## 跨租户隔离

- 租户 ID 由服务端强制注入（硬约束，不可配置关闭）；一切查询/写入均带 tenant_id 过滤。
- 跨租户访问一律 `ERR_NOT_FOUND` 404，**不泄露资源存在性**（软硬不分）。
- 前端拦截仅为体验层，接口由后端同步拦截（双侧拦截）。

## CAS 乐观锁（版本记账）

- 风险条目 `version` 创建为 1，每次成功更新 `$inc` +1；更新以 `{_id, tenant_id, version: expectedVersion}` 过滤执行 findAndModify。
- 冲突（version 不匹配）→ 409 + 回显最新条目供刷新重试。
- 批量标记逐条 CAS（**不做整批事务**），保证「未经确认不覆盖」在批量路径同样成立。