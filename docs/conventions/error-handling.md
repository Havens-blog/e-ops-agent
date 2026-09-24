---
domains: [error-handling, backend, reliability]
---

# 错误处理约定（Haven 平台）

> 事实来源：`D:\Haven\e-cam-service`。编排层 `opsagent` 沿用同一套错误语义。

## 分层错误职责

| 层 | 责任 |
|----|------|
| DAO（repository/dao） | 返回原始存储错误，不吞错 |
| service | 领域语义转换：将存储/外部错误映射为业务错误码 |
| web（handler） | 将业务错误码映射为 HTTP 状态 + 响应信封 |
| middleware | 鉴权/租户校验失败统一 401/403 |

## LLM 降级约定（关键先例）

- `internal/logquery/llm` 已实现：LLM 未配置 → `Disabled`；调用超时或解析失败 → 返回空串，**不阻塞主链路**。
- 编排层沿用并扩展为三级降级（模板意图匹配 → 预置查询入口 → 明示降级模式），判定谓词：单次调用超时 > 12s 或连接失败 / 连续 2 次失败。

## 监控与告警

- 使用 `gotomicro/ego` 的 `elog` 结构化日志（`elog.FieldErr(err)` 等）。
- 降级触发、底座调用失败、落库补偿失败均需埋点/告警；错误信息不向用户透出敏感内部细节。