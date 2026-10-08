---
status: "completed"
started: "2026-10-08 15:53"
completed: "2026-10-08 15:55"
time_spent: "~2m"
---

# Task Record: T-specs-consolidate Consolidate Specs

## Summary
从 haven-opsagent 特性文档提取跨功能业务规则与技术规范，落共享目录并带 domains frontmatter。新增 3 文件：① docs/business-rules/opsagent-llm-safety.md（提示注入三道防线 sanitize/wrap/fence + LLM 三级降级 + API Key 只写不读，domains [opsagent, llm, security, prompt-injection, degradation]）；② docs/business-rules/opsagent-risk-isolation.md（风险分级确定性代码 read/low/high + 高危不入白名单 + 跨租户 404 不泄露 + CAS 乐观锁逐条不覆盖，domains [opsagent, risk, multi-tenancy, cas, security]）；③ docs/conventions/opsagent-orchestration.md（单进程编排 + 4 逻辑 Agent + 窄接口依赖倒置 + 响应信封 + 告警去重/LLM 预算，domains [opsagent, architecture, go, orchestration, worker]）。去重处理：LLM 降级「先例」已在 conventions/error-handling.md 提及，新规则聚焦其未覆盖的提示注入三道防线/风险分级/租户隔离；api.md 已覆盖模块装配，新 convention 引用而非重复。以 [auto-specs] 提交。

## Changes

### Files Created
- docs/business-rules/opsagent-llm-safety.md
- docs/business-rules/opsagent-risk-isolation.md
- docs/conventions/opsagent-orchestration.md

### Files Modified
无

### Key Decisions
- 业务规则按「LLM 安全降级」「风险分级+租户隔离」两域拆分，各自 domains frontmatter 精准标注话题关键词（供后续 agent 按需加载）
- 去重：error-handling.md 已有的 LLM 降级「先例」不在新文件重复展开，新规则聚焦提示注入三道防线/风险分级/租户隔离/CAS 等未被既有 conventions 覆盖的跨功能条目
- 仓库无既有 docs/business-rules/，首次建立该目录承载跨功能业务规则；opsagent-orchestration.md 引用 api.md + error-handling.md 而非重述

## Document Metrics
N/A

## Referenced Documents
无

## Review Status
N/A

## Acceptance Criteria
- [x] All acceptance criteria met
- [x] Business rules extracted to docs/business-rules/ with correct domains frontmatter
- [x] Tech specs extracted to docs/conventions/ with correct domains frontmatter
- [x] All CROSS items auto-integrated and committed with [auto-specs] tag

## Notes
doc.consolidate 任务：无 feature code 改动。提取依据 tech-design.md（Security ② 三道防线 / Error Handling 三级降级 / Interface 5 RiskRegistry）+ 代码事实（D:/Haven/opsagent internal/orchestrator/llmsafety.go 的 sanitize/wrap/fence、internal/web 窄接口、domain.RiskEntry version CAS）。已在每个文件标注「事实来源」指向，供后续 drift 校验。commit tag [auto-specs]。
