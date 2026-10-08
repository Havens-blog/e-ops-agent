---
status: "completed"
started: "2026-10-08 15:59"
completed: "2026-10-08 16:01"
time_spent: "~2m"
---

# Task Record: T-test-gen-journeys Generate Test Journeys

## Summary
为 haven-opsagent 生成 3 份测试 Journey 文档（Breakdown 模式，源自 PRD 用户故事 3 条）。① testing/alert-to-risk-center/journey.md（High，Story 1 告警跟进：5 happy path + 7 edge cases，覆盖 CAS 冲突 409/批量部分失败/指纹去重/队列溢出/LLM 预算/高危不渲染控件/跨租户 404）；② testing/chat-diagnosis/journey.md（High，Story 2 对话排障：5 happy + 7 edge，覆盖 LLM 三级降级/超能力引导/澄清纠正/空 logquery/202 异步/落库失败保正文/prompt-injection 三道防线）；③ testing/diagnosis-history/journey.md（Medium，Story 3 深度排障+回溯：5 happy + 4 edge，覆盖 24h 窗口/跨租户 404/无诊断占位/空引用）。每份含 name/risk/surface/happy path/edge cases/invariants；高风险 Journey edge count >= happy path count。AUTO_COMMIT 生效，直接提交。

## Changes

### Files Created
- docs/features/haven-opsagent/testing/alert-to-risk-center/journey.md
- docs/features/haven-opsagent/testing/chat-diagnosis/journey.md
- docs/features/haven-opsagent/testing/diagnosis-history/journey.md

### Files Modified
无

### Key Decisions
- Breakdown 模式：3 条 PRD 用户故事 → 3 条 Journey（alert-to-risk-center/chat-diagnosis/diagnosis-history），surface=web（e-cam-web 前端为页面级用户流）
- 风险分级：Story 1/2 含并发 CAS/LLM 降级/prompt-injection 高风险维度 → High；Story 3 追溯/检索 → Medium
- High-risk Journey 满足 edge >= happy（7 vs 5），Medium 无该硬约束
- invariants 直接取自 business-rules/design 的不变量（租户隔离/CAS 不静默覆盖/高危只读/引用回指/apiKey 只写），保持与 spec 一致

## Cases Generated
N/A

## Cases Evaluated
N/A

## Scripts Created
无

## Test Results
N/A

## Acceptance Criteria
- [x] All acceptance criteria met
- [x] At least 1 Journey file generated under docs/features/haven-opsagent/testing/
- [x] Each Journey has: name, risk level, happy path steps, edge cases, invariants
- [x] High-risk Journeys have edge case count >= happy path step count
- [x] All Journey files committed (AUTO_COMMIT=true)

## Notes
test.gen-journeys 任务：无 feature code 改动。3 Journey 由 prd-user-stories.md 3 条故事的 Given/When/Then Acceptance Criteria 逐条映射，happy path 取自正向流程、edge cases 取自含「冲突/超限/不可用/空/跨租户」的 AC。surface 未强制 persist 到 .forge/config.yaml（本任务 surface-key 为空，journey 以 web 前端页为用户流承载面）；后续 /test-guide 可按 journey 生成 E2E 用例。自动提交 docs: generate journeys for haven-opsagent。
