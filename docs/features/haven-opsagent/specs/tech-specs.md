---
feature: "haven-opsagent"
generated: "2026-10-08"
status: draft
---

# Technical Specifications: Haven 运维 Agent

## 错误码语义

### TECH-001: 错误码 → HTTP 状态语义

**Requirement**: ERR_PARAM_INVALID→400；ERR_NOT_FOUND→404（跨租户）；ERR_CONFLICT→409（回显最新）；ERR_QUEUE_FULL→202 半成功（code=0, dropped）；ERR_PERSIST_FAILED→200（code≠0, data 仍含正文）；LLM 不可用/超时→200 降级（degradeLevel 1~3）。
**Scope**: CROSS
**Source**: api-handbook.md Error Codes；tech-design Error Handling

## 前端工程约定

### TECH-002: Vue3 页面纯函数 + presentational 组件

**Requirement**: 纯展示逻辑收敛 logic.ts（无 DOM 依赖、node 可单测）；子组件 presentational（props/emits）；后端域专用 axios 实例 + 信封解包；深色 tokens 作用域隔离；@vue/test-utils + happy-dom 挂载测试。
**Scope**: CROSS
**Source**: 任务 5.1-5.6 前端记录；page-map.md