# Contract: intent-correct

- **Journey**: chat-diagnosis
- **Risk**: High
- **Operation**: POST /api/v1/opsagent/chat/:sessionId/correct（会话内纠正重路由）

## Preconditions

- 会话存在且归属当前租户；请求体二选一：`{ targetIntent, params }` 或 `{ message }`（XOR，均缺省/均提供 → 400）。

## Input

- `targetIntent ∈ { diagnose, resource, out_of_scope }` + `params`（DiagnoseParams），或 `message`（自然语言纠正）。
- `params` 由前端基于澄清 candidates 预填，可改。

## Output

- 200 与 chat 同形（type/needsClarify/diagnosis/degradeLevel 等）；再次置信度低可再次 clarify（多轮）。
- 404 → 会话不存在或跨租户；400 → targetIntent 与 message 同现/均缺。

## State

- 复用会话上下文重路由；误分类 + 纠正记录追加 sessions.correction_log；targetIntent+params 路径以 ServiceName 重入编排（不调用 LLM 重分类）。

## Side-effect

- 触发一次 `IntentClassifier.Correct`；非 message 路径以确定性参数重入编排。

## Invariants

- 无需重新完整提问：纠正复用会话上下文。
- 纠正记录保留（误分类 + 纠正），供审计回溯。
- targetIntent XOR message 严格二选一。