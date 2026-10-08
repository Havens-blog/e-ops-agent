---
domains: [opsagent, architecture, go, orchestration, worker]
---

# 运维 Agent 编排层约定（Go）

> 事实来源：`D:\Haven\opsagent` / `docs/features/haven-opsagent/design/tech-design.md`。opsagent 服务复用 `docs/conventions/api.md`（模块装配/gin 路由）与 `docs/conventions/error-handling.md`（错误映射/降级先例）。

## 单进程编排 + 4 逻辑 Agent

- 单进程编排流水线 + 4 逻辑 Agent 角色（Coordinator/LogAnalyst/Monitor/Inspector），**非多进程/多框架**（KISS）。
- 角色间以 Go interface 协作，各自独立指标，仍可被 Agent 管理页观测。

## 窄接口依赖倒置（可测试性）

- handler 一律依赖倒置窄接口（`chatStore`/`riskStore`/`observabilityProvider`/`alertEnqueuer` 等），不 import 具体 DAO 实现。
- 测试以 fake 注入窄接口，免 Mongo/底座/LLM 依赖；领域类型 `internal/domain` 为唯一权威。

## 响应信封

- `{code, message, data}`；成功 `code=0`（`web.OK`）或手写 `"0"`（chat/correct），业务错误 `code` 为 `ERR_*` 字符串。
- 半成功 202（`ERR_QUEUE_FULL` 溢出丢弃低级别，`data.dropped`）；落库失败 200+`code=ERR_PERSIST_FAILED` 但仍返回 `data.report`（异步进补偿队列）。

## 告警去重与 LLM 预算

- 告警指纹去重：Redis SET NX 快闸（10min 窗口，fail-open 宁多勿漏）+ Mongo 归并记账；高危告警不丢弃、阻塞入队。
- LLM 滚动 1h 预算：Redis INCR 计数，耗尽转纯规则降级结论。
- 后台任务错误经 `onError` 回调非静默吞错；`ListDue` 失败跳过不中断。