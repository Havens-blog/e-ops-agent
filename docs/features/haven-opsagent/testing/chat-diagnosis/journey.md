---
name: chat-diagnosis
risk: High
surface: web
feature: haven-opsagent
source: PRD Story 2
---

# Journey: 对话排障快速定位

一线值班运维用自然语言提问，1 分钟内拿到含根因 + 处置建议 + 数据源引用的只读诊断报告；LLM 不可用时按三级降级响应而非静默失败。

## Happy Path Steps

1. 进入 `/opsagent/chat`，输入「order-service 近 1 小时错误率上升」，发送。
2. 编排层完成意图识别、调用日志/资产/告警底座，组装报告。
3. 1 分钟内收到诊断报告：根因结论 + 置信度 + 处置建议 + 数据源引用（点色区分 agent 角色）。
4. 思考过程展示 4 步编排进度（意图识别→查询→诊断→报告），证据卡展示引用。
5. 报告可点击结论回指具体数据源引用。

## Edge Cases

1. LLM 不可用（单次超时 >12s 或连续 2 次失败）→ L1 模板意图匹配 / L2 预置查询入口 / L3 明示降级模式，绝不返回编造内容。
2. 超能力意图（开发咨询/提单/闲聊）→ 引导式回应「这是 X 类问题，请走 Y 渠道」，不调用底座、不猜测。
3. 意图置信度低 → 返回澄清追问 + 候选意图；一键纠正走 correct(targetIntent+params) 或自然语言 correct(message)，无需重提完整问句。
4. logquery 返回空结果 → 报告明示「时间窗内无匹配日志」并列出已尝试查询条件，不编造结论。
5. 同步编排超出延迟预算 → 202 异步回退，前端提示后台继续，后续经历史回溯查结果。
6. 落库失败（ERR_PERSIST_FAILED）→ 200 + 业务错误码但仍返回 report 正文，前端保留诊断不丢弃。
7. 用户输入含 prompt-injection 指令标记 → 三道防线（sanitize/wrap/fence）清洗，LLM 结论引用校验失败即丢弃。

## Invariants

- 只读诊断：对话排障返回只读报告，不暴露任何执行/查询控件（超能力引导不渲染查询/执行控件）。
- 三级降级：LLM 不可用/预算耗尽走确定性降级，绝不返回看似正常的编造内容。
- 引用回指：结论 citation 须回指 citations 内条目，校验失败丢弃。
- API Key 只写不读：LLM 配置 GET 永返掩码。