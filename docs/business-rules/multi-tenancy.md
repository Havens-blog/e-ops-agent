---
domains: [multi-tenancy, tenant, isolation, security, cross-tenant]
---

# 多租户隔离与存在性不泄露（跨功能业务规则）

> 事实来源：`docs/features/haven-opsagent/design/tech-design.md`（Error Handling › 跨租户 404）+ `prd/prd-spec.md`（eiam 鉴权 + 租户隔离）。任何跨租户数据访问的能力应复用本规则。

## 租户强制注入

- tenant 谓词由中间件（`RequireTenant`）强制注入，所有数据访问（查询/写入）带 tenant 过滤，为硬约束、不可配置关闭（前端不暴露「租户注入开关」）。

## 跨租户 404（不泄露存在性）

- 跨租户访问资源一律返回 `404 ERR_NOT_FOUND`（非 403），不泄露目标资源是否存在，防枚举。
- 401 仅用于「未登录/令牌无效」；「已登录但跨租户/无权限」走 404 语义，软硬不分泄露存在性。

## 通知不携带跨租户数据

- 外部通知渠道消息仅携带告警摘要 + 入口链接，不携带任何跨租户数据。