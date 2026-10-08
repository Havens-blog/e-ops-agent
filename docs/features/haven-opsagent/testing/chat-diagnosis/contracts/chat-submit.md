# Contract: chat-submit

- **Journey**: chat-diagnosis
- **Risk**: High
- **Operation**: POST /api/v1/opsagent/chat（发起对话排障）

## Preconditions

- 调用者已登录；请求体 `{ message, requestId? }`，message 非空且未超长。
- 服务名在 message 中被意图识别抽取（抽取不出 → L2 澄清降级）。

## Input

- `message`：自然语言提问（含服务名 + 时间窗 + 现象）。
- `requestId?`：幂等键。

## Output

- 200 `{ sessionId, diagnosis, report, type, needsClarify, candidates, degradeLevel, presets }`
- `type ∈ { report, preset_entries, guided, clarify, degraded_notice }`
- 202（异步回退）：`{ sessionId, status: "running" }`（同步编排超预算）。
- 落库失败：200 + code=ERR_PERSIST_FAILED + data.report 仍含正文。

## State

- 创建会话 + 首轮提问并同步编排；降级路径（guided/clarify/preset）不落 diagnosis。

## Side-effect

- 编排调用底座（日志/资产/告警）；LLM 解读在 GuardedLLM 内；异步路径后台 continueAsync。

## Invariants

- 只读诊断：不暴露执行控件；超能力意图返回引导、不调用底座。
- 三级降级：LLM 不可用/预算耗尽走 L1/L2/L3，绝不返回编造内容。
- 输入侧三道防线：sanitize/wrap/fence，输出引用校验失败即丢弃。