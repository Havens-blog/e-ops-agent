---
domains: [api, backend, http, routing]
---

# API 约定（Haven 平台）

> 事实来源：`D:\Haven\e-cam-service`（Go 后端）。编排层 `opsagent` 服务复用同一套约定。

## 技术栈（已验证于 e-cam-service/go.mod）

- 语言/版本：Go 1.25.5
- 框架：`github.com/gin-gonic/gin`（HTTP 路由）+ `github.com/gotomicro/ego`（微服务框架/`elog` 结构化日志）
- 存储：`go.mongodb.org/mongo-driver`（MongoDB）+ `github.com/redis/go-redis/v9`（缓存/去重）
- 项目内 Mongo 封装：`pkg/mongox`（`mongox.Mongo`）

## 模块装配模式

每个能力模块遵循统一结构 `internal/<mod>/`：

```
internal/<mod>/
├── domain/        # 领域模型
├── repository/dao/# 数据访问（Mongo DAO）
├── service/       # 业务逻辑
├── web/           # HTTP handler
└── module.go      # InitModule(db, logger) -> Module; Module.RegisterRoutes(r)
```

示例：`internal/alert/module.go` 定义 `InitModule(db *mongox.Mongo, logger *elog.Component) (*Module, error)`，在 `RegisterRoutes(r *gin.Engine)` 中 `r.Group("/api/v1/cam")` 并挂 `middleware.RequireTenant`。

## 路由与响应约定

- 路由前缀：`/api/v1/cam`（既有）；编排层新增 `/api/v1/opsagent`。
- 租户：`middleware.RequireTenant` 中间件强制注入租户上下文，所有数据访问带 tenant 谓词。
- 响应信封：`{ "code": 0, "message": "ok", "data": {...} }`（`code != 0` 为错误）。

## 关键事实

- 底座模块（logquery / alert / cam / mcp / audit / topology）已实现并运行，编排层经 HTTP 契约调用，不依赖其 `internal` 数据结构或 ORM 模型。
- LLM 已有可复用降级封装先例：`internal/logquery/llm`（未配置即 Disabled、超时/解析失败返回空串）。