---
domains: [opsagent, llm, security, prompt-injection, degradation]
---

# 运维 Agent LLM 安全与三级降级（跨功能业务规则）

> 事实来源：`docs/features/haven-opsagent/design/tech-design.md`（Security ② 三道防线 + Error Handling 三级降级设计）。任何引入 LLM 的能力应复用本规则。

## 提示注入三道防线（输入/输出侧）

- **输入 sanitize**：清洗用户文本中的指令注入标记（`忽略以上指令`、`ignore previous instructions`、`system:`、`<|im_start|>system`、`### instruction`、`### system` 等）。
- **输入 wrap/fence**：所有不可信用户/外部数据在进入 LLM 前用 `<<<UNTRUSTED_DATA>>>` 围栏包裹，明确边界。
- **输出 fence + 引用校验**：LLM 结论中的引用须回指 `citations` 集合内的条目，服务端校验失败即丢弃该结论。

## LLM 三级降级

- 判定谓词：单次调用超时 > 12s 或连接失败、连续 2 次失败 → LLM 不可用。
- L1 模板意图匹配 / L2 预置查询入口（preset_queries）/ L3 明示降级模式。
- 硬约束：**绝不返回看似正常的编造内容**；降级级别随响应 `degradeLevel` 返回前端展示徽标。

## API Key 只写不读

- 任何接口不返回明文 apiKey；GET 永返掩码（`sk-****` + 末 4 位）。
- 真正的密钥加密落库由 secret manager 在组合根处理，代码/数据库不存明文。