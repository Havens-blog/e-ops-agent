---
name: diagnosis-history
risk: Medium
surface: web
feature: haven-opsagent
source: PRD Story 3
---

# Journey: 深度排障与历史回溯

资深运维/SRE 查看诊断报告的每个结论对应的数据源引用，1 分钟内回溯历史诊断的完整内容（提问、编排调用链、报告、引用），并复用既有结论。

## Happy Path Steps

1. 打开 `/opsagent/diagnosis/:id`，展示根因结论 + 置信度 + 严重性/风险档徽标。
2. 证据清单展示数据源引用（log/metric/asset/alert 按 agent 角色点色），结论可回指引用条目。
3. 编排调用链逐 step 展示 agent/action/来源/耗时 + 降级级别；处置预案只读展示 + 风险档徽标。
4. 进入 `/opsagent/history`，默认时间窗 now-24h，按服务名/时间窗检索，命中会话摘要列表。
5. 点击会话，经 diagnosisId 拉取完整诊断内容（提问 + 编排调用链 + 报告 + 引用）。

## Edge Cases

1. 检索时间窗 >24h → 前端提示「缩小范围」，后端 400 双兜底。
2. 访问跨租户或他人的会话/诊断 → 404，不显示任何数据（不泄露存在性）。
3. running/failed 会话无 diagnosisId → 显示占位说明「暂无诊断内容」。
4. 诊断无引用（citations 空）→ 证据清单显示空态，不为此阻塞报告展示。

## Invariants

- 跨租户不可见：历史检索按 tenant 过滤，会话详情跨租户 404。
- 只读：处置预案只读展示，不渲染执行控件（P1 无执行后端）。
- 引用回指：结论 citation 须能回指 citations 内条目。
- 自动已读：带 riskEntryId 打开诊断详情触发待查看→已查看惰性 CAS，无副作用（重复打开幂等）。